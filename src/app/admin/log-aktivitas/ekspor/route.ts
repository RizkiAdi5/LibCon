import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { csvCell } from "@/lib/monitoring";
import { formatLogValue, parseLogFilter } from "@/lib/activityLog";
import { loadLogs } from "@/lib/activityLogData";

// shortcut: batas 10.000 baris per ekspor (tanpa streaming); persempit filter tanggal untuk log lebih banyak
const MAX_ROWS = 10_000;

/** FR-13.07: ekspor CSV log sesuai filter. */
export async function GET(request: Request) {
  await requireRole(["SUPER_ADMIN"]);
  const params = new URL(request.url).searchParams;
  const f = parseLogFilter(Object.fromEntries(params));
  const { entries } = await loadLogs(f, MAX_ROWS, 0);
  const header = ["Waktu", "Pelaku", "Peran", "Sumber", "IP", "Aksi", "Objek", "Keterangan", "Perubahan"];
  const lines = entries.map((e) =>
    [
      formatWib(e.createdAt),
      e.actor,
      e.actorRole,
      e.source,
      e.ipAddress,
      e.action,
      e.target,
      e.description,
      e.changes.map((c) => (f.tab === "audit" ? `${c.field}: ${formatLogValue(c.before)} → ${formatLogValue(c.after)}` : `${c.field}: ${formatLogValue(c.after)}`)).join("; "),
    ]
      .map(csvCell)
      .join(","),
  );
  // BOM supaya Excel membaca UTF-8 dengan benar
  return new Response("﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="log-${f.tab}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
