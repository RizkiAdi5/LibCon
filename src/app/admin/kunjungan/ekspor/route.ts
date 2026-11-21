import ExcelJS from "exceljs";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { withDb } from "@/lib/db/withDb";
import { loadVisitorRecap, parseVisitorFilter } from "@/lib/visitorData";
import { FILL_STATUS, MONTH_LABELS } from "@/lib/visitors";
import { attachment } from "@/app/admin/report/ekspor/log";

/** Ekspor rekap pengunjung dengan susunan seperti Excel manual lama (per bulan LK/PR + JUMLAH). Tercatat di activity_logs. */
export async function GET(request: Request) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const filter = parseVisitorFilter(Object.fromEntries(new URL(request.url).searchParams));
  const { year, rows } = await loadVisitorRecap(filter);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Kunjungan ${year}`);
  const fixed = ["NO", "NAMA LEMBAGA", "NPP", "JENIS", "KECAMATAN"];
  const lastCol = fixed.length + 24 + 2;
  ws.addRow([`REKAPITULASI DATA PENGUNJUNG PERPUSTAKAAN TAHUN ${year}`]);
  ws.mergeCells(1, 1, 1, lastCol);
  ws.addRow([...fixed, ...MONTH_LABELS.flatMap((m) => [m.toUpperCase(), null]), "JUMLAH", "STATUS"]);
  ws.addRow([...fixed.map(() => null), ...MONTH_LABELS.flatMap(() => ["LK", "PR"]), null, null]);
  fixed.forEach((_, i) => ws.mergeCells(2, i + 1, 3, i + 1));
  MONTH_LABELS.forEach((_, m) => ws.mergeCells(2, fixed.length + 1 + m * 2, 2, fixed.length + 2 + m * 2));
  ws.mergeCells(2, lastCol - 1, 3, lastCol - 1);
  ws.mergeCells(2, lastCol, 3, lastCol);
  for (const r of [1, 2, 3]) {
    ws.getRow(r).font = { bold: true };
    ws.getRow(r).alignment = { horizontal: "center", vertical: "middle" };
  }

  rows.forEach((r, i) => {
    ws.addRow([
      i + 1,
      r.name,
      r.npp,
      r.typeCode,
      r.districtName,
      ...r.grid.flatMap((c) => (c ? [c.male, c.female] : [null, null])),
      r.totals.total,
      FILL_STATUS[r.status].label,
    ]);
  });
  const totalRow = ws.addRow(["TOTAL", null, null, null, null]);
  for (let col = fixed.length + 1; col <= lastCol - 1; col++) {
    const letter = ws.getColumn(col).letter;
    totalRow.getCell(col).value = rows.length > 0 ? { formula: `SUM(${letter}4:${letter}${3 + rows.length})` } : 0;
  }
  totalRow.font = { bold: true };
  ws.getColumn(2).width = 40;
  ws.getColumn(5).width = 22;
  ws.getColumn(lastCol).width = 14;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];

  const buffer = await wb.xlsx.writeBuffer();
  await runAsUser(user, () =>
    withDb((tx) =>
      tx.activityLog.create({
        data: {
          userId: user.id,
          actorRole: user.role,
          activity: "EXPORT_REPORT",
          description: `Ekspor rekap kunjungan ${year} (${rows.length} baris)`,
          metadata: { kind: "excel-kunjungan", rowCount: rows.length, filter: { ...filter, tahun: year } },
        },
      }),
    ),
  );
  return attachment(buffer as ArrayBuffer, `libcon-kunjungan-${year}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
