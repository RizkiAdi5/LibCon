import { analyzeExpression, evaluateNumber, findConditionCycle, FORMULA_FUNCTIONS, isEmpty } from "../validation/engine";

/**
 * Mesin skor (M09) — murni. Graf node: soal → indikator → subdimensi → dimensi
 * → indeks; satu node boleh punya beberapa induk (ERD). Dihitung dari bawah ke
 * atas. Rumus dievaluasi lewat whitelist mathjs (tanpa eval).
 */

export type NodeLevel = "INDICATOR" | "SUBDIMENSION" | "DIMENSION" | "INDEX";
export type Normalization = "NONE" | "TARGET_RATIO" | "MIN_MAX" | "THRESHOLD_TABLE" | "OPTION_SCORE" | "YEO_JOHNSON";
export type Aggregation = "WEIGHTED_SUM" | "AVERAGE" | "FORMULA";
export type ThresholdRange = { min: number; max: number | null; score: number };
export type NormParams = { target?: number; ranges?: ThresholdRange[] };

export type ScoreNodeDef = {
  id: string;
  code: string;
  name: string;
  level: NodeLevel;
  formula: string | null;
  normalization: Normalization;
  params: NormParams | null;
  aggregation: Aggregation;
  isRoot: boolean;
  /** FR-09.05: rumus/target berbeda per jenis peserta */
  overrides: { institutionTypeId: string; formula: string | null; params: NormParams | null }[];
};
export type EdgeDef = { parentId: string; childId: string; weight: number };
export type VariableDef = { code: string; type: string; options: { value: string; score: number | null }[] };
export type ScoringParticipant = { submissionId: string; institutionTypeId: string; answers: Record<string, unknown> /* per kode soal */ };
export type NodeResult = { raw: number | null; normalized: number; weighted: number | null };

const NUMERIC_TYPES = ["INTEGER", "DECIMAL", "CURRENCY", "PERCENT", "SCALE"];
const CHOICE_TYPES = ["SINGLE_CHOICE", "DROPDOWN", "YES_NO", "MULTI_CHOICE"];
const EPS = 1e-6;
const pct = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n * 100);

// ---------------------------------------------------------------- validasi (FR-09.06)

