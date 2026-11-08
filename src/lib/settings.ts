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
};

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
};

export function getPasswordPolicy() {
  return getAppSetting<PasswordPolicy>("password_policy", DEFAULT_PASSWORD_POLICY);
}

export function getLockoutPolicy() {
  return getAppSetting<LockoutPolicy>("lockout_policy", DEFAULT_LOCKOUT_POLICY);
}
