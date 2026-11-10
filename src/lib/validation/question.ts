import { z } from "zod";
import { BUILDER_QUESTION_TYPES, CHOICE_TYPES, CODE_PATTERN, RESERVED_CODES } from "../questionnaire";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);
const optionalInt = z.number().int().nullable().optional();
const optionalNumber = z.number().nullable().optional();
const isoDate = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Format tanggal tidak valid")
  .optional()
  .transform((v) => v || undefined);

/** FR-02 bagian kuesioner (FR-06.01, FR-06.08). */
export const sectionSchema = z.object({
  title: z.string().trim().min(1, "Judul bagian wajib diisi").max(200, "Judul maks. 200 karakter"),
  description: optionalText(2000),
  evidenceLabel: optionalText(2000),
  evidenceRequired: z.boolean(),
});

const configSchema = z.object({
  min: optionalNumber,
  max: optionalNumber,
  unit: optionalText(30),
  decimals: z.number().int().min(0, "Jumlah desimal 0–6").max(6, "Jumlah desimal 0–6").optional(),
  maxLength: z.number().int().positive("Panjang maks. harus > 0").nullable().optional(),
  minSelect: optionalInt,
  maxSelect: optionalInt,
  minDate: isoDate,
  maxDate: isoDate,
  minLabel: optionalText(50),
  maxLabel: optionalText(50),
  allowedDomains: z.array(z.string().trim().min(1)).optional(),
  columns: z
    .array(z.object({ label: z.string().trim().min(1, "Nama kolom wajib diisi").max(100), type: z.enum(["INTEGER", "DECIMAL", "TEXT", "DATE"]) }))
    .optional(),
  minRows: optionalInt,
  maxRows: optionalInt,
});

/** FR-06.02–06.04, 06.07, 06.08. Payload dikirim sebagai JSON dari form klien. */
export const questionSchema = z
  .object({
    sectionId: z.uuid("Pilih bagian"),
    label: z.string().trim().min(1, "Teks soal wajib diisi").max(1000, "Teks soal maks. 1000 karakter"),
    code: z
      .string()
      .trim()
      .max(50, "Kode variabel maks. 50 karakter")
      .regex(CODE_PATTERN, "Kode variabel hanya huruf kecil, angka, dan garis bawah, diawali huruf")
      .refine((c) => !RESERVED_CODES.includes(c), "Kode ini dicadangkan sistem, pakai kode lain"),
    helpText: optionalText(2000),
    type: z.enum(BUILDER_QUESTION_TYPES, "Pilih tipe jawaban"),
    isRequired: z.boolean(),
    hasEvidenceUrl: z.boolean(),
    institutionTypeIds: z.array(z.uuid()),
    options: z.array(z.object({ label: z.string().trim().min(1, "Teks opsi wajib diisi").max(200), scoreValue: z.number().nullable() })),
    config: configSchema,
  })
  .superRefine((q, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const c = q.config;

    if (q.type === "YES_NO" && q.options.length !== 2) issue(["options"], "Ya/Tidak harus punya tepat 2 opsi");
    else if (CHOICE_TYPES.includes(q.type) && q.options.length < 2) issue(["options"], "Minimal 2 opsi jawaban");
    if (CHOICE_TYPES.includes(q.type)) {
      const labels = q.options.map((o) => o.label.toLowerCase());
      if (new Set(labels).size !== labels.length) issue(["options"], "Teks opsi tidak boleh sama");
    }

    if (c.min != null && c.max != null && c.min > c.max) issue(["config", "max"], "Maks. harus ≥ min.");
    if (c.minDate && c.maxDate && c.minDate > c.maxDate) issue(["config", "maxDate"], "Tanggal akhir harus ≥ tanggal awal");
    if (q.type === "MULTI_CHOICE") {
      if (c.minSelect != null && c.maxSelect != null && c.minSelect > c.maxSelect) issue(["config", "maxSelect"], "Maks. pilihan harus ≥ min. pilihan");
      if (c.maxSelect != null && c.maxSelect > q.options.length) issue(["config", "maxSelect"], "Maks. pilihan melebihi jumlah opsi");
    }
    if (q.type === "TABLE") {
      if (!c.columns?.length) issue(["config", "columns"], "Tabel isian minimal 1 kolom");
      if (c.minRows != null && c.maxRows != null && c.minRows > c.maxRows) issue(["config", "maxRows"], "Maks. baris harus ≥ min. baris");
    }
  });

