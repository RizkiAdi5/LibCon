"use server";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { encodeAnswer, evidenceKey, parseAnswerKey, type StoredAnswer } from "@/lib/answers";
import { formatAnswer } from "@/lib/answerFormat";
import { renderReceiptPdf } from "@/lib/pdf/reportPdf";
import { checkSubmission, loadParticipantSurvey } from "@/lib/participantSurvey";
import { prisma } from "@/lib/db/client";
import { sendTemplateEmail } from "@/lib/email/send";
import { formatWib } from "@/lib/date";
import { redirect } from "next/navigation";
import { progressPct } from "@/lib/validation/engine";

export type SaveResult = { savedAt?: string; progressPct?: number; error?: string };

const inputSchema = z.object({ periodId: z.uuid(), changes: z.record(z.string(), z.unknown()) });
const MAX_CHANGES = 200;
const MAX_URL = 2000;

const sameStored = (a: StoredAnswer, b: StoredAnswer) => JSON.stringify(a) === JSON.stringify(b);

/**
 * FR-07.04 autosave. Lembaga diambil dari sesi; soal harus milik kuesioner
 * terbit periode ini dan berlaku untuk jenis lembaga (FR-07.03). Setiap
 * perubahan dicatat di answer_history dengan akun pengubahnya (FR-05.07).
 */
export async function saveAnswersAction(input: { periodId: string; changes: Record<string, unknown> }): Promise<SaveResult> {
  const user = await requireRole(["PARTICIPANT"]);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || Object.keys(parsed.data.changes).length > MAX_CHANGES) return { error: "Data tidak valid" };
  const institutionId = user.institutionId!;

  const survey = await loadParticipantSurvey(institutionId);
  if (!survey || survey.period.id !== parsed.data.periodId) return { error: "Periode survei tidak ditemukan atau sudah berganti. Muat ulang halaman." };
  if (survey.mode !== "editable" && survey.mode !== "revision") {
    return { error: survey.mode === "submitted" ? "Survei sudah dikirim dan terkunci." : "Periode pengisian sudah ditutup. Isian tidak bisa diubah." };
  }
  const revising = survey.mode === "revision";

  const typeId = survey.institution.typeId;
  const questions = new Map(survey.definition.sections.flatMap((s) => s.questions).map((q) => [q.id, q]));
  // FR-08.07: saat revisi hanya soal yang dibuka (dan link bukti bagian berisi soal itu) yang boleh diubah
  const editableQuestion = (id: string) => !revising || survey.revisionNotes.has(id);
  const sectionIds = new Set(
    survey.definition.sections.filter((s) => !revising || s.questions.some((q) => survey.revisionNotes.has(q.id))).map((s) => s.id),
  );
  const LOCKED_BY_REVISION = "Soal ini tidak dibuka untuk revisi — tidak perlu diubah.";

  // validasi seluruh perubahan dulu — tidak ada yang disimpan kalau satu saja tidak valid
  const answerWrites = new Map<string, StoredAnswer>();
  const evidenceWrites = new Map<string, string | null>();
  const sectionEvidence = { ...((survey.submission?.sectionEvidence ?? {}) as Record<string, string>) };
  for (const [key, value] of Object.entries(parsed.data.changes)) {
    const k = parseAnswerKey(key);
    if (k.kind === "evidence") {
      if (value !== null && (typeof value !== "string" || value.length > MAX_URL)) return { error: "Link bukti dukung tidak valid" };
      const url = (value as string | null)?.trim() || null;
      if (k.scope === "section") {
        if (!sectionIds.has(k.id)) return { error: revising ? LOCKED_BY_REVISION : "Bagian tidak ditemukan" };
        if (url) sectionEvidence[k.id] = url;
        else delete sectionEvidence[k.id];
      } else {
        const q = questions.get(k.id);
        if (!q?.hasEvidenceUrl) return { error: "Soal tidak meminta link bukti" };
        if (!editableQuestion(q.id)) return { error: LOCKED_BY_REVISION };
        evidenceWrites.set(k.id, url);
      }
      continue;
    }
    const q = questions.get(k.questionId);
    if (!q || (q.institutionTypeIds.length > 0 && !q.institutionTypeIds.includes(typeId))) return { error: "Soal tidak berlaku untuk lembaga ini" };
    if (!editableQuestion(q.id)) return { error: `${q.label}: ${LOCKED_BY_REVISION}` };
    const stored = encodeAnswer(q.type, value);
    if ("error" in stored) return { error: `${q.label}: ${stored.error}` };
    answerWrites.set(q.id, stored);
  }

  const answers = { ...survey.answers, ...parsed.data.changes };
  const progress = progressPct([...questions.values()], survey.definition.conditions, answers, typeId);
  const now = new Date();
  const round = survey.submission?.revisionRound ?? 0;

  await runAsUser(user, () =>
    withDb(async (tx) => {
      const submission = await tx.submission.upsert({
        where: { periodId_institutionId: { periodId: survey.period.id, institutionId } },
        create: {
          periodId: survey.period.id,
          institutionId,
          status: "DRAFT",
          progressPct: progress,
          lastSavedAt: now,
          sectionEvidence,
          createdBy: user.id,
        },
        // saat revisi status tetap NEEDS_REVISION sampai dikirim ulang
        update: { ...(revising ? {} : { status: "DRAFT" as const }), progressPct: progress, lastSavedAt: now, sectionEvidence, updatedBy: user.id },
      });

      for (const questionId of new Set([...answerWrites.keys(), ...evidenceWrites.keys()])) {
        const existing = await tx.answer.findUnique({ where: { submissionId_questionId: { submissionId: submission.id, questionId } } });
        const before: StoredAnswer = existing
          ? { valueNumber: existing.valueNumber === null ? null : Number(existing.valueNumber), valueText: existing.valueText, valueDate: existing.valueDate?.toISOString().slice(0, 10) ?? null, valueJson: existing.valueJson }
          : { valueNumber: null, valueText: null, valueDate: null, valueJson: null };
        const next = answerWrites.get(questionId) ?? before;
        const evidenceUrl = evidenceWrites.has(questionId) ? evidenceWrites.get(questionId)! : (existing?.evidenceUrl ?? null);
        if (existing && sameStored(before, next) && existing.evidenceUrl === evidenceUrl) continue;

        const data = {
          valueNumber: next.valueNumber,
          valueText: next.valueText,
          valueDate: next.valueDate ? new Date(`${next.valueDate}T00:00:00Z`) : null,
          valueJson: next.valueJson === null ? Prisma.DbNull : (next.valueJson as Prisma.InputJsonValue),
          evidenceUrl,
        };
        const answer = existing
          ? await tx.answer.update({ where: { id: existing.id }, data: { ...data, updatedBy: user.id } })
          : await tx.answer.create({ data: { ...data, submissionId: submission.id, questionId, createdBy: user.id } });
        await tx.answerHistory.create({
          data: {
            answerId: answer.id,
            oldValue: existing ? ({ ...before, evidenceUrl: existing.evidenceUrl } as Prisma.InputJsonValue) : Prisma.DbNull,
            newValue: { ...next, evidenceUrl } as Prisma.InputJsonValue,
            revisionRound: round,
            createdBy: user.id, // FR-05.07: akun yang mengubah (dua akun mengisi kiriman yang sama)
          },
        });
      }
    }),
  );

  return { savedAt: now.toISOString(), progressPct: progress };
}

