import type { LockoutPolicy } from "../settings";

/** Akun diblokir permanen sampai admin membuka blokir (failed_login_count di-reset ke 0). */
export function isPermanentlyBlocked(failedLoginCount: number, policy: LockoutPolicy): boolean {
  return failedLoginCount >= policy.permanentBlockAfter;
}

/**
 * Kunci 1 jam jika percobaan gagal (termasuk saat masih terkunci) dalam jendela
 * waktu mencapai batas. Mengembalikan lockedUntil baru, atau null jika tidak
 * perlu diubah. Tidak pernah memperpendek kunci yang sudah lebih lama.
 */
export function burstLockUntil(
  recentFailures: number,
  now: Date,
  currentLockedUntil: Date | null,
  policy: LockoutPolicy,
): Date | null {
  if (recentFailures < policy.burstAttempts) return null;
  const until = new Date(now.getTime() + policy.burstLockMinutes * 60 * 1000);
  return currentLockedUntil && currentLockedUntil >= until ? null : until;
}
