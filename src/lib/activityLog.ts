import { z } from "zod";
import type { ActivityType, AuditAction } from "@prisma/client";

/** Menu Log Aktivitas (FR-13.07) — bagian murni: filter, label, diff sebelum-sesudah. */

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  LOGIN_FAILED: "Login gagal",
  ACCOUNT_LOCKED: "Akun terkunci",
  PASSWORD_CHANGED: "Password dibuat/diganti (termasuk aktivasi)",
  VIEW_SUBMISSION: "Lihat jawaban peserta",
  EXPORT_REPORT: "Ekspor report",
  DOWNLOAD_RAPOR: "Unduh rapor",
  RESEND_ACTIVATION: "Kirim ulang aktivasi",
  SEND_BULK_REMINDER: "Reminder massal",
  PUBLISH_SCORES: "Publikasi skor",
  RUN_SCORING: "Hitung skor",
  IMPERSONATE_VIEW: "Lihat sebagai peserta",
  UNAUTHORIZED_ACCESS: "Percobaan akses tanpa izin",
};

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  INSERT: "Tambah",
  UPDATE: "Ubah",
  DELETE: "Hapus",
  SOFT_DELETE: "Hapus (soft)",
  RESTORE: "Pulihkan",
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);
const one = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => {
    const x = Array.isArray(v) ? v[0] : v;
    return x === "" ? undefined : x;
  }, s);

export const logFilterSchema = z.object({
  tab: one(z.enum(["audit", "aktivitas"]).catch("audit")),
  /** username (NPP) atau email pelaku */
  pengguna: one(z.string().trim().max(200).optional().catch(undefined)),
  aksi: one(z.string().regex(/^[A-Z_]+$/).optional().catch(undefined)),
  tabel: one(z.string().regex(/^[a-z_]+$/).optional().catch(undefined)),
  dari: one(day),
  sampai: one(day),
  hal: one(z.coerce.number().int().min(1).max(10_000).catch(1)),
});
export type LogFilter = z.infer<typeof logFilterSchema>;

export function parseLogFilter(params: Record<string, string | string[] | undefined>): LogFilter {
  return logFilterSchema.parse(params);
}

/** Rentang tanggal WIB inklusif → filter `createdAt` (sampai = awal hari berikutnya, eksklusif). */
export function wibDayRange(dari?: string, sampai?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (dari) range.gte = new Date(`${dari}T00:00:00+07:00`);
  if (sampai) range.lt = new Date(new Date(`${sampai}T00:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000);
  return range;
}

// kolom yang tidak boleh ditampilkan walau tercatat di audit_logs (hash password/token)
const SECRET_FIELDS = new Set(["password_hash", "token_hash", "session_token_hash"]);
const NOISE_FIELDS = new Set(["updated_at", "updated_by"]);

/**
 * Detail sebelum-sesudah satu baris audit. `changed_fields` dari trigger = objek {kolom: nilai baru};
 * INSERT/DELETE (tanpa changed_fields) → semua kolom. updated_at/by disembunyikan kecuali hanya itu yang berubah.
 */
export function auditChanges(oldData: unknown, newData: unknown, changedFields: unknown): { field: string; before: unknown; after: unknown }[] {
  const o = (oldData ?? {}) as Record<string, unknown>;
  const n = (newData ?? {}) as Record<string, unknown>;
  const changed = changedFields && typeof changedFields === "object" ? Object.keys(changedFields) : [];
  const fields = changed.length ? changed : [...new Set([...Object.keys(o), ...Object.keys(n)])];
  const meaningful = fields.filter((f) => !NOISE_FIELDS.has(f));
  return (meaningful.length ? meaningful : fields)
    .map((f) => (SECRET_FIELDS.has(f) ? { field: f, before: o[f] === undefined ? undefined : "••••", after: n[f] === undefined ? undefined : "••••" } : { field: f, before: o[f], after: n[f] }));
}

export function formatLogValue(v: unknown): string {
  if (v === undefined) return "";
  if (v === null) return "(kosong)";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
