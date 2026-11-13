import type { VariableDef } from "./scoring";

/**
 * Skema default gaya IPLM (Q2). Tingkat atas DIBUKTIKAN dari `docs/data-contoh-iplm.xlsx` (13 baris,
 * selisih ≤ pembulatan): Kepatuhan = rata-rata(Koleksi, SDM), Kinerja = rata-rata(Pelayanan, Pengelolaan),
 * Indeks Dasar = 30% Kepatuhan + 70% Kinerja.
 * Tingkat indikator TIDAK diberikan Perpusnas: pengelompokan kolom j_* / tambah_* per subdimensi di bawah
 * mengikuti urutan kolom file contoh, dan semuanya default yang bisa diubah admin di menu Skoring.
 * Dilewati sengaja: j_anggaran_koleksi_bos/_non_bos (rincian j_anggaran_koleksi, menghindari hitung ganda)
 * serta j_gurudantenagapendidik/j_siswa/j_karyawan (data konteks, bukan kinerja perpustakaan).
 */
export const IPLM_SUBDIMENSIONS = [
  {
    code: "sub_koleksi",
    name: "Koleksi",
    dimension: "dim_kepatuhan",
    indicators: [
      "j_judul_koleksi_tercetak",
      "j_eksemplar_koleksi_tercetak",
      "j_judul_koleksi_digital",
      "j_eksemplar_koleksi_digital",
      "tambah_judul_koleksi_tercetak",
      "tambah_eksemplar_koleksi_tercetak",
      "tambah_judul_koleksi_digital",
      "tambah_eksemplar_koleksi_digital",
      "j_anggaran_koleksi",
    ],
  },
  {
    code: "sub_sdm",
    name: "SDM",
    dimension: "dim_kepatuhan",
    indicators: ["j_tenaga_ilmu_perpus", "j_tenaga_nonilmu_perpus", "j_tenaga_pkb", "j_anggaran_diklat_perpus"],
  },
  {
    code: "sub_pelayanan",
    name: "Pelayanan",
    dimension: "dim_kinerja",
    indicators: [
      "j_peserta_budaya_baca",
      "j_pemustaka_luring_daring",
      "j_pemustaka_fasilitas_tik",
      "j_judul_koleksi_tercetak_termanfaat",
      "j_eksemplar_koleksi_tercetak_termanfaat",
      "j_judul_koleksi_digital_termanfaat",
      "j_eksemplar_koleksi_digital_termanfaat",
      "j_kegiatan_budaya_baca_peningkatan_literasi",
    ],
  },
  {
    code: "sub_pengelolaan",
    name: "Pengelolaan",
    dimension: "dim_kinerja",
    indicators: ["j_kerjasama_pengembangan_perpus", "j_variasi_layanan", "j_kebijakan_prosedur_pelayanan", "j_anggaran_peningkatan_pelayanan", "j_perda_perpus"],
  },
] as const;

const NUMERIC = ["INTEGER", "DECIMAL", "CURRENCY", "PERCENT", "SCALE"];

/** Indikator default yang benar-benar bisa dibuat: hanya kode soal IPLM yang ada di kuesioner periode & bertipe angka. */
export function presetIndicators(variables: (VariableDef & { label?: string })[]) {
  const byCode = new Map(variables.filter((v) => NUMERIC.includes(v.type)).map((v) => [v.code, v]));
  return IPLM_SUBDIMENSIONS.map((s) => ({
    ...s,
    available: s.indicators.filter((c) => byCode.has(c)).map((c) => ({ code: c, label: byCode.get(c)!.label ?? c })),
  }));
}
