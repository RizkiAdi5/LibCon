import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { withDb } from "@/lib/db/withDb";
import { scoresPublished } from "@/lib/submissionReview";
import { getIdentity } from "@/lib/settings";
import { renderRaporPdf } from "@/lib/pdf/reportPdf";
import { loadReportRows, raporPeers } from "@/lib/reportData";

/** FR-12.04: rapor milik lembaga sendiri, hanya setelah skor periode diumumkan. */
export async function GET(request: Request) {
  const user = await requireRole(["PARTICIPANT"]);
  const periodId = z.uuid().safeParse(new URL(request.url).searchParams.get("periode"));
  if (!periodId.success) return new Response("Periode tidak valid", { status: 400 });
  const period = await prisma.surveyPeriod.findFirst({ where: { id: periodId.data, deletedAt: null } });
  if (!period || !scoresPublished(period)) return new Response("Skor belum diumumkan", { status: 404 });

  const rows = await loadReportRows([period.id]);
  const row = rows.find((r) => r.institutionId === user.institutionId);
  if (!row?.score || !row.submissionId) return new Response("Skor tidak ditemukan", { status: 404 });
  const pdf = await renderRaporPdf({ ...row, score: row.score }, raporPeers(rows, row), period.showRankingToParticipants, await getIdentity());
  await runAsUser(user, () =>
    withDb((tx) =>
      tx.activityLog.create({
        data: { userId: user.id, actorRole: user.role, activity: "DOWNLOAD_RAPOR", entityType: "submission", entityId: row.submissionId, description: `Unduh rapor ${period.name}` },
      }),
    ),
  );
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="rapor-${row.npp}.pdf"` } });
}
