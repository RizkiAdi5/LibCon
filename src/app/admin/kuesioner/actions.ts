"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, type Db } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import {
  configForType,
  slugifyCode,
  structureChanged,
  uniqueCode,
  type QuestionConfig,
  type QuestionStructure,
} from "@/lib/questionnaire";
import { questionSchema, sectionSchema, type QuestionInput } from "@/lib/validation/question";

const ROLES = ["ADMIN", "SUPER_ADMIN"] as const; // flowchart §13: builder Penuh untuk keduanya
const LOCKED = "Kuesioner sudah terbit sehingga strukturnya terkunci. Hanya teks bantuan yang masih bisa diubah.";

const pathOf = (periodId: string) => `/admin/kuesioner/${periodId}`;

function backTo(path: string, params: Record<string, string>): never {
  revalidatePath(path);
  redirect(`${path}?${new URLSearchParams(params)}`);
}

/** Kuesioner periode ini, atau string pesan kenapa tidak bisa diubah. */
async function loadQuestionnaire(periodId: string) {
  const questionnaire = await prisma.questionnaire.findFirst({
    where: { periodId, deletedAt: null, period: { deletedAt: null } },
    include: { period: true },
  });
  if (!questionnaire) return "Kuesioner tidak ditemukan";
  if (questionnaire.period.status === "ARCHIVED") return "Periode sudah diarsipkan, kuesioner tidak bisa diubah.";
  return { questionnaire, published: questionnaire.status === "PUBLISHED" };
}

const periodIdSchema = z.uuid();

/** FR-06.01: satu kuesioner per periode. */
export async function createQuestionnaireAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const periodId = periodIdSchema.safeParse(formData.get("periodId"));
  if (!periodId.success) backTo("/admin/kuesioner", { error: "Periode tidak valid" });

  const period = await prisma.surveyPeriod.findFirst({ where: { id: periodId.data, deletedAt: null } });
  if (!period || period.status === "ARCHIVED") backTo("/admin/kuesioner", { error: "Periode tidak ditemukan atau sudah diarsipkan" });
  if (await prisma.questionnaire.findUnique({ where: { periodId: period.id } })) backTo(pathOf(period.id), {});

  await runAsUser(user, () =>
    withDb((tx) => tx.questionnaire.create({ data: { periodId: period.id, title: `Kuesioner ${period.name}`, createdBy: user.id } })),
  );
  backTo(pathOf(period.id), { ok: "Kuesioner dibuat (Draf)" });
}

export async function updateQuestionnaireAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const parsed = z
    .object({
      periodId: z.uuid(),
      title: z.string().trim().min(1, "Judul kuesioner wajib diisi").max(200),
      instructions: z.string().trim().max(5000).transform((v) => v || null),
    })
    .safeParse({ periodId: formData.get("periodId"), title: formData.get("title"), instructions: formData.get("instructions") ?? "" });
  if (!parsed.success) backTo("/admin/kuesioner", { error: parsed.error.issues[0].message });
  const { periodId, title, instructions } = parsed.data;

  const loaded = await loadQuestionnaire(periodId);
  if (typeof loaded === "string") backTo(pathOf(periodId), { error: loaded });
  await runAsUser(user, () =>
    withDb((tx) => tx.questionnaire.update({ where: { id: loaded.questionnaire.id }, data: { title, instructions, updatedBy: user.id } })),
  );
  backTo(pathOf(periodId), { ok: "Judul & petunjuk kuesioner disimpan" });
}

/** FR-06.01, FR-06.08: tambah/ubah bagian, termasuk petunjuk bukti dukung (diisi admin, Q1 PRD). */
export async function saveSectionAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const periodId = periodIdSchema.safeParse(formData.get("periodId"));
  if (!periodId.success) backTo("/admin/kuesioner", { error: "Periode tidak valid" });
  const path = pathOf(periodId.data);
  const sectionId = z.uuid().optional().safeParse(formData.get("sectionId") || undefined);
  const parsed = sectionSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    evidenceLabel: formData.get("evidenceLabel") ?? "",
    evidenceRequired: formData.get("evidenceRequired") === "on",
  });
  if (!sectionId.success || !parsed.success) backTo(path, { error: parsed.error?.issues[0].message ?? "Bagian tidak valid" });
  const data = { ...parsed.data, description: parsed.data.description ?? null, evidenceLabel: parsed.data.evidenceLabel ?? null };

  const loaded = await loadQuestionnaire(periodId.data);
  if (typeof loaded === "string") backTo(path, { error: loaded });
  const { questionnaire, published } = loaded;

  const existing = sectionId.data
    ? await prisma.section.findFirst({ where: { id: sectionId.data, questionnaireId: questionnaire.id, deletedAt: null } })
    : null;
  if (sectionId.data && !existing) backTo(path, { error: "Bagian tidak ditemukan" });
  // setelah terbit hanya teks penjelas (deskripsi & petunjuk bukti) yang boleh diubah
  if (published) {
    if (!existing || existing.title !== data.title) backTo(path, { error: LOCKED });
    data.evidenceRequired = existing.evidenceRequired; // checkbox disabled di UI tidak ikut terkirim
  }

  await runAsUser(user, () =>
    withDb(async (tx) => {
      if (existing) return tx.section.update({ where: { id: existing.id }, data: { ...data, updatedBy: user.id } });
      const siblings = await tx.section.findMany({ where: { questionnaireId: questionnaire.id }, select: { code: true } });
      return tx.section.create({
        data: {
          ...data,
          questionnaireId: questionnaire.id,
          code: uniqueCode(slugifyCode(data.title), siblings.map((s) => s.code)),
          sortOrder: siblings.length,
          createdBy: user.id,
        },
      });
    }),
  );
  backTo(path, { ok: existing ? `Bagian ${data.title} disimpan` : `Bagian ${data.title} ditambahkan` });
}

