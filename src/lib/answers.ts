import type { PeriodStatus, SubmissionStatus } from "@prisma/client";

/**
 * Nilai jawaban di klien/mesin validasi ↔ kolom `answers` (ERD):
 * angka → value_number, teks/pilihan/link → value_text, tanggal → value_date,
 * pilihan ganda & tabel isian → value_json.
 */
export type StoredAnswer = { valueNumber: number | null; valueText: string | null; valueDate: string | null; valueJson: unknown };

const NUMERIC = ["INTEGER", "DECIMAL", "CURRENCY", "PERCENT", "SCALE"];
const TEXT = ["SHORT_TEXT", "LONG_TEXT", "URL", "SINGLE_CHOICE", "DROPDOWN", "YES_NO"];
const MAX_TEXT = 10_000;
const MAX_NUMBER = 1e14; // value_number DECIMAL(18,4)
const EMPTY: StoredAnswer = { valueNumber: null, valueText: null, valueDate: null, valueJson: null };

/** Validasi BENTUK nilai dari klien sebelum disimpan (aturan isi dinilai mesin validasi saat kirim). */
export function encodeAnswer(type: string, value: unknown): StoredAnswer | { error: string } {
  if (value === null || value === undefined || value === "") return EMPTY;
  if (NUMERIC.includes(type)) {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) >= MAX_NUMBER) return { error: "Harus berupa angka" };
    return { ...EMPTY, valueNumber: value };
  }
  if (TEXT.includes(type)) {
    if (typeof value !== "string" || value.length > MAX_TEXT) return { error: "Isian tidak valid" };
    return { ...EMPTY, valueText: value };
  }
  if (type === "DATE") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return { error: "Tanggal tidak valid" };
    return { ...EMPTY, valueDate: value };
  }
  if (type === "MULTI_CHOICE") {
    if (!Array.isArray(value) || value.length > 100 || !value.every((v) => typeof v === "string" && v.length <= 200)) return { error: "Pilihan tidak valid" };
    return value.length ? { ...EMPTY, valueJson: [...new Set(value)] } : EMPTY;
  }
  if (type === "TABLE") {
    const ok =
      Array.isArray(value) &&
      value.length <= 500 &&
      value.every(
        (row) => row && typeof row === "object" && !Array.isArray(row) && Object.values(row).every((cell) => typeof cell === "string" && cell.length <= 1000),
      );
    if (!ok) return { error: "Isian tabel tidak valid" };
    return value.length ? { ...EMPTY, valueJson: value } : EMPTY;
  }
  return { error: "Tipe soal tidak didukung" };
}

export function decodeAnswer(
  type: string,
  row: { valueNumber: { toString(): string } | number | null; valueText: string | null; valueDate: Date | string | null; valueJson: unknown },
): unknown {
  if (NUMERIC.includes(type)) return row.valueNumber === null ? null : Number(row.valueNumber);
  if (type === "DATE") return row.valueDate === null ? null : typeof row.valueDate === "string" ? row.valueDate : row.valueDate.toISOString().slice(0, 10);
  if (type === "MULTI_CHOICE" || type === "TABLE") return row.valueJson ?? null;
  return row.valueText;
}

/**
 * FR-07.07: "1.234,5" / "1.234" / "1234,5" / "1234.5" → angka. Titik = ribuan,
 * koma = desimal (format Indonesia); "1.5" (bukan pola ribuan) tetap 1,5.
 */
export function parseIdNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (t === "") return null;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** FR-08.10: bandingkan dua versi jawaban (snapshot) per soal; `changed` untuk disorot. */
export function diffAnswers(questionIds: string[], before: Record<string, unknown>, after: Record<string, unknown>) {
  const norm = (v: unknown) => (v === undefined || v === "" || (Array.isArray(v) && v.length === 0) ? null : v);
  return questionIds.map((id) => ({
    questionId: id,
    before: norm(before[id]),
    after: norm(after[id]),
    changed: JSON.stringify(norm(before[id])) !== JSON.stringify(norm(after[id])),
  }));
}

/** Kunci jawaban link bukti dukung — dibagi klien & server. */
export const evidenceKey = (scope: "section" | "question", id: string) => `evidence:${scope}:${id}`;
export function parseAnswerKey(key: string): { kind: "answer"; questionId: string } | { kind: "evidence"; scope: "section" | "question"; id: string } {
  const m = /^evidence:(section|question):(.+)$/.exec(key);
  return m ? { kind: "evidence", scope: m[1] as "section" | "question", id: m[2] } : { kind: "answer", questionId: key };
}

export type SurveyMode = "countdown" | "editable" | "revision" | "submitted" | "closed";

/**
 * FR-07.02 + BR-10/BR-12: sebelum buka = hitung mundur; sudah dikirim = baca
 * saja; lewat tanggal tutup (termasuk perpanjangan lembaga ini) = baca saja.
 * FR-08.07/08.09: revisi terbuka = hanya soal yang dibuka bisa diubah sampai
 * batas revisi (terlepas dari tanggal tutup periode); lewat batas = baca saja.
 */
export function surveyMode(p: {
  periodStatus: PeriodStatus;
  opensAt: Date;
  effectiveClosesAt: Date;
  submissionStatus: SubmissionStatus | null;
  revisionDeadline?: Date | null;
  now: Date;
}): SurveyMode {
  if (p.periodStatus === "DRAFT" || p.now < p.opensAt) return "countdown";
  if (p.submissionStatus === "NEEDS_REVISION" && p.revisionDeadline && p.now < p.revisionDeadline && p.periodStatus !== "ARCHIVED") return "revision";
  // NOT_SUBMITTED (BR-12) tetap bisa diisi bila tenggat lembaga ini diperpanjang / periode dibuka lagi
  if (p.submissionStatus && !["NOT_STARTED", "DRAFT", "NOT_SUBMITTED"].includes(p.submissionStatus)) return "submitted";
  if (p.periodStatus === "ARCHIVED" || p.now >= p.effectiveClosesAt) return "closed";
  return "editable";
}

type PortalPeriod = { id: string; status: PeriodStatus; opensAt: Date; closesAt: Date };

/** Periode yang ditampilkan di portal: yang Dibuka; jika tidak ada, Draf terdekat (hitung mundur); jika tidak ada, Ditutup terbaru. */
export function pickPortalPeriod<T extends PortalPeriod>(periods: T[], now: Date): T | null {
  const open = periods.find((p) => p.status === "OPEN");
  if (open) return open;
  const upcoming = periods.filter((p) => p.status === "DRAFT" && p.closesAt > now).sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime())[0];
  if (upcoming) return upcoming;
  return periods.filter((p) => p.status === "CLOSED").sort((a, b) => b.closesAt.getTime() - a.closesAt.getTime())[0] ?? null;
}
