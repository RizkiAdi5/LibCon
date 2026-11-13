"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { validateScheme, type NormParams, type ThresholdRange } from "@/lib/formula/scoring";
import { analyzeExpression, FORMULA_FUNCTIONS } from "@/lib/validation/engine";
import { copyScheme, createPresetScheme, loadScheme, loadVariables } from "@/lib/scoringData";
import { runOfficialScoring } from "@/lib/scoringRun";
import { sendTemplateEmail } from "@/lib/email/send";

const pathOf = (id: string) => `/admin/skoring/${id}`;
const LOCKED = "Skema ini tidak berstatus Draf. Buat versi baru untuk mengubah rumus.";

function backTo(path: string, params: Record<string, string>): never {
  revalidatePath(path);
  redirect(`${path}?${new URLSearchParams(params)}`);
}

const uuid = z.uuid();

/** Skema DRAF milik id ini, atau redirect dengan pesan. */
async function draftScheme(schemeId: unknown) {
  const id = uuid.safeParse(schemeId);
  if (!id.success) backTo("/admin/skoring", { error: "Skema tidak valid" });
  const scheme = await prisma.scoringScheme.findFirst({ where: { id: id.data, deletedAt: null } });
  if (!scheme) backTo("/admin/skoring", { error: "Skema tidak ditemukan" });
  if (scheme.status !== "DRAFT") backTo(pathOf(scheme.id), { error: LOCKED });
  return scheme;
}

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const numberOrNull = (v: FormDataEntryValue | null) => (text(v) === "" ? null : Number(text(v).replace(",", ".")));

/** "0-2=0,25" per baris; batas atas boleh kosong ("10-=1") untuk tanpa batas. */
function parseRanges(input: string): ThresholdRange[] | string {
  const ranges: ThresholdRange[] = [];
  for (const line of input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^(-?[\d.,]+)\s*-\s*(-?[\d.,]*)\s*=\s*([\d.,]+)$/.exec(line);
    if (!m) return `Baris tabel ambang tidak valid: "${line}" (format: min-maks=skor, mis. 0-2=0,25)`;
    const n = (s: string) => Number(s.replace(",", "."));
    ranges.push({ min: n(m[1]), max: m[2] === "" ? null : n(m[2]), score: n(m[3]) });
  }
  return ranges;
}

/** FR-09.01: skema baru untuk periode dengan preset 30/70 (PRD §5.8). */
export async function createSchemeAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const periodId = uuid.safeParse(formData.get("periodId"));
  if (!periodId.success) backTo("/admin/skoring", { error: "Periode tidak valid" });
  const period = await prisma.surveyPeriod.findFirst({ where: { id: periodId.data, deletedAt: null } });
  if (!period) backTo("/admin/skoring", { error: "Periode tidak ditemukan" });
  const variables = await loadVariables(period.id);
  const scheme = await runAsUser(user, () => withDb((tx) => createPresetScheme(tx, period.id, Number(period.passingScore), user.id, variables)));
  backTo(pathOf(scheme.id), { ok: "Skema dibuat dari preset 30/70 (aturan default gaya IPLM). Periksa & ubah indikator/bobot sebelum diaktifkan." });
}

