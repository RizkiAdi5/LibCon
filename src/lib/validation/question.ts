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
