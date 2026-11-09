import { describe, expect, it } from "vitest";
import { institutionSchema } from "@/lib/validation/institution";
import { groupInstitutions } from "@/lib/institutionGroups";

const UUID = "11111111-1111-4111-8111-111111111111";

const valid = {
  npp: "61710513",
  npsn: "",
  libraryName: "Perpustakaan SDN 01",
  institutionName: "SD Negeri 01 Pontianak",
  typeId: UUID,
  districtId: UUID,
  villageId: UUID,
  address: "Jl. Merdeka No. 1",
  headName: "",
  picName: "Budi",
  officialEmail: "  SDN01@Example.com ",
  whatsapp: "",
};

function errorsOf(input: Record<string, unknown>) {
  const r = institutionSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path[0]);
}

describe("institutionSchema [FR-03.01, PRD §5.2]", () => {
  it("menerima data valid; field opsional kosong jadi undefined; email dinormalisasi", () => {
    const r = institutionSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.npsn).toBeUndefined();
    expect(r.data.headName).toBeUndefined();
    expect(r.data.whatsapp).toBeUndefined();
    expect(r.data.officialEmail).toBe("sdn01@example.com");
  });

  it("NPP wajib dan hanya angka [BR-01]", () => {
    expect(errorsOf({ ...valid, npp: "" })).toContain("npp");
    expect(errorsOf({ ...valid, npp: "6171-0513" })).toContain("npp");
  });

  it("NPSN opsional, tapi jika diisi harus 8 digit", () => {
    expect(errorsOf({ ...valid, npsn: "30101234" })).toEqual([]);
    expect(errorsOf({ ...valid, npsn: "1234567" })).toContain("npsn");
    expect(errorsOf({ ...valid, npsn: "1234567a" })).toContain("npsn");
  });

  it("nama perpustakaan & instansi maks. 200 karakter", () => {
    expect(errorsOf({ ...valid, libraryName: "a".repeat(200) })).toEqual([]);
    expect(errorsOf({ ...valid, libraryName: "a".repeat(201) })).toContain("libraryName");
    expect(errorsOf({ ...valid, institutionName: "a".repeat(201) })).toContain("institutionName");
  });

  it("field wajib: jenis, kecamatan, kelurahan, alamat, penanggung jawab, email", () => {
    const errors = errorsOf({ ...valid, typeId: "", districtId: null, villageId: "", address: " ", picName: "", officialEmail: "" });
    expect(errors).toEqual(
      expect.arrayContaining(["typeId", "districtId", "villageId", "address", "picName", "officialEmail"]),
    );
  });

  it("email harus format valid", () => {
    expect(errorsOf({ ...valid, officialEmail: "bukan-email" })).toContain("officialEmail");
  });

  it("WhatsApp opsional, format 62xxxxxxxxxx", () => {
    expect(errorsOf({ ...valid, whatsapp: "6281234567890" })).toEqual([]);
    expect(errorsOf({ ...valid, whatsapp: "081234567890" })).toContain("whatsapp");
    expect(errorsOf({ ...valid, whatsapp: "+6281234567890" })).toContain("whatsapp");
  });
});

describe("groupInstitutions [FR-03.08]", () => {
  const row = (districtName: string, typeName: string, typeSortOrder: number, id: string) => ({
    districtName,
    typeName,
    typeSortOrder,
    id,
  });

  it("kelompok Kecamatan (urut nama) > Jenis (urut sortOrder) dengan jumlah per kelompok", () => {
    const groups = groupInstitutions([
      row("Pontianak Utara", "TBM", 3, "a"),
      row("Pontianak Kota", "SMP", 2, "b"),
      row("Pontianak Kota", "SD", 1, "c"),
      row("Pontianak Kota", "SD", 1, "d"),
    ]);

    expect(groups.map((g) => [g.districtName, g.count])).toEqual([
      ["Pontianak Kota", 3],
      ["Pontianak Utara", 1],
    ]);
    expect(groups[0].types.map((t) => [t.typeName, t.count])).toEqual([
      ["SD", 2],
      ["SMP", 1],
    ]);
    expect(groups[0].types[0].items.map((i) => i.id)).toEqual(["c", "d"]);
  });

  it("daftar kosong menghasilkan kelompok kosong", () => {
    expect(groupInstitutions([])).toEqual([]);
  });
});
