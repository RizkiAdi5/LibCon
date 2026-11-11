import { formatWib } from "@/lib/date";

/** FR-08.06 + AC M08: banner revisi di beranda & halaman survei peserta. */
export function RevisionBanner({ deadlineAt, generalNote, count }: { deadlineAt: Date; generalNote: string | null; count: number }) {
  return (
    <section role="region" aria-label="Revisi" className="space-y-1 rounded-md border border-amber-600/50 bg-amber-50 p-4 text-sm text-amber-900" data-testid="revision-banner">
      <p className="font-semibold">Perlu revisi: {count} soal dibuka kembali oleh admin</p>
      {generalNote && <p>Catatan admin: {generalNote}</p>}
      <p>Batas revisi: {formatWib(deadlineAt)}. Lewat batas ini, jawaban terakhir yang dipakai.</p>
    </section>
  );
}
