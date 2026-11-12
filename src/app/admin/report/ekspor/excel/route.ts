import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/guard";
import { IPLM_COLUMNS, iplmRow } from "@/lib/report";
import { getIplmIdentity, loadFilteredReport } from "@/lib/reportData";
import { attachment, logExport } from "../log";

/** FR-11.05: ekspor Excel dengan kolom & urutan persis format IPLM (AC M11). Hanya lembaga yang punya kiriman. */
export async function GET(request: Request) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const { filter, rows } = await loadFilteredReport(new URL(request.url).searchParams);
  if (filter.periode.length === 0) return new Response("Pilih periode", { status: 400 });
  const identity = await getIplmIdentity();
  const data = rows.filter((r) => r.submissionId);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow([...IPLM_COLUMNS]);
  ws.getRow(1).font = { bold: true };
  for (const r of data) {
    const row = iplmRow(r, identity);
    ws.addRow(IPLM_COLUMNS.map((c) => (row[c] === null || row[c] === undefined ? null : Array.isArray(row[c]) ? (row[c] as unknown[]).join(", ") : row[c])));
  }
  const buffer = await wb.xlsx.writeBuffer();
  await logExport(user, "excel-iplm", filter, data.length);
  return attachment(buffer as ArrayBuffer, `libcon-iplm-${new Date().toISOString().slice(0, 10)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