/** FR-09.09 versi baru dari skema mana pun, atau FR-09.12 salin skema periode lalu ke periode ini. */
export async function copySchemeAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const ids = z.object({ sourceId: z.uuid(), periodId: z.uuid() }).safeParse({ sourceId: formData.get("sourceId"), periodId: formData.get("periodId") });
  if (!ids.success) backTo("/admin/skoring", { error: "Pilih skema sumber" });
  const [source, period] = await Promise.all([
    prisma.scoringScheme.findFirst({ where: { id: ids.data.sourceId, deletedAt: null } }),
    prisma.surveyPeriod.findFirst({ where: { id: ids.data.periodId, deletedAt: null } }),
  ]);
  if (!source || !period) backTo("/admin/skoring", { error: "Skema atau periode tidak ditemukan" });
  const last = await prisma.scoringScheme.findFirst({ where: { periodId: period.id }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
  const copy = await runAsUser(user, () =>
    withDb((tx) => copyScheme(tx, source.id, { periodId: period.id, name: source.periodId === period.id ? source.name : `${source.name} (salinan)`, version }, user.id)),
  );
  backTo(pathOf(copy.id), { ok: `Skema versi ${version} dibuat (Draf) dari ${source.name} v${source.version}` });
}

/** FR-09.01 + FR-09.06: aktifkan setelah lolos validasi; skema ACTIVE lain di periode yang sama diarsipkan. */
export async function activateSchemeAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const scheme = await draftScheme(formData.get("schemeId"));
  const [loaded, variables] = await Promise.all([loadScheme(scheme.id), loadVariables(scheme.periodId)]);
  const problems = validateScheme(loaded!.nodes, loaded!.edges, variables);
  if (problems.length) backTo(pathOf(scheme.id), { error: `Belum bisa diaktifkan: ${problems.join(" ")}` });

  const byCode = new Map(variables.map((v) => [v.code, v]));
  await runAsUser(user, () =>
    withDb(async (tx) => {
      await tx.scoringScheme.updateMany({ where: { periodId: scheme.periodId, status: "ACTIVE" }, data: { status: "ARCHIVED", updatedBy: user.id } });
      await tx.scoringScheme.update({ where: { id: scheme.id }, data: { status: "ACTIVE", activatedAt: new Date(), updatedBy: user.id } });
      // ERD score_node_variables: salinan kode variabel yang dipakai tiap indikator saat diaktifkan
      for (const n of loaded!.nodes.filter((x) => x.level === "INDICATOR")) {
        const codes = new Set(
          [n.formula, ...n.overrides.map((o) => o.formula)].flatMap((f) => (f ? analyzeExpression(f, [...byCode.keys()], FORMULA_FUNCTIONS).variables : [])),
        );
        await tx.scoreNodeVariable.deleteMany({ where: { nodeId: n.id } });
        if (codes.size) {
          await tx.scoreNodeVariable.createMany({
            data: [...codes].map((code) => ({ nodeId: n.id, questionId: byCode.get(code)!.questionId, variableCode: code, createdBy: user.id })),
          });
        }
      }
    }),
  );
  backTo(pathOf(scheme.id), { ok: "Skema aktif. Skema aktif sebelumnya di periode ini diarsipkan." });
}

const nodeSchema = z.object({
  level: z.enum(["INDICATOR", "SUBDIMENSION", "DIMENSION", "INDEX"]),
  code: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, "Kode node: huruf kecil, angka, garis bawah, diawali huruf").max(50),
  name: z.string().trim().min(1, "Nama node wajib diisi").max(200),
  formula: z.string().trim().max(500).transform((v) => v || null),
  normalization: z.enum(["NONE", "TARGET_RATIO", "MIN_MAX", "THRESHOLD_TABLE", "OPTION_SCORE", "YEO_JOHNSON"]),
  aggregation: z.enum(["WEIGHTED_SUM", "AVERAGE", "FORMULA"]),
});

/** FR-09.02–09.04: tambah/ubah node + rumus + normalisasi & parameternya. */
export async function saveNodeAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const scheme = await draftScheme(formData.get("schemeId"));
  const path = pathOf(scheme.id);
  const nodeId = uuid.optional().safeParse(formData.get("nodeId") || undefined);
  const parsed = nodeSchema.safeParse({
    level: formData.get("level"),
    code: formData.get("code"),
    name: formData.get("name"),
    formula: formData.get("formula") ?? "",
    normalization: formData.get("normalization") ?? "NONE",
    aggregation: formData.get("aggregation") ?? "WEIGHTED_SUM",
  });
  if (!nodeId.success || !parsed.success) backTo(path, { error: parsed.error?.issues[0].message ?? "Node tidak valid" });
  const d = parsed.data;

  let params: NormParams | null = null;
  if (d.normalization === "TARGET_RATIO") params = { target: numberOrNull(formData.get("target")) ?? undefined };
  if (d.normalization === "THRESHOLD_TABLE") {
    const ranges = parseRanges(text(formData.get("ranges")));
    if (typeof ranges === "string") backTo(path, { error: ranges });
    params = { ranges };
  }

  const clash = await prisma.scoreNode.findFirst({ where: { schemeId: scheme.id, code: d.code, id: { not: nodeId.data } } });
  if (clash) backTo(path, { error: `Kode ${d.code} sudah dipakai node ${clash.name}` });
  const existing = nodeId.data ? await prisma.scoreNode.findFirst({ where: { id: nodeId.data, schemeId: scheme.id, deletedAt: null } }) : null;
  if (nodeId.data && !existing) backTo(path, { error: "Node tidak ditemukan" });
  if (d.level === "INDEX" && !existing?.isRoot && (await prisma.scoreNode.count({ where: { schemeId: scheme.id, isRoot: true, deletedAt: null } }))) {
    backTo(path, { error: "Skema sudah punya node indeks. Hanya boleh satu (FR-09.06)." });
  }

  const data = { ...d, isRoot: d.level === "INDEX", normalizationParams: params ?? Prisma.DbNull };
  await runAsUser(user, () =>
    withDb((tx) =>
      existing
        ? tx.scoreNode.update({ where: { id: existing.id }, data: { ...data, updatedBy: user.id } })
        : tx.scoreNode.create({ data: { ...data, schemeId: scheme.id, createdBy: user.id } }),
    ),
  );
  backTo(path, { ok: `Node ${d.code} disimpan` });
}

