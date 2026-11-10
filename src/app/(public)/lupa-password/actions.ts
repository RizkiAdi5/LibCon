"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { runWithRequestContext } from "@/lib/db/requestContext";
import { getClientMeta } from "@/lib/auth/guard";
import { sendPasswordReset } from "@/lib/auth/activation";
import { SYSTEM_USER_ID } from "@/lib/auth/constants";
import { getLockoutPolicy } from "@/lib/settings";

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

      // FR-04.09 (per akun, keputusan Tahap 8): maks. N permintaan per jam; reset oleh admin tidak dihitung
      const { resetRequestsPerHour } = await getLockoutPolicy();
      const recentRequests = await prisma.authToken.count({
        where: {
          userId: user.id,
          type: "PASSWORD_RESET",
          createdBy: SYSTEM_USER_ID,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
      });
      if (recentRequests >= resetRequestsPerHour) return GENERIC_SUCCESS; // tetap respons sama (FR-04.04)

      await withDb((tx) => sendPasswordReset(tx, user, SYSTEM_USER_ID));

      return GENERIC_SUCCESS;
    },
  );
}
