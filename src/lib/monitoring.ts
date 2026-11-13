import type { SubmissionStatus, UserStatus } from "@/generated/prisma/client";

/** Tanggal kalender WIB "YYYY-MM-DD" — reminder dihitung per hari WIB (FR-10.05, FR-10.06). */
export function wibDate(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Awal hari WIB (00.00 WIB) dari `now`, sebagai Date UTC. */
export function startOfWibDay(now: Date): Date {
  return new Date(`${wibDate(now)}T00:00:00+07:00`);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Selisih hari kalender WIB: tanggal(target) − tanggal(now). */
export function wibDaysUntil(target: Date, now: Date): number {
  return Math.round((Date.parse(wibDate(target)) - Date.parse(wibDate(now))) / DAY_MS);
}

/**
 * FR-10.05: apakah jadwal jatuh hari ini. DEADLINE & REVISION: H-n sebelum
 * tanggal tujuan; ACTIVATION: n hari setelah akun dibuat.
 */
export function reminderDueToday(kind: "DEADLINE" | "ACTIVATION" | "REVISION", offsetDays: number, reference: Date, now: Date): boolean {
  return kind === "ACTIVATION" ? wibDaysUntil(now, reference) === offsetDays : wibDaysUntil(reference, now) === offsetDays;
}

/** Status monitoring satu lembaga (satu nilai, untuk tabel, filter, dan grafik — FR-10.01/10.02). */
export type MonitoringStatus = "PENDING_ACTIVATION" | SubmissionStatus;

export function monitoringStatus(p: {
  primaryAccountStatus: UserStatus | null;
  submissionStatus: SubmissionStatus | null;
  effectiveClosesAt: Date | null;
  now: Date;
}): MonitoringStatus {
  const s = p.submissionStatus ?? "NOT_STARTED";
  if (s === "NOT_STARTED" && p.primaryAccountStatus !== "ACTIVE") return "PENDING_ACTIVATION";
  // BR-12: draf yang tidak dikirim sampai tenggat lewat = Tidak Mengisi
  if ((s === "NOT_STARTED" || s === "DRAFT" || s === "NOT_SUBMITTED") && p.effectiveClosesAt && p.now >= p.effectiveClosesAt) return "NOT_SUBMITTED";
  // ditandai Tidak Mengisi oleh cron lalu tenggatnya diperpanjang → kembali dihitung Draf
  return s === "NOT_SUBMITTED" ? "DRAFT" : s;
}

export const MONITORING_STATUS: Record<MonitoringStatus, { label: string; className: string; bar: string }> = {
  PENDING_ACTIVATION: { label: "Belum Aktivasi", className: "text-muted-foreground", bar: "bg-slate-400" },
  NOT_STARTED: { label: "Belum Mengisi", className: "text-muted-foreground", bar: "bg-slate-300" },
  DRAFT: { label: "Draf", className: "text-amber-700", bar: "bg-amber-400" },
  SUBMITTED: { label: "Terkirim", className: "text-green-700", bar: "bg-green-400" },
  NEEDS_REVISION: { label: "Perlu Revisi", className: "text-destructive", bar: "bg-red-400" },
  VERIFIED: { label: "Terverifikasi", className: "text-green-800", bar: "bg-green-700" },
  NOT_SUBMITTED: { label: "Tidak Mengisi", className: "text-destructive", bar: "bg-red-700" },
};

/** FR-10.02: hitungan per status per kelompok (kecamatan / jenis) untuk batang bertumpuk. */
export function stackCounts<T>(items: T[], groupOf: (t: T) => string, statusOf: (t: T) => MonitoringStatus) {
  const groups = new Map<string, Map<MonitoringStatus, number>>();
  for (const item of items) {
    const g = groups.get(groupOf(item)) ?? new Map<MonitoringStatus, number>();
    g.set(statusOf(item), (g.get(statusOf(item)) ?? 0) + 1);
    groups.set(groupOf(item), g);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "id"))
    .map(([group, counts]) => ({ group, total: [...counts.values()].reduce((s, n) => s + n, 0), counts }));
}

/** Satu sel CSV (RFC 4180) + cegah formula injection saat dibuka di Excel. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
