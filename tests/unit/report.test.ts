import { describe, expect, it } from "vitest";
import { applyReportFilter, filterToQuery, groupMean, histogram, iplmRow, IPLM_COLUMNS, median, parseReportFilter, questionStats, type ReportRow } from "@/lib/report";

const row = (patch: Partial<ReportRow> = {}): ReportRow => ({
  periodId: "p",
  periodName: "Lomba 2026",
  periodYear: 2026,
  passingScore: 70,
  institutionId: "i",
  npp: "61710513",
  npsn: "30105249",
  libraryName: "PERPUSTAKAAN TIRANUS",
  institutionName: "SDK IMMANUEL",
  address: "Jl. Sisingamangaraja",
  whatsapp: "62823412",
  picName: "Pengisi",
  submitterName: "SURYA",
  cityName: "Kota Pontianak",
  districtId: "kec1",
  districtName: "Pontianak Kota",
  villageId: "kel1",
  typeId: "sd",
  typeCode: "SD",
  typeName: "Sekolah Dasar",
  status: "VERIFIED",
  openFlagCount: 0,
  submissionId: "s",
  score: { indexScore: 70.3, categoryId: "lolos", categoryName: "Lolos Nasional", categoryColor: null, rankOverall: 1, rankInType: 1, rankInDistrict: 1, schemeVersion: 1, nodes: { sub_koleksi: 0.6131, dim_kinerja: 0.686 } },
  answers: { j_siswa: 696, j_eksemplar_koleksi_tercetak: 2292 },
  evidenceUrls: ["https://drive.google.com/x"],
  ...patch,
});

describe("applyReportFilter [FR-11.01, AC M11]", () => {
  it("AC: jenis SD & skor ≥ batas lolos → hanya SD berskor ≥ 70", () => {
    const rows = [
      row({ institutionId: "a" }),
      row({ institutionId: "b", score: { ...row().score!, indexScore: 69.99 } }),
      row({ institutionId: "c", typeId: "tbm", typeCode: "TBM" }),
      row({ institutionId: "d", score: null, status: "DRAFT" }),
    ];
    const f = parseReportFilter({ jenis: "sd", skor: "lolos" });
    expect(applyReportFilter(rows, f).map((r) => r.institutionId)).toEqual(["a"]);
  });

  it("rentang kustom, flag, status multi", () => {
    const rows = [row({ institutionId: "a", openFlagCount: 2 }), row({ institutionId: "b", score: { ...row().score!, indexScore: 40 } })];
    expect(applyReportFilter(rows, parseReportFilter({ skor: "kustom", skorMin: "30", skorMax: "50" })).map((r) => r.institutionId)).toEqual(["b"]);
    expect(applyReportFilter(rows, parseReportFilter({ flag: "ada" })).map((r) => r.institutionId)).toEqual(["a"]);
    expect(applyReportFilter(rows, parseReportFilter({ status: ["VERIFIED", "DRAFT"] }))).toHaveLength(2);
  });

  it("nilai filter tak dikenal diabaikan; query bolak-balik", () => {
    const f = parseReportFilter({ skor: "ngawur", jenis: ["a", "b"], skorMin: "70" });
    expect(f.skor).toBe("");
    expect(parseReportFilter(Object.fromEntries([...filterToQuery(f).keys()].map((k) => [k, filterToQuery(f).getAll(k)])))).toEqual(f);
  });

  it("nilai tunggal dari URLSearchParams.getAll (array) tetap terbaca — ekspor & simpan filter", () => {
    const f = parseReportFilter({ skor: ["lolos"], flag: ["ada"], skorMax: ["80,5"], jenis: ["a"] });
    expect(f).toMatchObject({ skor: "lolos", flag: "ada", skorMax: 80.5, jenis: ["a"] });
  });
});

describe("statistik [FR-11.03, FR-11.04]", () => {
  it("histogram per 10 poin, 100 masuk rentang terakhir", () => {
    const bins = histogram([5, 70.3, 70.38, 100]);
    expect(bins[0].count).toBe(1);
    expect(bins[7].count).toBe(2);
    expect(bins[9].count).toBe(1);
  });

  it("median, statistik soal (kosong dihitung), rata-rata per kelompok", () => {
    expect(median([3, 1, 2, 10])).toBe(2.5);
    expect(questionStats([1, null, 3, "", 5])).toMatchObject({ count: 3, empty: 2, mean: 3, median: 3, min: 1, max: 5 });
    expect(groupMean([{ g: "SD", v: 0.5 }, { g: "SD", v: 0.7 }, { g: "TBM", v: null }], (x) => x.g, (x) => x.v)).toEqual([{ group: "SD", mean: 0.6, n: 2 }]);
  });
});

describe("iplmRow [FR-11.05, AC M11]", () => {
  it("57 kolom persis file contoh, klasifikasi SD, nilai subdimensi 3 desimal, kolom j_* dari kode soal", () => {
    expect(IPLM_COLUMNS).toHaveLength(57);
    const out = iplmRow(row(), { provinsi: "PROVINSI KALIMANTAN BARAT", kewNorm: "KAB/KOTA" });
    expect(Object.keys(out)).toEqual([...IPLM_COLUMNS]);
    expect(out).toMatchObject({
      Provinsi: "PROVINSI KALIMANTAN BARAT",
      "Kab/Kota": "KOTA PONTIANAK",
      Jenis: "sekolah",
      jenis_perpustakaan: "PERPUSTAKAAN SEKOLAH",
      sub_jenis_perpus_sekolah: "Perpustakaan SD (Negeri maupun Swasta)",
      sub_jenis_perpus: "PERPUSTAKAAN SD (NEGERI MAUPUN SWASTA)",
      sub_koleksi: 0.613,
      Indeks_Dasar_0_100: 70.3,
      Indeks_Final_0_100: null,
      j_siswa: 696,
      j_eksemplar_koleksi_tercetak: 2292,
      j_karyawan: null,
      nm_pengisi: "SURYA",
      data_dukung: "https://drive.google.com/x",
    });
  });

  it("jenis tanpa padanan IPLM (TBM) → kolom klasifikasi kosong", () => {
    const out = iplmRow(row({ typeCode: "TBM" }), { provinsi: "", kewNorm: "" });
    expect(out.Jenis).toBeNull();
    expect(out.sub_jenis_perpus).toBeNull();
  });
});
