"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { runWithRequestContext } from "@/lib/db/requestContext";
import { getClientMeta } from "@/lib/auth/guard";
import { consumeAuthToken, findTokenOwnerId } from "@/lib/auth/token";
import { hashPassword } from "@/lib/auth/password";
import { checkPasswordPolicy } from "@/lib/auth/passwordPolicy";
import { getPasswordPolicy } from "@/lib/settings";
import { destroyAllSessionsForUser } from "@/lib/auth/session";
import { SYSTEM_USER_ID } from "@/lib/auth/constants";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  passwordConfirmation: z.string().min(1),
});

export type ResetPasswordState = { error?: string };

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = schema.safeParse({
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
      const ownerId = await findTokenOwnerId(prisma, { raw: token, type: "PASSWORD_RESET" });
      if (!ownerId) return { error: "Link tidak valid." };

      const user = await prisma.user.findUnique({ where: { id: ownerId }, include: { institution: true } });
      if (!user) return { error: "Link tidak valid." };

      const policy = await getPasswordPolicy();
      const check = checkPasswordPolicy(password, policy, {
        npp: user.institution?.npp,
        institutionName: user.institution?.institutionName,
      });
      if (!check.valid) return { error: "Password tidak memenuhi syarat keamanan." };

      const passwordHash = await hashPassword(password);

      const result = await withDb(async (tx) => {
        const consumed = await consumeAuthToken(tx, {
          raw: token,
          type: "PASSWORD_RESET",
          actorUserId: SYSTEM_USER_ID,
        });
        if (consumed.status !== "ok") return consumed.status;

        await tx.user.update({
          where: { id: consumed.userId },
          data: { passwordHash, passwordChangedAt: new Date(), updatedBy: consumed.userId },
        });
        await tx.activityLog.create({
          data: {
            userId: consumed.userId,
            actorRole: user.role,
            activity: "PASSWORD_CHANGED",
            description: `${user.username} reset password`,
          },
        });
        // FR-04.06: ganti/reset password mengakhiri semua sesi lain
        await destroyAllSessionsForUser(tx, consumed.userId);
        return "ok" as const;
      });

      if (result !== "ok") {
        return { error: result === "expired" ? "Link sudah kedaluwarsa." : "Link tidak valid atau sudah dipakai." };
      }

      redirect(`/login?username=${encodeURIComponent(user.username)}`);
    },
  );
}
