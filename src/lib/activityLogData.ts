import { prisma } from "./db/client";
import { ACTIVITY_LABEL, AUDIT_ACTION_LABEL, auditChanges, wibDayRange, type LogFilter } from "./activityLog";
import type { ActivityType, AuditAction } from "@/generated/prisma/client";

export const LOG_PAGE_SIZE = 50;

export type LogEntry = {
  id: string;
  createdAt: Date;
  actor: string;
  actorRole: string;
  action: string;
  target: string;
  description: string;
  source: string;
  ipAddress: string | null;
  changes: { field: string; before: unknown; after: unknown }[];
};

/** Tabel yang punya trigger audit (pilihan filter "tabel"). */
export async function auditedTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ t: string }[]>`
    SELECT DISTINCT event_object_table AS t FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND trigger_name LIKE '%audit%' ORDER BY 1`;
  return rows.map((r) => r.t);
}

/**
 * FR-13.07: baca audit_logs / activity_logs sesuai filter. `take` +1 untuk tahu ada halaman berikutnya.
 * Pengguna dicari dari username/email; tidak ditemukan → hasil kosong (bukan semua log).
 */
export async function loadLogs(f: LogFilter, take = LOG_PAGE_SIZE, skip = (f.hal - 1) * LOG_PAGE_SIZE): Promise<{ entries: LogEntry[]; hasMore: boolean }> {
  let actorId: string | undefined;
  if (f.pengguna) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ username: { equals: f.pengguna, mode: "insensitive" } }, { email: { equals: f.pengguna, mode: "insensitive" } }] },
      select: { id: true },
    });
    if (!u) return { entries: [], hasMore: false };
    actorId = u.id;
  }
  const createdAt = wibDayRange(f.dari, f.sampai);

  const raw =
    f.tab === "audit"
      ? (
          await prisma.auditLog.findMany({
            where: {
              actorUserId: actorId,
              action: f.aksi && f.aksi in AUDIT_ACTION_LABEL ? (f.aksi as AuditAction) : undefined,
              tableName: f.tabel,
              createdAt,
            },
            orderBy: { id: "desc" },
            take: take + 1,
            skip,
          })
        ).map((l) => ({
          id: String(l.id),
          createdAt: l.createdAt,
          actorId: l.actorUserId,
          actorRole: l.actorRole,
          action: AUDIT_ACTION_LABEL[l.action],
          target: `${l.tableName} · ${l.recordId}`,
          description: "",
          source: l.source,
          ipAddress: l.ipAddress,
          changes: auditChanges(l.oldData, l.newData, l.changedFields),
        }))
      : (
          await prisma.activityLog.findMany({
            where: {
              userId: actorId,
              activity: f.aksi && f.aksi in ACTIVITY_LABEL ? (f.aksi as ActivityType) : undefined,
              entityType: f.tabel,
              createdAt,
            },
            orderBy: { id: "desc" },
            take: take + 1,
            skip,
          })
        ).map((l) => ({
          id: String(l.id),
          createdAt: l.createdAt,
          actorId: l.userId,
          actorRole: l.actorRole,
          action: ACTIVITY_LABEL[l.activity],
          target: l.entityType ? `${l.entityType}${l.entityId ? ` · ${l.entityId}` : ""}` : "",
          description: l.description ?? "",
          source: "WEB",
          ipAddress: l.ipAddress,
          changes: l.metadata ? auditChanges(null, l.metadata, null) : [],
        }));

  const ids = [...new Set(raw.map((r) => r.actorId).filter((id): id is string => !!id))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, username: true } })).map((u) => [u.id, `${u.fullName} (${u.username})`]));
  const entries = raw.slice(0, take).map(({ actorId: id, ...r }) => ({ ...r, actor: id ? (users.get(id) ?? id) : "—" }));
  return { entries, hasMore: raw.length > take };
}
