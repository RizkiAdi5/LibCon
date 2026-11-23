import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { pickPortalPeriod } from "@/lib/answers";
import { MONITORING_STATUS, type MonitoringStatus } from "@/lib/monitoring";
import { applyReportFilter, filterToQuery, parseReportFilter, type ReportRow } from "@/lib/report";
import { loadReportRows } from "@/lib/reportData";
import { Button, buttonVariants } from "@/components/ui/button";
import { ActionIcon, IconOnly } from "@/components/action-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { deleteFilterAction, saveFilterAction } from "./actions";
import { AutoSubmitForm } from "./auto-submit-form";
import { ReportCharts } from "./charts";

const fmt2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt3 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const RANK_VIEWS = { keseluruhan: "Keseluruhan", jenis: "Per jenis", kecamatan: "Per kecamatan" } as const;
type RankView = keyof typeof RANK_VIEWS;

function CheckGroup({ name, legend, options, selected }: { name: string; legend: string; options: { value: string; label: string }[]; selected: string[] }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border p-2 text-sm">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2">
            <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** M11 Report: FR-11.01 filter (+ simpan/bagikan), FR-11.02 ranking, FR-11.03/11.04 grafik & analitik, FR-11.05–11.07 ekspor. */
export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const sp = await searchParams;
  const filter = parseReportFilter(sp);
  const view: RankView = typeof sp.ranking === "string" && sp.ranking in RANK_VIEWS ? (sp.ranking as RankView) : "keseluruhan";

  const [periods, districts, villages, types, saved] = await Promise.all([
    prisma.surveyPeriod.findMany({ where: { deletedAt: null }, orderBy: [{ year: "desc" }, { opensAt: "desc" }] }),
    prisma.region.findMany({ where: { level: "DISTRICT", deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.region.findMany({ where: { level: "VILLAGE", deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.institutionType.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.savedReportFilter.findMany({
      where: { deletedAt: null, OR: [{ userId: user.id }, { isShared: true }] },
      include: { user: { select: { fullName: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  if (filter.periode.length === 0) {
    const fallback = pickPortalPeriod(periods.filter((p) => p.status !== "ARCHIVED"), new Date()) ?? periods[0];
    if (fallback) filter.periode = [fallback.id];
  }
  const categories = await prisma.scoreCategory.findMany({
    where: { deletedAt: null, scheme: { periodId: { in: filter.periode }, status: "ACTIVE", deletedAt: null } },
    orderBy: { minScore: "desc" },
  });

  const allRows = await loadReportRows(filter.periode);
  const rows = applyReportFilter(allRows, filter);
  const scored = rows.filter((r): r is ReportRow & { score: NonNullable<ReportRow["score"]> } => !!r.score);
  const nodeCols = [...new Map(scored.flatMap((r) => Object.entries(r.score.nodeInfo ?? {}))).entries()].sort(
    ([a, x], [b, y]) => (x.level === y.level ? a.localeCompare(b) : x.level === "DIMENSION" ? -1 : 1),
  );
  const rankKey = view === "jenis" ? "rankInType" : view === "kecamatan" ? "rankInDistrict" : "rankOverall";
  const groupKey = (r: ReportRow) => `${r.periodName}${view === "jenis" ? ` · ${r.typeName}` : view === "kecamatan" ? ` · Kec. ${r.districtName}` : ""}`;
  const ranked = [...scored].sort((a, b) => groupKey(a).localeCompare(groupKey(b), "id") || (a.score[rankKey] ?? 0) - (b.score[rankKey] ?? 0));
  const query = filterToQuery(filter);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Report</h1>
      <FlashMessage ok={typeof sp.ok === "string" ? sp.ok : undefined} error={typeof sp.error === "string" ? sp.error : undefined} />

      <AutoSubmitForm className="grid gap-4 rounded-md border p-4 md:grid-cols-4">
        <CheckGroup name="periode" legend="Periode" selected={filter.periode} options={periods.map((p) => ({ value: p.id, label: p.name }))} />
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="kecamatan">Kecamatan</Label>
            <select id="kecamatan" name="kecamatan" multiple defaultValue={filter.kecamatan} className="h-24 w-full rounded-md border p-1 text-sm">
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="kelurahan">Kelurahan</Label>
            <select id="kelurahan" name="kelurahan" multiple defaultValue={filter.kelurahan} className="h-24 w-full rounded-md border p-1 text-sm">
              {villages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <CheckGroup name="jenis" legend="Jenis peserta" selected={filter.jenis} options={types.map((t) => ({ value: t.id, label: t.name }))} />
        <CheckGroup
          name="status"
          legend="Status pengisian"
          selected={filter.status}
          options={(Object.keys(MONITORING_STATUS) as MonitoringStatus[]).map((s) => ({ value: s, label: MONITORING_STATUS[s].label }))}
        />
        <div className="space-y-1 text-sm">
          <Label htmlFor="skor">Rentang skor</Label>
          <select id="skor" name="skor" defaultValue={filter.skor} className="h-9 w-full rounded-md border px-2">
            <option value="">Semua</option>
            <option value="lolos">≥ batas lolos</option>
            <option value="tidak_lolos">&lt; batas lolos</option>
            <option value="kustom">Rentang kustom</option>
          </select>
          <div className="flex gap-2">
            <Input name="skorMin" aria-label="Skor minimum" placeholder="Min" defaultValue={filter.skorMin} className="h-8" />
            <Input name="skorMax" aria-label="Skor maksimum" placeholder="Maks" defaultValue={filter.skorMax} className="h-8" />
          </div>
        </div>
        <CheckGroup name="kategori" legend="Kategori skor" selected={filter.kategori} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        <div className="space-y-1 text-sm">
          <Label htmlFor="flag">Flag</Label>
          <select id="flag" name="flag" defaultValue={filter.flag} className="h-9 w-full rounded-md border px-2">
            <option value="">Semua</option>
            <option value="ada">Ada flag</option>
            <option value="tanpa">Tanpa flag</option>
          </select>
        </div>
        <div className="space-y-1 text-sm">
          <Label htmlFor="ranking">Tampilan ranking</Label>
          <select id="ranking" name="ranking" defaultValue={view} className="h-9 w-full rounded-md border px-2">
            {Object.entries(RANK_VIEWS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm" className="mt-2">
            Terapkan
          </Button>
        </div>
      </AutoSubmitForm>

      {/* FR-11.01: filter tersimpan & dibagikan */}
      <section className="flex flex-wrap items-start gap-6 text-sm">
        <div className="space-y-1">
          <p className="font-medium">Filter tersimpan</p>
          {saved.length === 0 && <p className="text-muted-foreground">Belum ada.</p>}
          <ul className="space-y-1">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <Link href={`/admin/report?${filterToQuery(parseReportFilter(s.filters as Record<string, string[]>))}`} className="underline">
                  {s.name}
                </Link>
                <span className="text-muted-foreground">{s.userId === user.id ? (s.isShared ? "(dibagikan)" : "(pribadi)") : `(dari ${s.user.fullName})`}</span>
                {s.userId === user.id && (
                  <form action={deleteFilterAction}>
                    <input type="hidden" name="filterId" value={s.id} />
                    <button type="submit" className="inline-flex items-center gap-1 text-xs hover:underline">
                      <IconOnly label={"hapus"} text="hapus" className="size-3.5" />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
        <form action={saveFilterAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="query" value={query.toString()} />
          <div className="space-y-1">
            <Label htmlFor="filterName">Simpan filter ini sebagai</Label>
            <Input id="filterName" name="name" className="h-8 w-48" required />
          </div>
          <label className="flex items-center gap-1 pb-1">
            <input type="checkbox" name="isShared" /> Bagikan ke admin lain
          </label>
          <Button type="submit" size="sm" variant="outline">
            Simpan filter
          </Button>
        </form>
      </section>

      {/* FR-11.05–11.07: ekspor sesuai filter */}
      <section className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground" data-testid="report-count">
          {rows.length} baris ({scored.length} berskor)
        </span>
        <a href={`/admin/report/ekspor/excel?${query}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          <ActionIcon label="Ekspor Excel (format IPLM)" />
          Ekspor Excel (format IPLM)
        </a>
        <a href={`/admin/report/ekspor/pdf?${query}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          <ActionIcon label="Laporan ringkas PDF" />
          Laporan ringkas PDF
        </a>
        <a href={`/admin/report/ekspor/rapor?${query}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          <ActionIcon label="Rapor semua lembaga (ZIP)" />
          Rapor semua lembaga (ZIP)
        </a>
      </section>

      {/* FR-11.02: ranking dengan indeks, dimensi, subdimensi, kategori */}
      <section className="space-y-2 overflow-x-auto">
        <h2 className="font-semibold">Ranking — {RANK_VIEWS[view]}</h2>
        {ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada skor resmi untuk filter ini.</p>
        ) : (
          <table className="w-full text-sm" data-testid="ranking">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1">#</th>
                <th>{view === "keseluruhan" ? "Periode" : view === "jenis" ? "Jenis" : "Kecamatan"}</th>
                <th>Lembaga</th>
                <th>Indeks</th>
                {nodeCols.map(([code, info]) => (
                  <th key={code} title={code}>
                    {info.name}
                  </th>
                ))}
                <th>Kategori</th>
                <th>Rapor</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={`${r.periodId}-${r.institutionId}`} className="border-t">
                  <td className="py-1">{r.score[rankKey]}</td>
                  <td>{view === "keseluruhan" ? r.periodName : view === "jenis" ? r.typeName : r.districtName}</td>
                  <td>{r.libraryName}</td>
                  <td className="font-medium">{fmt2.format(r.score.indexScore)}</td>
                  {nodeCols.map(([code]) => (
                    <td key={code}>{r.score.nodes[code] === undefined ? "–" : fmt3.format(r.score.nodes[code])}</td>
                  ))}
                  <td>
                    {r.score.categoryName && (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: r.score.categoryColor ?? undefined }} aria-hidden />
                        {r.score.categoryName}
                      </span>
                    )}
                  </td>
                  <td>
                    <a href={`/admin/report/ekspor/rapor?submission=${r.submissionId}`} className="inline-flex items-center gap-1 hover:underline">
                      <IconOnly label={"PDF"} text="PDF" className="size-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ReportCharts rows={rows} query={query} focusId={typeof sp.lembaga === "string" ? sp.lembaga : undefined} />
    </div>
  );
}
