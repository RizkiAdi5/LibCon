"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { sendActivation } from "@/lib/auth/activation";
import { officialEmailTaken } from "@/lib/institution";

const PATH = "/admin/pendaftaran";

function back(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params)}`);
}

async function loadPendingRequest(requestId: string) {
  const request = await prisma.institutionRegistrationRequest.findFirst({
    where: { id: requestId, status: "PENDING" },
    include: { type: true },
  });
  if (!request) back({ error: "Pendaftaran tidak ditemukan atau sudah diproses" });
  return request;
}

/**
 * Pendaftaran mandiri lembaga (di luar PRD/ERD) — setuju: buat lembaga + akun utama
 * PENDING_ACTIVATION (sama seperti alur lembaga baru lama, bukan varian Tahap 21 yang
 * admin set password sendiri — di sini admin tidak tahu password yang akan dipakai
 * pendaftar), lalu email aktivasi ke email yang didaftarkan.
 */
export async function approveRegistrationRequestAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const parsed = z.uuid().safeParse(formData.get("requestId"));
  if (!parsed.success) back({ error: "Pendaftaran tidak valid" });
  const request = await loadPendingRequest(parsed.data);

  if (!request.type.isActive || request.type.deletedAt) back({ error: `Jenis ${request.type.name} sudah nonaktif. Tolak permintaan ini.` });
  const emailError = await officialEmailTaken(request.officialEmail);
  if (emailError) back({ error: `${emailError}. Tolak permintaan ini dengan catatan.` });

  const { institution, account } = await runAsUser(user, () =>
    withDb(async (tx) => {
      const institution = await tx.institution.create({
        data: {
          institutionName: request.institutionName,
          libraryName: request.institutionName,
          typeId: request.typeId,
          officialEmail: request.officialEmail,
          picName: request.picName,
          whatsapp: request.whatsapp,
          createdBy: user.id,
        },
      });
      const account = await tx.user.create({
        data: {
          role: "PARTICIPANT",
          institutionId: institution.id,
          username: request.officialEmail,
          email: request.officialEmail,
          fullName: request.institutionName,
          status: "PENDING_ACTIVATION",
          isPrimary: true,
          createdBy: user.id,
        },
      });
      await tx.institutionRegistrationRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), createdInstitutionId: institution.id, updatedBy: user.id },
      });
      return { institution, account };
    }),
  );

  // Email di transaksi terpisah: persetujuan tetap tercatat walau pengiriman gagal (bisa kirim ulang dari detail lembaga).
  let ok = `${institution.libraryName} dibuat. Email aktivasi dikirim ke ${request.officialEmail}.`;
  try {
    await runAsUser(user, () => withDb((tx) => sendActivation(tx, { ...account, institution }, user.id)));
  } catch (error) {
    console.error("[pendaftaran] gagal kirim email aktivasi", error);
    ok = `${institution.libraryName} dibuat, tetapi email gagal dikirim. Gunakan Kirim ulang aktivasi di detail lembaga.`;
  }
  back({ ok });
}

const rejectSchema = z.object({ requestId: z.uuid(), reason: z.string().trim().min(1, "Alasan penolakan wajib diisi").max(500) });

/** Tolak dengan catatan wajib — tidak ada email ke pendaftar (belum punya akun untuk mengecek status; admin follow-up manual). */
export async function rejectRegistrationRequestAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const parsed = rejectSchema.safeParse({ requestId: formData.get("requestId"), reason: formData.get("reason") });
  if (!parsed.success) back({ error: parsed.error.issues[0].message });
  const request = await loadPendingRequest(parsed.data.requestId);

  await runAsUser(user, () =>
    withDb((tx) =>
      tx.institutionRegistrationRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), rejectReason: parsed.data.reason, updatedBy: user.id },
      }),
    ),
  );
  back({ ok: `Pendaftaran ${request.institutionName} ditolak.` });
}
