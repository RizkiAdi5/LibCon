import { describe, expect, it } from "vitest";
import { IPLM_SUBDIMENSIONS, presetIndicators } from "@/lib/formula/iplmPreset";
import { IPLM_COLUMNS } from "@/lib/report";

describe("skema default gaya IPLM [Q2, FR-09.01]", () => {
  it("semua kode indikator adalah kolom IPLM resmi, tanpa duplikat", () => {
    const all = IPLM_SUBDIMENSIONS.flatMap((s) => s.indicators);
    expect(new Set(all).size).toBe(all.length);
    for (const c of all) expect(IPLM_COLUMNS).toContain(c);
    // Kepatuhan = Koleksi + SDM, Kinerja = Pelayanan + Pengelolaan (terbukti dari data contoh)
    expect(IPLM_SUBDIMENSIONS.map((s) => `${s.code}>${s.dimension}`)).toEqual([
      "sub_koleksi>dim_kepatuhan",
      "sub_sdm>dim_kepatuhan",
      "sub_pelayanan>dim_kinerja",
      "sub_pengelolaan>dim_kinerja",
    ]);
  });

  it("hanya soal angka yang ada di kuesioner yang dijadikan indikator", () => {
    const res = presetIndicators([
      { code: "j_judul_koleksi_tercetak", type: "INTEGER", options: [], label: "Judul tercetak" },
      { code: "j_variasi_layanan", type: "SINGLE_CHOICE", options: [] }, // bukan angka → dilewati
      { code: "j_lain", type: "INTEGER", options: [] }, // bukan kode IPLM → dilewati
    ]);
    expect(res.find((s) => s.code === "sub_koleksi")!.available).toEqual([{ code: "j_judul_koleksi_tercetak", label: "Judul tercetak" }]);
    expect(res.find((s) => s.code === "sub_pengelolaan")!.available).toEqual([]);
  });
});