/** Hapus bagian beserta soalnya (soft delete). Hanya saat Draf. */
export async function deleteSectionAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const ids = z.object({ periodId: z.uuid(), sectionId: z.uuid() }).safeParse({
    periodId: formData.get("periodId"),
    sectionId: formData.get("sectionId"),
  });
  if (!ids.success) backTo("/admin/kuesioner", { error: "Bagian tidak valid" });
  const path = pathOf(ids.data.periodId);

  const loaded = await loadQuestionnaire(ids.data.periodId);
  if (typeof loaded === "string") backTo(path, { error: loaded });
  if (loaded.published) backTo(path, { error: LOCKED });

  const now = new Date();
  await runAsUser(user, () =>
    withDb(async (tx) => {
      const section = await tx.section.update({
        where: { id: ids.data.sectionId, questionnaireId: loaded.questionnaire.id },
        data: { deletedAt: now, deletedBy: user.id },
      });
      await tx.question.updateMany({ where: { sectionId: section.id, deletedAt: null }, data: { deletedAt: now, deletedBy: user.id } });
    }),
  );
  backTo(path, { ok: "Bagian dan soalnya dihapus" });
}

/** FR-06.01: urutan bagian / soal dalam satu bagian dari drag and drop. */
export async function reorderAction(periodId: string, kind: "section" | "question", ids: string[]): Promise<{ error?: string }> {
  const user = await requireRole([...ROLES]);
  const parsed = z.object({ periodId: z.uuid(), kind: z.enum(["section", "question"]), ids: z.array(z.uuid()).min(1) }).safeParse({ periodId, kind, ids });
  if (!parsed.success) return { error: "Urutan tidak valid" };

  const loaded = await loadQuestionnaire(parsed.data.periodId);
  if (typeof loaded === "string") return { error: loaded };
  if (loaded.published) return { error: LOCKED };
  const questionnaireId = loaded.questionnaire.id;

  await runAsUser(user, () =>
    withDb(async (tx) => {
      for (const [sortOrder, id] of parsed.data.ids.entries()) {
        // where questionnaireId: id dari klien tidak dipercaya — hanya baris milik kuesioner ini
        if (kind === "section") await tx.section.update({ where: { id, questionnaireId }, data: { sortOrder, updatedBy: user.id } });
        else await tx.question.update({ where: { id, questionnaireId }, data: { sortOrder, updatedBy: user.id } });
      }
    }),
  );
  revalidatePath(pathOf(parsed.data.periodId));
  return {};
}

export type QuestionFormState = { error?: string; fieldErrors?: Record<string, string> };

function toStructure(q: QuestionInput): QuestionStructure {
  return {
    sectionId: q.sectionId,
    code: q.code,
    label: q.label,
    type: q.type,
    isRequired: q.isRequired,
    hasEvidenceUrl: q.hasEvidenceUrl,
    config: configForType(q.type, q.config as QuestionConfig),
    options: q.options.map((o) => ({ label: o.label, scoreValue: o.scoreValue })),
    institutionTypeIds: q.institutionTypeIds,
  };
}

async function writeOptions(tx: Db, questionId: string, q: QuestionInput, actorId: string) {
  await tx.questionOption.updateMany({ where: { questionId, deletedAt: null }, data: { deletedAt: new Date(), deletedBy: actorId } });
  const taken: string[] = [];
  const rows = q.options.map((o, sortOrder) => {
    // value disimpan di jawaban; Ya/Tidak memakai nilai tetap supaya mudah dirujuk aturan & rumus
    const value = q.type === "YES_NO" ? (sortOrder === 0 ? "yes" : "no") : uniqueCode(slugifyCode(o.label), taken);
    taken.push(value);
    return { questionId, label: o.label, value, scoreValue: o.scoreValue, sortOrder, createdBy: actorId };
  });
  if (rows.length) await tx.questionOption.createMany({ data: rows });

  await tx.questionInstitutionType.deleteMany({ where: { questionId } });
  if (q.institutionTypeIds.length) {
    await tx.questionInstitutionType.createMany({
      data: q.institutionTypeIds.map((institutionTypeId) => ({ questionId, institutionTypeId, createdBy: actorId })),
    });
  }
}