/** Daftar masalah sebelum skema diaktifkan; kosong = boleh aktif. */
export function validateScheme(nodes: ScoreNodeDef[], edges: EdgeDef[], variables: VariableDef[]): string[] {
  const problems: string[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const varByCode = new Map(variables.map((v) => [v.code, v]));
  const childrenOf = (id: string) => edges.filter((e) => e.parentId === id);

  const roots = nodes.filter((n) => n.isRoot);
  if (roots.length !== 1 || roots[0].level !== "INDEX") problems.push("Harus ada tepat satu node indeks (akar).");

  const cycle = findConditionCycle(edges.map((e) => ({ questionId: e.parentId, dependsOnQuestionId: e.childId })));
  if (cycle) problems.push(`Graf berputar (siklus): ${cycle.map((id) => byId.get(id)?.code ?? id).join(" → ")}.`);

  for (const n of nodes) {
    if (n.level !== "INDICATOR") {
      const kids = childrenOf(n.id);
      if (kids.length === 0) problems.push(`${n.name} belum punya node anak.`);
      else if (n.aggregation === "WEIGHTED_SUM") {
        const total = kids.reduce((s, e) => s + e.weight, 0);
        // AC M09: "Total bobot Indeks Dasar 90%, harus 100%"
        if (Math.abs(total - 1) > EPS) problems.push(`Total bobot ${n.name} ${pct(total)}%, harus 100%`);
      } else if (n.aggregation === "FORMULA") {
        const childCodes = kids.map((e) => byId.get(e.childId)?.code).filter((c): c is string => !!c);
        const { error } = analyzeExpression(n.formula ?? "", childCodes, FORMULA_FUNCTIONS);
        if (!n.formula || error) problems.push(`Rumus agregasi ${n.code}: ${error ?? "wajib diisi"}.`);
      }
    }
    if (n.level === "INDICATOR") {
      for (const { formula, label } of [{ formula: n.formula, label: n.code }, ...n.overrides.filter((o) => o.formula).map((o) => ({ formula: o.formula, label: `${n.code} (jenis khusus)` }))]) {
        const problem = indicatorFormulaProblem(formula, n.normalization, varByCode);
        if (problem) problems.push(`Rumus ${label}: ${problem}`);
      }
    }
    if (n.normalization === "TARGET_RATIO" && !((n.params?.target ?? 0) > 0)) problems.push(`Target normalisasi ${n.code} harus > 0.`);
    if (n.normalization === "THRESHOLD_TABLE" && !n.params?.ranges?.length) problems.push(`Tabel ambang ${n.code} belum diisi.`);
    if (!n.isRoot && !reachesRoot(n.id, edges, roots[0]?.id)) problems.push(`${n.name} tidak terhubung ke indeks.`);
  }
  return problems;
}

function indicatorFormulaProblem(formula: string | null, normalization: Normalization, vars: Map<string, VariableDef>): string | null {
  if (!formula?.trim()) return "wajib diisi.";
  const { error, variables } = analyzeExpression(formula, [...vars.keys()], FORMULA_FUNCTIONS);
  if (error) return `${error}.`;
  if (normalization === "OPTION_SCORE") {
    const v = vars.get(formula.trim());
    return v && CHOICE_TYPES.includes(v.type) ? null : "normalisasi Nilai opsi butuh rumus berupa satu kode soal pilihan.";
  }
  const nonNumeric = variables.filter((c) => !NUMERIC_TYPES.includes(vars.get(c)!.type));
  return nonNumeric.length ? `soal ${nonNumeric.join(", ")} bukan angka (pakai normalisasi Nilai opsi).` : null;
}

function reachesRoot(id: string, edges: EdgeDef[], rootId: string | undefined, seen = new Set<string>()): boolean {
  if (!rootId) return false;
  if (id === rootId) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  return edges.filter((e) => e.childId === id).some((e) => reachesRoot(e.parentId, edges, rootId, seen));
}

// ---------------------------------------------------------------- normalisasi (FR-09.04)

/** Transformasi Yeo-Johnson (1 nilai, lambda tertentu) — rumus standar, juga dipakai scipy.stats.yeojohnson. */
export function yeoJohnson(x: number, lambda: number): number {
  if (x >= 0) return Math.abs(lambda) < EPS ? Math.log1p(x) : (Math.pow(x + 1, lambda) - 1) / lambda;
  return Math.abs(lambda - 2) < EPS ? -Math.log1p(-x) : -(Math.pow(1 - x, 2 - lambda) - 1) / (2 - lambda);
}

/**
 * Lambda Yeo-Johnson dengan maximum likelihood (log-likelihood normal seperti scipy):
 * llf(λ) = −n/2·ln(var(y)) + (λ−1)·Σ sign(x)·ln(1+|x|). Dicari dengan golden-section di [−5, 5].
 * Data terlalu sedikit/seragam → 1 (transformasi identitas + geser).
 */
export function yeoJohnsonLambda(xs: number[]): number {
  if (xs.length < 3 || Math.max(...xs) - Math.min(...xs) < EPS) return 1;
  const logTerm = xs.reduce((s, x) => s + Math.sign(x) * Math.log1p(Math.abs(x)), 0);
  const llf = (l: number) => {
    const ys = xs.map((x) => yeoJohnson(x, l));
    const mean = ys.reduce((s, y) => s + y, 0) / ys.length;
    const variance = ys.reduce((s, y) => s + (y - mean) ** 2, 0) / ys.length;
    return variance > 0 && Number.isFinite(variance) ? (-ys.length / 2) * Math.log(variance) + (l - 1) * logTerm : -Infinity;
  };
  let [a, b] = [-5, 5];
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 100 && b - a > 1e-6; i++) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (llf(c) > llf(d)) b = d;
    else a = c;
  }
  return (a + b) / 2;
}

export type Population = { min: number; max: number; lambda?: number; tmin?: number; tmax?: number };

/** Populasi satu indikator untuk normalisasi relatif (min-max, Yeo-Johnson). */
export function populationOf(values: number[], kind: Normalization): Population | undefined {
  if (!values.length) return undefined;
  const base = { min: Math.min(...values), max: Math.max(...values) };
  if (kind !== "YEO_JOHNSON") return base;
  const lambda = yeoJohnsonLambda(values);
  const t = values.map((v) => yeoJohnson(v, lambda));
  return { ...base, lambda, tmin: Math.min(...t), tmax: Math.max(...t) };
}

export function normalize(kind: Normalization, raw: number | null, params: NormParams | null, population?: Population): number {
  if (raw === null) return 0; // keputusan Tahap 13: tidak ada data = 0
  switch (kind) {
    case "TARGET_RATIO":
      return params?.target ? Math.min(Math.max(raw / params.target, 0), 1) : 0;
    case "MIN_MAX":
      if (!population) return 0;
      // keputusan Tahap 13: semua peserta bernilai sama → 1
      return population.max - population.min < EPS ? 1 : (raw - population.min) / (population.max - population.min);
    case "YEO_JOHNSON": {
      // Q2 (Perpusnas, 2026-11-13): data IPLM dirapikan dengan Yeo-Johnson lalu dinormalisasi → min-max 0–1
      if (!population || population.lambda === undefined) return 0;
      const span = population.tmax! - population.tmin!;
      return span < EPS ? 1 : Math.min(Math.max((yeoJohnson(raw, population.lambda) - population.tmin!) / span, 0), 1);
    }
    case "THRESHOLD_TABLE": {
      const hit = (params?.ranges ?? []).find((r) => raw >= r.min && (r.max === null || raw < r.max));
      return hit?.score ?? 0;
    }
    default:
      return raw; // NONE (sudah 0–1) & OPTION_SCORE (skor opsi dari admin)
  }
}

