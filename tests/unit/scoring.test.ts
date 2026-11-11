import { describe, expect, it } from "vitest";
import { computeScores, normalize, pickCategory, rankBy, validateScheme, type EdgeDef, type ScoreNodeDef, type VariableDef } from "@/lib/formula/scoring";

const node = (id: string, level: ScoreNodeDef["level"], patch: Partial<ScoreNodeDef> = {}): ScoreNodeDef => ({
  id,
  code: id,
  name: id,
  level,
  formula: null,
  normalization: "NONE",
  params: null,
  aggregation: "WEIGHTED_SUM",
  isRoot: level === "INDEX",
  overrides: [],
  ...patch,
});
const edge = (parentId: string, childId: string, weight: number): EdgeDef => ({ parentId, childId, weight });
const num = (code: string): VariableDef => ({ code, type: "INTEGER", options: [] });

// preset PRD/ERD: indeks_dasar = 0,30 × Kepatuhan + 0,70 × Kinerja (× 100)
const preset = (wKepatuhan = 0.3, wKinerja = 0.7) => ({
  nodes: [
    node("indeks", "INDEX", { name: "Indeks Dasar" }),
    node("kepatuhan", "DIMENSION"),
    node("kinerja", "DIMENSION"),
    node("i_kep", "INDICATOR", { formula: "kep" }),
    node("i_kin", "INDICATOR", { formula: "kin" }),
  ],
  edges: [edge("indeks", "kepatuhan", wKepatuhan), edge("indeks", "kinerja", wKinerja), edge("kepatuhan", "i_kep", 1), edge("kinerja", "i_kin", 1)],
  scale: 100,
});
const presetVars: VariableDef[] = [
  { code: "kep", type: "DECIMAL", options: [] },
  { code: "kin", type: "DECIMAL", options: [] },
];

describe("validateScheme [FR-09.06, AC M09]", () => {
  it("skema preset valid", () => {
    const s = preset();
    expect(validateScheme(s.nodes, s.edges, presetVars)).toEqual([]);
  });

  it('AC M09: Kepatuhan 30% + Kinerja 60% → "Total bobot Indeks Dasar 90%, harus 100%"', () => {
    const s = preset(0.3, 0.6);
    expect(validateScheme(s.nodes, s.edges, presetVars)).toContain("Total bobot Indeks Dasar 90%, harus 100%");
  });

  it("variabel rumus harus ada di kuesioner, tepat satu indeks, tidak yatim", () => {
    const s = preset();
    const nodes = [...s.nodes, node("indeks2", "INDEX"), node("yatim", "INDICATOR", { formula: "j_tidak_ada" })];
    const problems = validateScheme(nodes, s.edges, presetVars);
    expect(problems).toContain("Harus ada tepat satu node indeks (akar).");
    expect(problems.some((p) => p.includes("Variabel tidak dikenal: j_tidak_ada"))).toBe(true);
    expect(problems).toContain("yatim tidak terhubung ke indeks.");
  });

  it("siklus terdeteksi", () => {
    const s = preset();
    const problems = validateScheme(s.nodes, [...s.edges, edge("i_kep", "kepatuhan", 1)], presetVars);
    expect(problems.some((p) => p.startsWith("Graf berputar"))).toBe(true);
  });

  it("node induk tanpa anak & target normalisasi kosong", () => {
    const nodes = [node("indeks", "INDEX", { name: "Indeks Dasar" }), node("i", "INDICATOR", { formula: "kep", normalization: "TARGET_RATIO" })];
    const problems = validateScheme(nodes, [edge("indeks", "i", 1)], presetVars);
    expect(problems).toContain("Target normalisasi i harus > 0.");
    expect(validateScheme([node("indeks", "INDEX", { name: "Indeks Dasar" })], [], [])).toContain("Indeks Dasar belum punya node anak.");
  });
});

