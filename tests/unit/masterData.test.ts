import { describe, expect, it } from "vitest";
import { institutionTypeSchema, regionSchema } from "@/lib/validation/masterData";

describe("regionSchema [FR-02.01]", () => {
  it("induk kosong dari form dianggap tidak ada (kota baru)", () => {
    const r = regionSchema.safeParse({ parentId: "", code: "6171", name: "Kota Pontianak" });
    expect(r.success && r.data.parentId).toBe(undefined);
  });

  it("menolak kode/nama kosong setelah trim", () => {
    expect(regionSchema.safeParse({ parentId: "", code: "  ", name: "X" }).success).toBe(false);
    expect(regionSchema.safeParse({ parentId: "", code: "1", name: "  " }).success).toBe(false);
  });

  it("menolak induk yang bukan UUID", () => {
    expect(regionSchema.safeParse({ parentId: "abc", code: "1", name: "X" }).success).toBe(false);
  });
});

describe("institutionTypeSchema [FR-02.02]", () => {
  it("urutan dari input form (string) dikonversi ke angka", () => {
    const r = institutionTypeSchema.safeParse({ code: "LSM", name: "Lembaga Swadaya", sortOrder: "4" });
    expect(r.success && r.data.sortOrder).toBe(4);
  });

  it("menolak urutan negatif atau pecahan", () => {
    expect(institutionTypeSchema.safeParse({ code: "A", name: "A", sortOrder: "-1" }).success).toBe(false);
    expect(institutionTypeSchema.safeParse({ code: "A", name: "A", sortOrder: "1.5" }).success).toBe(false);
  });
});
