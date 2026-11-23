import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { ACTIVITY_LABEL, AUDIT_ACTION_LABEL, formatLogValue, parseLogFilter, type LogFilter } from "@/lib/activityLog";
import { auditedTables, loadLogs } from "@/lib/activityLogData";
import { Button, buttonVariants } from "@/components/ui/button";
import { ActionIcon } from "@/components/action-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function query(f: LogFilter, patch: Partial<LogFilter> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...patch })) if (v !== undefined && v !== "" && !(k === "hal" && v === 1)) q.set(k, String(v));
  return q.toString();
}

/** FR-13.07: Log Aktivitas (Super Admin) — audit perubahan data & aktivitas pengguna. */
export default async function LogAktivitasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["SUPER_ADMIN"]);
  const f = parseLogFilter(await searchParams);
  const [{ entries, hasMore }, tables] = await Promise.all([loadLogs(f), f.tab === "audit" ? auditedTables() : Promise.resolve([])]);
  const actions = f.tab === "audit" ? AUDIT_ACTION_LABEL : ACTIVITY_LABEL;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Log Aktivitas</h1>
      <nav className="flex gap-4 text-sm">
        {(["audit", "aktivitas"] as const).map((t) => (
          <Link key={t} href={`?tab=${t}`} aria-current={f.tab === t ? "page" : undefined} className={f.tab === t ? "font-semibold underline" : "underline-offset-4 hover:underline"}>
            {t === "audit" ? "Perubahan data" : "Aktivitas pengguna"}
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="tab" value={f.tab} />
        <div className="space-y-1">
          <Label htmlFor="pengguna">Pengguna (username/email)</Label>
          <Input id="pengguna" name="pengguna" defaultValue={f.pengguna} className="h-9 w-56" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="aksi">Aksi</Label>
          <select id="aksi" name="aksi" defaultValue={f.aksi ?? ""} className="h-9 rounded-md border px-2">
            <option value="">Semua</option>
            {Object.entries(actions).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tabel">{f.tab === "audit" ? "Tabel" : "Jenis entitas"}</Label>
          {f.tab === "audit" ? (
            <select id="tabel" name="tabel" defaultValue={f.tabel ?? ""} className="h-9 rounded-md border px-2">
              <option value="">Semua</option>
              {tables.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          ) : (
            <Input id="tabel" name="tabel" defaultValue={f.tabel} placeholder="mis. submission" className="h-9 w-40" />
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="dari">Dari (WIB)</Label>
          <Input id="dari" name="dari" type="date" defaultValue={f.dari} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sampai">Sampai (WIB)</Label>
          <Input id="sampai" name="sampai" type="date" defaultValue={f.sampai} className="h-9" />
        </div>
        <Button type="submit" size="sm">
          Terapkan
        </Button>
        <a href={`/admin/log-aktivitas/ekspor?${query(f, { hal: 1 })}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          <ActionIcon label="Ekspor CSV" />
          Ekspor CSV
        </a>
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tidak ada log untuk filter ini.</p>
      ) : (
        <table className="w-full text-sm" data-testid="log-table">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1">Waktu</th>
              <th>Pelaku</th>
              <th>Aksi</th>
              <th>Objek</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="py-1 whitespace-nowrap">{formatWib(e.createdAt)}</td>
                <td>
                  {e.actor}
                  <span className="block text-xs text-muted-foreground">
                    {e.actorRole} · {e.source}
                    {e.ipAddress ? ` · ${e.ipAddress}` : ""}
                  </span>
                </td>
                <td>{e.action}</td>
                <td className="font-mono text-xs break-all">{e.target}</td>
                <td>
                  {e.description && <p>{e.description}</p>}
                  {e.changes.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-xs underline">{f.tab === "audit" ? "Sebelum → sesudah" : "Metadata"}</summary>
                      <table className="mt-1 text-xs">
                        <tbody>
                          {e.changes.map((c) => (
                            <tr key={c.field}>
                              <td className="pr-2 font-mono">{c.field}</td>
                              {f.tab === "audit" && <td className="pr-2 break-all text-muted-foreground line-through">{formatLogValue(c.before)}</td>}
                              <td className="break-all">{formatLogValue(c.after)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <nav className="flex gap-4 text-sm">
        {f.hal > 1 && <Link href={`?${query(f, { hal: f.hal - 1 })}`}>← Sebelumnya</Link>}
        {hasMore && <Link href={`?${query(f, { hal: f.hal + 1 })}`}>Berikutnya →</Link>}
      </nav>
    </div>
  );
}
