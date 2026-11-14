import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { pickPortalPeriod } from "@/lib/answers";
import { groupInstitutions } from "@/lib/institutionGroups";
import { MONITORING_STATUS, stackCounts, type MonitoringStatus } from "@/lib/monitoring";
import { filterRows, loadMonitoring, type MonitoringRow } from "@/lib/monitoringData";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconOnly } from "@/components/action-icon";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { bulkActivationAction, bulkReminderAction } from "./actions";
import { BadgeCheck, Building2, CircleDashed, FilePen, Flag, MailWarning, RotateCcw, Send, XCircle, type LucideIcon } from "lucide-react";

const STATUS_ICON: Record<MonitoringStatus, LucideIcon> = {
  PENDING_ACTIVATION: MailWarning,
  NOT_STARTED: CircleDashed,
  DRAFT: FilePen,
  SUBMITTED: Send,
  NEEDS_REVISION: RotateCcw,
  VERIFIED: BadgeCheck,
  NOT_SUBMITTED: XCircle,
};

const PAGE_SIZE = 100;
const STATUS_ORDER: MonitoringStatus[] = ["PENDING_ACTIVATION", "NOT_STARTED", "DRAFT", "SUBMITTED", "NEEDS_REVISION", "VERIFIED", "NOT_SUBMITTED"];
const pct = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** FR-10.02: batang bertumpuk per status (CSS, dengan teks untuk pembaca layar). */
function StackedBars({ title, rows, groupOf }: { title: string; rows: MonitoringRow[]; groupOf: (r: MonitoringRow) => string }) {
  const stacks = stackCounts(rows, groupOf, (r) => r.status);
  return (
    <figure className="box space-y-3">
      <figcaption className="font-medium">{title}</figcaption>
      {stacks.map((s) => (
        <div key={s.group} className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>{s.group}</span>
            <span className="text-muted-foreground">{s.total} lembaga</span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
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
  searchParams: Promise<{ periode?: string; status?: string; flag?: string; hal?: string; ok?: string; error?: string }>;
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
  const cards: { label: string; value: number; href: string; active: boolean; className: string; Icon: LucideIcon }[] = [
    { label: "Total lembaga", value: data.rows.length, href: query({}), active: !status && !flag, className: "text-brand", Icon: Building2 },
    ...(["PENDING_ACTIVATION", "NOT_STARTED", "DRAFT", "SUBMITTED"] as const).map((s) => ({
      label: MONITORING_STATUS[s].label, value: count(s), href: query({ status: s }), active: status === s, className: MONITORING_STATUS[s].className, Icon: STATUS_ICON[s],
    })),
    { label: "Ada Flag", value: data.rows.filter((r) => r.openFlagCount > 0).length, href: query({ flag: "1" }), active: flag, className: "text-destructive", Icon: Flag },
    ...(["NEEDS_REVISION", "VERIFIED", "NOT_SUBMITTED"] as const).map((s) => ({
      label: MONITORING_STATUS[s].label, value: count(s), href: query({ status: s }), active: status === s, className: MONITORING_STATUS[s].className, Icon: STATUS_ICON[s],
    })),
  ];
  // daftar dipaginasi: merender ratusan baris sekaligus membuat dashboard (tujuan setelah login) lambat
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.hal) || 1), pages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filterQuery = { ...(status && { status }), ...(flag && { flag: "1" }) };
  const groups = groupInstitutions(pageRows);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted-foreground">
            Monitoring pengisian {period.name} · tutup {formatWib(period.closesAt)}
          </p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
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
      <section className="space-y-3">
        <h2>Ringkasan status</h2>
        <nav aria-label="Ringkasan status" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {cards.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              aria-current={c.active ? "page" : undefined}
              data-testid={`card-${c.label}`}
              className={`box p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md ${c.active ? "ring-2 ring-brand" : ""}`}
            >
              <c.Icon className={`size-6 ${c.className}`} aria-hidden />
              <p className="mt-4 text-3xl leading-none font-medium">{c.value}</p>
              <p className="mt-1.5 text-muted-foreground">{c.label}</p>
            </Link>
          ))}
        </nav>
      </section>

      <section className="space-y-3">
        <h2>Progres pengisian</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <StackedBars title="Per kecamatan" rows={data.rows} groupOf={(r) => r.districtName} />
          <StackedBars title="Per jenis" rows={data.rows} groupOf={(r) => r.typeName} />
        </div>
      </section>

      {/* FR-10.03 + FR-10.04 */}
      <form className="space-y-4">
        <input type="hidden" name="periodId" value={period.id} />
        <h2>Daftar lembaga</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-muted-foreground">
            {rows.length} lembaga{status || flag ? " (terfilter)" : ""}
            {pages > 1 && ` · menampilkan ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, rows.length)}`} · tandai lalu:
          </span>
          <Button type="submit" formAction={bulkReminderAction} size="sm" variant="outline">
            Kirim reminder
          </Button>
          <Button type="submit" formAction={bulkActivationAction} size="sm" variant="outline">
            Kirim ulang aktivasi
          </Button>
          <a href={`/admin/dashboard/ekspor${query({ ...(status && { status }), ...(flag && { flag: "1" }) })}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            <IconOnly label="Ekspor daftar (CSV)" text="Ekspor daftar (CSV)" />
          </a>
        </div>
        {groups.map((district) => (
          <section key={district.districtName} className="pt-2">
            <h3 className="font-medium">
              Kec. {district.districtName} <span className="font-normal text-muted-foreground">· {district.count} lembaga</span>
            </h3>
            {district.types.map((type) => (
              <div key={type.typeName} className="mt-2 overflow-x-auto">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {type.typeName} ({type.count})
                </p>
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
                          <Link href={`/admin/peserta/${r.id}`} className="font-medium hover:text-brand">
                            {r.libraryName}
                          </Link>
                          <p className="text-xs text-muted-foreground">NPP {r.npp}</p>
                        </td>
                        <td className={MONITORING_STATUS[r.status].className}>
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`size-2 rounded-full ${MONITORING_STATUS[r.status].bar}`} aria-hidden />
                            {MONITORING_STATUS[r.status].label}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                              <div className="h-full bg-brand" style={{ width: `${r.progress}%` }} />
                            </div>
                            {pct.format(r.progress)}%
                          </div>
                        </td>
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
        {pages > 1 && (
          <nav aria-label="Halaman daftar lembaga" className="flex flex-wrap items-center gap-1">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={query({ ...filterQuery, hal: String(n) })}
                aria-current={n === page ? "page" : undefined}
                className={`grid size-8 place-items-center rounded-md text-sm ${n === page ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:bg-card"}`}
              >
                {n}
              </Link>
            ))}
          </nav>
        )}
      </form>
    </div>
  );
}
