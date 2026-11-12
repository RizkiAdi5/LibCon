"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { resendActivations, resendSummary, sendActivation, sendPasswordReset } from "@/lib/auth/activation";
import { destroyAllSessionsForUser } from "@/lib/auth/session";
import {
  institutionSchema,
  type InstitutionFieldErrors,
  type InstitutionInput,
} from "@/lib/validation/institution";

export type InstitutionFormState = {
  error?: string;
  fieldErrors?: InstitutionFieldErrors;
  values?: Record<string, string>;
};

type ExistingInstitution = Prisma.InstitutionGetPayload<{ include: { users: true } }>;

/** Aturan lintas tabel yang tidak bisa dicek Zod (PRD §5.2, BR-01). */
async function checkInstitutionRules(
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

  const emailOwner = await prisma.institution.findFirst({
    where: { officialEmail: { equals: data.officialEmail, mode: "insensitive" }, id: { not: existing?.id } },
  });
  if (emailOwner) {
    errors.officialEmail = [`Email sudah dipakai oleh ${emailOwner.libraryName}`];
  } else {
    const emailAccount = await prisma.user.findFirst({
      where: { email: { equals: data.officialEmail, mode: "insensitive" }, id: { not: primary?.id } },
    });
    if (emailAccount) errors.officialEmail = ["Email sudah dipakai akun lain"];
  }

  return Object.keys(errors).length > 0 ? errors : null;
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

/**
 * Tambah (tanpa `id`) atau ubah (dengan `id`) lembaga. Lembaga baru otomatis
 * dibuatkan akun peserta utama PENDING_ACTIVATION + email aktivasi (FR-03.02).
 */
export async function saveInstitutionAction(
  _prev: InstitutionFormState,
  formData: FormData,
): Promise<InstitutionFormState> {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);

  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }

  const id = z.uuid().optional().safeParse(values.id || undefined);
  if (!id.success) return { values, error: "Lembaga tidak valid" };

  const parsed = institutionSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors, error: "Periksa kembali isian yang ditandai." };
  }
  const data = parsed.data;

  const result = await runAsUser(user, async (): Promise<InstitutionFormState | { redirectTo: string }> => {
    const existing = id.data
      ? await prisma.institution.findUnique({ where: { id: id.data }, include: { users: true } })
      : null;
    if (id.data && !existing) return { error: "Lembaga tidak ditemukan" };

    // FR-03.01: ubah NPP hanya oleh Super Admin (perubahan tercatat otomatis oleh trigger audit_logs)
    if (existing && existing.npp !== data.npp && user.role !== "SUPER_ADMIN") {
      return { fieldErrors: { npp: ["Hanya Super Admin yang bisa mengubah NPP"] }, error: "Periksa kembali isian yang ditandai." };
    }

    const fieldErrors = await checkInstitutionRules(data, existing);
    if (fieldErrors) return { fieldErrors, error: "Periksa kembali isian yang ditandai." };

    try {
      if (existing) {
        await updateInstitution(existing, data, user.id);
        return { redirectTo: `/admin/peserta/${existing.id}?${new URLSearchParams({ ok: "Data lembaga disimpan" })}` };
      }
      return { redirectTo: await createInstitution(data, user.id) };
    } catch (error) {
      // balapan dua admin menyimpan NPP/email yang sama di saat bersamaan — UNIQUE di DB yang menang
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { error: "NPP atau email baru saja dipakai lembaga lain. Muat ulang lalu coba lagi." };
      }
      throw error;
    }
  });

  if ("redirectTo" in result) redirect(result.redirectTo);
  return { ...result, values };
}

