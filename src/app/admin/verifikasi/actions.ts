"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { formatWib, parseWibDateTime } from "@/lib/date";
import { sendTemplateEmail } from "@/lib/email/send";
import { loadSubmissionForReview, scoresPublished } from "@/lib/submissionReview";

const ROLES = ["ADMIN", "SUPER_ADMIN"] as const; // flowchart §13: tinjau flag & buka revisi untuk keduanya
const pathOf = (id: string) => `/admin/verifikasi/${id}`;

function backTo(path: string, params: Record<string, string>): never {
  revalidatePath(path);
  redirect(`${path}?${new URLSearchParams(params)}`);
}

const idSchema = z.uuid();

async function loadOr404(submissionId: unknown) {
  const id = idSchema.safeParse(submissionId);
  if (!id.success) backTo("/admin/verifikasi", { error: "Kiriman tidak valid" });
  const submission = await prisma.submission.findUnique({ where: { id: id.data }, include: { period: true } });
  if (!submission) backTo("/admin/verifikasi", { error: "Kiriman tidak ditemukan" });
  return submission;
}

/** FR-08.04: tandai flag Diterima (data memang benar), catatan opsional. */
export async function acceptFlagAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const submission = await loadOr404(formData.get("submissionId"));
  const parsed = z
    .object({ resultId: z.uuid(), note: z.string().trim().max(1000, "Catatan maks. 1000 karakter") })
    .safeParse({ resultId: formData.get("resultId"), note: formData.get("note") ?? "" });
  if (!parsed.success) backTo(pathOf(submission.id), { error: parsed.error.issues[0].message });

  await runAsUser(user, () =>
    withDb(async (tx) => {
      const result = await tx.validationResult.findFirst({ where: { id: parsed.data.resultId, submissionId: submission.id, status: "OPEN" } });
      if (!result) return;
      await tx.validationResult.update({
        where: { id: result.id },
        data: { status: "ACCEPTED_BY_ADMIN", reviewedById: user.id, reviewedAt: new Date(), reviewNote: parsed.data.note || null, updatedBy: user.id },
      });
      const open = await tx.validationResult.count({ where: { submissionId: submission.id, status: "OPEN" } });
      await tx.submission.update({ where: { id: submission.id }, data: { openFlagCount: open, updatedBy: user.id } });
    }),
  );
  backTo(pathOf(submission.id), { ok: "Flag ditandai Diterima" });
}

/** FR-08.11 + BR-13: hanya kiriman Terverifikasi yang masuk skor resmi. */
export async function verifyAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const submission = await loadOr404(formData.get("submissionId"));
  if (submission.status !== "SUBMITTED") backTo(pathOf(submission.id), { error: "Hanya kiriman berstatus Terkirim yang bisa diverifikasi." });

  await runAsUser(user, () =>
    withDb((tx) =>
      tx.submission.update({
        where: { id: submission.id },
        data: { status: "VERIFIED", verifiedAt: new Date(), verifiedById: user.id, updatedBy: user.id },
      }),
    ),
  );
  backTo(pathOf(submission.id), { ok: "Kiriman Terverifikasi dan akan masuk perhitungan skor resmi" });
}

/** FR-08.12: batalkan verifikasi dengan alasan, selama skor periode belum dipublikasikan. */
export async function unverifyAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const submission = await loadOr404(formData.get("submissionId"));
  const reason = z.string().trim().min(1, "Alasan pembatalan wajib diisi").max(1000).safeParse(formData.get("reason") ?? "");
  if (!reason.success) backTo(pathOf(submission.id), { error: reason.error.issues[0].message });
  if (submission.status !== "VERIFIED") backTo(pathOf(submission.id), { error: "Kiriman ini belum Terverifikasi." });
  if (scoresPublished(submission.period)) backTo(pathOf(submission.id), { error: "Skor periode ini sudah dipublikasikan — verifikasi tidak bisa dibatalkan." });

  await runAsUser(user, () =>
    withDb((tx) =>
      tx.submission.update({
        where: { id: submission.id },
        // alasan disimpan di admin_note (tidak ada kolom khusus di ERD); jejak lengkap di audit_logs
        data: { status: "SUBMITTED", verifiedAt: null, verifiedById: null, adminNote: `Verifikasi dibatalkan: ${reason.data}`, updatedBy: user.id },
      }),
    ),
  );
  backTo(pathOf(submission.id), { ok: "Verifikasi dibatalkan" });
}

