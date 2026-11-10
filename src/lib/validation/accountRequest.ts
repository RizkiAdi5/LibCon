import { z } from "zod";

export const MAX_PARTICIPANT_ACCOUNTS = 2; // BR-02, juga ditegakkan trigger DB (FR-05.06)

/** FR-05.02: form ajukan akun tambahan. */
export const accountRequestSchema = z.object({
  fullName: z.string().trim().min(1, "Nama lengkap wajib diisi").max(200, "Nama maks. 200 karakter"),
  email: z.string().trim().toLowerCase().pipe(z.email("Format email tidak valid")),
  reason: z.string().trim().min(1, "Alasan wajib diisi"),
});

/** FR-05.05: tolak wajib dengan alasan. */
export const rejectAccountRequestSchema = z.object({
  requestId: z.uuid(),
  reason: z.string().trim().min(1, "Alasan penolakan wajib diisi"),
});

/** FR-05.01: tombol tampil hanya jika < 2 akun dan tidak ada permintaan yang menunggu. */
export function canRequestSecondAccount(params: { accountCount: number; hasPendingRequest: boolean }): boolean {
  return params.accountCount < MAX_PARTICIPANT_ACCOUNTS && !params.hasPendingRequest;
}
