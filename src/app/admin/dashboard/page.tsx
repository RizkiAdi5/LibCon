import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { pickPortalPeriod } from "@/lib/answers";
import { groupInstitutions } from "@/lib/institutionGroups";
import { MONITORING_STATUS, stackCounts, type MonitoringStatus } from "@/lib/monitoring";
import { filterRows, loadMonitoring, type MonitoringRow } from "@/lib/monitoringData";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { bulkActivationAction, bulkReminderAction } from "./actions";

const STATUS_ORDER: MonitoringStatus[] = ["PENDING_ACTIVATION", "NOT_STARTED", "DRAFT", "SUBMITTED", "NEEDS_REVISION", "VERIFIED", "NOT_SUBMITTED"];
const pct = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** FR-10.02: batang bertumpuk per status (CSS, dengan teks untuk pembaca layar). */
function StackedBars({ title, rows, groupOf }: { title: string; rows: MonitoringRow[]; groupOf: (r: MonitoringRow) => string }) {
  const stacks = stackCounts(rows, groupOf, (r) => r.status);
  return (
    <figure className="space-y-2 rounded-md border p-4">
      <figcaption className="font-semibold">{title}</figcaption>
      {stacks.map((s) => (
        <div key={s.group} className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>{s.group}</span>
            <span className="text-muted-foreground">{s.total} lembaga</span>
          </div>
          <div className="flex h-4 w-full overflow-hidden rounded bg-muted" aria-hidden>
            {STATUS_ORDER.filter((st) => s.counts.get(st)).map((st) => (
              <div key={st} className={MONITORING_STATUS[st].bar} style={{ width: `${(s.counts.get(st)! / s.total) * 100}%` }} title={`${MONITORING_STATUS[st].label}: ${s.counts.get(st)}`} />
            ))}
          </div>
          <p className="sr-only">
            {STATUS_ORDER.filter((st) => s.counts.get(st))
              .map((st) => `${MONITORING_STATUS[st].label} ${s.counts.get(st)}`)
              .join(", ")}
          </p>
        </div>
      ))}
      <ul className="flex flex-wrap gap-3 pt-1 text-xs">
        {STATUS_ORDER.map((st) => (
          <li key={st} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${MONITORING_STATUS[st].bar}`} aria-hidden />
            {MONITORING_STATUS[st].label}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** M10 Monitoring: FR-10.01 kartu, FR-10.02 grafik, FR-10.03 tabel, FR-10.04 aksi massal. */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; status?: string; flag?: string; ok?: string; error?: string }>;
}) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const sp = await searchParams;
  const periods = await prisma.surveyPeriod.findMany({ where: { deletedAt: null }, orderBy: [{ year: "desc" }, { opensAt: "desc" }] });
  const period = periods.find((p) => p.id === sp.periode) ?? pickPortalPeriod(periods.filter((p) => p.status !== "ARCHIVED"), new Date()) ?? periods[0];

  if (!period) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Belum ada periode. Buat periode di menu <Link href="/admin/periode" className="underline">Periode</Link>.
        </p>
      </div>
    );
  }

  const data = (await loadMonitoring(period.id))!;
  const status = sp.status && sp.status in MONITORING_STATUS ? sp.status : undefined;
  const flag = sp.flag === "1";
  const rows = filterRows(data.rows, { status, flag });
  const count = (s: MonitoringStatus) => data.rows.filter((r) => r.status === s).length;
  const query = (extra: Record<string, string>) => `?${new URLSearchParams({ periode: period.id, ...extra })}`;
  const cards: { label: string; value: number; href: string; active: boolean; className: string }[] = [
    { label: "Total lembaga", value: data.rows.length, href: query({}), active: !status && !flag, className: "" },
    ...(["PENDING_ACTIVATION", "NOT_STARTED", "DRAFT", "SUBMITTED"] as const).map((s) => ({
      label: MONITORING_STATUS[s].label, value: count(s), href: query({ status: s }), active: status === s, className: MONITORING_STATUS[s].className,
    })),
    { label: "Ada Flag", value: data.rows.filter((r) => r.openFlagCount > 0).length, href: query({ flag: "1" }), active: flag, className: "text-destructive" },
    ...(["NEEDS_REVISION", "VERIFIED", "NOT_SUBMITTED"] as const).map((s) => ({
      label: MONITORING_STATUS[s].label, value: count(s), href: query({ status: s }), active: status === s, className: MONITORING_STATUS[s].className,
    })),
  ];
  const groups = groupInstitutions(rows);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <form className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="periode">Periode</Label>
            <select id="periode" name="periode" defaultValue={period.id} className="h-9 rounded-md border px-2 text-sm">
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">
            Tampilkan
          </Button>
        </form>
      </div>
      <FlashMessage ok={sp.ok} error={sp.error} />

      {/* FR-10.01: klik kartu memfilter tabel */}
      <nav aria-label="Ringkasan status" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            aria-current={c.active ? "page" : undefined}
            data-testid={`card-${c.label}`}
            className={`rounded-md border p-3 hover:bg-muted ${c.active ? "border-foreground ring-1 ring-foreground" : ""}`}
          >
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-2xl font-semibold ${c.className}`}>{c.value}</p>
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 md:grid-cols-2">
        <StackedBars title="Progres per kecamatan" rows={data.rows} groupOf={(r) => r.districtName} />
        <StackedBars title="Progres per jenis" rows={data.rows} groupOf={(r) => r.typeName} />
      </div>

      {/* FR-10.03 + FR-10.04 */}
      <form className="space-y-4">
        <input type="hidden" name="periodId" value={period.id} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {rows.length} lembaga{status || flag ? " (terfilter)" : ""} · tandai lalu:
          </span>
          <Button type="submit" formAction={bulkReminderAction} size="sm" variant="outline">
            Kirim reminder
          </Button>
          <Button type="submit" formAction={bulkActivationAction} size="sm" variant="outline">
            Kirim ulang aktivasi
          </Button>
          <a href={`/admin/dashboard/ekspor${query({ ...(status && { status }), ...(flag && { flag: "1" }) })}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Ekspor daftar (CSV)
          </a>
        </div>
        {groups.map((district) => (
          <section key={district.districtName} className="rounded-md border p-4">
            <h2 className="font-semibold">
              Kec. {district.districtName} <span className="text-muted-foreground">({district.count})</span>
            </h2>
            {district.types.map((type) => (
              <div key={type.typeName} className="mt-3 overflow-x-auto">
                <h3 className="text-sm font-medium">
                  {type.typeName} <span className="text-muted-foreground">({type.count})</span>
                </h3>
                <table className="mt-1 w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="w-8" />
                      <th>Lembaga</th>
                      <th>Status</th>
                      <th>Progres</th>
                      <th>Terakhir disimpan</th>
                      <th>Flag</th>
                      <th>Tenggat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {type.items.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-2">
                          <input type="checkbox" name="institutionId" value={r.id} aria-label={`Pilih ${r.libraryName}`} />
                        </td>
                        <td>
                          <Link href={`/admin/peserta/${r.id}`} className="underline">
                            {r.libraryName}
                          </Link>
                        </td>
                        <td className={MONITORING_STATUS[r.status].className}>{MONITORING_STATUS[r.status].label}</td>
                        <td>{pct.format(r.progress)}%</td>
                        <td>{r.lastSavedAt ? formatWib(r.lastSavedAt) : "–"}</td>
                        <td>{r.openFlagCount > 0 ? <span className="text-destructive">⚑ {r.openFlagCount}</span> : "–"}</td>
                        <td>{formatWib(r.deadline)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        ))}
      </form>
    </div>
  );
}
