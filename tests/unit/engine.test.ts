import { describe, expect, it } from "vitest";
import {
  analyzeExpression,
  checkType,
  conditionMet,
  evaluateExpression,
  findConditionCycle,
  validateAnswers,
  type EngineQuestion,
  type EngineRule,
} from "@/lib/validation/engine";

const q = (id: string, patch: Partial<EngineQuestion> = {}): EngineQuestion => ({
  id,
  code: id,
  type: "INTEGER",
  isRequired: false,
  config: {},
  institutionTypeIds: [],
  options: [],
  ...patch,
});
const rule = (questionId: string, patch: Partial<EngineRule>): EngineRule => ({
  id: `r-${questionId}-${patch.ruleType}`,
  questionId,
  ruleType: "REQUIRED",
  params: {},
  severity: "BLOCK",
  message: "pesan admin",
  ...patch,
});
const run = (input: Partial<Parameters<typeof validateAnswers>[0]>) =>
  validateAnswers({ questions: [], rules: [], conditions: [], answers: {}, institutionTypeId: null, institutionTypeCode: null, ...input });

describe("ekspresi aman [EXPRESSION, CLAUDE.md: tidak pernah eval]", () => {
  it("contoh ERD: OR huruf besar dan perbandingan teks jenis", () => {
    const expr = "j_siswa > 0 OR jenis != 'SD'";
    expect(analyzeExpression(expr, ["j_siswa", "jenis"])).toEqual({ variables: ["j_siswa", "jenis"] });
    expect(evaluateExpression(expr, { j_siswa: 0, jenis: "SD" })).toBe(false);
    expect(evaluateExpression(expr, { j_siswa: 0, jenis: "TBM" })).toBe(true);
  });

  it("menolak variabel yang tidak ada di kuesioner", () => {
    expect(analyzeExpression("j_guru > 0", ["j_siswa"]).error).toContain("Variabel tidak dikenal: j_guru");
  });

  it("menolak fungsi/konstruksi berbahaya mathjs", () => {
    for (const expr of ['import({}, {override: true})', 'evaluate("1+1")', "f(x) = x", "a = 1", "createUnit('x')", "[1,2]"]) {
      expect(analyzeExpression(expr, ["a", "x"]).error, expr).toBeTruthy();
    }
  });

  it("fungsi aman diizinkan", () => {
    expect(analyzeExpression("max(a, b) >= round(a / 2)", ["a", "b"]).error).toBeUndefined();
  });
});

describe("checkType (pengaturan tipe, PRD §5.5)", () => {
  it("angka bulat dengan min/maks", () => {
    const question = q("x", { config: { min: 0, max: 100 } });
    expect(checkType(question, 5.5)).toBe("Harus bilangan bulat");
    expect(checkType(question, -1)).toBe("Minimal 0");
    expect(checkType(question, 1000)).toBe("Maksimal 100");
    expect(checkType(question, 50)).toBeNull();
  });

  it("persentase 0–100, desimal sesuai jumlah digit", () => {
    expect(checkType(q("p", { type: "PERCENT" }), 101)).toBe("Persentase harus 0–100");
    expect(checkType(q("d", { type: "DECIMAL", config: { decimals: 1 } }), 2.25)).toBe("Maks. 1 angka desimal");
  });

  it("link harus dari domain yang diizinkan", () => {
    const question = q("u", { type: "URL", config: { allowedDomains: ["drive.google.com"] } });
    expect(checkType(question, "https://drive.google.com/drive/folders/abc")).toBeNull();
    expect(checkType(question, "https://dropbox.com/x")).toBe("Link harus dari drive.google.com");
    expect(checkType(question, "bukan link")).toContain("tidak valid");
  });

  it("pilihan ganda: nilai harus opsi yang ada dan jumlah pilihan", () => {
    const question = q("m", { type: "MULTI_CHOICE", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], config: { maxSelect: 1 } });
    expect(checkType(question, ["a", "b"])).toBe("Pilih maksimal 1");
    expect(checkType(question, ["z"])).toBe("Pilihan tidak valid");
  });
});