function backTo(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params)}`);
}


export async function resendActivationAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const parsed = z.uuid().safeParse(formData.get("institutionId"));
  if (!parsed.success) backTo("/admin/peserta", { error: "Lembaga tidak valid" });

  const result = await runAsUser(user, () => resendActivations([parsed.data], user));
  backTo(`/admin/peserta/${parsed.data}`, resendSummary(result));
}

export async function bulkResendActivationAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const parsed = z.array(z.uuid()).min(1).safeParse(formData.getAll("institutionId"));
  if (!parsed.success) backTo("/admin/peserta", { error: "Pilih minimal satu lembaga" });

  const result = await runAsUser(user, () => resendActivations([...new Set(parsed.data)], user));
  backTo("/admin/peserta", resendSummary(result));
}

/**
 * FR-03.10: nonaktifkan (soft delete) / pulihkan lembaga. Status akun tidak
 * diubah supaya kembali seperti semula saat dipulihkan; login ditolak lewat
 * cek lembaga di loginAction, dan sesi yang sedang aktif dicabut.
 */
export async function setInstitutionActiveAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const parsed = z
    .object({ id: z.uuid(), active: z.enum(["true", "false"]) })
    .safeParse({ id: formData.get("id"), active: formData.get("active") });
  if (!parsed.success) backTo("/admin/peserta", { error: "Lembaga tidak valid" });
  const { id } = parsed.data;
  const active = parsed.data.active === "true";

  const institution = await runAsUser(user, () =>
    withDb(async (tx) => {
      const updated = await tx.institution.update({
        where: { id },
        data: active
          ? { isActive: true, deletedAt: null, deletedBy: null, updatedBy: user.id }
          : { isActive: false, deletedAt: new Date(), deletedBy: user.id, updatedBy: user.id },
      });
      if (!active) await tx.session.deleteMany({ where: { user: { institutionId: id } } });
      return updated;
    }),
  );

  backTo(`/admin/peserta/${id}`, {
    ok: `${institution.libraryName} ${active ? "dipulihkan" : "dinonaktifkan. Akun lembaga ini tidak bisa login."}`,
  });
}

const ACCOUNT_ACTIONS = ["reset-password", "disable", "enable", "unblock"] as const;

/**
 * FR-04.07: reset password (kirim link, admin tidak pernah melihat password),
 * nonaktifkan, aktifkan kembali, dan buka blokir akun peserta (FR-04.09).
 */
export async function accountAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const parsed = z
    .object({ userId: z.uuid(), action: z.enum(ACCOUNT_ACTIONS) })
    .safeParse({ userId: formData.get("userId"), action: formData.get("action") });
  if (!parsed.success) backTo("/admin/peserta", { error: "Aksi akun tidak valid" });
  const { userId, action } = parsed.data;

  const account = await prisma.user.findFirst({
    where: { id: userId, role: "PARTICIPANT", deletedAt: null },
    include: { institution: true },
  });
  if (!account) backTo("/admin/peserta", { error: "Akun tidak ditemukan" });
  const path = `/admin/peserta/${account.institutionId}`;

  if (action === "reset-password" && account.status !== "ACTIVE") {
    backTo(path, { error: `Akun ${account.username} belum aktif atau dinonaktifkan — gunakan kirim ulang aktivasi.` });
  }

  await runAsUser(user, () =>
    withDb(async (tx) => {
      if (action === "reset-password") return sendPasswordReset(tx, account, user.id);
      if (action === "unblock") {
        await tx.user.update({
          where: { id: account.id },
          data: { failedLoginCount: 0, lockedUntil: null, updatedBy: user.id },
        });
        return;
      }
      // aktifkan kembali ke status sebelum dinonaktifkan: belum pernah aktivasi → tetap menunggu aktivasi
      const status = action === "disable" ? "DISABLED" : account.activatedAt ? "ACTIVE" : "PENDING_ACTIVATION";
      await tx.user.update({ where: { id: account.id }, data: { status, updatedBy: user.id } });
      if (action === "disable") await destroyAllSessionsForUser(tx, account.id);
    }),
  );

  const messages: Record<(typeof ACCOUNT_ACTIONS)[number], string> = {
    "reset-password": `Link reset password dikirim ke ${account.email}. Password lama tetap berlaku sampai link dipakai.`,
    disable: `Akun ${account.username} dinonaktifkan dan tidak bisa login.`,
    enable: `Akun ${account.username} diaktifkan kembali.`,
    unblock: `Blokir akun ${account.username} dibuka. Akun bisa login kembali.`,
  };
  backTo(path, { ok: messages[action] });
}

async function createInstitution(data: InstitutionInput, actorId: string): Promise<string> {
  const { institution, account } = await withDb(async (tx) => {
    const institution = await tx.institution.create({ data: { ...institutionData(data), createdBy: actorId } });
    // FR-03.02 + BR-01: akun utama, username = NPP, menunggu aktivasi
    const account = await tx.user.create({
      data: {
        role: "PARTICIPANT",
        institutionId: institution.id,
        username: institution.npp,
        email: institution.officialEmail,
        fullName: institution.picName,
        status: "PENDING_ACTIVATION",
        isPrimary: true,
        createdBy: actorId,
      },
    });
    return { institution, account };
  });

  // Email di transaksi terpisah: lembaga tetap tersimpan walau pengiriman gagal, admin bisa kirim ulang.
  let ok = `Lembaga ${institution.libraryName} ditambahkan. Email aktivasi dikirim ke ${institution.officialEmail}.`;
  try {
    await withDb((tx) => sendActivation(tx, { ...account, institution }, actorId));
  } catch (error) {
    console.error("[peserta] gagal kirim email aktivasi", error);
    ok = `Lembaga ${institution.libraryName} ditambahkan, tetapi email aktivasi gagal dikirim. Gunakan Kirim ulang aktivasi.`;
  }
  return `/admin/peserta/${institution.id}?${new URLSearchParams({ ok })}`;
}

async function updateInstitution(existing: ExistingInstitution, data: InstitutionInput, actorId: string) {
  const primary = existing.users.find((u) => u.isPrimary);
  await withDb(async (tx) => {
    await tx.institution.update({ where: { id: existing.id }, data: { ...institutionData(data), updatedBy: actorId } });

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
