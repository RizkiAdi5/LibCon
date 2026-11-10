import { describe, expect, it } from "vitest";
import { burstLockUntil, isPermanentlyBlocked } from "@/lib/auth/loginThrottle";
import { DEFAULT_LOCKOUT_POLICY as policy } from "@/lib/settings";

const now = new Date("2026-11-10T03:00:00Z");
const hour = 60 * 60 * 1000;

describe("burstLockUntil [FR-04.09: 10 gagal dalam 3 menit → kunci 1 jam, per akun]", () => {
  it("di bawah batas tidak mengubah kunci", () => {
    expect(burstLockUntil(9, now, null, policy)).toBeNull();
  });

  it("mencapai batas mengunci 1 jam dari sekarang", () => {
    expect(burstLockUntil(10, now, null, policy)).toEqual(new Date(now.getTime() + hour));
  });

  it("memperpanjang kunci 15 menit yang sedang berjalan menjadi 1 jam", () => {
    const current = new Date(now.getTime() + 15 * 60 * 1000);
    expect(burstLockUntil(12, now, current, policy)).toEqual(new Date(now.getTime() + hour));
  });

  it("tidak memperpendek kunci yang sudah lebih lama", () => {
    const current = new Date(now.getTime() + 2 * hour);
    expect(burstLockUntil(12, now, current, policy)).toBeNull();
  });
});

describe("isPermanentlyBlocked [50 salah password sejak login berhasil terakhir]", () => {
  it("49 belum diblokir, 50 diblokir", () => {
    expect(isPermanentlyBlocked(49, policy)).toBe(false);
    expect(isPermanentlyBlocked(50, policy)).toBe(true);
  });
});
