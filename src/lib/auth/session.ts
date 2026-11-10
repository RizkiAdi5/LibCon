import { randomBytes, createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { prisma, type Db } from "../db/client";
import { withDb } from "../db/withDb";
import { runWithRequestContext } from "../db/requestContext";
import type { UserRole } from "@/generated/prisma/client";
import { SESSION_COOKIE_NAME } from "./sessionCookie";

export { SESSION_COOKIE_NAME };

const SESSION_TTL_MS: Record<UserRole, number> = {
  SUPER_ADMIN: 8 * 60 * 60 * 1000, // FR-04.05: 8 jam untuk admin
  ADMIN: 8 * 60 * 60 * 1000,
  PARTICIPANT: 24 * 60 * 60 * 1000, // 24 jam untuk peserta
  SYSTEM: 0,
};

const SESSION_REFRESH_MS = 15 * 60 * 1000;

function hashSessionToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createSession(
  tx: Db,
  params: { userId: string; role: UserRole; ip: string | null; userAgent: string | null; createdBy: string },
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await tx.session.create({
    data: {
      userId: params.userId,
      sessionTokenHash: hashSessionToken(raw),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS[params.role]),
      ipAddress: params.ip,
      userAgent: params.userAgent,
      createdBy: params.createdBy,
    },
  });
  return raw;
}

export async function destroySessionByRawToken(tx: Db, raw: string): Promise<void> {
  await tx.session.deleteMany({ where: { sessionTokenHash: hashSessionToken(raw) } });
}

/** FR-04.06: ganti password / reset mengakhiri semua sesi lain milik user. */
export async function destroyAllSessionsForUser(tx: Db, userId: string): Promise<void> {
  await tx.session.deleteMany({ where: { userId } });
}

/** FR-04.06: ganti password dari menu Akun mengakhiri semua sesi lain, sesi saat ini tetap. */
export async function destroyOtherSessions(tx: Db, userId: string, keepRawToken: string): Promise<void> {
  await tx.session.deleteMany({ where: { userId, sessionTokenHash: { not: hashSessionToken(keepRawToken) } } });
}

export type SessionUser = {
  id: string;
  role: UserRole;
  institutionId: string | null;
  username: string;
  fullName: string;
  status: string;
};

/** Baca cookie sesi dari request saat ini, validasi ke DB, kembalikan user aktif atau null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;

  const session = await prisma.session.findUnique({
    where: { sessionTokenHash: hashSessionToken(raw) },
    include: { user: { include: { institution: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.deletedAt || session.user.status !== "ACTIVE") return null;
  if (session.user.institution?.deletedAt) return null; // FR-03.10, jaga-jaga jika sesi lolos dicabut

  // FR-04.05: batas 8/24 jam dihitung dari aktivitas terakhir. Tulis paling sering tiap 15 menit
  // supaya tidak ada UPDATE (+ baris audit_logs) di setiap request.
  const ttl = SESSION_TTL_MS[session.user.role];
  if (session.expiresAt.getTime() - Date.now() < ttl - SESSION_REFRESH_MS) {
    await runWithRequestContext(
      { userId: session.user.id, requestId: randomUUID(), ip: null, userAgent: null, source: "WEB" },
      () =>
        withDb((tx) =>
          tx.session.update({
            where: { id: session.id },
            data: { expiresAt: new Date(Date.now() + ttl), updatedBy: session.user.id },
          }),
        ),
    );
  }

  return {
    id: session.user.id,
    role: session.user.role,
    institutionId: session.user.institutionId,
    username: session.user.username,
    fullName: session.user.fullName,
    status: session.user.status,
  };
}

// Tanpa maxAge: cookie tidak bisa diperpanjang dari Server Component, jadi masa berlaku
// yang otoritatif hanya sessions.expires_at (diperpanjang di getSessionUser, FR-04.05).
export async function setSessionCookie(raw: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
