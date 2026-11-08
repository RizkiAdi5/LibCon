"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { withDb } from "../db/withDb";
import { runWithRequestContext } from "../db/requestContext";
import { getSessionUser, destroySessionByRawToken, clearSessionCookie } from "./session";
import { SESSION_COOKIE_NAME } from "./sessionCookie";
import { getClientMeta } from "./guard";

/** FR-04.05: logout menghapus sesi di server, bukan cuma cookie di browser. */
export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;

  if (user && raw) {
    const { ip, userAgent } = await getClientMeta();
    await runWithRequestContext({ userId: user.id, requestId: randomUUID(), ip, userAgent, source: "WEB" }, () =>
      withDb(async (tx) => {
        await destroySessionByRawToken(tx, raw);
        await tx.activityLog.create({
          data: {
            userId: user.id,
            actorRole: user.role,
            activity: "LOGOUT",
            description: `${user.username} logout`,
          },
        });
      }),
    );
  }

  await clearSessionCookie();
  redirect("/login");
}
