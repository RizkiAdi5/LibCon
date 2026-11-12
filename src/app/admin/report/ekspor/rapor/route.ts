import JSZip from "jszip";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { renderRaporPdf } from "@/lib/pdf/reportPdf";
import { loadFilteredReport, loadReportRows, raporPeers } from "@/lib/reportData";
import { attachment, logExport } from "../log";

const safeName = (s: string) => s.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80) || "lembaga";

/** FR-11.06: rapor PDF satu peserta (?submission=) atau semua lembaga berskor sesuai filter (ZIP). */
export async function GET(request: Request) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const params = new URL(request.url).searchParams;

  if (params.has("submission")) {
    const id = z.uuid().safeParse(params.get("submission"));
    const sub = id.success ? await prisma.submission.findUnique({ where: { id: id.data }, select: { periodId: true, institutionId: true } }) : null;
    if (!sub) return new Response("Kiriman tidak ditemukan", { status: 404 });
    const all = await loadReportRows([sub.periodId]);
    const row = all.find((r) => r.institutionId === sub.institutionId);
    if (!row?.score) return new Response("Kiriman belum punya skor resmi", { status: 404 });
    const pdf = await renderRaporPdf({ ...row, score: row.score }, raporPeers(all, row), true);
    await logExport(user, "rapor", null, 1, { type: "submission", id: id.data! });
    return attachment(new Uint8Array(pdf), `rapor-${row.npp}.pdf`, "application/pdf");
  }

  const { filter, rows, allRows } = await loadFilteredReport(params);
  if (filter.periode.length === 0) return new Response("Pilih periode", { status: 400 });
  const zip = new JSZip();
  let count = 0;
  for (const row of rows) {
    if (!row.score) continue;
    const pdf = await renderRaporPdf({ ...row, score: row.score }, raporPeers(allRows, row), true);
    zip.file(`${row.periodYear}/${row.npp} ${safeName(row.libraryName)}.pdf`, pdf);
    count++;
  }
  if (count === 0) return new Response("Tidak ada lembaga berskor pada filter ini", { status: 404 });
  const body = await zip.generateAsync({ type: "arraybuffer" });
  await logExport(user, "rapor-zip", filter, count);
  return attachment(body, `rapor-libcon-${new Date().toISOString().slice(0, 10)}.zip`, "application/zip");
}