/** FR-06.02–06.04, 06.07, 06.08, 06.10 (kunci struktur setelah terbit, AC M06). */
export async function saveQuestionAction(_prev: QuestionFormState, formData: FormData): Promise<QuestionFormState> {
  const user = await requireRole([...ROLES]);
  const ids = z
    .object({ periodId: z.uuid(), questionId: z.uuid().optional() })
    .safeParse({ periodId: formData.get("periodId"), questionId: formData.get("questionId") || undefined });
  if (!ids.success) return { error: "Soal tidak valid" };

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload")));
  } catch {
    return { error: "Form tidak valid, muat ulang halaman" };
  }
  const parsed = questionSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { error: "Periksa kembali isian yang ditandai.", fieldErrors };
  }
  const q = parsed.data;
  const { periodId, questionId } = ids.data;

  const loaded = await loadQuestionnaire(periodId);
  if (typeof loaded === "string") return { error: loaded };
  const { questionnaire, published } = loaded;

  const [section, existing, sameCode, typeCount] = await Promise.all([
    prisma.section.findFirst({ where: { id: q.sectionId, questionnaireId: questionnaire.id, deletedAt: null } }),
    questionId
      ? prisma.question.findFirst({
          where: { id: questionId, questionnaireId: questionnaire.id, deletedAt: null },
          include: { options: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } }, institutionTypes: true },
        })
      : null,
    prisma.question.findFirst({ where: { questionnaireId: questionnaire.id, code: q.code, deletedAt: null, id: { not: questionId } } }),
    prisma.institutionType.count({ where: { id: { in: q.institutionTypeIds }, deletedAt: null } }),
  ]);
  if (!section) return { fieldErrors: { sectionId: "Bagian tidak ditemukan" }, error: "Periksa kembali isian yang ditandai." };
  if (questionId && !existing) return { error: "Soal tidak ditemukan" };
  if (typeCount !== q.institutionTypeIds.length) return { fieldErrors: { institutionTypeIds: "Jenis peserta tidak ditemukan" } };

  if (published) {
    if (!existing) return { error: LOCKED };
    const before: QuestionStructure = {
      sectionId: existing.sectionId,
      code: existing.code,
      label: existing.label,
      type: existing.type,
      isRequired: existing.isRequired,
      hasEvidenceUrl: existing.hasEvidenceUrl,
      config: (existing.config ?? {}) as QuestionConfig,
      options: existing.options.map((o) => ({ label: o.label, scoreValue: o.scoreValue === null ? null : Number(o.scoreValue) })),
      institutionTypeIds: existing.institutionTypes.map((t) => t.institutionTypeId),
    };
    if (structureChanged(before, toStructure(q))) return { error: LOCKED };
    await runAsUser(user, () =>
      withDb((tx) => tx.question.update({ where: { id: existing.id }, data: { helpText: q.helpText ?? null, updatedBy: user.id } })),
    );
    backTo(pathOf(periodId), { ok: "Teks bantuan disimpan" });
  }

  if (sameCode) return { fieldErrors: { code: `Kode ${q.code} sudah dipakai soal "${sameCode.label}"` }, error: "Periksa kembali isian yang ditandai." };

  const data = {
    sectionId: q.sectionId,
    code: q.code,
    label: q.label,
    helpText: q.helpText ?? null,
    type: q.type,
    isRequired: q.isRequired,
    hasEvidenceUrl: q.hasEvidenceUrl,
    config: configForType(q.type, q.config as QuestionConfig),
  };
  await runAsUser(user, () =>
    withDb(async (tx) => {
      const question = existing
        ? await tx.question.update({ where: { id: existing.id }, data: { ...data, updatedBy: user.id } })
        : await tx.question.create({
            data: {
              ...data,
              questionnaireId: questionnaire.id,
              sortOrder: await tx.question.count({ where: { sectionId: q.sectionId, deletedAt: null } }),
              createdBy: user.id,
            },
          });
      await writeOptions(tx, question.id, q, user.id);
    }),
  );
  backTo(pathOf(periodId), { ok: existing ? `Soal ${q.code} disimpan` : `Soal ${q.code} ditambahkan` });
}

export async function deleteQuestionAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const ids = z.object({ periodId: z.uuid(), questionId: z.uuid() }).safeParse({
    periodId: formData.get("periodId"),
    questionId: formData.get("questionId"),
  });
  if (!ids.success) backTo("/admin/kuesioner", { error: "Soal tidak valid" });
  const path = pathOf(ids.data.periodId);

  const loaded = await loadQuestionnaire(ids.data.periodId);
  if (typeof loaded === "string") backTo(path, { error: loaded });
  if (loaded.published) backTo(path, { error: LOCKED });

  await runAsUser(user, () =>
    withDb((tx) =>
      tx.question.update({
        where: { id: ids.data.questionId, questionnaireId: loaded.questionnaire.id },
        data: { deletedAt: new Date(), deletedBy: user.id },
      }),
    ),
  );
  backTo(path, { ok: "Soal dihapus" });
}