// ---------------------------------------------------------------- hitung

function indicatorRaw(node: ScoreNodeDef, p: ScoringParticipant, vars: Map<string, VariableDef>): number | null {
  const override = node.overrides.find((o) => o.institutionTypeId === p.institutionTypeId);
  const formula = (override?.formula || node.formula || "").trim();
  if (node.normalization === "OPTION_SCORE") {
    const v = vars.get(formula);
    const value = p.answers[formula];
    if (!v || isEmpty(value)) return null;
    const picked = Array.isArray(value) ? value.map(String) : [String(value)];
    return v.options.filter((o) => picked.includes(o.value)).reduce((s, o) => s + (o.score ?? 0), 0);
  }
  const { variables, error } = analyzeExpression(formula, [...vars.keys()], FORMULA_FUNCTIONS);
  if (error) return null;
  const scope: Record<string, unknown> = {};
  for (const code of variables) {
    if (isEmpty(p.answers[code])) return null;
    scope[code] = p.answers[code];
  }
  return evaluateNumber(formula, scope);
}

/**
 * FR-09.07/09.08: hitung semua peserta sekaligus (min-max butuh seluruh populasi
 * periode). Mengembalikan rincian per node dan indeks (dibulatkan 2 desimal × skala).
 */
export function computeScores(scheme: { nodes: ScoreNodeDef[]; edges: EdgeDef[]; scale: number }, variables: VariableDef[], participants: ScoringParticipant[]) {
  const vars = new Map(variables.map((v) => [v.code, v]));
  const byId = new Map(scheme.nodes.map((n) => [n.id, n]));
  const root = scheme.nodes.find((n) => n.isRoot);
  const parentsOf = (id: string) => scheme.edges.filter((e) => e.childId === id);
  const childrenOf = (id: string) => scheme.edges.filter((e) => e.parentId === id);

  // lintasan 1: nilai mentah indikator semua peserta (untuk min-max)
  const indicators = scheme.nodes.filter((n) => n.level === "INDICATOR");
  const raws = new Map(participants.map((p) => [p.submissionId, new Map(indicators.map((n) => [n.id, indicatorRaw(n, p, vars)]))]));
  const population = new Map(
    indicators.map((n) => {
      const values = participants.map((p) => raws.get(p.submissionId)!.get(n.id)).filter((v): v is number => v !== null);
      return [n.id, populationOf(values, n.normalization)];
    }),
  );

  return participants.map((p) => {
    const results = new Map<string, NodeResult>();
    const visit = (id: string): number => {
      const cached = results.get(id);
      if (cached) return cached.normalized;
      const n = byId.get(id)!;
      const params = n.overrides.find((o) => o.institutionTypeId === p.institutionTypeId)?.params ?? n.params;
      let raw: number | null;
      if (n.level === "INDICATOR") raw = raws.get(p.submissionId)!.get(id) ?? null;
      else {
        const kids = childrenOf(id);
        const values = kids.map((e) => ({ code: byId.get(e.childId)!.code, value: visit(e.childId), weight: e.weight }));
        raw =
          n.aggregation === "AVERAGE"
            ? values.reduce((s, v) => s + v.value, 0) / (values.length || 1)
            : n.aggregation === "FORMULA"
              ? evaluateNumber(n.formula ?? "", Object.fromEntries(values.map((v) => [v.code, v.value])))
              : values.reduce((s, v) => s + v.value * v.weight, 0);
      }
      const normalized = normalize(n.normalization, raw, params, population.get(id));
      const parents = parentsOf(id);
      // nilai tertimbang hanya bermakna jika induknya satu
      results.set(id, { raw, normalized, weighted: parents.length === 1 ? normalized * parents[0].weight : null });
      return normalized;
    };
    const indexValue = root ? visit(root.id) : 0;
    for (const n of scheme.nodes) if (!results.has(n.id)) visit(n.id); // node yatim tetap dirinci
    return { submissionId: p.submissionId, indexScore: Math.round(indexValue * scheme.scale * 100) / 100, nodes: results };
  });
}

// ---------------------------------------------------------------- ranking & kategori (FR-09.08, FR-09.10)

/** Ranking kompetisi: nilai sama → peringkat sama (1, 1, 3). */
export function rankBy<T>(items: T[], score: (t: T) => number, group: (t: T) => string = () => ""): Map<T, number> {
  const ranks = new Map<T, number>();
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(group(item), [...(groups.get(group(item)) ?? []), item]);
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => score(b) - score(a));
    sorted.forEach((item, i) => ranks.set(item, i > 0 && score(item) === score(sorted[i - 1]) ? ranks.get(sorted[i - 1])! : i + 1));
  }
  return ranks;
}

export function pickCategory<T extends { minScore: number; maxScore: number }>(categories: T[], score: number): T | null {
  return categories.find((c) => score >= c.minScore && score <= c.maxScore) ?? null;
}
