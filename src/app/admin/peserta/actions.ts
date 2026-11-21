"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { resendActivations, resendSummary, sendPasswordReset } from "@/lib/auth/activation";
import { hashPassword } from "@/lib/auth/password";
import { checkPasswordPolicy } from "@/lib/auth/passwordPolicy";
import { destroyAllSessionsForUser } from "@/lib/auth/session";
import { getPasswordPolicy } from "@/lib/settings";
import { checkInstitutionRules, officialEmailTaken, updateInstitution } from "@/lib/institution";
import { institutionSchema, newParticipantSchema, type InstitutionFieldErrors } from "@/lib/validation/institution";

export type InstitutionFormState = {
  error?: string;
  fieldErrors?: InstitutionFieldErrors;
  values?: Record<string, string>;
};

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/** Ubah data lembaga oleh admin. Lembaga baru dibuat lewat `createParticipantAccountAction`. */
export async function saveInstitutionAction(
  _prev: InstitutionFormState,
  formData: FormData,
): Promise<InstitutionFormState> {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const values = formValues(formData);

  const id = z.uuid().safeParse(values.id);
  if (!id.success) return { values, error: "Lembaga tidak valid" };

  const parsed = institutionSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors, error: "Periksa kembali isian yang ditandai." };
  }
  const data = parsed.data;

  const result = await runAsUser(user, async (): Promise<InstitutionFormState | { redirectTo: string }> => {
    const existing = await prisma.institution.findUnique({ where: { id: id.data }, include: { users: true } });
    if (!existing) return { error: "Lembaga tidak ditemukan" };

    // FR-03.01: ubah NPP hanya oleh Super Admin (perubahan tercatat otomatis oleh trigger audit_logs).
    // NPP yang masih kosong (profil belum dilengkapi peserta) boleh diisi Admin.
    if (existing.npp && existing.npp !== data.npp && user.role !== "SUPER_ADMIN") {
      return { fieldErrors: { npp: ["Hanya Super Admin yang bisa mengubah NPP"] }, error: "Periksa kembali isian yang ditandai." };
    }

    const fieldErrors = await checkInstitutionRules(data, existing);
    if (fieldErrors) return { fieldErrors, error: "Periksa kembali isian yang ditandai." };

    try {
      await updateInstitution(existing, data, user.id);
      return { redirectTo: `/admin/peserta/${existing.id}?${new URLSearchParams({ ok: "Data lembaga disimpan" })}` };
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

export type NewParticipantState = {
  error?: string;
  fieldErrors?: Partial<Record<"institutionName" | "typeId" | "email" | "password", string[]>>;
  values?: Record<string, string>;
};

/**
 * Admin membuat akun peserta dengan email + password awal (feedback mentor 2026-11-19, menggantikan
 * alur link aktivasi FR-03.02 untuk peserta baru). Peserta login dengan email, wajib mengganti password
 * awal lalu melengkapi profil lembaga (NPP, wilayah, alamat, penanggung jawab) sebelum fitur lain.
 */
export async function createParticipantAccountAction(
  _prev: NewParticipantState,
  formData: FormData,
): Promise<NewParticipantState> {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const values = formValues(formData);
  delete values.password; // jangan kirim balik password ke browser

  const parsed = newParticipantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors, error: "Periksa kembali isian yang ditandai." };
  }
  const data = parsed.data;

  const type = await prisma.institutionType.findFirst({ where: { id: data.typeId, deletedAt: null, isActive: true } });
  if (!type) return { values, fieldErrors: { typeId: ["Jenis peserta tidak tersedia atau sudah nonaktif"] } };
  const emailError = await officialEmailTaken(data.email);
  if (emailError) return { values, fieldErrors: { email: [emailError] } };
  const check = checkPasswordPolicy(data.password, await getPasswordPolicy(), { institutionName: data.institutionName });
  if (!check.valid) return { values, fieldErrors: { password: ["Password awal tidak memenuhi syarat keamanan"] } };
  const passwordHash = await hashPassword(data.password);

  let institutionId: string;
  try {
    institutionId = await runAsUser(user, () =>
      withDb(async (tx) => {
        const now = new Date();
        const institution = await tx.institution.create({
          data: {
            institutionName: data.institutionName,
            libraryName: data.institutionName, // diganti peserta saat melengkapi profil
            typeId: data.typeId,
            officialEmail: data.email,
            createdBy: user.id,
          },
        });
        // username = email sampai NPP diisi peserta (lalu username = NPP, BR-02)
        await tx.user.create({
          data: {
            role: "PARTICIPANT",
            institutionId: institution.id,
            username: data.email,
            email: data.email,
            fullName: data.institutionName,
            passwordHash,
            passwordChangedAt: now,
            mustChangePassword: true,
            status: "ACTIVE",
            activatedAt: now,
            isPrimary: true,
            createdBy: user.id,
          },
        });
        return institution.id;
      }),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { values, error: "Email baru saja dipakai akun lain. Muat ulang lalu coba lagi." };
    }
    throw error;
  }

  redirect(
    `/admin/peserta/${institutionId}?${new URLSearchParams({
      ok: `Akun ${data.email} dibuat. Berikan email & password awal ke lembaga; mereka wajib mengganti password dan melengkapi profil saat login pertama.`,
    })}`,
  );
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
