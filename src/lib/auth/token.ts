import { randomBytes, createHash } from "node:crypto";
import type { Db } from "../db/client";
import type { TokenType } from "@/generated/prisma/client";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam, BR-03

export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Buat token baru (aktivasi/reset), mencabut token sejenis yang masih aktif
 * milik user yang sama (BR-03: "link baru mencabut link lama").
 */
export async function issueAuthToken(
  tx: Db,
  params: { userId: string; type: TokenType; createdBy: string },
): Promise<string> {
  await tx.authToken.updateMany({
    where: { userId: params.userId, type: params.type, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const raw = generateRawToken();
  await tx.authToken.create({
    data: {
      userId: params.userId,
      type: params.type,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      createdBy: params.createdBy,
    },
  });
  return raw;
}

export type TokenCheckResult =
  | { status: "ok"; userId: string }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "used" }
  | { status: "revoked" };

/** Cek status token TANPA menandainya terpakai — buat render halaman (GET). */
export async function peekAuthToken(db: Db, params: { raw: string; type: TokenType }): Promise<TokenCheckResult> {
  const record = await db.authToken.findUnique({ where: { tokenHash: hashToken(params.raw) } });
  if (!record || record.type !== params.type) return { status: "not_found" };
  if (record.revokedAt) return { status: "revoked" };
  if (record.usedAt) return { status: "used" };
  if (record.expiresAt < new Date()) return { status: "expired" };
  return { status: "ok", userId: record.userId };
}

/**
 * Cari pemilik token terlepas dari status (kedaluwarsa/terpakai/tercabut) —
 * dipakai khusus alur "minta link baru" dari halaman link kedaluwarsa, yang
 * perlu tahu akun mana walau tokennya sendiri sudah tidak valid lagi.
 */
export async function findTokenOwnerId(db: Db, params: { raw: string; type: TokenType }): Promise<string | null> {
  const record = await db.authToken.findUnique({ where: { tokenHash: hashToken(params.raw) } });
  if (!record || record.type !== params.type) return null;
  return record.userId;
}

/** Validasi token lalu tandai terpakai dalam transaksi yang sama (sekali pakai, BR-03). */
export async function consumeAuthToken(
  tx: Db,
  params: { raw: string; type: TokenType; actorUserId: string },
): Promise<TokenCheckResult> {
  const result = await peekAuthToken(tx, params);
  if (result.status !== "ok") return result;

  await tx.authToken.update({
    where: { tokenHash: hashToken(params.raw) },
    data: { usedAt: new Date(), updatedBy: params.actorUserId },
  });

  return result;
}
