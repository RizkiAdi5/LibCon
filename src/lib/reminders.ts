import type { EmailTemplateKey, ReminderKind } from "@/generated/prisma/client";
import { prisma, type Db } from "./db/client";
import { withDb } from "./db/withDb";
import { formatWib } from "./date";
import { sendTemplateEmail } from "./email/send";
import { issueAuthToken } from "./auth/token";
import { effectiveClosesAt } from "./period";
import { reminderDueToday, startOfWibDay } from "./monitoring";

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "";

/** FR-10.06: email yang sama (template) ke lembaga yang sama paling banyak sekali per hari WIB. */
async function sentToday(templateKey: EmailTemplateKey, institutionId: string, now: Date): Promise<boolean> {
  const log = await prisma.emailLog.findFirst({
    where: { institutionId, template: { key: templateKey }, createdAt: { gte: startOfWibDay(now) } },
    select: { id: true },
  });
  return !!log;
}

async function activeAccounts(institutionId: string) {
  return prisma.user.findMany({ where: { institutionId, deletedAt: null, status: "ACTIVE" } });
}

/**
 * Pengingat tenggat ke semua akun aktif satu lembaga (dipakai cron & aksi massal, FR-10.04).
 * Mengembalikan jumlah email terkirim; 0 jika sudah dikirim hari ini.
 */
export async function sendDeadlineReminder(
  institution: { id: string; libraryName: string },
  deadline: Date,
  actorId: string,
  now = new Date(),
): Promise<number> {
  if (await sentToday("REMINDER_DEADLINE", institution.id, now)) return 0;
  const accounts = await activeAccounts(institution.id);
  if (accounts.length === 0) return 0;
  await withDb(async (tx) => {
    for (const a of accounts) {
      await sendTemplateEmail(tx, {
        key: "REMINDER_DEADLINE",
        to: a.email,
        variables: { nama_lembaga: institution.libraryName, tenggat: formatWib(deadline), link: `${APP_URL()}/portal/survei` },
        createdBy: actorId,
        userId: a.id,
        institutionId: institution.id,
      });
    }
  });
  return accounts.length;
}

/** Jadwal default per periode (FR-10.05): H-7, H-3, H-1 tenggat; aktivasi H+3; revisi H-1. */
export async function createDefaultSchedules(tx: Db, periodId: string, actorId: string) {
  const templates = new Map((await tx.emailTemplate.findMany({ where: { key: { in: ["REMINDER_DEADLINE", "REMINDER_ACTIVATION", "REMINDER_REVISION"] } } })).map((t) => [t.key, t.id]));
  const rows: { kind: ReminderKind; offsetDays: number; targetStatuses: string[]; key: EmailTemplateKey }[] = [
    ...[7, 3, 1].map((d) => ({ kind: "DEADLINE" as const, offsetDays: d, targetStatuses: ["NOT_STARTED", "DRAFT"], key: "REMINDER_DEADLINE" as const })),
    { kind: "ACTIVATION", offsetDays: 3, targetStatuses: [], key: "REMINDER_ACTIVATION" },
    { kind: "REVISION", offsetDays: 1, targetStatuses: ["NEEDS_REVISION"], key: "REMINDER_REVISION" },
  ];
  const data = rows
    .filter((r) => templates.has(r.key))
    .map((r) => ({ periodId, kind: r.kind, offsetDays: r.offsetDays, targetStatuses: r.targetStatuses, templateId: templates.get(r.key)!, createdBy: actorId }));
  if (data.length) await tx.reminderSchedule.createMany({ data });
}

/**
 * FR-10.05: dijalankan cron harian 07.00 WIB dalam request context SYSTEM/CRON.
 * AC M10: hanya lembaga dengan status sasaran (mis. Belum Mengisi & Draf) yang dikirimi.
 */
export async function runReminders(actorId: string, now = new Date()) {
  const schedules = await prisma.reminderSchedule.findMany({
    where: { isActive: true, deletedAt: null, period: { deletedAt: null, status: { in: ["OPEN", "CLOSED"] } } },
    include: { period: { include: { periodExtensions: { where: { deletedAt: null } } } } },
  });
  const sent = { deadline: 0, activation: 0, revision: 0 };

  for (const s of schedules) {
    const targets = new Set(s.targetStatuses as string[]);
    if (s.kind === "DEADLINE" && s.period.status === "OPEN") {
      const institutions = await prisma.institution.findMany({
        where: { deletedAt: null },
        include: { submissions: { where: { periodId: s.periodId } } },
      });
      for (const inst of institutions) {
        const deadline = effectiveClosesAt(s.period.closesAt, s.period.periodExtensions, inst.id);
        const status = inst.submissions[0]?.status ?? "NOT_STARTED";
        if (!reminderDueToday("DEADLINE", s.offsetDays, deadline, now) || !targets.has(status)) continue;
        sent.deadline += await sendDeadlineReminder(inst, deadline, actorId, now);
      }
    }

    if (s.kind === "ACTIVATION") {
      const pending = await prisma.user.findMany({
        where: { role: "PARTICIPANT", status: "PENDING_ACTIVATION", deletedAt: null, institution: { deletedAt: null } },
        include: { institution: true },
      });
      for (const u of pending) {
        if (!reminderDueToday("ACTIVATION", s.offsetDays, u.createdAt, now) || (await sentToday("REMINDER_ACTIVATION", u.institutionId!, now))) continue;
        await withDb(async (tx) => {
          // link lama mungkin sudah kedaluwarsa (24 jam) — terbitkan link baru (BR-03: link lama dicabut)
          const raw = await issueAuthToken(tx, { userId: u.id, type: "ACTIVATION", createdBy: actorId });
          await sendTemplateEmail(tx, {
            key: "REMINDER_ACTIVATION",
            to: u.email,
            variables: { nama_lembaga: u.institution!.libraryName, link: `${APP_URL()}/aktivasi/${raw}` },
            createdBy: actorId,
            userId: u.id,
            institutionId: u.institutionId!,
          });
        });
        sent.activation++;
      }
    }

    if (s.kind === "REVISION") {
      const revisions = await prisma.revisionRequest.findMany({
        where: { status: "OPEN", submission: { periodId: s.periodId, status: "NEEDS_REVISION" } },
        include: { submission: { include: { institution: true } } },
      });
      for (const r of revisions) {
        const inst = r.submission.institution;
        if (!reminderDueToday("REVISION", s.offsetDays, r.deadlineAt, now) || (await sentToday("REMINDER_REVISION", inst.id, now))) continue;
        const accounts = await activeAccounts(inst.id);
        await withDb(async (tx) => {
          for (const a of accounts) {
            await sendTemplateEmail(tx, {
              key: "REMINDER_REVISION",
              to: a.email,
              variables: { nama_lembaga: inst.libraryName, tenggat: formatWib(r.deadlineAt), catatan: r.generalNote ?? "-" },
              createdBy: actorId,
              userId: a.id,
              institutionId: inst.id,
              relatedType: "submission",
              relatedId: r.submissionId,
            });
          }
        });
        sent.revision += accounts.length;
      }
    }

    await withDb((tx) => tx.reminderSchedule.update({ where: { id: s.id }, data: { lastRunAt: now } }));
  }
  return sent;
}