export type QuestionInput = z.infer<typeof questionSchema>;

export const RULE_TYPE_LABEL = {
  REQUIRED: "Wajib",
  RANGE: "Rentang",
  COMPARE: "Perbandingan antarsoal",
  FORMAT: "Format (pola teks)",
  YOY_CHANGE: "Perubahan dari tahun lalu",
  EXPRESSION: "Ekspresi bebas",
} as const;
const COMPARE_OPS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE"] as const;

/** FR-06.06 + parameter sesuai contoh ERD `validation_rules.params`. */
export const ruleSchema = z
  .object({
    ruleType: z.enum(Object.keys(RULE_TYPE_LABEL) as (keyof typeof RULE_TYPE_LABEL)[], "Pilih jenis aturan"),
    severity: z.enum(["BLOCK", "FLAG"], "Pilih tingkat"),
    message: z.string().trim().min(1, "Pesan untuk peserta wajib diisi").max(500, "Pesan maks. 500 karakter"),
    params: z.object({
      min: z.number().nullable().optional(),
      max: z.number().nullable().optional(),
      op: z.enum(COMPARE_OPS).optional(),
      other_question_id: z.string().optional(),
      pattern: z.string().optional(),
      max_pct: z.number().nullable().optional(),
      expr: z.string().trim().optional(),
    }),
  })
  .superRefine((r, ctx) => {
    const p = r.params;
    const issue = (key: string, message: string) => ctx.addIssue({ code: "custom", path: ["params", key], message });
    if (r.ruleType === "RANGE") {
      if (p.min == null && p.max == null) issue("min", "Isi min. atau maks.");
      if (p.min != null && p.max != null && p.min > p.max) issue("max", "Maks. harus ≥ min.");
    }
    if (r.ruleType === "COMPARE") {
      if (!p.op) issue("op", "Pilih operator");
      if (!z.uuid().safeParse(p.other_question_id).success) issue("other_question_id", "Pilih soal pembanding");
    }
    if (r.ruleType === "FORMAT") {
      try {
        if (!p.pattern) throw new Error();
        new RegExp(p.pattern);
      } catch {
        issue("pattern", "Pola teks tidak valid");
      }
    }
    if (r.ruleType === "YOY_CHANGE" && !(p.max_pct != null && p.max_pct > 0)) issue("max_pct", "Persentase maks. harus > 0");
    if (r.ruleType === "EXPRESSION" && !p.expr) issue("expr", "Ekspresi wajib diisi");
  });

export type RuleInput = z.infer<typeof ruleSchema>;

/** Simpan hanya parameter milik jenis aturan itu (format ERD). */
export function ruleParams(r: RuleInput): Record<string, unknown> {
  const p = r.params;
  switch (r.ruleType) {
    case "RANGE":
      return { ...(p.min != null && { min: p.min }), ...(p.max != null && { max: p.max }) };
    case "COMPARE":
      return { op: p.op, other_question_id: p.other_question_id };
    case "FORMAT":
      return { pattern: p.pattern };
    case "YOY_CHANGE":
      return { max_pct: p.max_pct };
    case "EXPRESSION":
      return { expr: p.expr };
    default:
      return {};
  }
}

/** FR-06.05: logika tampil. Nilai IN dipisah koma; NOT_EMPTY tanpa nilai. */
export const conditionSchema = z
  .object({
    dependsOnQuestionId: z.uuid("Pilih soal acuan"),
    operator: z.enum([...COMPARE_OPS, "IN", "NOT_EMPTY"], "Pilih operator"),
    value: z.string().trim(),
    effect: z.enum(["SHOW", "REQUIRE"], "Pilih efek"),
  })
  .refine((c) => c.operator === "NOT_EMPTY" || c.value !== "", { message: "Nilai kondisi wajib diisi", path: ["value"] })
  .transform((c) => ({
    ...c,
    value: c.operator === "NOT_EMPTY" ? null : c.operator === "IN" ? c.value.split(",").map((v) => v.trim()).filter(Boolean) : c.value,
  }));
