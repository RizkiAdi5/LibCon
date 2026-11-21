import { Prisma } from "@prisma/client";
import { prisma } from "./db/client";
import { withDb } from "./db/withDb";
import type { InstitutionFieldErrors, InstitutionInput } from "./validation/institution";

/** Simpan data lembaga — satu jalur untuk admin (Peserta › ubah) dan peserta (lengkapi profil). */

export type ExistingInstitution = Prisma.InstitutionGetPayload<{ include: { users: true } }>;

/** Aturan lintas tabel yang tidak bisa dicek Zod (PRD §5.2, BR-01). */
export async function checkInstitutionRules(
  data: InstitutionInput,
  existing: ExistingInstitution | null,
): Promise<InstitutionFieldErrors | null> {
  const errors: InstitutionFieldErrors = {};
  const primary = existing?.users.find((u) => u.isPrimary);

  // master yang dinonaktifkan tidak bisa dipilih untuk data baru, tapi nilai lama tetap boleh dipertahankan
  const type = await prisma.institutionType.findFirst({ where: { id: data.typeId, deletedAt: null } });
  if (!type || (!type.isActive && existing?.typeId !== data.typeId)) {
    errors.typeId = ["Jenis peserta tidak tersedia atau sudah nonaktif"];
  }

  const village = await prisma.region.findFirst({
    where: { id: data.villageId, level: "VILLAGE", deletedAt: null },
    include: { parent: true },
  });
  if (!village || village.parentId !== data.districtId) {
    errors.villageId = ["Kelurahan harus berada di dalam kecamatan yang dipilih"];
  } else if ((!village.isActive || !village.parent?.isActive) && existing?.regionId !== data.villageId) {
    errors.villageId = ["Kelurahan atau kecamatan ini sudah nonaktif"];
  }

  const nppOwner = await prisma.institution.findUnique({ where: { npp: data.npp } });
  if (nppOwner && nppOwner.id !== existing?.id) {
    errors.npp = [`NPP sudah dipakai oleh ${nppOwner.libraryName}`]; // AC M03
  } else {
    const nppAccount = await prisma.user.findUnique({ where: { username: data.npp } });
    if (nppAccount && nppAccount.institutionId !== existing?.id) errors.npp = ["NPP sudah dipakai sebagai username akun lain"];
  }

  const emailError = await officialEmailTaken(data.officialEmail, existing?.id, primary?.id);
  if (emailError) errors.officialEmail = [emailError];

  return Object.keys(errors).length > 0 ? errors : null;
}

/** Email resmi unik di lembaga & akun (PRD minta unik, ERD tanpa UNIQUE — dicek di aplikasi, case-insensitive). */
export async function officialEmailTaken(email: string, institutionId?: string, primaryUserId?: string): Promise<string | null> {
  const owner = await prisma.institution.findFirst({
    where: { officialEmail: { equals: email, mode: "insensitive" }, id: { not: institutionId } },
  });
  if (owner) return `Email sudah dipakai oleh ${owner.libraryName}`;
  const account = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, id: { not: primaryUserId } } });
  return account ? "Email sudah dipakai akun lain" : null;
}

function institutionData(data: InstitutionInput) {
  return {
    npp: data.npp,
    npsn: data.npsn ?? null,
    libraryName: data.libraryName,
    institutionName: data.institutionName,
    typeId: data.typeId,
    regionId: data.villageId,
    address: data.address,
    headName: data.headName ?? null,
    picName: data.picName,
    officialEmail: data.officialEmail,
    whatsapp: data.whatsapp ?? null,
  };
}

/** Form lengkap selalu mengisi semua field wajib → profil dianggap lengkap sejak simpan pertama. */
export async function updateInstitution(existing: ExistingInstitution, data: InstitutionInput, actorId: string) {
  const primary = existing.users.find((u) => u.isPrimary);
  await withDb(async (tx) => {
    await tx.institution.update({
      where: { id: existing.id },
      data: { ...institutionData(data), profileCompletedAt: existing.profileCompletedAt ?? new Date(), updatedBy: actorId },
    });

    if (existing.npp !== data.npp) {
      // BR-02: username akun utama = NPP, akun kedua = NPP-2
      if (primary) await tx.user.update({ where: { id: primary.id }, data: { username: data.npp, updatedBy: actorId } });
      await tx.user.updateMany({
        where: { institutionId: existing.id, isPrimary: false },
        data: { username: `${data.npp}-2`, updatedBy: actorId },
      });
    }

    if (primary && primary.email !== data.officialEmail) {
      await tx.user.update({ where: { id: primary.id }, data: { email: data.officialEmail, updatedBy: actorId } });
      // link aktivasi yang sudah terkirim ke email lama tidak boleh tetap berlaku
      await tx.authToken.updateMany({
        where: { userId: primary.id, type: "ACTIVATION", usedAt: null, revokedAt: null },
        data: { revokedAt: new Date(), updatedBy: actorId },
      });
    }
  });
}