describe("validateAnswers", () => {
  it("AC M06: aturan Blokir eksemplar ≥ judul — judul 3.914, eksemplar 3.000 → pesan admin, Blokir", () => {
    const questions = [q("j_judul"), q("j_eksemplar")];
    const rules = [rule("j_eksemplar", { ruleType: "COMPARE", params: { op: "GTE", other_question_id: "j_judul" }, message: "Eksemplar harus ≥ judul" })];
    const { issues } = run({ questions, rules, answers: { j_judul: 3914, j_eksemplar: 3000 } });
    expect(issues).toEqual([{ questionId: "j_eksemplar", ruleId: rules[0].id, severity: "BLOCK", message: "Eksemplar harus ≥ judul" }]);
    expect(run({ questions, rules, answers: { j_judul: 3914, j_eksemplar: 4000 } }).issues).toEqual([]);
  });

  it("AC M06: soal khusus SD/SMP tidak tampil dan tidak divalidasi untuk TBM", () => {
    const questions = [q("j_siswa", { isRequired: true, institutionTypeIds: ["sd", "smp"] })];
    const tbm = run({ questions, institutionTypeId: "tbm" });
    expect(tbm.visible.has("j_siswa")).toBe(false);
    expect(tbm.issues).toEqual([]);
    expect(run({ questions, institutionTypeId: "sd" }).issues[0].message).toBe("Wajib diisi");
  });

  it("aturan Flag tidak memblokir dan tetap dilaporkan", () => {
    const questions = [q("anggaran")];
    const rules = [rule("anggaran", { ruleType: "RANGE", params: { max: 1000 }, severity: "FLAG", message: "Terlalu besar?" })];
    expect(run({ questions, rules, answers: { anggaran: 5000 } }).issues[0].severity).toBe("FLAG");
  });

  it("perbandingan dengan soal kosong tidak dinilai (bukan gagal)", () => {
    const questions = [q("a"), q("b")];
    const rules = [rule("b", { ruleType: "COMPARE", params: { op: "GTE", other_question_id: "a" } })];
    expect(run({ questions, rules, answers: { b: 1 } }).issues).toEqual([]);
  });

  it("perubahan dari tahun lalu > 50% → flag", () => {
    const questions = [q("x")];
    const rules = [rule("x", { ruleType: "YOY_CHANGE", params: { max_pct: 50 }, severity: "FLAG" })];
    expect(run({ questions, rules, answers: { x: 160 }, previousAnswers: { x: 100 } }).issues).toHaveLength(1);
    expect(run({ questions, rules, answers: { x: 140 }, previousAnswers: { x: 100 } }).issues).toHaveLength(0);
    expect(run({ questions, rules, answers: { x: 160 } }).issues).toHaveLength(0); // tanpa data tahun lalu
  });

  it("ekspresi memakai kode soal dan jenis lembaga", () => {
    const questions = [q("j_siswa")];
    const rules = [rule("j_siswa", { ruleType: "EXPRESSION", params: { expr: "j_siswa > 0 OR jenis != 'SD'" } })];
    expect(run({ questions, rules, answers: { j_siswa: 0 }, institutionTypeCode: "SD" }).issues).toHaveLength(1);
    expect(run({ questions, rules, answers: { j_siswa: 0 }, institutionTypeCode: "TBM" }).issues).toHaveLength(0);
  });

  it("FR-06.05: logika tampil dan menjadi wajib", () => {
    const questions = [q("punya_web", { type: "YES_NO", options: [{ value: "yes", label: "Ya" }, { value: "no", label: "Tidak" }] }), q("url_web", { type: "URL" }), q("jml_kunjungan")];
    const conditions = [
      { questionId: "url_web", dependsOnQuestionId: "punya_web", operator: "EQ" as const, value: "yes", effect: "SHOW" as const },
      { questionId: "jml_kunjungan", dependsOnQuestionId: "punya_web", operator: "EQ" as const, value: "yes", effect: "REQUIRE" as const },
    ];
    const no = run({ questions, conditions, answers: { punya_web: "no" } });
    expect(no.visible.has("url_web")).toBe(false);
    expect(no.issues).toEqual([]);
    const yes = run({ questions, conditions, answers: { punya_web: "yes" } });
    expect(yes.visible.has("url_web")).toBe(true);
    expect(yes.issues.map((i) => i.questionId)).toEqual(["jml_kunjungan"]);
  });
});

describe("conditionMet / findConditionCycle", () => {
  it("operator kondisi", () => {
    expect(conditionMet("GT", 5, "3")).toBe(true);
    expect(conditionMet("IN", "b", ["a", "b"])).toBe(true);
    expect(conditionMet("IN", ["x", "b"], ["b"])).toBe(true);
    expect(conditionMet("NOT_EMPTY", "", null)).toBe(false);
    expect(conditionMet("EQ", ["a", "c"], "c")).toBe(true);
  });

  it("FR-06.10: siklus logika tampil terdeteksi", () => {
    expect(findConditionCycle([{ questionId: "a", dependsOnQuestionId: "b" }, { questionId: "b", dependsOnQuestionId: "c" }])).toBeNull();
    const cycle = findConditionCycle([
      { questionId: "a", dependsOnQuestionId: "b" },
      { questionId: "b", dependsOnQuestionId: "c" },
      { questionId: "c", dependsOnQuestionId: "a" },
    ]);
    expect(cycle).toEqual(["a", "b", "c"]);
  });
});
