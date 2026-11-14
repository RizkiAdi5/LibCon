import type { UserRole } from "@/generated/prisma/client";
import { formatWib } from "@/lib/date";
import { formatLogValue } from "@/lib/activityLog";
import { loadRecordHistory } from "@/lib/activityLogData";
import { RESTORE_ROLES } from "@/lib/restore";
import { restoreAction } from "@/app/admin/riwayat-actions";
import { IconOnly } from "@/components/action-icon";

/**
 * FR-13.06 tab Riwayat (dipasang di detail lembaga, kiriman, soal, kuesioner, skema skor, jenis peserta).
 * Menampilkan audit_logs record terkait; FR-13.09 tombol Pulihkan untuk soft delete yang diizinkan.
 */
export async function RecordHistory({ targets, returnTo, role, labels = {} }: { targets: { table: string; ids: string[] }[]; returnTo: string; role: UserRole; labels?: Record<string, string> }) {
  const entries = await loadRecordHistory(targets);
  return (
    <details className="rounded-md border p-3" data-testid="record-history">
      <summary className="cursor-pointer font-semibold">Riwayat ({entries.length === 50 ? "50 terbaru" : entries.length})</summary>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Belum ada riwayat.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="border-t pt-2">
              {/* div, bukan p: tombol Pulihkan adalah <form>, tidak sah di dalam <p> (hydration error) */}
              <div>
                <span className="font-medium">{e.action}</span> {labels[e.tableName] ?? e.tableName}
                {e.recordLabel && <> <code>{e.recordLabel}</code></>} · {formatWib(e.createdAt)} · {e.actor}
                {e.restorable && RESTORE_ROLES[e.tableName]?.includes(role) && (
                  <form action={restoreAction} className="ml-2 inline">
                    <input type="hidden" name="table" value={e.tableName} />
                    <input type="hidden" name="recordId" value={e.recordId} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button type="submit" className="inline-flex items-center gap-1 text-xs hover:underline">
                      <IconOnly label={"Pulihkan"} text="Pulihkan" className="size-3.5" />
                    </button>
                  </form>
                )}
              </div>
              {e.changes.length > 0 && (
                <table className="mt-1 text-xs">
                  <tbody>
                    {e.changes.slice(0, 12).map((c) => (
                      <tr key={c.field}>
                        <td className="pr-2 font-mono">{c.field}</td>
                        {e.auditAction !== "INSERT" && <td className="pr-2 break-all text-muted-foreground line-through">{formatLogValue(c.before)}</td>}
                        <td className="break-all">{formatLogValue(c.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
