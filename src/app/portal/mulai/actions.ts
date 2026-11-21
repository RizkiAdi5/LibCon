"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { checkInstitutionRules, updateInstitution } from "@/lib/institution";
import { institutionSchema } from "@/lib/validation/institution";
import type { InstitutionFormState } from "@/app/admin/peserta/actions";

/**
 * Peserta melengkapi profil lembaganya sendiri (akun dibuat admin dengan email + password).
 * Lembaga SELALU dari sesi; jenis & email resmi tetap nilai dari admin, bukan dari form.
 * Hanya sekali — perubahan berikutnya lewat admin (FR-03.01, NPP hanya Super Admin).
 */
export async function completeProfileAction(_prev: InstitutionFormState, formData: FormData): Promise<InstitutionFormState> {
  const user = await requireRole(["PARTICIPANT"], { allowSetup: true });
  if (user.setup !== "profile") redirect(user.setup ? "/portal/mulai" : "/portal/beranda");

  const existing = await prisma.institution.findUniqueOrThrow({ where: { id: user.institutionId! }, include: { users: true } });
  const values: Record<string, string> = {};
  for (const [key, value] of formData) if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  Object.assign(values, { typeId: existing.typeId, officialEmail: existing.officialEmail });

  const parsed = institutionSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors, error: "Periksa kembali isian yang ditandai." };
  }
  const fieldErrors = await checkInstitutionRules(parsed.data, existing);
  if (fieldErrors) return { values, fieldErrors, error: "Periksa kembali isian yang ditandai." };

  try {
    await runAsUser(user, () => updateInstitution(existing, parsed.data, user.id));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { values, error: "NPP baru saja dipakai lembaga lain. Periksa kembali NPP Anda atau hubungi admin." };
    }
    throw error;
  }
  redirect(`/portal/beranda?${new URLSearchParams({ ok: "Profil lembaga lengkap. Selamat datang di LibCon!" })}`);
}