/**
 * FR-08.05 + FR-08.06 + BR-11: buka revisi untuk soal terpilih (atau semua,
 * sesuai pengaturan periode) dengan catatan per soal + umum dan batas waktu.
 */
export async function requestRevisionAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const base = await loadOr404(formData.get("submissionId"));
  const path = pathOf(base.id);
  if (base.status !== "SUBMITTED") backTo(path, { error: "Revisi hanya bisa dibuka untuk kiriman berstatus Terkirim." });

  const review = await loadSubmissionForReview(base.id);
  if (!review) backTo(path, { error: "Kuesioner kiriman tidak ditemukan" });
  const { submission, definition, visible } = review;
  const visibleIds = definition.sections.flatMap((s) => s.questions).filter((q) => visible.has(q.id)).map((q) => q.id);

  const all = submission.period.revisionScope === "ALL";
  const picked = all ? visibleIds : formData.getAll("questionIds").map(String).filter((id) => visibleIds.includes(id));
  const generalNote = String(formData.get("generalNote") ?? "").trim().slice(0, 2000) || null;
  const deadlineAt = parseWibDateTime(String(formData.get("deadlineAt") ?? ""));
  if (picked.length === 0) backTo(path, { error: "Pilih minimal satu soal yang dibuka untuk revisi." });
  if (!deadlineAt || deadlineAt <= new Date()) backTo(path, { error: "Batas revisi harus diisi dan setelah waktu sekarang." });

  const round = submission.revisionRound + 1;
  const items = picked.map((questionId) => ({
    questionId,
    note: String(formData.get(`note_${questionId}`) ?? "").trim().slice(0, 1000) || null,
  }));

  await runAsUser(user, () =>
    withDb(async (tx) => {
      await tx.revisionRequest.create({
        data: {
          submissionId: submission.id,
          round,
          generalNote,
          deadlineAt,
          requestedById: user.id,
          createdBy: user.id,
          items: { create: items.map((i) => ({ ...i, createdBy: user.id })) },
        },
      });
      await tx.submission.update({ where: { id: submission.id }, data: { status: "NEEDS_REVISION", revisionRound: round, updatedBy: user.id } });
      await tx.answer.updateMany({ where: { submissionId: submission.id, questionId: { in: picked } }, data: { isLocked: false, updatedBy: user.id } });
    }),
  );

  // FR-08.06: email ke semua akun lembaga berisi daftar soal + catatan (di luar transaksi)
  let ok = `Revisi dibuka untuk ${picked.length} soal sampai ${formatWib(deadlineAt)}. Email terkirim ke akun lembaga.`;
  try {
    const labelOf = new Map(definition.sections.flatMap((s) => s.questions).map((q) => [q.id, q.label]));
    const catatan = [generalNote, ...items.map((i) => `• ${labelOf.get(i.questionId)}${i.note ? `: ${i.note}` : ""}`)].filter(Boolean).join("\n");
    const accounts = await prisma.user.findMany({ where: { institutionId: submission.institutionId, deletedAt: null, status: "ACTIVE" } });
    await runAsUser(user, () =>
      withDb(async (tx) => {
        for (const account of accounts) {
          await sendTemplateEmail(tx, {
            key: "REVISION_OPENED",
            to: account.email,
            variables: { nama_lembaga: submission.institution.libraryName, catatan, tenggat: formatWib(deadlineAt) },
            createdBy: user.id,
            userId: account.id,
            institutionId: submission.institutionId,
            relatedType: "submission",
            relatedId: submission.id,
          });
        }
      }),
    );
  } catch (error) {
    console.error("[verifikasi] gagal kirim email revisi", error);
    ok = `Revisi dibuka untuk ${picked.length} soal, tetapi email ke lembaga gagal dikirim.`;
  }
  backTo(path, { ok });
}
