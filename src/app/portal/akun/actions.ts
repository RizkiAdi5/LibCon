"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { checkPasswordPolicy } from "@/lib/auth/passwordPolicy";
import { destroyOtherSessions, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getPasswordPolicy } from "@/lib/settings";
import { accountRequestSchema, canRequestSecondAccount } from "@/lib/validation/accountRequest";

export type AccountRequestState = { error?: string; success?: boolean };

/** FR-05.01/02: ajukan akun kedua. institution_id SELALU dari sesi, bukan dari form. */
export async function requestSecondAccountAction(
  _prev: AccountRequestState,
  formData: FormData,
): Promise<AccountRequestState> {
  const sessionUser = await requireRole(["PARTICIPANT"]);
  const parsed = accountRequestSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  const institutionId = sessionUser.institutionId!;

  const [accountCount, pending, emailTaken, emailRequested] = await Promise.all([
    prisma.user.count({ where: { institutionId, deletedAt: null } }),
    prisma.accountRequest.findFirst({ where: { institutionId, status: "PENDING" } }),
    prisma.user.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } } }),
    prisma.accountRequest.findFirst({ where: { email: { equals: data.email, mode: "insensitive" }, status: "PENDING" } }),
  ]);
  // AC M05 ("ditolak 409"): server action tidak punya kode HTTP — ditolak dengan pesan setara (disetujui user)
  if (!canRequestSecondAccount({ accountCount, hasPendingRequest: Boolean(pending) })) {
    return { error: "Lembaga sudah punya 2 akun atau masih ada permintaan yang menunggu persetujuan." };
  }
  if (emailTaken || emailRequested) return { error: "Email sudah terdaftar. Gunakan email lain." };

  await runAsUser(sessionUser, () =>
    withDb((tx) =>
      tx.accountRequest.create({
        data: { institutionId, requestedById: sessionUser.id, ...data, createdBy: sessionUser.id },
      }),
    ),
  );
  return { success: true };
}

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Password lama wajib diisi"),
  password: z.string().min(1, "Password baru wajib diisi"),
  passwordConfirmation: z.string().min(1, "Konfirmasi password wajib diisi"),
});

export type ChangePasswordState = { error?: string; success?: boolean };

/** FR-04.06: ganti password dengan password lama; semua sesi lain diakhiri. */
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const sessionUser = await requireRole(["PARTICIPANT"]);
  const parsed = changePasswordSchema.safeParse({
    oldPassword: formData.get("oldPassword"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { oldPassword, password, passwordConfirmation } = parsed.data;
  if (password !== passwordConfirmation) return { error: "Konfirmasi password tidak sama" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id }, include: { institution: true } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, oldPassword))) {
    return { error: "Password lama salah" };
  }

  const check = checkPasswordPolicy(password, await getPasswordPolicy(), {
    npp: user.institution?.npp,
    institutionName: user.institution?.institutionName,
  });
  if (!check.valid) return { error: "Password baru tidak memenuhi syarat keamanan." };

  const passwordHash = await hashPassword(password);
  const currentSession = (await cookies()).get(SESSION_COOKIE_NAME)!.value; // ada: requireRole lolos

  await runAsUser(sessionUser, () =>
    withDb(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: new Date(), updatedBy: user.id },
      });
      await tx.activityLog.create({
        data: {
          userId: user.id,
          actorRole: user.role,
          activity: "PASSWORD_CHANGED",
          description: `${user.username} ganti password`,
        },
      });
      await destroyOtherSessions(tx, user.id, currentSession);
    }),
  );

  return { success: true };
}
