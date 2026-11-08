import { describe, expect, it } from "vitest";
import { generateRawToken, hashToken } from "@/lib/auth/token";

describe("token crypto [BR-03: token disimpan sebagai hash, sekali pakai]", () => {
  it("generateRawToken menghasilkan token unik tiap panggilan", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it("hashToken deterministik untuk input yang sama", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).toEqual(hashToken(raw));
  });

  it("hashToken tidak pernah sama dengan token mentahnya (tidak disimpan plaintext)", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).not.toEqual(raw);
  });

  it("hashToken menghasilkan hex SHA-256 (64 karakter)", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
  });
});