describe("computeScores [FR-09.07, FR-09.08]", () => {
  it("AC M09: Kepatuhan 0,865 & Kinerja 0,858 → Indeks Dasar 86,01", () => {
    const [r] = computeScores(preset(), presetVars, [{ submissionId: "s", institutionTypeId: "sd", answers: { kep: 0.865, kin: 0.858 } }]);
    expect(r.indexScore).toBe(86.01);
    expect(Math.abs(r.indexScore - 85.99)).toBeLessThanOrEqual(0.05); // toleransi AC terhadap data contoh Pontianak
    expect(r.nodes.get("kepatuhan")).toMatchObject({ normalized: 0.865, weighted: 0.865 * 0.3 });
  });

  it("rasio target, beda target per jenis (FR-09.05), data kosong = 0", () => {
    const nodes = [
      node("indeks", "INDEX"),
      node("rasio", "INDICATOR", {
        formula: "j_eksemplar / j_siswa",
        normalization: "TARGET_RATIO",
        params: { target: 10 },
        overrides: [{ institutionTypeId: "tbm", formula: null, params: { target: 5 } }],
      }),
    ];
    const scheme = { nodes, edges: [edge("indeks", "rasio", 1)], scale: 100 };
    const vars = [num("j_eksemplar"), num("j_siswa")];
    const [sd, tbm, empty, zero] = computeScores(scheme, vars, [
      { submissionId: "sd", institutionTypeId: "sd", answers: { j_eksemplar: 3000, j_siswa: 600 } },
      { submissionId: "tbm", institutionTypeId: "tbm", answers: { j_eksemplar: 3000, j_siswa: 600 } },
      { submissionId: "kosong", institutionTypeId: "sd", answers: { j_eksemplar: 3000 } },
      { submissionId: "nol", institutionTypeId: "sd", answers: { j_eksemplar: 3000, j_siswa: 0 } },
    ]);
    expect(sd.indexScore).toBe(50); // 5 per siswa / target 10
    expect(tbm.indexScore).toBe(100); // target TBM 5 → dibatasi 1
    expect(empty.indexScore).toBe(0);
    expect(empty.nodes.get("rasio")!.raw).toBeNull();
    expect(zero.indexScore).toBe(0); // bagi nol → tidak ada nilai
  });

  it("min-max antar peserta dan fungsi rumus gaya PRD (MIN, AVG, IF)", () => {
    const nodes = [node("indeks", "INDEX"), node("p", "INDICATOR", { formula: "IF(a > 0, AVG(a, b), MIN(a, b))", normalization: "MIN_MAX" })];
    const scheme = { nodes, edges: [edge("indeks", "p", 1)], scale: 100 };
    const scores = computeScores(scheme, [num("a"), num("b")], [
      { submissionId: "x", institutionTypeId: "sd", answers: { a: 10, b: 30 } }, // AVG = 20
      { submissionId: "y", institutionTypeId: "sd", answers: { a: 0, b: 5 } }, // MIN = 0
      { submissionId: "z", institutionTypeId: "sd", answers: { a: 5, b: 15 } }, // AVG = 10
    ]);
    expect(scores.map((s) => s.indexScore)).toEqual([100, 0, 50]);
  });

  it("nilai opsi & tabel ambang", () => {
    const vars: VariableDef[] = [
      { code: "akreditasi", type: "SINGLE_CHOICE", options: [{ value: "a", score: 1 }, { value: "b", score: 0.5 }] },
      num("rasio"),
    ];
    const nodes = [
      node("indeks", "INDEX", { aggregation: "AVERAGE" }),
      node("i_akr", "INDICATOR", { formula: "akreditasi", normalization: "OPTION_SCORE" }),
      node("i_amb", "INDICATOR", {
        formula: "rasio",
        normalization: "THRESHOLD_TABLE",
        params: { ranges: [{ min: 0, max: 2, score: 0.25 }, { min: 2, max: 5, score: 0.5 }, { min: 5, max: 10, score: 0.75 }, { min: 10, max: null, score: 1 }] },
      }),
    ];
    const scheme = { nodes, edges: [edge("indeks", "i_akr", 0.5), edge("indeks", "i_amb", 0.5)], scale: 100 };
    expect(validateScheme(nodes, scheme.edges, vars)).toEqual([]);
    const [r] = computeScores(scheme, vars, [{ submissionId: "s", institutionTypeId: "sd", answers: { akreditasi: "b", rasio: 12 } }]);
    expect(r.indexScore).toBe(75); // (0,5 + 1) / 2
  });

  it("normalize: min-max saat semua sama → 1", () => {
    expect(normalize("MIN_MAX", 7, null, { min: 7, max: 7 })).toBe(1);
  });
});

describe("rankBy / pickCategory [FR-09.08, FR-09.10]", () => {
  const items = [
    { id: "a", score: 90, type: "SD" },
    { id: "b", score: 90, type: "SD" },
    { id: "c", score: 80, type: "TBM" },
    { id: "d", score: 70, type: "SD" },
  ];

  it("ranking kompetisi: nilai sama berbagi peringkat", () => {
    const ranks = rankBy(items, (i) => i.score);
    expect(items.map((i) => ranks.get(i))).toEqual([1, 1, 3, 4]);
  });

  it("ranking per kelompok (jenis)", () => {
    const ranks = rankBy(items, (i) => i.score, (i) => i.type);
    expect(items.map((i) => ranks.get(i))).toEqual([1, 1, 1, 3]);
  });

  it("kategori berdasarkan rentang skor", () => {
    const cats = [
      { name: "Lolos Nasional", minScore: 70, maxScore: 100 },
      { name: "Belum Lolos", minScore: 0, maxScore: 69.99 },
    ];
    expect(pickCategory(cats, 70)?.name).toBe("Lolos Nasional");
    expect(pickCategory(cats, 69.5)?.name).toBe("Belum Lolos");
  });
});