export async function deleteNodeAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const scheme = await draftScheme(formData.get("schemeId"));
  const nodeId = uuid.safeParse(formData.get("nodeId"));
  if (!nodeId.success) backTo(pathOf(scheme.id), { error: "Node tidak valid" });
  await runAsUser(user, () =>
    withDb(async (tx) => {
      // kode diganti id supaya UNIQUE(scheme_id, code) tidak menghalangi node baru berkode sama
      const node = await tx.scoreNode.update({ where: { id: nodeId.data, schemeId: scheme.id }, data: { deletedAt: new Date(), deletedBy: user.id, code: nodeId.data } });
      // edge tidak punya soft delete (konfigurasi, bukan data inti) — lepas hubungan node yang dihapus
      await tx.scoreNodeEdge.deleteMany({ where: { OR: [{ parentNodeId: node.id }, { childNodeId: node.id }] } });
    }),
  );
  backTo(pathOf(scheme.id), { ok: "Node dihapus" });
}

/** FR-09.02: hubungkan anak ke induk dengan bobot (%). Satu node boleh punya beberapa induk (ERD). */
export async function saveEdgeAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const scheme = await draftScheme(formData.get("schemeId"));
  const path = pathOf(scheme.id);
  const parsed = z
    .object({ parentId: z.uuid(), childId: z.uuid("Pilih node anak"), weight: z.number("Bobot harus angka").min(0, "Bobot 0–100%").max(100, "Bobot 0–100%") })
    .safeParse({ parentId: formData.get("parentId"), childId: formData.get("childId"), weight: numberOrNull(formData.get("weight")) });
  if (!parsed.success) backTo(path, { error: parsed.error.issues[0].message });
  const { parentId, childId, weight } = parsed.data;
  if (parentId === childId) backTo(path, { error: "Node tidak bisa menjadi anak dirinya sendiri" });
  const count = await prisma.scoreNode.count({ where: { id: { in: [parentId, childId] }, schemeId: scheme.id, deletedAt: null } });
  if (count !== 2) backTo(path, { error: "Node tidak ditemukan di skema ini" });

  await runAsUser(user, () =>
    withDb((tx) =>
      tx.scoreNodeEdge.upsert({
        where: { parentNodeId_childNodeId: { parentNodeId: parentId, childNodeId: childId } },
        create: { parentNodeId: parentId, childNodeId: childId, weight: weight / 100, createdBy: user.id },
        update: { weight: weight / 100, updatedBy: user.id },
      }),
    ),
  );
  backTo(path, { ok: "Bobot disimpan" });
}

export async function deleteEdgeAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const scheme = await draftScheme(formData.get("schemeId"));
  const ids = z.object({ parentId: z.uuid(), childId: z.uuid() }).safeParse({ parentId: formData.get("parentId"), childId: formData.get("childId") });
  if (!ids.success) backTo(pathOf(scheme.id), { error: "Hubungan tidak valid" });
  await runAsUser(user, () =>
    withDb((tx) =>
      tx.scoreNodeEdge.deleteMany({ where: { parentNodeId: ids.data.parentId, childNodeId: ids.data.childId, parent: { schemeId: scheme.id } } }),
    ),
  );
  backTo(pathOf(scheme.id), { ok: "Hubungan dilepas" });
}

