import type { PasswordPolicy } from "../settings";
import { isCommonPassword } from "./commonPasswords";

export type PasswordRuleId =
  | "minLength"
  | "uppercase"
  | "lowercase"
  | "number"
  | "symbol"
  | "noNppOrInstitutionName"
  | "notCommon";

export type PasswordCheckResult = {
  valid: boolean;
  /** id aturan yang gagal — dipakai untuk centang/silang di meter kekuatan (FR-03.05) */
  failedRules: PasswordRuleId[];
};

export type PasswordCheckContext = {
  npp?: string | null;
  institutionName?: string | null;
};

const SYMBOL_PATTERN = /[^A-Za-z0-9]/;

/**
 * Validasi password sesuai kebijakan dinamis (app_settings.password_policy).
 * Dipakai di server (wajib) dan di client (meter kekuatan real-time) —
 * jangan hanya mengecek ini di client.
 */
export function checkPasswordPolicy(
  password: string,
  policy: PasswordPolicy,
  ctx: PasswordCheckContext = {},
): PasswordCheckResult {
  const failed: PasswordRuleId[] = [];

  if (password.length < policy.minLength) failed.push("minLength");
  if (policy.requireUppercase && !/[A-Z]/.test(password)) failed.push("uppercase");
  if (policy.requireLowercase && !/[a-z]/.test(password)) failed.push("lowercase");
  if (policy.requireNumber && !/[0-9]/.test(password)) failed.push("number");
  if (policy.requireSymbol && !SYMBOL_PATTERN.test(password)) failed.push("symbol");

  if (policy.forbidNppOrInstitutionName) {
    const lower = password.toLowerCase();
    const npp = ctx.npp?.toLowerCase();
    const name = ctx.institutionName?.toLowerCase();
    if ((npp && npp.length > 0 && lower.includes(npp)) || (name && name.length > 0 && lower.includes(name))) {
      failed.push("noNppOrInstitutionName");
    }
  }

  if (isCommonPassword(password)) failed.push("notCommon");

  return { valid: failed.length === 0, failedRules: failed };
}
