"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import type { Prisma } from "@prisma/client";

const int = (min: number, max: number, label: string) => z.coerce.number().int(`${label} harus bilangan bulat`).min(min, `${label} minimal ${min}`).max(max, `${label} maksimal ${max}`);
const bool = z.preprocess((v) => v === "on", z.boolean());

const securitySchema = z.object({
  password_policy: z.object({
    minLength: int(8, 64, "Panjang password"),
    requireUppercase: bool,
    requireLowercase: bool,
    requireNumber: bool,
    requireSymbol: bool,
    forbidNppOrInstitutionName: bool,
  }),
  lockout_policy: z.object({
    maxFailedAttempts: int(3, 20, "Batas gagal login"),
    lockoutMinutes: int(1, 1440, "Lama kunci"),
    burstAttempts: int(3, 100, "Batas percobaan beruntun"),
    burstWindowMinutes: int(1, 60, "Jendela percobaan beruntun"),
    burstLockMinutes: int(1, 1440, "Lama kunci percobaan beruntun"),
    permanentBlockAfter: int(10, 1000, "Batas blokir"),
    resetRequestsPerHour: int(1, 50, "Batas lupa password per jam"),
  }),
  session_policy: z.object({ adminHours: int(1, 24, "Lama sesi admin"), participantHours: int(1, 168, "Lama sesi peserta") }),
});

const identitySchema = z.object({
  identity: z.object({
    libraryName: z.string().trim().max(200),
    address: z.string().trim().max(500),
    senderEmail: z.union([z.literal(""), z.email("Email pengirim tidak valid")]),
    signerName: z.string().trim().max(120),
    signerTitle: z.string().trim().max(120),
  }),
  iplm_export: z.object({ provinsi: z.string().trim().max(120), kewNorm: z.string().trim().max(40) }),
});

/** Field form bernama `grup.field` → objek bertingkat. Checkbox tak tercentang tidak terkirim → false. */
function nested(formData: FormData, shape: Record<string, z.ZodObject>) {
  return Object.fromEntries(Object.entries(shape).map(([group, obj]) => [group, Object.fromEntries(Object.keys(obj.shape).map((f) => [f, formData.get(`${group}.${f}`) ?? undefined]))]));
}

async function save(formData: FormData, schema: z.ZodObject, path: string) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = schema.safeParse(nested(formData, schema.shape as Record<string, z.ZodObject>));
  if (!parsed.success) redirect(`${path}?${new URLSearchParams({ error: parsed.error.issues[0].message })}`);
  await runAsUser(user, () =>
    withDb(async (tx) => {
      for (const [key, value] of Object.entries(parsed.data as Record<string, Prisma.InputJsonValue>)) {
        await tx.appSetting.upsert({ where: { key }, create: { key, value, createdBy: user.id }, update: { value, updatedBy: user.id } });
      }
    }),
  );
  redirect(`${path}?ok=${encodeURIComponent("Pengaturan disimpan")}`);
}

/** FR-14.03: kebijakan password, batas gagal login, lama kunci, lama sesi. */
export async function saveSecurityAction(formData: FormData) {
  await save(formData, securitySchema, "/admin/pengaturan/keamanan");
}

/** FR-14.04: identitas penyelenggara + identitas ekspor IPLM. */
export async function saveIdentityAction(formData: FormData) {
  await save(formData, identitySchema, "/admin/pengaturan/identitas");
}
