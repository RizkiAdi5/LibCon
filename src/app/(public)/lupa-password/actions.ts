"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { runWithRequestContext } from "@/lib/db/requestContext";
import { getClientMeta } from "@/lib/auth/guard";
import { issueAuthToken } from "@/lib/auth/token";
import { SYSTEM_USER_ID } from "@/lib/auth/constants";
import { sendTemplateEmail } from "@/lib/email/send";

const schema = z.object({ identifier: z.string().min(1) });

export type ForgotPasswordState = { success?: boolean; error?: string };

// FR-04.04: respons selalu sama, baik akun ada maupun tidak.
const GENERIC_SUCCESS: ForgotPasswordState = { success: true };

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = schema.safeParse({ identifier: formData.get("identifier") });
  if (!parsed.success) return { error: "NPP atau email wajib diisi" };

  const { ip, userAgent } = await getClientMeta();

  return runWithRequestContext(
    { userId: SYSTEM_USER_ID, requestId: randomUUID(), ip, userAgent, source: "WEB" },
    async () => {
      const { identifier } = parsed.data;
      const user = await prisma.user.findFirst({
        where: { OR: [{ username: identifier }, { email: identifier }] },
        include: { institution: true },
      });

      if (!user || user.deletedAt || user.status === "DISABLED") return GENERIC_SUCCESS;

      await withDb(async (tx) => {
        const raw = await issueAuthToken(tx, { userId: user.id, type: "PASSWORD_RESET", createdBy: SYSTEM_USER_ID });
        const link = `${process.env.NEXT_PUBLIC_APP_URL}/reset/${raw}`;
        await sendTemplateEmail(tx, {
          key: "PASSWORD_RESET",
          to: user.institution?.officialEmail ?? user.email,
          variables: { nama_lembaga: user.institution?.libraryName ?? user.fullName, link },
          createdBy: SYSTEM_USER_ID,
          userId: user.id,
          institutionId: user.institutionId ?? undefined,
        });
      });

      return GENERIC_SUCCESS;
    },
  );
}
