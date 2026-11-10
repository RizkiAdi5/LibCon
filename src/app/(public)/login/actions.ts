"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, type Db } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { runWithRequestContext } from "@/lib/db/requestContext";
import { getClientMeta } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getLockoutPolicy, type LockoutPolicy } from "@/lib/settings";
import { burstLockUntil, isPermanentlyBlocked } from "@/lib/auth/loginThrottle";
import { SYSTEM_USER_ID } from "@/lib/auth/constants";
import { formatWib } from "@/lib/date";
import { sendTemplateEmail } from "@/lib/email/send";

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

const GENERIC_ERROR: LoginState = { error: "NPP/email atau password salah" }; // FR-04.02
const BLOCKED_ERROR: LoginState = {
  error: "Akun diblokir karena terlalu banyak percobaan login gagal. Hubungi admin Perpustakaan Kota untuk membuka blokir.",
};

/** FR-04.09: percobaan gagal beruntun dalam jendela pendek → kunci lebih lama (lihat loginThrottle.ts). */
async function applyBurstLock(
  tx: Db,
  user: { id: string; lockedUntil: Date | null },
  policy: LockoutPolicy,
): Promise<Date | null> {
  const now = new Date();
  const recentFailures = await tx.loginAttempt.count({
    where: {
      userId: user.id,
      success: false,
      createdAt: { gte: new Date(now.getTime() - policy.burstWindowMinutes * 60 * 1000) },
    },
  });
  const until = burstLockUntil(recentFailures, now, user.lockedUntil, policy);
  if (until) await tx.user.update({ where: { id: user.id }, data: { lockedUntil: until, updatedBy: SYSTEM_USER_ID } });
  return until;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "NPP/email dan password wajib diisi" };

  const { identifier, password } = parsed.data;
  const { ip, userAgent } = await getClientMeta();

  return runWithRequestContext(
    { userId: SYSTEM_USER_ID, requestId: randomUUID(), ip, userAgent, source: "WEB" },
    async () => {
      const user = await prisma.user.findFirst({
        where: { OR: [{ username: identifier }, { email: identifier }] },
        include: { institution: true },
      });

      // FR-03.10: akun milik lembaga nonaktif tidak bisa login
      if (!user || user.deletedAt || user.status === "DISABLED" || user.institution?.deletedAt) {
        await withDb((tx) =>
          tx.loginAttempt.create({
            data: { usernameInput: identifier, success: false, ipAddress: ip, userAgent, createdBy: SYSTEM_USER_ID },
          }),
        );
        return GENERIC_ERROR;
      }

      const lockoutPolicy = await getLockoutPolicy();
      const failedAttempt = {
        data: { usernameInput: identifier, userId: user.id, success: false, ipAddress: ip, userAgent, createdBy: SYSTEM_USER_ID },
      };

      if (isPermanentlyBlocked(user.failedLoginCount, lockoutPolicy)) {
        await withDb((tx) => tx.loginAttempt.create(failedAttempt));
        return BLOCKED_ERROR;
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const extended = await withDb(async (tx) => {
          await tx.loginAttempt.create(failedAttempt);
          return applyBurstLock(tx, user, lockoutPolicy);
        });
        return { error: `Akun terkunci sampai ${formatWib(extended ?? user.lockedUntil)}` }; // FR-04.03 AC
      }

      if (user.status === "PENDING_ACTIVATION" || !user.passwordHash) {
        await withDb((tx) =>
          tx.loginAttempt.create({
            data: {
              usernameInput: identifier,
              userId: user.id,
              success: false,
              ipAddress: ip,
              userAgent,
              createdBy: SYSTEM_USER_ID,
            },
          }),
        );
        return GENERIC_ERROR;
      }

      const passwordOk = await verifyPassword(user.passwordHash, password);
      if (!passwordOk) {
        const nextFailedCount = user.failedLoginCount + 1;
        const willBlock = isPermanentlyBlocked(nextFailedCount, lockoutPolicy);
        const willLock = nextFailedCount >= lockoutPolicy.maxFailedAttempts;
        const lockedUntil = willLock
          ? new Date(Date.now() + lockoutPolicy.lockoutMinutes * 60 * 1000)
          : user.lockedUntil;

        const burstUntil = await withDb(async (tx) => {
          await tx.loginAttempt.create(failedAttempt);
          await tx.user.update({
            where: { id: user.id },
            data: { failedLoginCount: nextFailedCount, lockedUntil, updatedBy: SYSTEM_USER_ID },
          });
          if (willBlock) {
            await tx.activityLog.create({
              data: {
                userId: user.id,
                actorRole: user.role,
                activity: "ACCOUNT_LOCKED",
                description: `Akun ${user.username} diblokir setelah ${nextFailedCount} kali salah password sejak login terakhir`,
              },
            });
            return null;
          }
          const burst = await applyBurstLock(tx, { id: user.id, lockedUntil }, lockoutPolicy);
          if (willLock) {
            await tx.activityLog.create({
              data: {
                userId: user.id,
                actorRole: user.role,
                activity: "ACCOUNT_LOCKED",
                description: `Akun ${user.username} terkunci setelah ${nextFailedCount} kali gagal login`,
              },
            });
            await sendTemplateEmail(tx, {
              key: "ACCOUNT_LOCKED",
              to: user.email,
              variables: { tenggat: formatWib(burst ?? lockedUntil!) },
              createdBy: SYSTEM_USER_ID,
              userId: user.id,
            });
          }
          return burst;
        });

        if (willBlock) return BLOCKED_ERROR;
        const finalLock = burstUntil ?? (willLock ? lockedUntil : null);
        return finalLock ? { error: `Akun terkunci sampai ${formatWib(finalLock)}` } : GENERIC_ERROR;
      }

      const rawSession = await withDb(async (tx) => {
        await tx.loginAttempt.create({
          data: {
            usernameInput: identifier,
            userId: user.id,
            success: true,
            ipAddress: ip,
            userAgent,
            createdBy: SYSTEM_USER_ID,
          },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), updatedBy: user.id },
        });
        await tx.activityLog.create({
          data: { userId: user.id, actorRole: user.role, activity: "LOGIN", description: `${user.username} login` },
        });
        return createSession(tx, { userId: user.id, role: user.role, ip, userAgent, createdBy: user.id });
      });

      await setSessionCookie(rawSession);
      redirect(user.role === "PARTICIPANT" ? "/portal/beranda" : "/admin/dashboard");
    },
  );
}
