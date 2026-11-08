"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { runWithRequestContext } from "@/lib/db/requestContext";
import { getClientMeta } from "@/lib/auth/guard";
import { consumeAuthToken, findTokenOwnerId, issueAuthToken } from "@/lib/auth/token";
import { hashPassword } from "@/lib/auth/password";
import { checkPasswordPolicy } from "@/lib/auth/passwordPolicy";
import { getPasswordPolicy } from "@/lib/settings";
import { SYSTEM_USER_ID } from "@/lib/auth/constants";
import { sendTemplateEmail } from "@/lib/email/send";

const activateSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  passwordConfirmation: z.string().min(1),
});

export type ActivateState = { error?: string };

export async function activateAction(_prev: ActivateState, formData: FormData): Promise<ActivateState> {
  const parsed = activateSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });
  if (!parsed.success) return { error: "Form tidak valid" };
  const { token, password, passwordConfirmation } = parsed.data;

  if (password !== passwordConfirmation) {
    return { error: "Konfirmasi password tidak sama" };
  }

  const { ip, userAgent } = await getClientMeta();

  return runWithRequestContext(
    { userId: SYSTEM_USER_ID, requestId: randomUUID(), ip, userAgent, source: "WEB" },
    async () => {
      const ownerId = await findTokenOwnerId(prisma, { raw: token, type: "ACTIVATION" });
      if (!ownerId) return { error: "Link tidak valid." };

      const user = await prisma.user.findUnique({ where: { id: ownerId }, include: { institution: true } });
      if (!user) return { error: "Link tidak valid." };

      const policy = await getPasswordPolicy();
      const check = checkPasswordPolicy(password, policy, {
        npp: user.institution?.npp,
        institutionName: user.institution?.institutionName,
      });
      if (!check.valid) {
        return { error: "Password tidak memenuhi syarat keamanan." };
      }

      const passwordHash = await hashPassword(password);

      const result = await withDb(async (tx) => {
        const consumed = await consumeAuthToken(tx, { raw: token, type: "ACTIVATION", actorUserId: SYSTEM_USER_ID });
        if (consumed.status !== "ok") return consumed.status;

        await tx.user.update({
          where: { id: consumed.userId },
          data: {
            passwordHash,
            status: "ACTIVE",
            activatedAt: new Date(),
            passwordChangedAt: new Date(),
            updatedBy: consumed.userId,
          },
        });
        await tx.activityLog.create({
          data: {
            userId: consumed.userId,
            actorRole: user.role,
            activity: "PASSWORD_CHANGED",
            description: `${user.username} aktivasi akun`,
          },
        });
        return "ok" as const;
      });

      if (result !== "ok") {
        return { error: result === "expired" ? "Link sudah kedaluwarsa." : "Link tidak valid atau sudah dipakai." };
      }

      redirect(`/login?username=${encodeURIComponent(user.username)}`);
    },
  );
}

const resendSchema = z.object({ token: z.string().min(1) });

export type ResendState = { error?: string; success?: boolean };

export async function resendActivationAction(_prev: ResendState, formData: FormData): Promise<ResendState> {
  const parsed = resendSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { error: "Token tidak valid" };

  const { ip, userAgent } = await getClientMeta();

  return runWithRequestContext(
    { userId: SYSTEM_USER_ID, requestId: randomUUID(), ip, userAgent, source: "WEB" },
    async () => {
      // Jangan bocorkan apakah token/akun ada — selalu balas sukses generik.
      const ownerId = await findTokenOwnerId(prisma, { raw: parsed.data.token, type: "ACTIVATION" });
      if (!ownerId) return { success: true };

      const user = await prisma.user.findUnique({ where: { id: ownerId }, include: { institution: true } });
      if (!user) return { success: true };

      await withDb(async (tx) => {
        const raw = await issueAuthToken(tx, { userId: user.id, type: "ACTIVATION", createdBy: SYSTEM_USER_ID });
        const link = `${process.env.NEXT_PUBLIC_APP_URL}/aktivasi/${raw}`;
        await sendTemplateEmail(tx, {
          key: "ACTIVATION",
          to: user.institution?.officialEmail ?? user.email,
          variables: {
            nama_lembaga: user.institution?.libraryName ?? user.fullName,
            npp: user.username,
            link,
          },
          createdBy: SYSTEM_USER_ID,
          userId: user.id,
          institutionId: user.institutionId ?? undefined,
        });
        await tx.activityLog.create({
          data: {
            userId: user.id,
            actorRole: user.role,
            activity: "RESEND_ACTIVATION",
            description: `Kirim ulang aktivasi ke ${user.username}`,
          },
        });
      });

      return { success: true };
    },
  );
}