/** FR-09.05: rumus atau target berbeda per jenis peserta. */
export async function saveOverrideAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const scheme = await draftScheme(formData.get("schemeId"));
  const path = pathOf(scheme.id);
  const ids = z.object({ nodeId: z.uuid(), typeId: z.uuid("Pilih jenis peserta") }).safeParse({ nodeId: formData.get("nodeId"), typeId: formData.get("typeId") });
  if (!ids.success) backTo(path, { error: ids.error.issues[0].message });
  const node = await prisma.scoreNode.findFirst({ where: { id: ids.data.nodeId, schemeId: scheme.id, deletedAt: null } });
  if (!node) backTo(path, { error: "Node tidak ditemukan" });
  const formula = text(formData.get("formula")) || null;
  const target = numberOrNull(formData.get("target"));
  if (!formula && target === null) backTo(path, { error: "Isi rumus khusus atau target khusus" });

  await runAsUser(user, () =>
    withDb(async (tx) => {
      await tx.scoreNodeTypeOverride.updateMany({
        where: { nodeId: node.id, institutionTypeId: ids.data.typeId, deletedAt: null },
        data: { deletedAt: new Date(), deletedBy: user.id },
      });
      await tx.scoreNodeTypeOverride.create({
        data: { nodeId: node.id, institutionTypeId: ids.data.typeId, formula, normalizationParams: target === null ? undefined : { target }, createdBy: user.id },
      });
    }),
  );
  backTo(path, { ok: `Pengaturan khusus jenis untuk ${node.code} disimpan` });
}

export async function deleteOverrideAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const scheme = await draftScheme(formData.get("schemeId"));
  const id = uuid.safeParse(formData.get("overrideId"));
  if (!id.success) backTo(pathOf(scheme.id), { error: "Data tidak valid" });
  await runAsUser(user, () =>
    withDb((tx) =>
      tx.scoreNodeTypeOverride.updateMany({ where: { id: id.data, node: { schemeId: scheme.id } }, data: { deletedAt: new Date(), deletedBy: user.id } }),
    ),
  );
  backTo(pathOf(scheme.id), { ok: "Pengaturan khusus jenis dihapus" });
}

/** FR-09.10: kategori skor (mis. ≥ 70 Lolos Nasional) dengan warna. */
export async function saveCategoryAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const scheme = await draftScheme(formData.get("schemeId"));
  const path = pathOf(scheme.id);
  const parsed = z
    .object({
      categoryId: z.uuid().optional(),
      name: z.string().trim().min(1, "Nama kategori wajib diisi").max(100),
      minScore: z.number("Skor min. harus angka"),
      maxScore: z.number("Skor maks. harus angka"),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna tidak valid"),
    })
    .refine((c) => c.minScore <= c.maxScore, "Skor min. harus ≤ maks.")
    .safeParse({
      categoryId: formData.get("categoryId") || undefined,
      name: formData.get("name"),
      minScore: numberOrNull(formData.get("minScore")),
      maxScore: numberOrNull(formData.get("maxScore")),
      color: formData.get("color"),
    });
  if (!parsed.success) backTo(path, { error: parsed.error.issues[0].message });
  const { categoryId, ...data } = parsed.data;
  await runAsUser(user, () =>
    withDb(async (tx) => {
      if (categoryId) await tx.scoreCategory.updateMany({ where: { id: categoryId, schemeId: scheme.id }, data: { ...data, updatedBy: user.id } });
      else await tx.scoreCategory.create({ data: { ...data, schemeId: scheme.id, sortOrder: await tx.scoreCategory.count({ where: { schemeId: scheme.id } }), createdBy: user.id } });
    }),
  );
  backTo(path, { ok: `Kategori ${data.name} disimpan` });
}

export async function deleteCategoryAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const scheme = await draftScheme(formData.get("schemeId"));
  const id = uuid.safeParse(formData.get("categoryId"));
  if (!id.success) backTo(pathOf(scheme.id), { error: "Kategori tidak valid" });
  await runAsUser(user, () =>
    withDb((tx) => tx.scoreCategory.updateMany({ where: { id: id.data, schemeId: scheme.id }, data: { deletedAt: new Date(), deletedBy: user.id } })),
  );
  backTo(pathOf(scheme.id), { ok: "Kategori dihapus" });
}

