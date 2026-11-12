"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { resendActivations, resendSummary } from "@/lib/auth/activation";
import { effectiveClosesAt } from "@/lib/period";
import { sendDeadlineReminder } from "@/lib/reminders";

const bulkSchema = z.object({
  periodId: z.uuid(),
  institutionIds: z.array(z.uuid()).min(1, "Pilih minimal satu lembaga"),
});

function back(periodId: string, params: Record<string, string>): never {
  redirect(`/admin/dashboard?${new URLSearchParams({ periode: periodId, ...params })}`);
}

function parseBulk(formData: FormData) {
  const parsed = bulkSchema.safeParse({ periodId: formData.get("periodId"), institutionIds: formData.getAll("institutionId") });
  if (!parsed.success) redirect(`/admin/dashboard?${new URLSearchParams({ error: parsed.error.issues[0].message })}`);
  return { periodId: parsed.data.periodId, institutionIds: [...new Set(parsed.data.institutionIds)] };
}

/**
 * FR-10.04 + AC M10: kirim reminder tenggat ke lembaga terpilih; tercatat di
 * activity_logs dengan jumlah penerima. FR-10.06: yang sudah dikirimi hari ini dilewati.
 */
export async function bulkReminderAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const { periodId, institutionIds } = parseBulk(formData);
  const period = await prisma.surveyPeriod.findFirst({
    where: { id: periodId, deletedAt: null, status: { not: "ARCHIVED" } },
    include: { periodExtensions: { where: { deletedAt: null } } },
  });
  if (!period) back(periodId, { error: "Periode tidak ditemukan atau sudah diarsipkan" });
  const institutions = await prisma.institution.findMany({ where: { id: { in: institutionIds }, deletedAt: null } });

  const result = await runAsUser(user, async () => {
    let recipients = 0;
    let reached = 0;
    for (const inst of institutions) {
      const n = await sendDeadlineReminder(inst, effectiveClosesAt(period.closesAt, period.periodExtensions, inst.id), user.id);
      recipients += n;
      if (n > 0) reached++;
    }
    await withDb((tx) =>
      tx.activityLog.create({
        data: {
          userId: user.id,
          actorRole: user.role,
          activity: "SEND_BULK_REMINDER",
          entityType: "survey_period",
          entityId: period.id,
          description: `Kirim reminder ke ${reached} lembaga (${recipients} penerima)`,
          metadata: { selected: institutionIds.length, institutions: reached, recipients },
        },
      }),
    );
    return { recipients, reached };
  });

  const skipped = institutionIds.length - result.reached;
  back(periodId, {
    ok: `Reminder dikirim ke ${result.reached} lembaga (${result.recipients} email).${skipped ? ` ${skipped} dilewati (sudah dikirimi hari ini atau belum ada akun aktif).` : ""}`,
  });
}

/** FR-10.04: kirim ulang aktivasi ke lembaga terpilih (logika sama dengan menu Peserta). */
export async function bulkActivationAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const { periodId, institutionIds } = parseBulk(formData);
  const result = await runAsUser(user, () => resendActivations(institutionIds, user));
  back(periodId, resendSummary(result));
}
