import { runAsUser, type requireRole } from "@/lib/auth/guard";
import { withDb } from "@/lib/db/withDb";
import type { ReportFilter } from "@/lib/report";

type Admin = Awaited<ReturnType<typeof requireRole>>;

/** FR-11.07: setiap ekspor tercatat di activity_logs beserta filter & jumlah baris. */
export function logExport(user: Admin, kind: string, filter: ReportFilter | null, rowCount: number, entity?: { type: string; id: string }) {
  return runAsUser(user, () =>
    withDb((tx) =>
      tx.activityLog.create({
        data: {
          userId: user.id,
          actorRole: user.role,
          activity: kind === "rapor" ? "DOWNLOAD_RAPOR" : "EXPORT_REPORT",
          entityType: entity?.type,
          entityId: entity?.id,
          description: `Ekspor ${kind} (${rowCount} baris)`,
          metadata: { kind, rowCount, filter },
        },
      }),
    ),
  );
}

export function attachment(body: BodyInit, filename: string, type: string) {
  return new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"` } });
}