/** FR-09.08/09.09: hitung (ulang) resmi semua kiriman Terverifikasi dengan skema Aktif. */
export async function officialRunAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const id = uuid.safeParse(formData.get("schemeId"));
  if (!id.success) backTo("/admin/skoring", { error: "Skema tidak valid" });
  const path = `${pathOf(id.data)}/hitung`;
  const scheme = await prisma.scoringScheme.findFirst({ where: { id: id.data, deletedAt: null } });
  if (!scheme || scheme.status !== "ACTIVE") backTo(path, { error: "Hitung resmi hanya dengan skema berstatus Aktif." });

  let result: { count: number };
  try {
    result = await runAsUser(user, async () => {
      const r = await runOfficialScoring(scheme.id, user.id);
      await withDb((tx) =>
        tx.activityLog.create({
          data: { userId: user.id, actorRole: user.role, activity: "RUN_SCORING", entityType: "scoring_scheme", entityId: scheme.id, description: `Hitung resmi ${scheme.name} v${scheme.version}: ${r.count} kiriman` },
        }),
      );
      return r;
    });
  } catch (error) {
    console.error("[skoring] hitung resmi gagal", error);
    backTo(path, { error: "Hitung resmi gagal. Detail kesalahan tercatat di riwayat perhitungan." });
  }
  backTo(path, { ok: `Hitung resmi selesai: ${result.count} kiriman Terverifikasi diberi skor.` });
}

/** FR-09.11 + BR-16: publikasikan skor periode (Super Admin) + email ke semua akun lembaga yang punya skor. */
export async function publishScoresAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const id = uuid.safeParse(formData.get("schemeId"));
  if (!id.success) backTo("/admin/skoring", { error: "Skema tidak valid" });
  const path = `${pathOf(id.data)}/hitung`;
  const scheme = await prisma.scoringScheme.findFirst({ where: { id: id.data, deletedAt: null }, include: { period: true } });
  if (!scheme) backTo("/admin/skoring", { error: "Skema tidak ditemukan" });
  const scored = await prisma.submissionScore.findMany({
    where: { isCurrent: true, submission: { periodId: scheme.periodId } },
    include: { submission: { include: { institution: { include: { users: { where: { deletedAt: null, status: "ACTIVE" } } } } } } },
  });
  if (scored.length === 0) backTo(path, { error: "Belum ada skor resmi. Jalankan hitung resmi dulu." });

  await runAsUser(user, () =>
    withDb(async (tx) => {
      await tx.surveyPeriod.update({
        where: { id: scheme.periodId },
        data: { scoresPublishedAt: new Date(), scoresPublishedById: user.id, updatedBy: user.id },
      });
      await tx.activityLog.create({
        data: { userId: user.id, actorRole: user.role, activity: "PUBLISH_SCORES", entityType: "survey_period", entityId: scheme.periodId, description: `Publikasi skor ${scheme.period.name}` },
      });
    }),
  );

  // email di luar transaksi: publikasi tetap berlaku walau sebagian email gagal
  let failed = 0;
  for (const s of scored) {
    for (const account of s.submission.institution.users) {
      try {
        await runAsUser(user, () =>
          withDb((tx) =>
            sendTemplateEmail(tx, {
              key: "SCORE_PUBLISHED",
              to: account.email,
              variables: { nama_lembaga: s.submission.institution.libraryName, periode: scheme.period.name },
              createdBy: user.id,
              userId: account.id,
              institutionId: s.submission.institutionId,
              relatedType: "survey_period",
              relatedId: scheme.periodId,
            }),
          ),
        );
      } catch (error) {
        console.error("[skoring] email publikasi gagal", error);
        failed++;
      }
    }
  }
  backTo(path, { ok: `Skor ${scheme.period.name} dipublikasikan ke ${scored.length} lembaga.${failed ? ` ${failed} email gagal dikirim.` : ""}` });
}

/** FR-09.11: tarik kembali publikasi dengan alasan. */
export async function unpublishScoresAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const id = uuid.safeParse(formData.get("schemeId"));
  if (!id.success) backTo("/admin/skoring", { error: "Skema tidak valid" });
  const path = `${pathOf(id.data)}/hitung`;
  const reason = z.string().trim().min(1, "Alasan penarikan wajib diisi").max(1000).safeParse(formData.get("reason") ?? "");
  if (!reason.success) backTo(path, { error: reason.error.issues[0].message });
  const scheme = await prisma.scoringScheme.findFirst({ where: { id: id.data, deletedAt: null } });
  if (!scheme) backTo("/admin/skoring", { error: "Skema tidak ditemukan" });

  await runAsUser(user, () =>
    withDb((tx) =>
      tx.surveyPeriod.update({
        where: { id: scheme.periodId },
        data: { scoresUnpublishedAt: new Date(), scoresUnpublishedById: user.id, scoresUnpublishReason: reason.data, updatedBy: user.id },
      }),
    ),
  );
  backTo(path, { ok: "Publikasi skor ditarik. Skor tidak lagi tampil ke peserta." });
}
