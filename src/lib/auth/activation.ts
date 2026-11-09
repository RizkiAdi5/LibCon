import type { Db } from "../db/client";
import { sendTemplateEmail } from "../email/send";
import { issueAuthToken } from "./token";

export type ActivationTarget = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  institutionId: string | null;
  institution: { libraryName: string; officialEmail: string } | null;
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
    to: user.institution?.officialEmail ?? user.email,
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
