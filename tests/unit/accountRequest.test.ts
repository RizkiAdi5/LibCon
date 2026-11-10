import { describe, expect, it } from "vitest";
import {
  accountRequestSchema,
  canRequestSecondAccount,
  rejectAccountRequestSchema,
} from "@/lib/validation/accountRequest";

describe("canRequestSecondAccount [FR-05.01, BR-02]", () => {
  it("1 akun tanpa permintaan menunggu → boleh mengajukan", () => {
    expect(canRequestSecondAccount({ accountCount: 1, hasPendingRequest: false })).toBe(true);
  });

  it("sudah 2 akun → tidak boleh (AC M05)", () => {
    expect(canRequestSecondAccount({ accountCount: 2, hasPendingRequest: false })).toBe(false);
  });

  it("masih ada permintaan menunggu → tidak boleh", () => {
    expect(canRequestSecondAccount({ accountCount: 1, hasPendingRequest: true })).toBe(false);
  });
});

describe("accountRequestSchema [FR-05.02]", () => {
  it("menerima data valid dan menormalisasi email", () => {
    const r = accountRequestSchema.safeParse({ fullName: " Siti ", email: " Siti@Example.COM ", reason: "Bantu isi" });
    expect(r.success && r.data).toEqual({ fullName: "Siti", email: "siti@example.com", reason: "Bantu isi" });
  });

  it("nama, email valid, dan alasan wajib", () => {
    const r = accountRequestSchema.safeParse({ fullName: "", email: "bukan-email", reason: " " });
    expect(r.success ? [] : r.error.issues.map((i) => i.path[0])).toEqual(["fullName", "email", "reason"]);
  });
});

describe("rejectAccountRequestSchema [FR-05.05]", () => {
  it("alasan penolakan wajib diisi", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(rejectAccountRequestSchema.safeParse({ requestId: id, reason: "  " }).success).toBe(false);
    expect(rejectAccountRequestSchema.safeParse({ requestId: id, reason: "Data tidak lengkap" }).success).toBe(true);
  });
});
