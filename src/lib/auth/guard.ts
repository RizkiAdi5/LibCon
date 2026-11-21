import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser, type SessionUser } from "./session";
import { runWithRequestContext } from "../db/requestContext";
import { prisma } from "../db/client";
import type { UserRole } from "@prisma/client";

export async function getClientMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");
  return { ip, userAgent };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

/**
 * Pengecekan peran yang SEBENARNYA (otoritatif) — dipanggil di layout
 * admin/portal dan di setiap server action, bukan cuma di middleware.
 * Peserta yang membuka URL panel admin: redirect ke /403 + tercatat di
 * activity_logs (AC M04).
 *
 * Peserta yang belum ganti password awal / belum melengkapi profil diarahkan ke
 * /portal/mulai untuk SEMUA halaman & action, kecuali yang memberi `allowSetup`.
 */
export async function requireRole(allowed: UserRole[], opts: { allowSetup?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!allowed.includes(user.role)) {
    const { ip, userAgent } = await getClientMeta();
    await runWithRequestContext(
      { userId: user.id, requestId: randomUUID(), ip, userAgent, source: "WEB" },
      () =>
        prisma.activityLog.create({
          data: {
            userId: user.id,
            actorRole: user.role,
            activity: "UNAUTHORIZED_ACCESS",
            description: `Percobaan akses tanpa izin oleh ${user.username} (role ${user.role})`,
          },
        }),
    );
    redirect("/403");
  }

  if (user.setup && !opts.allowSetup) redirect("/portal/mulai");

  return user;
}

/**
 * Jalankan `fn` dengan request context atas nama user sesi — dipakai server
 * action panel admin setelah `requireRole()`, supaya `withDb()` mencatat aktor
 * yang benar di audit_logs.
 */
export async function runAsUser<T>(user: SessionUser, fn: () => Promise<T>): Promise<T> {
  const { ip, userAgent } = await getClientMeta();
  return runWithRequestContext({ userId: user.id, requestId: randomUUID(), ip, userAgent, source: "WEB" }, fn);
}
