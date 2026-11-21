import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { runWithRequestContext } from "@/lib/db/requestContext";
import { issueAuthToken } from "@/lib/auth/token";
import { hashPassword } from "@/lib/auth/password";
import { SYSTEM_USER_ID } from "@/lib/auth/constants";

/**
 * Endpoint khusus data uji e2e. Hanya aktif saat NODE_ENV=development (yang
 * dipakai `next dev`, termasuk saat Playwright menjalankan webServer-nya) —
 * 404 di production/preview. Playwright tidak bisa import Prisma Client
 * langsung (generator "prisma-client" ESM-only tidak kompatibel dengan
 * loader CJS Playwright), jadi fixture dibuat lewat route ini saja.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await request.json();

  return runWithRequestContext(
    { userId: SYSTEM_USER_ID, requestId: randomUUID(), ip: null, userAgent: null, source: "SYSTEM" },
    async () => {
      switch (body.action) {
        case "issue-super-admin-activation-token": {
          const superAdmin = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
          const raw = await withDb((tx) =>
            issueAuthToken(tx, { userId: superAdmin.id, type: "ACTIVATION", createdBy: SYSTEM_USER_ID }),
          );
          return NextResponse.json({ token: raw, email: superAdmin.email });
        }

        case "create-active-participant": {
          const suffix = randomUUID().slice(0, 8);
          const region = await prisma.region.findFirstOrThrow({ where: { level: "VILLAGE" } });
          const type = await prisma.institutionType.findFirstOrThrow({ where: { code: "SD" } });
          const passwordHash = await hashPassword(body.password);

          const result = await withDb(async (tx) => {
            const institution = await tx.institution.create({
              data: {
                npp: `E2E-${suffix}`,
                libraryName: `Perpus E2E ${suffix}`,
                institutionName: `SD E2E ${suffix}`,
                typeId: type.id,
                regionId: region.id,
                address: "Jl. Uji Coba",
                officialEmail: `e2e-${suffix}@example.com`,
                picName: "Pengisi E2E",
                profileCompletedAt: new Date(),
                createdBy: SYSTEM_USER_ID,
              },
            });
            const user = await tx.user.create({
              data: {
                role: "PARTICIPANT",
                institutionId: institution.id,
                username: `E2E-${suffix}`,
                email: institution.officialEmail,
                fullName: "Pengisi E2E",
                passwordHash,
                status: "ACTIVE",
                isPrimary: true,
                createdBy: SYSTEM_USER_ID,
              },
            });
            return { username: user.username, userId: user.id };
          });
          return NextResponse.json(result);
        }

        case "create-active-admin": {
          const suffix = randomUUID().slice(0, 8);
          const email = `e2e-admin-${suffix}@libcon.local`;
          const passwordHash = await hashPassword(body.password);
          await withDb((tx) =>
            tx.user.create({
              data: {
                role: body.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN",
                username: email,
                email,
                fullName: `Admin E2E ${suffix}`,
                passwordHash,
                status: "ACTIVE",
                createdBy: SYSTEM_USER_ID,
              },
            }),
          );
          return NextResponse.json({ username: email });
        }

        // Token mentah tidak pernah disimpan (hanya hash), jadi e2e tidak bisa membacanya dari
        // email — cek email ACTIVATION memang tercatat, lalu terbitkan token baru (= kirim ulang).
        case "reissue-activation-token": {
          const user = await prisma.user.findUniqueOrThrow({ where: { username: body.username } });
          const email = await prisma.emailLog.findFirst({
            where: { userId: user.id, status: "SENT", template: { key: "ACTIVATION" } },
          });
          const raw = await withDb((tx) =>
            issueAuthToken(tx, { userId: user.id, type: "ACTIVATION", createdBy: SYSTEM_USER_ID }),
          );
          return NextResponse.json({ token: raw, activationEmailSent: Boolean(email), sentTo: email?.toEmail });
        }

        case "latest-email": {
          const user = await prisma.user.findUniqueOrThrow({ where: { username: body.username } });
          const email = await prisma.emailLog.findFirst({
            where: { userId: user.id, template: { key: body.key } },
            orderBy: { createdAt: "desc" },
          });
          return NextResponse.json({ sentTo: email?.toEmail ?? null, status: email?.status ?? null });
        }

        case "user-lock-state": {
          const user = await prisma.user.findUniqueOrThrow({ where: { username: body.username } });
          return NextResponse.json({ lockedUntil: user.lockedUntil, failedLoginCount: user.failedLoginCount });
        }

        // mempercepat uji blokir permanen (50 salah password) tanpa 49 kali login sungguhan
        case "set-failed-login-count": {
          await withDb((tx) =>
            tx.user.update({
              where: { username: body.username },
              data: { failedLoginCount: body.count, lockedUntil: null, updatedBy: SYSTEM_USER_ID },
            }),
          );
          return NextResponse.json({ ok: true });
        }

        // Hanya satu periode OPEN boleh ada (FR-02.05) — arsipkan sisa periode uji (DRAFT/OPEN) dari run
        // sebelumnya supaya cron tidak membuka/menahan periode lama
        case "close-e2e-periods": {
          await withDb((tx) =>
            tx.surveyPeriod.updateMany({
              where: { status: { in: ["DRAFT", "OPEN"] }, name: { startsWith: "E2E " } },
              data: { status: "ARCHIVED", updatedBy: SYSTEM_USER_ID },
            }),
          );
          const otherOpen = await prisma.surveyPeriod.findFirst({ where: { status: "OPEN", deletedAt: null } });
          return NextResponse.json({ otherOpen: otherOpen?.name ?? null });
        }

        // Simulasi waktu lewat: tanggal tutup periode + semua perpanjangannya dipindah ke masa lalu
        case "expire-period": {
          const past = new Date(Date.now() - 60 * 60 * 1000);
          await withDb(async (tx) => {
            const period = await tx.surveyPeriod.findFirstOrThrow({ where: { name: body.name } });
            await tx.surveyPeriod.update({
              where: { id: period.id },
              data: { opensAt: new Date(past.getTime() - 60 * 60 * 1000), closesAt: past, updatedBy: SYSTEM_USER_ID },
            });
            if (body.includeExtensions) {
              await tx.periodExtension.updateMany({
                where: { periodId: period.id },
                data: { newClosesAt: past, updatedBy: SYSTEM_USER_ID },
              });
            }
          });
          return NextResponse.json({ ok: true });
        }

        // M07: periode lalu (eksemplar 2.292) + periode OPEN dengan kuesioner terbit + peserta SD aktif
        case "setup-open-survey": {
          const stamp = randomUUID().slice(0, 8);
          const past = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
          const region = await prisma.region.findFirstOrThrow({ where: { level: "VILLAGE" } });
          const [sd, tbm] = await Promise.all([
            prisma.institutionType.findFirstOrThrow({ where: { code: "SD" } }),
            prisma.institutionType.findFirstOrThrow({ where: { code: "TBM" } }),
          ]);
          const passwordHash = await hashPassword(body.password);

          const result = await withDb(async (tx) => {
            await tx.surveyPeriod.updateMany({
              where: { status: { in: ["DRAFT", "OPEN"] }, name: { startsWith: "E2E " } },
              data: { status: "ARCHIVED", updatedBy: SYSTEM_USER_ID },
            });
            const otherOpen = await tx.surveyPeriod.findFirst({ where: { status: "OPEN", deletedAt: null } });
            if (otherOpen) return { error: `Tutup dulu periode OPEN non-uji "${otherOpen.name}"` };

            const institution = await tx.institution.create({
              data: {
                npp: `S${stamp}`,
                libraryName: `Perpus Survei ${stamp}`,
                institutionName: `SD Survei ${stamp}`,
                typeId: sd.id,
                regionId: region.id,
                address: "Jl. Uji",
                officialEmail: `survei-${stamp}@example.com`,
                picName: "Pengisi",
                profileCompletedAt: new Date(),
                createdBy: SYSTEM_USER_ID,
              },
            });
            const user = await tx.user.create({
              data: {
                role: "PARTICIPANT",
                institutionId: institution.id,
                username: `S${stamp}`,
                email: institution.officialEmail,
                fullName: "Pengisi",
                passwordHash,
                status: "ACTIVE",
                isPrimary: true,
                createdBy: SYSTEM_USER_ID,
              },
            });

            // periode lalu: ARCHIVED, jawaban eksemplar 2.292 (AC M08)
            const prevPeriod = await tx.surveyPeriod.create({
              data: { name: `E2E Survei Lalu ${stamp}`, year: 2025, opensAt: past, closesAt: new Date(past.getTime() + 864e5), status: "ARCHIVED", createdBy: SYSTEM_USER_ID },
            });
            const prevQ = await tx.questionnaire.create({ data: { periodId: prevPeriod.id, title: "Lalu", status: "PUBLISHED", createdBy: SYSTEM_USER_ID } });
            const prevSection = await tx.section.create({ data: { questionnaireId: prevQ.id, code: "koleksi", title: "Koleksi", createdBy: SYSTEM_USER_ID } });
            const prevEksemplar = await tx.question.create({
              data: { questionnaireId: prevQ.id, sectionId: prevSection.id, code: "j_eksemplar", label: "Jumlah eksemplar", type: "INTEGER", createdBy: SYSTEM_USER_ID },
            });
            const prevSubmission = await tx.submission.create({
              data: { periodId: prevPeriod.id, institutionId: institution.id, status: "VERIFIED", createdBy: SYSTEM_USER_ID },
            });
            await tx.answer.create({ data: { submissionId: prevSubmission.id, questionId: prevEksemplar.id, valueNumber: 2292, createdBy: SYSTEM_USER_ID } });

            // periode berjalan
            const period = await tx.surveyPeriod.create({
              data: {
                name: `E2E Survei ${stamp}`,
                year: 2026,
                opensAt: new Date(Date.now() - 60 * 60 * 1000),
                closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                status: "OPEN",
                createdBy: SYSTEM_USER_ID,
              },
            });
            const q = await tx.questionnaire.create({ data: { periodId: period.id, title: "Survei Uji", status: "PUBLISHED", createdBy: SYSTEM_USER_ID } });
            // M10: satu jadwal H-1 untuk Draf saja (jadwal default juga menyasar Belum Mengisi = ratusan lembaga uji lain)
            const reminderTemplate = await tx.emailTemplate.findUniqueOrThrow({ where: { key: "REMINDER_DEADLINE" } });
            await tx.reminderSchedule.create({
              data: { periodId: period.id, kind: "DEADLINE", offsetDays: 1, targetStatuses: ["DRAFT"], templateId: reminderTemplate.id, createdBy: SYSTEM_USER_ID },
            });
            const section = await tx.section.create({
              data: { questionnaireId: q.id, code: "koleksi", title: "Koleksi", evidenceLabel: "Folder 01_Koleksi", evidenceRequired: true, createdBy: SYSTEM_USER_ID },
            });
            const mk = (code: string, label: string, sortOrder: number, extra: object = {}) =>
              tx.question.create({ data: { questionnaireId: q.id, sectionId: section.id, code, label, type: "INTEGER", sortOrder, createdBy: SYSTEM_USER_ID, ...extra } });
            const judul = await mk("j_judul", "Jumlah judul", 0, { isRequired: true });
            const eksemplar = await mk("j_eksemplar", "Jumlah eksemplar", 1, { copiedFromId: prevEksemplar.id });
            const siswa = await mk("j_siswa", "Jumlah siswa", 2, { isRequired: true });
            const anggotaTbm = await mk("j_anggota_tbm", "Jumlah anggota TBM", 3);
            await tx.questionInstitutionType.createMany({
              data: [
                { questionId: siswa.id, institutionTypeId: sd.id, createdBy: SYSTEM_USER_ID },
                { questionId: anggotaTbm.id, institutionTypeId: tbm.id, createdBy: SYSTEM_USER_ID },
              ],
            });
            await tx.validationRule.createMany({
              data: [
                { questionId: eksemplar.id, ruleType: "COMPARE", params: { op: "GTE", other_question_id: judul.id }, severity: "BLOCK", message: "Eksemplar harus ≥ judul", createdBy: SYSTEM_USER_ID },
                { questionId: eksemplar.id, ruleType: "YOY_CHANGE", params: { max_pct: 50 }, severity: "FLAG", message: "Naik/turun > 50% dari tahun lalu", sortOrder: 1, createdBy: SYSTEM_USER_ID },
              ],
            });
            return { username: user.username, periodName: period.name };
          });
          return NextResponse.json(result);
        }

        // mempercepat uji skoring: verifikasi kiriman (alur UI verifikasi sudah diuji di survei.spec)
        case "force-verify": {
          const user = await prisma.user.findUniqueOrThrow({ where: { username: body.username } });
          await withDb((tx) =>
            tx.submission.updateMany({
              where: { institutionId: user.institutionId!, status: "SUBMITTED", period: { status: { not: "ARCHIVED" } } },
              data: { status: "VERIFIED", verifiedAt: new Date(), updatedBy: SYSTEM_USER_ID },
            }),
          );
          return NextResponse.json({ ok: true });
        }

        case "latest-activity": {
          const log = await prisma.activityLog.findFirst({ where: { activity: body.activity }, orderBy: { createdAt: "desc" } });
          return NextResponse.json({ description: log?.description ?? null, metadata: log?.metadata ?? null });
        }

        case "email-count": {
          const user = await prisma.user.findUniqueOrThrow({ where: { username: body.username } });
          const count = await prisma.emailLog.count({ where: { institutionId: user.institutionId!, template: { key: body.key } } });
          return NextResponse.json({ count, institutionId: user.institutionId });
        }

        case "submission-state": {
          const user = await prisma.user.findUniqueOrThrow({ where: { username: body.username } });
          const submission = await prisma.submission.findFirst({
            where: { institutionId: user.institutionId!, period: { status: { not: "ARCHIVED" } } },
            include: {
              validationResults: true,
              snapshots: true,
              answers: { include: { history: true } },
            },
          });
          const receipts = await prisma.emailLog.count({ where: { institutionId: user.institutionId!, template: { key: "SUBMISSION_RECEIPT" } } });
          return NextResponse.json({
            status: submission?.status,
            openFlagCount: submission?.openFlagCount,
            flags: submission?.validationResults.map((v) => v.message) ?? [],
            snapshots: submission?.snapshots.length ?? 0,
            allLocked: submission?.answers.every((a) => a.isLocked) ?? false,
            historyByUser: submission?.answers.flatMap((a) => a.history).every((h) => h.createdBy === user.id) ?? false,
            receipts,
          });
        }

        case "check-unauthorized-access-log": {
          const log = await prisma.activityLog.findFirst({
            where: { userId: body.userId, activity: "UNAUTHORIZED_ACCESS" },
          });
          return NextResponse.json({ found: Boolean(log) });
        }

        default:
          return NextResponse.json({ error: "unknown action" }, { status: 400 });
      }
    },
  );
}
