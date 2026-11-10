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
                createdBy: SYSTEM_USER_ID,
              },
            });
            const user = await tx.user.create({
              data: {
                role: "PARTICIPANT",
                institutionId: institution.id,
                username: institution.npp,
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
