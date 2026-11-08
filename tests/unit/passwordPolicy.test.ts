import { describe, expect, it } from "vitest";
import { checkPasswordPolicy } from "@/lib/auth/passwordPolicy";
import { DEFAULT_PASSWORD_POLICY } from "@/lib/settings";

describe("checkPasswordPolicy [FR-03.06, BR-04]", () => {
  it("menolak password tanpa simbol (contoh AC PRD: 'Pontianak2026')", () => {
    const result = checkPasswordPolicy("Pontianak2026", DEFAULT_PASSWORD_POLICY);
    expect(result.valid).toBe(false);
    expect(result.failedRules).toContain("symbol");
  });

  it("menolak password lebih pendek dari minLength", () => {
    const result = checkPasswordPolicy("Ab1!", DEFAULT_PASSWORD_POLICY);
    expect(result.failedRules).toContain("minLength");
  });

  it("menolak password yang memuat NPP", () => {
    const result = checkPasswordPolicy("NPP123456!Aa", DEFAULT_PASSWORD_POLICY, { npp: "123456" });
    expect(result.failedRules).toContain("noNppOrInstitutionName");
  });

  it("menolak password yang memuat nama lembaga", () => {
    const result = checkPasswordPolicy("PerpusSD1!Aa", DEFAULT_PASSWORD_POLICY, {
      institutionName: "PerpusSD1",
    });
    expect(result.failedRules).toContain("noNppOrInstitutionName");
  });

  it("menolak password yang ada di daftar password umum", () => {
    const result = checkPasswordPolicy("Qwerty123", DEFAULT_PASSWORD_POLICY);
    expect(result.failedRules).toContain("notCommon");
  });

  it("menerima password yang memenuhi semua aturan", () => {
    const result = checkPasswordPolicy("KataSandiKuat!2026", DEFAULT_PASSWORD_POLICY, {
      npp: "61710513",
      institutionName: "Perpustakaan Contoh",
    });
    expect(result.valid).toBe(true);
    expect(result.failedRules).toHaveLength(0);
  });
});
