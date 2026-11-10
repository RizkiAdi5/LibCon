import { describe, expect, it } from "vitest";
import { configForType, slugifyCode, stableStringify, structureChanged, uniqueCode, type QuestionStructure } from "@/lib/questionnaire";
import { questionSchema } from "@/lib/validation/question";

describe("slugifyCode / uniqueCode [FR-06.02, FR-06.03]", () => {
  it("membuat kode dari teks soal", () => {
    expect(slugifyCode("Jumlah Eksemplar Cetak (buah)")).toBe("jumlah_eksemplar_cetak_buah");
    expect(slugifyCode("Luas ruang — m²")).toBe("luas_ruang_m");
    expect(slugifyCode("Kegiatan Ékstra")).toBe("kegiatan_ekstra");
  });

  it("diawali huruf (dipakai sebagai variabel rumus)", () => {
    expect(slugifyCode("2024 anggaran")).toBe("q_2024_anggaran");
    expect(slugifyCode("???")).toBe("soal");
  });

  it("maks. 50 karakter tanpa garis bawah di ujung", () => {
    const code = slugifyCode("a ".repeat(60));
    expect(code.length).toBeLessThanOrEqual(50);
    expect(code.endsWith("_")).toBe(false);
  });

  it("menambah akhiran jika bentrok atau dicadangkan", () => {
    expect(uniqueCode("j_siswa", ["j_siswa", "j_siswa_2"])).toBe("j_siswa_3");
    expect(uniqueCode("jenis", [])).toBe("jenis_2");
    expect(uniqueCode("baru", ["lain"])).toBe("baru");
  });
});

describe("configForType", () => {
  it("hanya menyimpan pengaturan yang relevan untuk tipe", () => {
    const config = { min: 0, max: 10, unit: "buah", maxLength: 100, columns: [] };
    expect(configForType("INTEGER", config)).toEqual({ min: 0, max: 10, unit: "buah" });
    expect(configForType("PERCENT", config)).toEqual({});
    expect(configForType("SHORT_TEXT", config)).toEqual({ maxLength: 100 });
  });

  it("membuang nilai kosong", () => {
    expect(configForType("INTEGER", { min: null, max: undefined, unit: "" })).toEqual({});
  });
});

describe("structureChanged [FR-06.10, AC M06]", () => {
  const base: QuestionStructure = {
    sectionId: "s1",
    code: "j_siswa",
    label: "Jumlah siswa",
    type: "INTEGER",
    isRequired: true,
    hasEvidenceUrl: false,
    config: { min: 0, unit: "orang" },
    options: [],
    institutionTypeIds: ["a", "b"],
  };

  it("urutan kunci config dan urutan jenis tidak dianggap perubahan", () => {
    expect(structureChanged(base, { ...base, config: { unit: "orang", min: 0 }, institutionTypeIds: ["b", "a"] })).toBe(false);
  });

  it("mengubah tipe soal terdeteksi sebagai perubahan struktur", () => {
    expect(structureChanged(base, { ...base, type: "DECIMAL" })).toBe(true);
    expect(structureChanged(base, { ...base, options: [{ label: "x", scoreValue: 1 }] })).toBe(true);
  });

  it("stableStringify mengurutkan kunci objek bersarang", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});

describe("questionSchema [FR-06.02, FR-06.07]", () => {
  const valid = {
    sectionId: "11111111-1111-4111-8111-111111111111",
    label: "Jumlah siswa",
    code: "j_siswa",
    type: "INTEGER",
    isRequired: true,
    hasEvidenceUrl: false,
    institutionTypeIds: [],
    options: [],
    config: { min: 0, max: 5000 },
  };
  const paths = (input: unknown) => {
    const r = questionSchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
  };

  it("menerima soal angka valid", () => {
    expect(paths(valid)).toEqual([]);
  });

  it("kode variabel harus huruf kecil/angka/garis bawah, diawali huruf, bukan kata cadangan", () => {
    expect(paths({ ...valid, code: "J-Siswa" })).toContain("code");
    expect(paths({ ...valid, code: "1siswa" })).toContain("code");
    expect(paths({ ...valid, code: "jenis" })).toContain("code");
  });

  it("min tidak boleh lebih dari maks", () => {
    expect(paths({ ...valid, config: { min: 10, max: 1 } })).toContain("config.max");
  });

  it("pilihan butuh minimal 2 opsi unik; Ya/Tidak tepat 2", () => {
    expect(paths({ ...valid, type: "SINGLE_CHOICE", options: [{ label: "A", scoreValue: 1 }] })).toContain("options");
    expect(paths({ ...valid, type: "DROPDOWN", options: [{ label: "A", scoreValue: 1 }, { label: "a", scoreValue: 2 }] })).toContain("options");
    expect(paths({ ...valid, type: "YES_NO", options: [{ label: "Ya", scoreValue: 1 }, { label: "Tidak", scoreValue: 0 }] })).toEqual([]);
  });

  it("pilihan ganda: maks. pilihan tidak melebihi jumlah opsi", () => {
    const options = [{ label: "A", scoreValue: null }, { label: "B", scoreValue: null }];
    expect(paths({ ...valid, type: "MULTI_CHOICE", options, config: { maxSelect: 3 } })).toContain("config.maxSelect");
  });

  it("tabel isian minimal 1 kolom", () => {
    expect(paths({ ...valid, type: "TABLE", config: {} })).toContain("config.columns");
    expect(paths({ ...valid, type: "TABLE", config: { columns: [{ label: "Nama", type: "TEXT" }] } })).toEqual([]);
  });

  it("tipe Unggah file tidak bisa dipilih (Tahap lanjutan)", () => {
    expect(paths({ ...valid, type: "FILE" })).toContain("type");
  });
});
