import { z } from "zod";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { csvCell, MONITORING_STATUS } from "@/lib/monitoring";
import { filterRows, loadMonitoring } from "@/lib/monitoringData";

/** FR-10.04: ekspor daftar monitoring (sesuai filter kartu) sebagai CSV. */
export async function GET(request: Request) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const params = new URL(request.url).searchParams;
  const periodId = z.uuid().safeParse(params.get("periode"));
  if (!periodId.success) return new Response("Periode tidak valid", { status: 400 });
  const data = await loadMonitoring(periodId.data);
  if (!data) return new Response("Periode tidak ditemukan", { status: 404 });

  const rows = filterRows(data.rows, { status: params.get("status") ?? undefined, flag: params.get("flag") === "1" });
  const header = ["NPP", "Nama perpustakaan", "Kecamatan", "Jenis", "Status", "Progres (%)", "Terakhir disimpan", "Flag terbuka", "Tenggat"];
  const lines = rows.map((r) =>
    [r.npp, r.libraryName, r.districtName, r.typeName, MONITORING_STATUS[r.status].label, r.progress, r.lastSavedAt ? formatWib(r.lastSavedAt) : "", r.openFlagCount, formatWib(r.deadline)]
      .map(csvCell)
      .join(","),
  );
  // BOM supaya Excel membaca UTF-8 dengan benar
  const body = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="monitoring-${data.period.year}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
