import type { PeriodStatus } from "@prisma/client";

// Prinsip UX PRD §8: status selalu warna + teks
export const PERIOD_STATUS: Record<PeriodStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draf", className: "text-muted-foreground" },
  OPEN: { label: "Dibuka", className: "text-green-700" },
  CLOSED: { label: "Ditutup", className: "text-amber-700" },
  ARCHIVED: { label: "Diarsipkan", className: "text-muted-foreground" },
};

export type ExtensionLike ={ institutionId: string | null; newClosesAt: Date; deletedAt?: Date | null };

/**
 * Tanggal tutup yang berlaku untuk satu lembaga (FR-02.07, BR-12): maksimum
 * dari tanggal tutup periode, perpanjangan semua lembaga (institutionId null),
 * dan perpanjangan khusus lembaga itu. `institutionId = null` → hanya yang umum.
 */
export function effectiveClosesAt(closesAt: Date, extensions: ExtensionLike[], institutionId: string | null): Date {
  return extensions
    .filter((e) => !e.deletedAt && (e.institutionId === null || e.institutionId === institutionId))
    .reduce((max, e) => (e.newClosesAt > max ? e.newClosesAt : max), closesAt);
}

/** Transisi manual oleh Super Admin (FR-02.04). ARCHIVED final. */
export const MANUAL_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  DRAFT: ["OPEN"],
  OPEN: ["CLOSED"],
  CLOSED: ["OPEN", "ARCHIVED"],
  ARCHIVED: [],
};

/**
 * Status otomatis dari cron (FR-02.04): DRAFT → OPEN saat tanggal buka tercapai
 * (selama belum lewat tutup dan tidak ada periode lain OPEN, FR-02.05);
 * OPEN → CLOSED saat tanggal tutup umum (termasuk perpanjangan semua lembaga) lewat.
 * Perpanjangan khusus lembaga TIDAK menahan periode tetap OPEN — ditangani
 * effectiveClosesAt per lembaga saat kirim (AC M02).
 */
export function nextAutoStatus(
  period: { status: PeriodStatus; opensAt: Date; closesAt: Date },
  extensions: ExtensionLike[],
  now: Date,
  anotherPeriodOpen: boolean,
): PeriodStatus | null {
  const closes = effectiveClosesAt(period.closesAt, extensions, null);
  if (period.status === "DRAFT" && period.opensAt <= now && closes > now && !anotherPeriodOpen) return "OPEN";
  if (period.status === "OPEN" && closes <= now) return "CLOSED";
  return null;
}
