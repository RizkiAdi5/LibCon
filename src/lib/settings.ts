import { prisma } from "./db/client";

/** Baca satu baris app_settings, fallback ke default kalau belum diseed. */
export async function getAppSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  return row.value as T;
}

export type PasswordPolicy = {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  forbidNppOrInstitutionName: boolean;
};

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 10,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
  forbidNppOrInstitutionName: true,
};

export type LockoutPolicy = {
  maxFailedAttempts: number;
  lockoutMinutes: number;
  // FR-04.09, keputusan user Tahap 8: dihitung per akun, bukan per IP
  burstAttempts: number;
  burstWindowMinutes: number;
  burstLockMinutes: number;
  permanentBlockAfter: number;
  resetRequestsPerHour: number;
};

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  burstAttempts: 10, // 10 percobaan gagal dalam 3 menit → kunci 1 jam
  burstWindowMinutes: 3,
  burstLockMinutes: 60,
  permanentBlockAfter: 50, // 50 salah password sejak login berhasil terakhir → blokir, buka oleh admin
  resetRequestsPerHour: 5,
};

/** FR-04.05 / FR-14.03: lama sesi sejak aktivitas terakhir. */
export type SessionPolicy = { adminHours: number; participantHours: number };
export const DEFAULT_SESSION_POLICY: SessionPolicy = { adminHours: 8, participantHours: 24 };

export async function getSessionPolicy(): Promise<SessionPolicy> {
  return { ...DEFAULT_SESSION_POLICY, ...(await getAppSetting<Partial<SessionPolicy>>("session_policy", {})) };
}

/** FR-14.04: identitas penyelenggara (rapor PDF, email). */
export type IdentitySettings = { libraryName: string; address: string; senderEmail: string; signerName: string; signerTitle: string };
export const DEFAULT_IDENTITY: IdentitySettings = { libraryName: "", address: "", senderEmail: "", signerName: "", signerTitle: "" };

export async function getIdentity(): Promise<IdentitySettings> {
  return { ...DEFAULT_IDENTITY, ...(await getAppSetting<Partial<IdentitySettings>>("identity", {})) };
}

export function getPasswordPolicy() {
  return getAppSetting<PasswordPolicy>("password_policy", DEFAULT_PASSWORD_POLICY);
}

export async function getLockoutPolicy(): Promise<LockoutPolicy> {
  // baris lama di DB (seed Tahap 5) belum punya field burst/permanent — isi dari default
  return { ...DEFAULT_LOCKOUT_POLICY, ...(await getAppSetting<Partial<LockoutPolicy>>("lockout_policy", {})) };
}
