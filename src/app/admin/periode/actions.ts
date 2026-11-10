"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, type PeriodStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { effectiveClosesAt, MANUAL_TRANSITIONS, PERIOD_STATUS } from "@/lib/period";
import { copyPeriodSchema, extensionSchema, periodSchema } from "@/lib/validation/period";
import { copyQuestionnaireToPeriod } from "@/lib/questionnaireCopy";

export type PeriodFormState = { error?: string; fieldErrors?: Record<string, string[]>; values?: Record<string, string> };

function backTo(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params)}`);
}

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/** FR-02.03 + FR-02.08: buat (tanpa id) atau ubah (dengan id) periode. Hanya Super Admin (PRD §8). */
export async function savePeriodAction(_prev: PeriodFormState, formData: FormData): Promise<PeriodFormState> {
  const user = await requireRole(["SUPER_ADMIN"]);
  const values = formValues(formData);
  const id = z.uuid().optional().safeParse(values.id || undefined);
  if (!id.success) return { values, error: "Periode tidak valid" };

  const parsed = periodSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors, error: "Periksa kembali isian yang ditandai." };
  }
  const data = parsed.data;

  const existing = id.data ? await prisma.surveyPeriod.findFirst({ where: { id: id.data, deletedAt: null } }) : null;
  if (id.data && !existing) return { values, error: "Periode tidak ditemukan" };
  if (existing?.status === "ARCHIVED") return { values, error: "Periode yang diarsipkan tidak bisa diubah." };
  if (existing && existing.status !== "DRAFT" && existing.opensAt.getTime() !== data.opensAt.getTime()) {
    return { values, fieldErrors: { opensAt: ["Tanggal buka hanya bisa diubah saat periode masih Draf"] } };
  }

  const period = await runAsUser(user, () =>
    withDb((tx) =>
      existing
        ? tx.surveyPeriod.update({ where: { id: existing.id }, data: { ...data, updatedBy: user.id } })
        : tx.surveyPeriod.create({ data: { ...data, status: "DRAFT", createdBy: user.id } }),
    ),
  );
  backTo(`/admin/periode/${period.id}`, { ok: existing ? "Periode disimpan" : `Periode ${period.name} dibuat (Draf)` });
}

/** FR-02.04/05: buka/tutup/arsipkan manual. Hanya satu periode OPEN (dicek + index unik di DB). */
export async function setPeriodStatusAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(["DRAFT", "OPEN", "CLOSED", "ARCHIVED"]) })
    .safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) backTo("/admin/periode", { error: "Aksi tidak valid" });
  const { id, status } = parsed.data;
  const path = `/admin/periode/${id}`;

  const period = await prisma.surveyPeriod.findFirst({
    where: { id, deletedAt: null },
    include: { periodExtensions: { where: { deletedAt: null } } },
  });
  if (!period) backTo("/admin/periode", { error: "Periode tidak ditemukan" });
  if (!MANUAL_TRANSITIONS[period.status].includes(status as PeriodStatus)) {
    backTo(path, { error: `Status ${PERIOD_STATUS[period.status].label} tidak bisa diubah ke ${PERIOD_STATUS[status].label}.` });
  }

  if (status === "OPEN") {
    const closes = effectiveClosesAt(period.closesAt, period.periodExtensions, null);
    if (closes <= new Date()) {
      backTo(path, { error: `Tanggal tutup (${formatWib(closes)}) sudah lewat. Ubah tanggal tutup atau tambah perpanjangan dulu.` });
    }
    const open = await prisma.surveyPeriod.findFirst({ where: { status: "OPEN", deletedAt: null, id: { not: id } } });
    if (open) backTo(path, { error: `Masih ada periode lain yang Dibuka: ${open.name}. Tutup dulu periode itu.` });
  }

  try {
    await runAsUser(user, () =>
      withDb((tx) => tx.surveyPeriod.update({ where: { id }, data: { status: status as PeriodStatus, updatedBy: user.id } })),
    );
  } catch (error) {
    // balapan dua admin membuka periode berbeda bersamaan — index unik survey_periods_single_open yang menang
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      backTo(path, { error: "Masih ada periode lain yang Dibuka. Muat ulang lalu coba lagi." });
    }
    throw error;
  }
  backTo(path, { ok: `Status periode menjadi ${PERIOD_STATUS[status].label}` });
}

/** FR-02.07: perpanjangan untuk semua lembaga (institution_id NULL) atau lembaga terpilih, alasan wajib. */
export async function addExtensionAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const periodId = z.uuid().safeParse(formData.get("periodId"));
  if (!periodId.success) backTo("/admin/periode", { error: "Periode tidak valid" });
  const path = `/admin/periode/${periodId.data}`;

  const parsed = extensionSchema.safeParse({
    newClosesAt: formData.get("newClosesAt"),
    reason: formData.get("reason"),
    scope: formData.get("scope"),
    institutionIds: formData.getAll("institutionIds"),
  });
  if (!parsed.success) backTo(path, { error: parsed.error.issues[0].message });
  const { newClosesAt, reason, scope } = parsed.data;
  const institutionIds = scope === "ALL" ? [] : [...new Set(parsed.data.institutionIds)];

  const period = await prisma.surveyPeriod.findFirst({ where: { id: periodId.data, deletedAt: null } });
  if (!period) backTo("/admin/periode", { error: "Periode tidak ditemukan" });
  if (period.status === "ARCHIVED") backTo(path, { error: "Periode yang diarsipkan tidak bisa diperpanjang." });
  if (newClosesAt <= period.closesAt) {
    backTo(path, { error: `Tanggal tutup baru harus setelah ${formatWib(period.closesAt)}.` });
  }
  if (institutionIds.length) {
    const found = await prisma.institution.count({ where: { id: { in: institutionIds }, deletedAt: null } });
    if (found !== institutionIds.length) backTo(path, { error: "Ada lembaga terpilih yang tidak ditemukan atau nonaktif." });
  }

  const rows = (institutionIds.length ? institutionIds : [null]).map((institutionId) => ({
    periodId: period.id,
    institutionId,
    newClosesAt,
    reason,
    createdBy: user.id,
  }));
  await runAsUser(user, () => withDb((tx) => tx.periodExtension.createMany({ data: rows })));

  backTo(path, {
    ok: `Tenggat diperpanjang sampai ${formatWib(newClosesAt)} untuk ${institutionIds.length ? `${institutionIds.length} lembaga` : "semua lembaga"}.`,
  });
}

/**
 * FR-02.06: salin periode → DRAFT baru dengan tanggal baru, pengaturan yang sama, dan
 * kuesioner (bagian/soal/opsi/logika tampil/aturan) sebagai Draf. Jawaban tidak ikut.
 * shortcut: skema skor BELUM ikut tersalin karena modulnya belum ada — tambahkan saat M09.
 */
export async function copyPeriodAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const sourceId = z.uuid().safeParse(formData.get("sourceId"));
  if (!sourceId.success) backTo("/admin/periode", { error: "Periode tidak valid" });
  const path = `/admin/periode/${sourceId.data}`;

  const parsed = copyPeriodSchema.safeParse({
    name: formData.get("name"),
    year: formData.get("year"),
    opensAt: formData.get("opensAt"),
    closesAt: formData.get("closesAt"),
  });
  if (!parsed.success) backTo(path, { error: parsed.error.issues[0].message });

  const source = await prisma.surveyPeriod.findFirst({ where: { id: sourceId.data, deletedAt: null } });
  if (!source) backTo("/admin/periode", { error: "Periode tidak ditemukan" });

  const { copy, questionnaire } = await runAsUser(user, () =>
    withDb(async (tx) => {
      const copy = await tx.surveyPeriod.create({
        data: {
          ...parsed.data,
          status: "DRAFT",
          copiedFromId: source.id,
          revisionDeadlineDays: source.revisionDeadlineDays,
          revisionScope: source.revisionScope,
          passingScore: source.passingScore,
          showRankingToParticipants: source.showRankingToParticipants,
          createdBy: user.id,
        },
      });
      return { copy, questionnaire: await copyQuestionnaireToPeriod(tx, source.id, copy.id, user.id) };
    }),
  );
  backTo(`/admin/periode/${copy.id}`, {
    ok: `Periode ${copy.name} dibuat sebagai salinan ${source.name} (Draf)${questionnaire ? ", termasuk kuesioner (Draf)" : ""}`,
  });
}
