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
