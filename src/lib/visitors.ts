import { z } from "zod";
import { wibDate } from "./monitoring";

/** Rekap pengunjung bulanan (pengganti Excel "Data Pengunjung Perpustakaan Sekolah"). Murni: dipakai portal, admin, ekspor. */

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"] as const;
export const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

/** Batas atas wajar per bulan per jenis kelamin — mencegah salah ketik (mis. kelebihan nol). */
export const MAX_VISITORS_PER_MONTH = 100_000;

export function wibYearMonth(now: Date): { year: number; month: number } {
  const [y, m] = wibDate(now).split("-");
  return { year: Number(y), month: Number(m) };
}

/** Jumlah bulan di `year` yang sudah boleh diisi per `now` (WIB): bulan berjalan ikut dihitung. */
export function openMonths(year: number, now: Date): number {
  const cur = wibYearMonth(now);
  if (year < cur.year) return 12;
  if (year > cur.year) return 0;
  return cur.month;
}

/** Bulan yang dipakai untuk "sudah mengisi bulan lalu": bulan terakhir yang sudah selesai. */
export function lastClosedMonth(now: Date): { year: number; month: number } {
  const { year, month } = wibYearMonth(now);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

const count = z
  .string()
  .trim()
  .transform((s) => s.replace(/\./g, "")) // pemisah ribuan gaya Indonesia
  .pipe(z.string().regex(/^\d+$/, "Isi dengan angka bulat (tanpa koma)"))
  .transform(Number)
  .pipe(z.number().max(MAX_VISITORS_PER_MONTH, `Maksimal ${MAX_VISITORS_PER_MONTH.toLocaleString("id-ID")} per bulan`));

export type VisitorEntry = { month: number; male: number; female: number };
export type VisitorFormResult =
  | { ok: true; entries: VisitorEntry[] }
  | { ok: false; errors: Record<number, string> };

/**
 * Baca form rekap satu tahun (`male_<bulan>`, `female_<bulan>`). Bulan yang kedua kolomnya kosong
 * dilewati (belum diisi); satu kolom saja yang diisi = error. Bulan yang belum dibuka ditolak.
 */
export function parseVisitorForm(get: (name: string) => unknown, year: number, now: Date): VisitorFormResult {
  const open = openMonths(year, now);
  const entries: VisitorEntry[] = [];
  const errors: Record<number, string> = {};
  for (let month = 1; month <= 12; month++) {
    const raw = { male: String(get(`male_${month}`) ?? "").trim(), female: String(get(`female_${month}`) ?? "").trim() };
    if (!raw.male && !raw.female) continue;
    if (month > open) {
      errors[month] = "Bulan ini belum bisa diisi";
      continue;
    }
    if (!raw.male || !raw.female) {
      errors[month] = "Isi jumlah laki-laki dan perempuan (tulis 0 jika tidak ada)";
      continue;
    }
    const male = count.safeParse(raw.male);
    const female = count.safeParse(raw.female);
    if (!male.success || !female.success) {
      errors[month] = (male.error ?? female.error)!.issues[0].message;
      continue;
    }
    entries.push({ month, male: male.data, female: female.data });
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, entries };
}

export type MonthCell = { male: number; female: number } | null;

/** 12 sel bulan (index 0 = Januari) dari baris DB satu lembaga satu tahun. */
export function monthGrid(rows: { month: number; male: number; female: number }[]): MonthCell[] {
  const grid: MonthCell[] = Array(12).fill(null);
  for (const r of rows) grid[r.month - 1] = { male: r.male, female: r.female };
  return grid;
}

export type FillStatus = "COMPLETE" | "PARTIAL" | "EMPTY";

/** Lengkap = semua bulan yang sudah dibuka terisi; Sebagian = minimal satu; Belum = tidak ada. */
export function fillStatus(grid: MonthCell[], open: number): FillStatus {
  const filled = grid.slice(0, open).filter(Boolean).length;
  if (open > 0 && filled === open) return "COMPLETE";
  return filled > 0 ? "PARTIAL" : "EMPTY";
}

export const FILL_STATUS: Record<FillStatus, { label: string; className: string }> = {
  COMPLETE: { label: "Lengkap", className: "text-green-700" },
  PARTIAL: { label: "Sebagian", className: "text-amber-700" },
  EMPTY: { label: "Belum mengisi", className: "text-destructive" },
};

export function gridTotals(grid: MonthCell[]): { male: number; female: number; total: number; filled: number } {
  let male = 0;
  let female = 0;
  let filled = 0;
  for (const c of grid) {
    if (!c) continue;
    male += c.male;
    female += c.female;
    filled++;
  }
  return { male, female, total: male + female, filled };
}
