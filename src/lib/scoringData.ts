import { prisma, type Db } from "./db/client";
import type { EdgeDef, NormParams, ScoreNodeDef, VariableDef } from "./formula/scoring";
import { presetIndicators } from "./formula/iplmPreset";

/** Skema + node/edge/override/kategori dalam bentuk mesin skor. */
export async function loadScheme(schemeId: string) {
  const scheme = await prisma.scoringScheme.findFirst({
    where: { id: schemeId, deletedAt: null },
    include: {
      period: { include: { questionnaire: true } },
      nodes: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        include: { edgesAsParent: true, typeOverrides: { where: { deletedAt: null }, include: { institutionType: true } } },
      },
      categories: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { minScore: "desc" }] },
    },
  });
  if (!scheme) return null;
  const nodes: ScoreNodeDef[] = scheme.nodes.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
    level: n.level,
    formula: n.formula,
    normalization: n.normalization,
    params: (n.normalizationParams ?? null) as NormParams | null,
    aggregation: n.aggregation,
    isRoot: n.isRoot,
    overrides: n.typeOverrides.map((o) => ({ institutionTypeId: o.institutionTypeId, formula: o.formula, params: (o.normalizationParams ?? null) as NormParams | null })),
  }));
  const live = new Set(nodes.map((n) => n.id));
  const edges: EdgeDef[] = scheme.nodes.flatMap((n) =>
    n.edgesAsParent.filter((e) => live.has(e.childNodeId)).map((e) => ({ parentId: e.parentNodeId, childId: e.childNodeId, weight: Number(e.weight) })),
  );
  const categories = scheme.categories.map((c) => ({ ...c, minScore: Number(c.minScore), maxScore: Number(c.maxScore) }));
  return { scheme, nodes, edges, categories, scale: Number(scheme.scale) };
}

