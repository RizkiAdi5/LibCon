import { z } from "zod";
import type { MonitoringStatus } from "./monitoring";

/**
 * Report & analitik (M11) — bagian murni: filter, statistik, kolom IPLM.
 * Data dimuat di `reportData.ts`.
 */

export type ReportRow = {
  periodId: string;
  periodName: string;
  periodYear: number;
  passingScore: number;
  institutionId: string;
  npp: string;
  npsn: string | null;
  libraryName: string;
  institutionName: string;
  address: string;
  whatsapp: string | null;
  picName: string;
  submitterName: string | null;
  cityName: string;
  districtId: string;
  districtName: string;
  villageId: string;
  typeId: string;
  typeCode: string;
  typeName: string;
  status: MonitoringStatus;
  openFlagCount: number;
  submissionId: string | null;
  score: null | {
    indexScore: number;
    categoryId: string | null;
    categoryName: string | null;
    categoryColor: string | null;
    rankOverall: number | null;
    rankInType: number | null;
    rankInDistrict: number | null;
    schemeVersion: number;
    /** nilai ternormalisasi per kode node dimensi/subdimensi (mis. sub_koleksi, dim_kinerja) */
    nodes: Record<string, number>;
    nodeInfo?: Record<string, { name: string; level: string }>;
  };
  /** jawaban per kode soal (untuk kolom j_* IPLM & analitik jawaban) */
  answers: Record<string, unknown>;
  evidenceUrls: string[];
};

// ---------------------------------------------------------------- filter (FR-11.01, form filter PRD §5.10)

const multi = z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string()));
// URLSearchParams.getAll memberi array untuk nilai tunggal juga → ambil yang pertama
const single = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (Array.isArray(v) ? v[0] : v), schema);
const optionalNumber = z.preprocess((v) => (v === "" || v === undefined ? undefined : Number(String(v).replace(",", "."))), z.number().optional());

export const reportFilterSchema = z.object({
  periode: multi,
  kecamatan: multi,
  kelurahan: multi,
  jenis: multi,
  status: multi,
  skor: single(z.enum(["", "lolos", "tidak_lolos", "kustom"]).catch("")),
  skorMin: single(optionalNumber.catch(undefined)),
  skorMax: single(optionalNumber.catch(undefined)),
  kategori: multi,
  flag: single(z.enum(["", "ada", "tanpa"]).catch("")),
});
export type ReportFilter = z.infer<typeof reportFilterSchema>;

/** searchParams (Next) / URLSearchParams → filter. Nilai tak dikenal diabaikan, bukan error. */
export function parseReportFilter(params: Record<string, string | string[] | undefined>): ReportFilter {
  return reportFilterSchema.parse(params);
}

export function filterToQuery(filter: ReportFilter): URLSearchParams {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (Array.isArray(value)) value.forEach((v) => q.append(key, v));
    else if (value !== undefined && value !== "") q.set(key, String(value));
  }
  return q;
}

