import { all, create, type MathNode } from "mathjs";
import type { QuestionConfig } from "../questionnaire";

/**
 * Mesin validasi soal (FR-06.05, FR-06.06) — murni, dipakai pratinjau admin
 * (FR-06.09), pengisian peserta (M07), dan pemeriksaan server (M08).
 * Jawaban dikunci per question id. Soal yang tidak tampil (logika tampil
 * atau tidak berlaku untuk jenis lembaga) tidak divalidasi.
 */

// ---------------------------------------------------------------- ekspresi

const math = create(all);
// `==`/`!=` bawaan mathjs mengubah teks jadi angka — contoh ERD `jenis != 'SD'` butuh perbandingan teks
math.import(
  {
    equal: math.typed("equal", { "string, string": (a: string, b: string) => a === b }),
    unequal: math.typed("unequal", { "string, string": (a: string, b: string) => a !== b }),
  },
  { override: false },
);

const ALLOWED_OPERATORS = new Set([
  "add", "subtract", "multiply", "divide", "mod", "unaryMinus", "unaryPlus",
  "larger", "largerEq", "smaller", "smallerEq", "equal", "unequal", "and", "or", "not",
]);
const ALLOWED_FUNCTIONS = new Set(["abs", "min", "max", "round", "floor", "ceil", "sqrt"]);
const MAX_EXPRESSION_LENGTH = 500;

/** ERD menulis `OR`/`AND`; mathjs hanya kenal huruf kecil. */
function normalizeExpression(expr: string): string {
  return expr.replace(/\b(AND|OR|NOT)\b/g, (k) => k.toLowerCase());
}

/**
 * Whitelist node AST — tidak pernah `eval`. Mengembalikan variabel yang dirujuk,
 * atau pesan error yang bisa ditampilkan ke admin.
 */
export function analyzeExpression(expr: string, allowedVariables: string[]): { error?: string; variables: string[] } {
  if (expr.length > MAX_EXPRESSION_LENGTH) return { error: `Ekspresi maks. ${MAX_EXPRESSION_LENGTH} karakter`, variables: [] };
  let root: MathNode;
  try {
    root = math.parse(normalizeExpression(expr));
  } catch (e) {
    return { error: `Ekspresi tidak bisa dibaca: ${(e as Error).message}`, variables: [] };
  }
  const allowed = new Set(allowedVariables);
  const variables = new Set<string>();
  let error: string | undefined;
  root.traverse((node, _path, parent) => {
    if (error) return;
    const n = node as MathNode & { fn?: string | { name: string }; name?: string; value?: unknown };
    switch (node.type) {
      case "ConstantNode":
      case "ParenthesisNode":
        return;
      case "OperatorNode":
        if (!ALLOWED_OPERATORS.has(n.fn as string)) error = `Operator tidak diizinkan: ${(n as { op?: string }).op ?? n.fn}`;
        return;
      case "FunctionNode": {
        const name = typeof n.fn === "object" ? n.fn.name : "";
        if (!ALLOWED_FUNCTIONS.has(name)) error = `Fungsi tidak diizinkan: ${name}`;
        return;
      }
      case "SymbolNode": {
        // nama fungsi di FunctionNode juga SymbolNode — sudah dicek di atas
        if (parent?.type === "FunctionNode" && (parent as unknown as { fn: MathNode }).fn === node) return;
        if (n.name === "true" || n.name === "false") return;
        if (!allowed.has(n.name!)) error = `Variabel tidak dikenal: ${n.name}`;
        else variables.add(n.name!);
        return;
      }
      default:
        error = `Bentuk ekspresi tidak diizinkan (${node.type})`;
    }
  });
  return error ? { error, variables: [] } : { variables: [...variables] };
}

