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
import { redirect } from "next/navigation";
import {
  accountRequestSchema,
  canRequestSecondAccount,
  DISABLE_SECOND_ACCOUNT,
  disableSecondAccountSchema,
  type DisableSecondAccountChange,
} from "@/lib/validation/accountRequest";

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

/**
 * FR-05.08: hanya akun UTAMA yang bisa meminta admin menonaktifkan akun kedua lembaganya.
 * Akun & lembaga selalu dari sesi/DB; satu permintaan menunggu pada satu waktu.
 */
export async function requestDisableSecondAccountAction(formData: FormData) {
  const sessionUser = await requireRole(["PARTICIPANT"]);
  const back = (params: Record<string, string>): never => redirect(`/portal/akun?${new URLSearchParams(params)}`);
  const parsed = disableSecondAccountSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) back({ error: parsed.error.issues[0].message });
  const institutionId = sessionUser.institutionId!;
  const [me, second, pending] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } }),
    prisma.user.findFirst({ where: { institutionId, isPrimary: false, deletedAt: null, status: { not: "DISABLED" } } }),
    prisma.institutionChangeRequest.findFirst({ where: { institutionId, status: "PENDING", changes: { path: ["type"], equals: DISABLE_SECOND_ACCOUNT } } }),
  ]);
  if (!me.isPrimary) back({ error: "Hanya akun utama yang bisa mengajukan penonaktifan akun kedua." });
  if (!second) back({ error: "Tidak ada akun kedua yang aktif." });
  if (pending) back({ error: "Permintaan penonaktifan masih menunggu admin." });

  const changes: DisableSecondAccountChange = { type: DISABLE_SECOND_ACCOUNT, userId: second!.id, username: second!.username };
  await runAsUser(sessionUser, () =>
    withDb((tx) => tx.institutionChangeRequest.create({ data: { institutionId, requestedById: me.id, changes, reason: parsed.data!.reason, createdBy: me.id } })),
  );
  back({ ok: `Permintaan menonaktifkan ${second!.username} dikirim ke admin.` });
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
  // allowSetup: dipakai juga di /portal/mulai untuk mengganti password awal dari admin
  const sessionUser = await requireRole(["PARTICIPANT"], { allowSetup: true });
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
  if (oldPassword === password) return { error: "Password baru harus berbeda dari password lama." };

  const passwordHash = await hashPassword(password);
  const currentSession = (await cookies()).get(SESSION_COOKIE_NAME)!.value; // ada: requireRole lolos

  await runAsUser(sessionUser, () =>
    withDb(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false, updatedBy: user.id },
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

  if (user.mustChangePassword) redirect("/portal/mulai"); // lanjut ke langkah lengkapi profil
  return { success: true };
}
