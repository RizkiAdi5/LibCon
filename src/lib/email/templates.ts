import type { EmailTemplateKey } from "@prisma/client";

/**
 * FR-14.02: katalog template — label & variabel yang BENAR-BENAR diisi kode pengirimnya.
 * Tambah variabel di sini hanya bersamaan dengan mengisinya di pemanggil `sendTemplateEmail`.
 */
export const TEMPLATE_INFO: Record<EmailTemplateKey, { label: string; variables: string[] }> = {
  ACTIVATION: { label: "Aktivasi akun / undangan admin", variables: ["nama_lembaga", "npp", "link"] },
  PASSWORD_RESET: { label: "Reset password", variables: ["nama_lembaga", "link"] },
  ACCOUNT_LOCKED: { label: "Akun terkunci", variables: ["tenggat"] },
  REMINDER_DEADLINE: { label: "Reminder tenggat pengisian", variables: ["nama_lembaga", "tenggat", "link"] },
  REMINDER_ACTIVATION: { label: "Reminder aktivasi", variables: ["nama_lembaga", "link"] },
  REMINDER_REVISION: { label: "Reminder batas revisi", variables: ["nama_lembaga", "tenggat", "catatan"] },
  SUBMISSION_RECEIPT: { label: "Tanda terima kiriman", variables: ["nama_lembaga", "waktu", "periode"] },
  REVISION_OPENED: { label: "Revisi dibuka", variables: ["nama_lembaga", "catatan", "tenggat"] },
  ACCOUNT_REQUEST_APPROVED: { label: "Permintaan akun kedua disetujui", variables: ["nama_lembaga"] },
  ACCOUNT_REQUEST_REJECTED: { label: "Permintaan akun kedua ditolak", variables: ["nama_lembaga", "catatan"] },
  SCORE_PUBLISHED: { label: "Skor dipublikasikan", variables: ["nama_lembaga", "periode"] },
};

/** Contoh nilai untuk pratinjau & kirim uji. */
export const SAMPLE_VARIABLES: Record<string, string> = {
  nama_lembaga: "Perpustakaan SD Contoh 01",
  npp: "6171000000000001",
  link: "https://libcon.example/contoh-link",
  tenggat: "30 Jun 2026, 23.59 WIB",
  catatan: "Mohon lengkapi jumlah eksemplar.",
  waktu: "12 Nov 2026, 10.42 WIB",
  periode: "Lomba Perpustakaan 2026",
};

export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (match, key) => variables[key] ?? match);
}

/** Variabel `{x}` yang tidak dikenal template ini — akan terkirim mentah ke penerima, jadi ditolak saat simpan. */
export function unknownVariables(text: string, allowed: string[]): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].filter((v) => !allowed.includes(v));
}