/** true/false hasil ekspresi; null jika gagal dihitung (dianggap tidak bisa dinilai, bukan gagal). */
export function evaluateExpression(expr: string, scope: Record<string, unknown>): boolean | null {
  try {
    const result = math.evaluate(normalizeExpression(expr), { ...scope });
    return typeof result === "boolean" ? result : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- tipe data

export type RuleType = "REQUIRED" | "RANGE" | "COMPARE" | "FORMAT" | "YOY_CHANGE" | "EXPRESSION";
export type Severity = "BLOCK" | "FLAG";
export type CompareOp = "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE";
export type ConditionOp = CompareOp | "IN" | "NOT_EMPTY";

export type EngineQuestion = {
  id: string;
  code: string;
  type: string;
  isRequired: boolean;
  config: QuestionConfig;
  institutionTypeIds: string[];
  options: { value: string; label: string }[];
};
export type EngineRule = {
  id: string;
  questionId: string;
  ruleType: RuleType;
  params: Record<string, unknown>;
  severity: Severity;
  message: string;
};
export type EngineCondition = {
  questionId: string;
  dependsOnQuestionId: string;
  operator: ConditionOp;
  value: unknown;
  effect: "SHOW" | "REQUIRE";
};
export type Answers = Record<string, unknown>;
export type ValidationIssue = { questionId: string; ruleId: string | null; severity: Severity; message: string };

export const COMPARE_OP_LABEL: Record<CompareOp, string> = { EQ: "=", NEQ: "≠", GT: ">", GTE: "≥", LT: "<", LTE: "≤" };

// ---------------------------------------------------------------- helper nilai

export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function compare(op: CompareOp, a: unknown, b: unknown): boolean {
  const na = asNumber(a);
  const nb = asNumber(b) ?? (typeof b === "string" && b.trim() !== "" && !Number.isNaN(Number(b)) ? Number(b) : null);
  if (op === "EQ" || op === "NEQ") {
    const same = na !== null && nb !== null ? na === nb : String(a) === String(b);
    return op === "EQ" ? same : !same;
  }
  if (na === null || nb === null) return false;
  return op === "GT" ? na > nb : op === "GTE" ? na >= nb : op === "LT" ? na < nb : na <= nb;
}

/** FR-06.05: kondisi logika tampil terhadap jawaban soal lain. */
export function conditionMet(op: ConditionOp, actual: unknown, expected: unknown): boolean {
  if (op === "NOT_EMPTY") return !isEmpty(actual);
  if (isEmpty(actual)) return false;
  if (op === "IN") {
    const list = (Array.isArray(expected) ? expected : [expected]).map(String);
    return Array.isArray(actual) ? actual.some((a) => list.includes(String(a))) : list.includes(String(actual));
  }
  if (Array.isArray(actual)) return op === "EQ" ? actual.map(String).includes(String(expected)) : op === "NEQ" ? !actual.map(String).includes(String(expected)) : false;
  return compare(op, actual, expected);
}

// ---------------------------------------------------------------- tampil & wajib

/** Soal yang tampil + yang wajib untuk jenis lembaga ini, dengan jawaban saat ini. */
export function resolveVisibility(
  questions: EngineQuestion[],
  conditions: EngineCondition[],
  answers: Answers,
  institutionTypeId: string | null,
): { visible: Set<string>; required: Set<string> } {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();

  const isVisible = (id: string): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    const q = byId.get(id);
    // FR-06.04: tanpa jenis = semua jenis; null = pratinjau tanpa jenis tertentu
    const applies = !!q && (q.institutionTypeIds.length === 0 || institutionTypeId === null || q.institutionTypeIds.includes(institutionTypeId));
    if (!applies || visiting.has(id)) return false; // siklus ditolak saat terbit; di sini dianggap tidak tampil
    visiting.add(id);
    const shows = conditions.filter((c) => c.questionId === id && c.effect === "SHOW");
    const result = shows.every((c) => isVisible(c.dependsOnQuestionId) && conditionMet(c.operator, answers[c.dependsOnQuestionId], c.value));
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };

  const visible = new Set(questions.filter((q) => isVisible(q.id)).map((q) => q.id));
  const required = new Set(
    questions
      .filter((q) => visible.has(q.id))
      .filter(
        (q) =>
          q.isRequired ||
          conditions.some(
            (c) => c.questionId === q.id && c.effect === "REQUIRE" && visible.has(c.dependsOnQuestionId) && conditionMet(c.operator, answers[c.dependsOnQuestionId], c.value),
          ),
      )
      .map((q) => q.id),
  );
  return { visible, required };
}

// ---------------------------------------------------------------- cek bawaan tipe

const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const NUMERIC_TYPES = ["INTEGER", "DECIMAL", "CURRENCY", "PERCENT", "SCALE"];

/** Pemeriksaan dari pengaturan tipe soal (PRD §5.5). Selalu Blokir. */
export function checkType(q: EngineQuestion, value: unknown): string | null {
  if (isEmpty(value)) return null;
  const c = q.config;
  if (NUMERIC_TYPES.includes(q.type)) {
    const n = asNumber(value);
    if (n === null) return "Harus berupa angka";
    if ((q.type === "INTEGER" || q.type === "CURRENCY" || q.type === "SCALE") && !Number.isInteger(n)) return "Harus bilangan bulat";
    if (q.type === "PERCENT" && (n < 0 || n > 100)) return "Persentase harus 0–100";
    if (q.type === "SCALE" && (n < 1 || n > 5)) return "Pilih nilai 1–5";
    if (q.type === "DECIMAL" && c.decimals != null && (String(n).split(".")[1]?.length ?? 0) > c.decimals) return `Maks. ${c.decimals} angka desimal`;
    if (c.min != null && n < c.min) return `Minimal ${fmt(c.min)}`;
    if (c.max != null && n > c.max) return `Maksimal ${fmt(c.max)}`;
    return null;
  }
  if ((q.type === "SHORT_TEXT" || q.type === "LONG_TEXT") && c.maxLength && String(value).length > c.maxLength) return `Maks. ${fmt(c.maxLength)} karakter`;
  if (q.type === "URL") {
    let url: URL;
    try {
      url = new URL(String(value));
    } catch {
      return "Link tidak valid (harus diawali https://)";
    }
    if (!/^https?:$/.test(url.protocol)) return "Link harus diawali http:// atau https://";
    const domains = c.allowedDomains ?? [];
    if (domains.length && !domains.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`))) return `Link harus dari ${domains.join(" atau ")}`;
    return null;
  }
  if (q.type === "DATE") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return "Tanggal tidak valid";
    if (c.minDate && String(value) < c.minDate) return `Tanggal paling awal ${c.minDate}`;
    if (c.maxDate && String(value) > c.maxDate) return `Tanggal paling akhir ${c.maxDate}`;
    return null;
  }
  const values = q.options.map((o) => o.value);
  if (["SINGLE_CHOICE", "DROPDOWN", "YES_NO"].includes(q.type) && !values.includes(String(value))) return "Pilihan tidak valid";
  if (q.type === "MULTI_CHOICE") {
    const picked = Array.isArray(value) ? value.map(String) : [];
    if (picked.some((v) => !values.includes(v))) return "Pilihan tidak valid";
    if (c.minSelect != null && picked.length < c.minSelect) return `Pilih minimal ${c.minSelect}`;
    if (c.maxSelect != null && picked.length > c.maxSelect) return `Pilih maksimal ${c.maxSelect}`;
  }
  if (q.type === "TABLE") {
    const rows = Array.isArray(value) ? value.length : 0;
    if (c.minRows != null && rows < c.minRows) return `Minimal ${c.minRows} baris`;
    if (c.maxRows != null && rows > c.maxRows) return `Maksimal ${c.maxRows} baris`;
  }
  return null;
}

// ---------------------------------------------------------------- aturan admin

/** true = lolos, false = gagal, null = tidak bisa dinilai (data pembanding kosong/tersembunyi). */
export function evaluateRule(
  rule: EngineRule,
  ctx: {
    value: unknown;
    answers: Answers;
    visible: Set<string>;
    codeToId: Map<string, string>;
    institutionTypeCode: string | null;
    previousValue?: unknown;
  },
): boolean | null {
  const p = rule.params;
  const { value } = ctx;
  switch (rule.ruleType) {
    case "REQUIRED":
      return !isEmpty(value);
    case "RANGE": {
      if (isEmpty(value)) return null;
      const n = asNumber(value);
      if (n === null) return false;
      return (p.min == null || n >= Number(p.min)) && (p.max == null || n <= Number(p.max));
    }
    case "COMPARE": {
      const otherId = String(p.other_question_id);
      if (isEmpty(value) || !ctx.visible.has(otherId) || isEmpty(ctx.answers[otherId])) return null;
      return compare(p.op as CompareOp, value, ctx.answers[otherId]);
    }
    case "FORMAT": {
      if (isEmpty(value)) return null;
      try {
        return new RegExp(String(p.pattern)).test(String(value));
      } catch {
        return null;
      }
    }
    case "YOY_CHANGE": {
      const cur = asNumber(value);
      const prev = asNumber(ctx.previousValue);
      if (cur === null || prev === null || prev === 0) return null;
      return (Math.abs(cur - prev) / Math.abs(prev)) * 100 <= Number(p.max_pct);
    }
    case "EXPRESSION": {
      const expr = String(p.expr);
      const { variables, error } = analyzeExpression(expr, [...ctx.codeToId.keys(), "jenis"]);
      if (error) return null;
      const scope: Record<string, unknown> = {};
      for (const v of variables) {
        if (v === "jenis") {
          if (!ctx.institutionTypeCode) return null;
          scope.jenis = ctx.institutionTypeCode;
          continue;
        }
        const id = ctx.codeToId.get(v)!;
        if (!ctx.visible.has(id) || isEmpty(ctx.answers[id])) return null;
        scope[v] = ctx.answers[id];
      }
      return evaluateExpression(expr, scope);
    }
  }
}

/** Seluruh kuesioner: soal tampil/wajib + daftar masalah (Blokir/Flag) per soal. */
export function validateAnswers(input: {
  questions: EngineQuestion[];
  rules: EngineRule[];
  conditions: EngineCondition[];
  answers: Answers;
  institutionTypeId: string | null;
  institutionTypeCode: string | null;
  previousAnswers?: Answers;
}): { visible: Set<string>; required: Set<string>; issues: ValidationIssue[] } {
  const { questions, rules, conditions, answers } = input;
  const { visible, required } = resolveVisibility(questions, conditions, answers, input.institutionTypeId);
  const codeToId = new Map(questions.map((q) => [q.code, q.id]));
  const issues: ValidationIssue[] = [];

  for (const q of questions) {
    if (!visible.has(q.id)) continue;
    const value = answers[q.id];
    if (required.has(q.id) && isEmpty(value)) {
      issues.push({ questionId: q.id, ruleId: null, severity: "BLOCK", message: "Wajib diisi" });
      continue;
    }
    const typeError = checkType(q, value);
    if (typeError) {
      issues.push({ questionId: q.id, ruleId: null, severity: "BLOCK", message: typeError });
      continue;
    }
    for (const rule of rules.filter((r) => r.questionId === q.id)) {
      const ok = evaluateRule(rule, {
        value,
        answers,
        visible,
        codeToId,
        institutionTypeCode: input.institutionTypeCode,
        previousValue: input.previousAnswers?.[q.id],
      });
      if (ok === false) issues.push({ questionId: q.id, ruleId: rule.id, severity: rule.severity, message: rule.message });
    }
  }
  return { visible, required, issues };
}

/** FR-07.05: persen soal tampil yang sudah terisi (soal tidak berlaku tidak dihitung, AC M06). */
export function progressPct(questions: EngineQuestion[], conditions: EngineCondition[], answers: Answers, institutionTypeId: string | null): number {
  const { visible } = resolveVisibility(questions, conditions, answers, institutionTypeId);
  if (visible.size === 0) return 0;
  const answered = [...visible].filter((id) => !isEmpty(answers[id])).length;
  return Math.round((answered / visible.size) * 10000) / 100;
}

/** FR-06.10: logika tampil tidak boleh membentuk siklus. Mengembalikan id soal di siklus pertama, atau null. */
export function findConditionCycle(conditions: Pick<EngineCondition, "questionId" | "dependsOnQuestionId">[]): string[] | null {
  const deps = new Map<string, string[]>();
  for (const c of conditions) deps.set(c.questionId, [...(deps.get(c.questionId) ?? []), c.dependsOnQuestionId]);
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return stack.slice(stack.indexOf(id));
    state.set(id, "visiting");
    stack.push(id);
    for (const dep of deps.get(id) ?? []) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };
  for (const id of deps.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}