/** AC M11: "jenis SD dan skor ≥ 70" → hanya kiriman SD dengan skor berlaku ≥ 70 (batas lolos periode). */
export function applyReportFilter(rows: ReportRow[], f: ReportFilter): ReportRow[] {
  const has = (list: string[], v: string | null | undefined) => list.length === 0 || (v !== null && v !== undefined && list.includes(v));
  return rows.filter((r) => {
    if (!has(f.kecamatan, r.districtId) || !has(f.kelurahan, r.villageId) || !has(f.jenis, r.typeId) || !has(f.status, r.status)) return false;
    if (f.flag === "ada" && r.openFlagCount === 0) return false;
    if (f.flag === "tanpa" && r.openFlagCount > 0) return false;
    if (f.kategori.length && !has(f.kategori, r.score?.categoryId)) return false;
    if (f.skor) {
      if (!r.score) return false;
      const s = r.score.indexScore;
      if (f.skor === "lolos" && s < r.passingScore) return false;
      if (f.skor === "tidak_lolos" && s >= r.passingScore) return false;
      if (f.skor === "kustom" && ((f.skorMin !== undefined && s < f.skorMin) || (f.skorMax !== undefined && s > f.skorMax))) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- statistik (FR-11.03, FR-11.04)

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** FR-11.03 histogram: jumlah skor per rentang 10 poin (0–9,99 … 90–100). */
export function histogram(scores: number[], width = 10, max = 100): { from: number; to: number; count: number }[] {
  const bins = Array.from({ length: Math.ceil(max / width) }, (_, i) => ({ from: i * width, to: (i + 1) * width, count: 0 }));
  for (const s of scores) bins[Math.min(Math.floor(s / width), bins.length - 1)].count++;
  return bins;
}

/** FR-11.04: statistik satu soal angka di kiriman terpilih. */
export function questionStats(values: unknown[]) {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return {
    count: nums.length,
    empty: values.length - nums.length,
    mean: mean(nums),
    median: median(nums),
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
  };
}

/** Rata-rata nilai per kelompok (mis. subdimensi per jenis, indeks per kecamatan). */
export function groupMean<T>(items: T[], groupOf: (t: T) => string, valueOf: (t: T) => number | null | undefined) {
  const groups = new Map<string, number[]>();
  for (const item of items) {
    const v = valueOf(item);
    if (v === null || v === undefined) continue;
    groups.set(groupOf(item), [...(groups.get(groupOf(item)) ?? []), v]);
  }
  return [...groups.entries()].map(([group, values]) => ({ group, mean: mean(values)!, n: values.length })).sort((a, b) => a.group.localeCompare(b.group, "id"));
}

// ---------------------------------------------------------------- ekspor IPLM (FR-11.05)

/** Urutan & nama kolom persis file contoh `docs/data-contoh-iplm.xlsx` (AC M11). */
export const IPLM_COLUMNS = [
  "Provinsi", "Kab/Kota", "nm_perpustakaan", "nm_instansi_lembaga", "KEW_NORM", "Jenis",
  "sub_koleksi", "sub_sdm", "sub_pelayanan", "sub_pengelolaan", "dim_kepatuhan", "dim_kinerja",
  "Indeks_Dasar_0_100", "Indeks_Final_0_100", "npsn", "npp", "nm_pengisi", "alamat_perpustakaan", "kontak_wa",
  "jenis_perpustakaan", "sub_jenis_perpus_umum", "sub_jenis_perpus_sekolah", "sub_jenis_perpus_perguruantinggi",
  "sub_jenis_perpus_khusus", "sub_jenis_perpus",
  "j_gurudantenagapendidik", "j_siswa", "j_karyawan", "j_judul_koleksi_tercetak", "j_eksemplar_koleksi_tercetak",
  "j_judul_koleksi_digital", "j_eksemplar_koleksi_digital", "tambah_judul_koleksi_tercetak", "tambah_eksemplar_koleksi_tercetak",
  "tambah_judul_koleksi_digital", "tambah_eksemplar_koleksi_digital", "j_anggaran_koleksi", "j_anggaran_koleksi_bos",
  "j_anggaran_koleksi_non_bos", "j_tenaga_ilmu_perpus", "j_tenaga_nonilmu_perpus", "j_tenaga_pkb", "j_anggaran_diklat_perpus",
  "j_peserta_budaya_baca", "j_pemustaka_luring_daring", "j_pemustaka_fasilitas_tik", "j_judul_koleksi_tercetak_termanfaat",
  "j_eksemplar_koleksi_tercetak_termanfaat", "j_judul_koleksi_digital_termanfaat", "j_eksemplar_koleksi_digital_termanfaat",
  "j_kegiatan_budaya_baca_peningkatan_literasi", "j_kerjasama_pengembangan_perpus", "j_variasi_layanan",
  "j_kebijakan_prosedur_pelayanan", "j_anggaran_peningkatan_pelayanan", "j_perda_perpus", "data_dukung",
] as const;

/**
 * Klasifikasi IPLM per kode jenis peserta — diturunkan dari file contoh (SD & SMP).
 * shortcut: jenis lain (mis. TBM) belum punya padanan IPLM di data contoh → kolom klasifikasi
 * dikosongkan; pindahkan ke pengaturan jenis peserta begitu padanan resminya didapat.
 */
const IPLM_TYPE: Record<string, { Jenis: string; jenis_perpustakaan: string; sub_jenis_perpus_sekolah: string }> = {
  SD: { Jenis: "sekolah", jenis_perpustakaan: "PERPUSTAKAAN SEKOLAH", sub_jenis_perpus_sekolah: "Perpustakaan SD (Negeri maupun Swasta)" },
  SMP: { Jenis: "sekolah", jenis_perpustakaan: "PERPUSTAKAAN SEKOLAH", sub_jenis_perpus_sekolah: "Perpustakaan SMP (Negeri maupun Swasta)" },
};

const round3 = (v: number | undefined) => (v === undefined ? null : Math.round(v * 1000) / 1000); // data contoh: 3 desimal

/** Satu baris ekspor IPLM. Kolom j_* / tambah_* diambil dari jawaban soal yang kodenya sama. */
export function iplmRow(r: ReportRow, identity: { provinsi: string; kewNorm: string }): Record<(typeof IPLM_COLUMNS)[number], unknown> {
  const type = IPLM_TYPE[r.typeCode];
  const row = Object.fromEntries(IPLM_COLUMNS.map((c) => [c, (r.answers[c] as unknown) ?? null])) as Record<(typeof IPLM_COLUMNS)[number], unknown>;
  return {
    ...row,
    Provinsi: identity.provinsi,
    "Kab/Kota": r.cityName.toUpperCase(),
    nm_perpustakaan: r.libraryName,
    nm_instansi_lembaga: r.institutionName,
    KEW_NORM: identity.kewNorm,
    Jenis: type?.Jenis ?? null,
    sub_koleksi: round3(r.score?.nodes.sub_koleksi),
    sub_sdm: round3(r.score?.nodes.sub_sdm),
    sub_pelayanan: round3(r.score?.nodes.sub_pelayanan),
    sub_pengelolaan: round3(r.score?.nodes.sub_pengelolaan),
    dim_kepatuhan: round3(r.score?.nodes.dim_kepatuhan),
    dim_kinerja: round3(r.score?.nodes.dim_kinerja),
    Indeks_Dasar_0_100: r.score?.indexScore ?? null,
    Indeks_Final_0_100: null, // PRD §12 Q3: arti kolom belum diketahui
    npsn: r.npsn,
    npp: r.npp,
    nm_pengisi: r.submitterName ?? r.picName,
    alamat_perpustakaan: r.address,
    kontak_wa: r.whatsapp,
    jenis_perpustakaan: type?.jenis_perpustakaan ?? null,
    sub_jenis_perpus_umum: null,
    sub_jenis_perpus_sekolah: type?.sub_jenis_perpus_sekolah ?? null,
    sub_jenis_perpus_perguruantinggi: null,
    sub_jenis_perpus_khusus: null,
    sub_jenis_perpus: type?.sub_jenis_perpus_sekolah.toUpperCase() ?? null,
    data_dukung: r.evidenceUrls.join(" ") || null,
  };
}
