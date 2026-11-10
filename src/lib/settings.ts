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

export function getPasswordPolicy() {
  return getAppSetting<PasswordPolicy>("password_policy", DEFAULT_PASSWORD_POLICY);
}

export async function getLockoutPolicy(): Promise<LockoutPolicy> {
  // baris lama di DB (seed Tahap 5) belum punya field burst/permanent — isi dari default
  return { ...DEFAULT_LOCKOUT_POLICY, ...(await getAppSetting<Partial<LockoutPolicy>>("lockout_policy", {})) };
}
