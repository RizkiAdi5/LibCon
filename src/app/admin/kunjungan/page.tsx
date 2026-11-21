import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import { loadVisitorFilterOptions, loadVisitorRecap, parseVisitorFilter } from "@/lib/visitorData";
import { FILL_STATUS, MONTH_LABELS, MONTH_NAMES, wibYearMonth } from "@/lib/visitors";

const fmt = new Intl.NumberFormat("id-ID");
const selectClass = "h-9 rounded-md border bg-white px-2 text-sm";

export default async function AdminKunjunganPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const params = await searchParams;
  const filter = parseVisitorFilter(params);
  const [{ year, open, last, rows, monthTotals }, { types, districts }] = await Promise.all([loadVisitorRecap(filter), loadVisitorFilterOptions()]);
  const currentYear = wibYearMonth(new Date()).year;
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  const total = monthTotals.reduce((t, m) => ({ male: t.male + m.male, female: t.female + m.female }), { male: 0, female: 0 });
  const counts = { COMPLETE: 0, PARTIAL: 0, EMPTY: 0 };
  for (const r of rows) counts[r.status]++;
  const lastFilled = rows.filter((r) => r.filledLastMonth).length;
  const exportQuery = new URLSearchParams(Object.entries({ ...filter, tahun: year }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Rekap Kunjungan Perpustakaan {year}</h1>
        <p className="text-sm text-muted-foreground">
          Jumlah pengunjung bulanan yang diinput peserta. {open < 12 && `Bulan yang sudah dibuka: Januari–${MONTH_NAMES[Math.max(open, 1) - 1]}.`}
        </p>
      </div>

      <form method="GET" className="box flex flex-wrap items-end gap-3 p-4">
        <label className="space-y-1 text-sm">
          <span className="block">Tahun</span>
          <select name="tahun" defaultValue={String(year)} className={selectClass}>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block">Jenis</span>
          <select name="jenis" defaultValue={filter.jenis ?? ""} className={selectClass}>
            <option value="">Semua jenis</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block">Kecamatan</span>
          <select name="kecamatan" defaultValue={filter.kecamatan ?? ""} className={selectClass}>
            <option value="">Semua kecamatan</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block">Status</span>
          <select name="status" defaultValue={filter.status ?? ""} className={selectClass}>
            <option value="">Semua status</option>
            {(Object.keys(FILL_STATUS) as (keyof typeof FILL_STATUS)[]).map((s) => (
              <option key={s} value={s}>
                {FILL_STATUS[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block">Cari lembaga</span>
          <input name="q" defaultValue={filter.q ?? ""} className={`${selectClass} w-48`} placeholder="Nama atau NPP" />
        </label>
        <Button type="submit" variant="outline">
          Tampilkan
        </Button>
        <a href={`/admin/kunjungan/ekspor?${exportQuery}`} className="ml-auto text-sm font-medium underline">
          Unduh Excel
        </a>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="box p-4">
          <p className="text-sm text-muted-foreground">Total pengunjung {year}</p>
          <p className="text-2xl font-semibold tabular-nums">{fmt.format(total.male + total.female)}</p>
          <p className="text-xs text-muted-foreground">
            L {fmt.format(total.male)} · P {fmt.format(total.female)}
          </p>
        </div>
        <div className="box p-4">
          <p className="text-sm text-muted-foreground">Lengkap s.d. bulan berjalan</p>
          <p className="text-2xl font-semibold tabular-nums">
            {counts.COMPLETE} <span className="text-base font-normal text-muted-foreground">/ {rows.length} lembaga</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Sebagian {counts.PARTIAL} · Belum mengisi {counts.EMPTY}
          </p>
        </div>
        <div className="box p-4">
          <p className="text-sm text-muted-foreground">Sudah mengisi {MONTH_NAMES[last.month - 1]} {last.year}</p>
          <p className="text-2xl font-semibold tabular-nums">
            {last.year === year ? lastFilled : "–"} <span className="text-base font-normal text-muted-foreground">/ {rows.length}</span>
          </p>
          <p className="text-xs text-muted-foreground">Bulan terakhir yang sudah selesai</p>
        </div>
        <div className="box p-4">
          <p className="text-sm text-muted-foreground">Rata-rata per lembaga yang mengisi</p>
          <p className="text-2xl font-semibold tabular-nums">
            {fmt.format(Math.round((total.male + total.female) / Math.max(1, rows.filter((r) => r.totals.filled > 0).length)))}
          </p>
          <p className="text-xs text-muted-foreground">pengunjung per tahun</p>
        </div>
      </div>

      <div className="box overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Lembaga</th>
              <th className="text-left">Kecamatan</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="text-right">
                  {m}
                </th>
              ))}
              <th className="text-right">Jumlah</th>
              <th className="text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.institutionId}>
                <td>
                  <Link href={`/admin/peserta/${r.institutionId}`}>{r.name}</Link>
                  <div className="text-xs text-muted-foreground">
                    {r.typeCode}
                    {r.npp && ` · NPP ${r.npp}`}
                  </div>
                </td>
                <td className="text-muted-foreground">{r.districtName}</td>
                {r.grid.map((c, m) => (
                  <td
                    key={m}
                    className={`text-right tabular-nums ${!c && m < open ? "text-destructive" : ""}`}
                    title={c ? `L ${fmt.format(c.male)} · P ${fmt.format(c.female)}` : m < open ? "Belum diisi" : "Belum dibuka"}
                  >
                    {c ? fmt.format(c.male + c.female) : m < open ? "✕" : ""}
                  </td>
                ))}
                <td className="text-right font-semibold tabular-nums">{fmt.format(r.totals.total)}</td>
                <td className={FILL_STATUS[r.status].className}>{FILL_STATUS[r.status].label}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={16} className="text-center text-muted-foreground">
                  Tidak ada lembaga yang cocok dengan filter.
                </td>
              </tr>
            )}
            {rows.length > 0 && (
              <tr className="font-semibold">
                <td colSpan={2}>Total ({rows.length} lembaga)</td>
                {monthTotals.map((m, i) => (
                  <td key={i} className="text-right tabular-nums" title={`${m.filled} lembaga mengisi`}>
                    {i < open ? fmt.format(m.total) : ""}
                  </td>
                ))}
                <td className="text-right tabular-nums">{fmt.format(total.male + total.female)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">✕ = bulan sudah dibuka tetapi belum diisi. Arahkan kursor ke angka untuk melihat rincian laki-laki/perempuan.</p>
    </div>
  );
}
