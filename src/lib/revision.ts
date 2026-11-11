import { prisma } from "./db/client";
import { withDb } from "./db/withDb";

/**
 * FR-08.09: revisi lewat batas waktu → EXPIRED, kiriman kembali Terkirim
 * dengan jawaban terakhir, jawaban dikunci lagi, flag tetap tercatat.
 * Dipanggil cron di dalam request context SYSTEM/CRON.
 */
export async function expireRevisions(now = new Date()) {
  const due = await prisma.revisionRequest.findMany({ where: { status: "OPEN", deadlineAt: { lte: now } }, select: { id: true, submissionId: true } });
  for (const r of due) {
    await withDb(async (tx) => {
      await tx.revisionRequest.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
      await tx.submission.update({ where: { id: r.submissionId }, data: { status: "SUBMITTED" } });
      await tx.answer.updateMany({ where: { submissionId: r.submissionId }, data: { isLocked: true } });
    });
  }
  return { expiredRevisions: due.length };
}