export type SubmitState = { error?: string; fieldErrors?: Record<string, string> };

const submitSchema = z.object({
  periodId: z.uuid(),
  confirm: z.literal("on", "Centang pernyataan bahwa data sudah benar"),
  submitterName: z.string().trim().min(1, "Nama pengisi wajib diisi").max(200, "Nama maks. 200 karakter"),
});

/**
 * FR-07.09 + FR-08.01 + BR-10: kirim. Server menilai ulang SEMUA jawaban dari DB;
 * ada Blokir → ditolak. Jawaban dikunci, snapshot disimpan, Flag dicatat di
 * validation_results, email tanda terima ke semua akun lembaga (FR-07.10).
 */
export async function submitSurveyAction(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const user = await requireRole(["PARTICIPANT"]);
  const parsed = submitSchema.safeParse({
    periodId: formData.get("periodId"),
    confirm: formData.get("confirm"),
    submitterName: formData.get("submitterName"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: "Lengkapi konfirmasi sebelum mengirim.", fieldErrors };
  }

  const survey = await loadParticipantSurvey(user.institutionId!);
  if (!survey || survey.period.id !== parsed.data.periodId) return { error: "Periode survei sudah berganti. Muat ulang halaman." };
  if (survey.mode !== "editable" && survey.mode !== "revision") {
    return { error: survey.mode === "submitted" ? "Survei sudah dikirim." : "Periode pengisian sudah ditutup, survei tidak bisa dikirim." };
  }
  const check = await checkSubmission(survey);
  if (check.blocks.length || check.missingEvidence.length) {
    return { error: `Masih ada ${check.blocks.length + check.missingEvidence.length} masalah yang harus diperbaiki. Lihat daftar di atas.` };
  }

  const now = new Date();
  const submission = survey.submission;
  const round = submission?.revisionRound ?? 0;
  // FR-08.08: kirim ulang revisi — flag yang sudah diterima admin untuk soal+aturan yang sama tidak dibuka lagi
  const accepted = submission
    ? await prisma.validationResult.findMany({ where: { submissionId: submission.id, status: "ACCEPTED_BY_ADMIN" }, select: { questionId: true, ruleId: true } })
    : [];
  const flags = check.flags.filter((f) => !accepted.some((a) => a.questionId === f.questionId && a.ruleId === f.ruleId));
  await runAsUser(user, () =>
    withDb(async (tx) => {
      if (survey.revision) {
        await tx.revisionRequest.update({ where: { id: survey.revision.id }, data: { status: "RESUBMITTED", resubmittedAt: now, updatedBy: user.id } });
        // flag putaran sebelumnya yang belum ditinjau digantikan hasil pemeriksaan putaran ini
        await tx.validationResult.updateMany({ where: { submissionId: submission!.id, status: "OPEN" }, data: { status: "RESOLVED", updatedBy: user.id } });
      }
      const saved = await tx.submission.upsert({
        where: { periodId_institutionId: { periodId: survey.period.id, institutionId: survey.institution.id } },
        create: {
          periodId: survey.period.id,
          institutionId: survey.institution.id,
          status: "SUBMITTED",
          progressPct: check.progress,
          submitterName: parsed.data.submitterName,
          firstSubmittedAt: now,
          lastSubmittedAt: now,
          lastSubmittedById: user.id,
          openFlagCount: flags.length,
          createdBy: user.id,
        },
        update: {
          status: "SUBMITTED",
          progressPct: check.progress,
          submitterName: parsed.data.submitterName,
          firstSubmittedAt: submission?.firstSubmittedAt ?? now,
          lastSubmittedAt: now,
          lastSubmittedById: user.id,
          openFlagCount: flags.length,
          updatedBy: user.id,
        },
      });
      await tx.answer.updateMany({ where: { submissionId: saved.id }, data: { isLocked: true, updatedBy: user.id } }); // BR-10
      await tx.submissionSnapshot.create({
        data: {
          submissionId: saved.id,
          revisionRound: round,
          answers: survey.answers as Prisma.InputJsonValue,
          submittedById: user.id,
          submittedAt: now,
          createdBy: user.id,
        },
      });
      if (flags.length) {
        await tx.validationResult.createMany({
          data: flags.map((f) => ({
            submissionId: saved.id,
            questionId: f.questionId,
            ruleId: f.ruleId!, // flag selalu berasal dari aturan admin (cek bawaan tipe selalu Blokir)
            severity: f.severity,
            message: f.message,
            revisionRound: round,
            createdBy: user.id,
          })),
        });
      }
    }),
  );

  // email di luar transaksi: kiriman tetap tercatat walau email gagal
  try {
    const accounts = await prisma.user.findMany({ where: { institutionId: survey.institution.id, deletedAt: null, status: "ACTIVE" } });
    // FR-07.10: ringkasan jawaban (soal yang tampil) sebagai lampiran PDF; gagal render → email tetap terkirim tanpa lampiran
    const receipt = await renderReceiptPdf({
      libraryName: survey.institution.libraryName,
      npp: survey.institution.npp,
      periodName: survey.period.name,
      submittedAt: now,
      submitterName: parsed.data.submitterName,
      sections: survey.definition.sections
        .map((s) => ({
          title: s.title,
          evidenceUrl: String(survey.answers[evidenceKey("section", s.id)] ?? ""),
          rows: s.questions.filter((q) => check.visible.has(q.id)).map((q) => ({ code: q.code, label: q.label, answer: formatAnswer(q, survey.answers[q.id]) })),
        }))
        .filter((s) => s.rows.length),
    }).catch((error) => {
      console.error("[survei] gagal membuat PDF tanda terima", error);
      return null;
    });
    const attachments = receipt ? [{ filename: `tanda-terima-${survey.institution.npp}.pdf`, content: receipt }] : undefined;
    await runAsUser(user, () =>
      withDb(async (tx) => {
        for (const account of accounts) {
          await sendTemplateEmail(tx, {
            key: "SUBMISSION_RECEIPT",
            to: account.email,
            variables: { nama_lembaga: survey.institution.libraryName, waktu: formatWib(now), periode: survey.period.name },
            createdBy: user.id,
            userId: account.id,
            institutionId: survey.institution.id,
            relatedType: "submission",
            relatedId: survey.submission?.id,
            attachments,
          });
        }
      }),
    );
  } catch (error) {
    console.error("[survei] gagal kirim email tanda terima", error);
  }
  redirect("/portal/survei/ringkasan?terkirim=1");
}