/** FR-09.03/09.06: variabel yang boleh dipakai rumus = soal kuesioner periode itu. */
export async function loadVariables(periodId: string): Promise<(VariableDef & { questionId: string; label: string })[]> {
  const questions = await prisma.question.findMany({
    where: { deletedAt: null, questionnaire: { periodId, deletedAt: null }, section: { deletedAt: null } },
    include: { options: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  return questions.map((q) => ({
    questionId: q.id,
    code: q.code,
    label: q.label,
    type: q.type,
    options: q.options.map((o) => ({ value: o.value, score: o.scoreValue === null ? null : Number(o.scoreValue) })),
  }));
}

/**
 * Salin skema beserta node, edge, override per jenis, dan kategori sebagai DRAFT.
 * Dipakai: versi baru (FR-09.09), salin dari periode lalu (FR-09.12), salin periode (FR-02.06).
 */
export async function copyScheme(tx: Db, sourceId: string, target: { periodId: string; name: string; version: number }, actorId: string) {
  const source = await tx.scoringScheme.findUniqueOrThrow({
    where: { id: sourceId },
    include: {
      nodes: { where: { deletedAt: null }, include: { edgesAsParent: true, typeOverrides: { where: { deletedAt: null } } } },
      categories: { where: { deletedAt: null } },
    },
  });
  const copy = await tx.scoringScheme.create({
    data: { periodId: target.periodId, name: target.name, version: target.version, scale: source.scale, notes: source.notes, copiedFromId: source.id, createdBy: actorId },
  });
  const idMap = new Map<string, string>();
  for (const n of source.nodes) {
    const created = await tx.scoreNode.create({
      data: {
        schemeId: copy.id,
        level: n.level,
        code: n.code,
        name: n.name,
        formula: n.formula,
        normalization: n.normalization,
        normalizationParams: n.normalizationParams ?? undefined,
        aggregation: n.aggregation,
        isRoot: n.isRoot,
        sortOrder: n.sortOrder,
        createdBy: actorId,
      },
    });
    idMap.set(n.id, created.id);
    for (const o of n.typeOverrides) {
      await tx.scoreNodeTypeOverride.create({
        data: { nodeId: created.id, institutionTypeId: o.institutionTypeId, formula: o.formula, normalizationParams: o.normalizationParams ?? undefined, createdBy: actorId },
      });
    }
  }
  const edges = source.nodes.flatMap((n) => n.edgesAsParent).filter((e) => idMap.has(e.childNodeId));
  if (edges.length) {
    await tx.scoreNodeEdge.createMany({
      data: edges.map((e) => ({ parentNodeId: idMap.get(e.parentNodeId)!, childNodeId: idMap.get(e.childNodeId)!, weight: e.weight, createdBy: actorId })),
    });
  }
  if (source.categories.length) {
    await tx.scoreCategory.createMany({
      data: source.categories.map((c) => ({ schemeId: copy.id, name: c.name, minScore: c.minScore, maxScore: c.maxScore, color: c.color, sortOrder: c.sortOrder, createdBy: actorId })),
    });
  }
  return copy;
}

/**
 * Preset awal PRD §5.8 / ERD: Indeks Dasar = 0,30 Kepatuhan + 0,70 Kinerja, empat
 * subdimensi + indikator default gaya IPLM (`iplmPreset.ts`) untuk kode soal IPLM yang ada di kuesioner
 * periode. Subdimensi tanpa soal yang cocok tetap kosong → skema belum bisa diaktifkan sampai admin melengkapinya.
 */
export async function createPresetScheme(tx: Db, periodId: string, passingScore: number, actorId: string, variables: Awaited<ReturnType<typeof loadVariables>>) {
  const scheme = await tx.scoringScheme.create({ data: { periodId, name: "Skema IPLM (preset 30/70)", version: 1, createdBy: actorId } });
  let order = 0;
  const mk = (level: "INDEX" | "DIMENSION" | "SUBDIMENSION" | "INDICATOR", code: string, name: string, extra: object = {}) =>
    tx.scoreNode.create({ data: { schemeId: scheme.id, level, code, name, sortOrder: order++, createdBy: actorId, ...extra } });
  const edge = (parentNodeId: string, childNodeId: string, weight: number) => ({ parentNodeId, childNodeId, weight, createdBy: actorId });
  const index = await mk("INDEX", "indeks_dasar", "Indeks Dasar", { isRoot: true });
  const dims = { dim_kepatuhan: await mk("DIMENSION", "dim_kepatuhan", "Kepatuhan"), dim_kinerja: await mk("DIMENSION", "dim_kinerja", "Kinerja") };
  // bobot terbukti dari docs/data-contoh-iplm.xlsx (lihat iplmPreset.ts); semua tetap bisa diubah selama Draf
  const edges = [edge(index.id, dims.dim_kepatuhan.id, 0.3), edge(index.id, dims.dim_kinerja.id, 0.7)];
  for (const sub of presetIndicators(variables)) {
    // subdimensi = rata-rata indikatornya (default), indikator = Yeo-Johnson + min-max (Q2)
    const node = await mk("SUBDIMENSION", sub.code, sub.name, { aggregation: "AVERAGE" });
    edges.push(edge(dims[sub.dimension].id, node.id, 0.5));
    for (const q of sub.available) {
      const ind = await mk("INDICATOR", `i_${q.code}`, q.label, { formula: q.code, normalization: "YEO_JOHNSON" });
      edges.push(edge(node.id, ind.id, Math.round(10_000 / sub.available.length) / 10_000));
    }
  }
  await tx.scoreNodeEdge.createMany({ data: edges });
  // FR-09.10 contoh "≥ 70 Lolos Nasional" — batas dari pengaturan periode (FR-02.08)
  await tx.scoreCategory.createMany({
    data: [
      { schemeId: scheme.id, name: "Lolos Nasional", minScore: passingScore, maxScore: 100, color: "#15803d", sortOrder: 0, createdBy: actorId },
      { schemeId: scheme.id, name: "Belum Lolos", minScore: 0, maxScore: Math.max(passingScore - 0.01, 0), color: "#b91c1c", sortOrder: 1, createdBy: actorId },
    ],
  });
  return scheme;
}

// status selalu warna + teks (PRD §8)
export const SCHEME_STATUS = {
  DRAFT: { label: "Draf", className: "text-muted-foreground" },
  ACTIVE: { label: "Aktif", className: "text-green-700" },
  ARCHIVED: { label: "Diarsipkan", className: "text-muted-foreground" },
} as const;

export const LEVEL_LABEL = { INDEX: "Indeks", DIMENSION: "Dimensi", SUBDIMENSION: "Subdimensi", INDICATOR: "Indikator" } as const;
export const NORMALIZATION_LABEL = {
  NONE: "Tanpa normalisasi",
  TARGET_RATIO: "Rasio terhadap target",
  MIN_MAX: "Min-max antar peserta",
  THRESHOLD_TABLE: "Tabel ambang",
  OPTION_SCORE: "Nilai opsi",
  YEO_JOHNSON: "Yeo-Johnson + min-max (gaya IPLM)",
} as const;
export const AGGREGATION_LABEL = { WEIGHTED_SUM: "Jumlah berbobot", AVERAGE: "Rata-rata", FORMULA: "Rumus" } as const;
