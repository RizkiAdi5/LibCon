// Simpan UTC di DB, selalu tampilkan WIB di UI (konvensi CLAUDE.md).
const WIB_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatWib(date: Date): string {
  return `${WIB_FORMATTER.format(date)} WIB`;
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // WIB = UTC+7, tanpa DST

/** Nilai `<input type="datetime-local">` ("2026-06-30T23:59") dibaca sebagai WIB → Date UTC. */
export function parseWibDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Kebalikan parseWibDateTime — untuk defaultValue input datetime-local. */
export function toWibInputValue(date: Date): string {
  return new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 16);
}
