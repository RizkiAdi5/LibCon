import { requireRole } from "@/lib/auth/guard";
import { renderSummaryPdf } from "@/lib/pdf/reportPdf";
import { loadFilteredReport } from "@/lib/reportData";
import { attachment, logExport } from "../log";

/** FR-11.06: laporan ringkas PDF sesuai filter. */
export async function GET(request: Request) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const { filter, rows } = await loadFilteredReport(new URL(request.url).searchParams);
  if (filter.periode.length === 0) return new Response("Pilih periode", { status: 400 });
  const periods = [...new Set(rows.map((r) => r.periodName))].join(", ");
  const pdf = await renderSummaryPdf(rows, `Periode: ${periods || "-"}`);
  await logExport(user, "pdf-ringkas", filter, rows.length);
  return attachment(new Uint8Array(pdf), `libcon-ringkas-${new Date().toISOString().slice(0, 10)}.pdf`, "application/pdf");
}
