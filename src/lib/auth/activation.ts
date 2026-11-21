import type { UserRole } from "@prisma/client";
import { prisma, type Db } from "../db/client";
import { withDb } from "../db/withDb";
import { sendTemplateEmail } from "../email/send";
import { issueAuthToken } from "./token";

export type ActivationTarget = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  institutionId: string | null;
  institution: { libraryName: string } | null;
};

/**
 * Terbitkan token aktivasi baru (mencabut yang lama, BR-03) dan kirim email
 * ACTIVATION berisi nama lembaga, username, dan link (FR-03.04). Dipakai
 * bersama oleh: simpan lembaga baru, kirim ulang dari panel admin (individual
 * & massal), dan "Minta link baru" di halaman link kedaluwarsa.
 */
export async function sendActivation(tx: Db, user: ActivationTarget, actorId: string): Promise<void> {
  const raw = await issueAuthToken(tx, { userId: user.id, type: "ACTIVATION", createdBy: actorId });
  await sendTemplateEmail(tx, {
    key: "ACTIVATION",
    // email akun: akun utama selalu = email resmi lembaga (disinkron saat ubah lembaga),
    // akun kedua = email pengisi kedua (FR-05.04, PRD §7 "Email akun")
    to: user.email,
    variables: {
      nama_lembaga: user.institution?.libraryName ?? user.fullName,
      npp: user.username,
      link: `${process.env.NEXT_PUBLIC_APP_URL}/aktivasi/${raw}`,
    },
    createdBy: actorId,
    userId: user.id,
    institutionId: user.institutionId ?? undefined,
  });
}

/**
 * Terbitkan token reset baru dan kirim email PASSWORD_RESET (FR-04.04, FR-04.07).
 * Password lama tetap berlaku sampai link dipakai (AC M04).
 */
export async function sendPasswordReset(tx: Db, user: ActivationTarget, actorId: string): Promise<void> {
  const raw = await issueAuthToken(tx, { userId: user.id, type: "PASSWORD_RESET", createdBy: actorId });
  await sendTemplateEmail(tx, {
    key: "PASSWORD_RESET",
    to: user.email,
    variables: {
      nama_lembaga: user.institution?.libraryName ?? user.fullName,
      link: `${process.env.NEXT_PUBLIC_APP_URL}/reset/${raw}`,
    },
    createdBy: actorId,
    userId: user.id,
    institutionId: user.institutionId ?? undefined,
  });
}

/**
 * Kirim ulang aktivasi ke akun utama lembaga-lembaga yang dipilih (FR-03.09).
 * Hanya akun PENDING_ACTIVATION di lembaga aktif; token lama dicabut (BR-03).
 * Setiap lembaga transaksi sendiri supaya satu kegagalan tidak membatalkan sisanya.
 */
export async function resendActivations(institutionIds: string[], actor: { id: string; role: UserRole }) {
  const accounts = await prisma.user.findMany({
    where: {
      institutionId: { in: institutionIds },
      isPrimary: true,
      status: "PENDING_ACTIVATION",
      deletedAt: null,
      institution: { deletedAt: null, isActive: true },
    },
    include: { institution: true },
  });

  let failed = 0;
  for (const account of accounts) {
    try {
      await withDb(async (tx) => {
        await sendActivation(tx, account, actor.id);
        await tx.activityLog.create({
          data: {
            userId: actor.id,
            actorRole: actor.role,
            activity: "RESEND_ACTIVATION",
            description: `Kirim ulang aktivasi ke ${account.username}`,
          },
        });
      });
    } catch (error) {
      console.error(`[peserta] gagal kirim ulang aktivasi ke ${account.username}`, error);
      failed++;
    }
  }
  return { sent: accounts.length - failed, skipped: institutionIds.length - accounts.length, failed };
}


/** Pesan flash hasil kirim ulang aktivasi (dipakai daftar peserta & dashboard). */
export function resendSummary({ sent, skipped, failed }: { sent: number; skipped: number; failed: number }): Record<string, string> {
  const parts = [`Link aktivasi dikirim ulang ke ${sent} lembaga.`];
  if (skipped) parts.push(`${skipped} dilewati (akun sudah aktif atau lembaga nonaktif).`);
  if (failed) parts.push(`${failed} gagal dikirim, coba lagi.`);
  return failed ? { error: parts.join(" ") } : { ok: parts.join(" ") };
}
