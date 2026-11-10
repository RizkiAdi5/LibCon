import type { QuestionType } from "@/generated/prisma/client";

/** Tipe yang bisa dipilih admin. FILE (unggah file) = Tahap lanjutan (PRD §5.5), disembunyikan. */
export const QUESTION_TYPE_LABEL: Record<Exclude<QuestionType, "FILE">, string> = {
  INTEGER: "Angka bulat",
  DECIMAL: "Desimal",
  CURRENCY: "Rupiah",
  PERCENT: "Persentase",
  SHORT_TEXT: "Teks pendek",
  LONG_TEXT: "Paragraf",
  SINGLE_CHOICE: "Pilihan tunggal",
  DROPDOWN: "Dropdown",
  MULTI_CHOICE: "Pilihan ganda",
  YES_NO: "Ya / Tidak",
  DATE: "Tanggal",
  SCALE: "Skala 1–5",
  URL: "Link (URL)",
  TABLE: "Tabel isian",
};
export type BuilderQuestionType = keyof typeof QUESTION_TYPE_LABEL;
export const BUILDER_QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABEL) as BuilderQuestionType[];

export const CHOICE_TYPES: QuestionType[] = ["SINGLE_CHOICE", "DROPDOWN", "MULTI_CHOICE", "YES_NO"];

/**
 * FR-06.02: huruf kecil, angka, garis bawah. Wajib diawali huruf supaya bisa
 * dipakai sebagai variabel di ekspresi/rumus (mathjs). `jenis` dicadangkan
 * untuk kode jenis lembaga di aturan Ekspresi bebas.
 */
export const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
export const RESERVED_CODES = ["jenis"];
const CODE_MAX = 50;

/** FR-06.03: "Jumlah Eksemplar Cetak (buah)" → "jumlah_eksemplar_cetak_buah". */
export function slugifyCode(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, CODE_MAX)
    .replace(/_+$/, "");
  if (!slug) return "soal";
  return /^[a-z]/.test(slug) ? slug : `q_${slug}`.slice(0, CODE_MAX);
}

/** Tambah akhiran _2, _3, ... sampai tidak bentrok dengan `taken`. */
export function uniqueCode(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base) && !RESERVED_CODES.includes(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base.slice(0, CODE_MAX - String(i).length - 1)}_${i}`;
    if (!set.has(candidate)) return candidate;
  }
}

export type TableColumn = { label: string; type: "INTEGER" | "DECIMAL" | "TEXT" | "DATE" };

export type QuestionConfig = {
  min?: number | null;
  max?: number | null;
  unit?: string;
  decimals?: number;
  maxLength?: number | null;
  minSelect?: number | null;
  maxSelect?: number | null;
  minDate?: string;
  maxDate?: string;
  minLabel?: string;
  maxLabel?: string;
  allowedDomains?: string[];
  columns?: TableColumn[];
  minRows?: number | null;
  maxRows?: number | null;
};

/** Pengaturan yang relevan per tipe (PRD §5.5) — buang sisa isian tipe lain sebelum disimpan. */
const CONFIG_KEYS: Record<BuilderQuestionType, (keyof QuestionConfig)[]> = {
  INTEGER: ["min", "max", "unit"],
  DECIMAL: ["decimals", "min", "max", "unit"],
  CURRENCY: ["min"],
  PERCENT: [],
  SHORT_TEXT: ["maxLength"],
  LONG_TEXT: ["maxLength"],
  SINGLE_CHOICE: [],
  DROPDOWN: [],
  MULTI_CHOICE: ["minSelect", "maxSelect"],
  YES_NO: [],
  DATE: ["minDate", "maxDate"],
  SCALE: ["minLabel", "maxLabel"],
  URL: ["allowedDomains"],
  TABLE: ["columns", "minRows", "maxRows"],
};

export function configForType(type: BuilderQuestionType, config: QuestionConfig): QuestionConfig {
  const out: QuestionConfig = {};
  for (const key of CONFIG_KEYS[type]) {
    const value = config[key];
    const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (!empty) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/** JSON dengan kunci terurut — jsonb Postgres mengubah urutan kunci, jadi perbandingan harus stabil. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export type QuestionStructure = {
  sectionId: string;
  code: string;
  label: string;
  type: string;
  isRequired: boolean;
  hasEvidenceUrl: boolean;
  config: QuestionConfig;
  options: { label: string; scoreValue: number | null }[];
  institutionTypeIds: string[];
};

/**
 * FR-06.10: setelah terbit, struktur terkunci — hanya teks bantuan yang boleh
 * berubah. Mengembalikan true jika ada bagian struktur yang berbeda.
 */
export function structureChanged(a: QuestionStructure, b: QuestionStructure): boolean {
  const norm = (s: QuestionStructure) => stableStringify({ ...s, institutionTypeIds: [...s.institutionTypeIds].sort() });
  return norm(a) !== norm(b);
}
