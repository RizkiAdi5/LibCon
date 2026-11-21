import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/**
 * Data lembaga sesuai PRD §5.2 (format IPLM). Dipakai di form klien DAN
 * server action. Aturan lintas tabel (NPP/email unik, kelurahan di dalam
 * kecamatan, jenis aktif) dicek di server karena butuh DB.
 */
export const institutionSchema = z.object({
  npp: z.string().trim().min(1, "NPP wajib diisi").regex(/^\d+$/, "NPP hanya boleh berisi angka"),
  // Keputusan Tahap 7: NPSN selalu opsional (master jenis tidak menandai mana yang sekolah)
  npsn: z.preprocess(emptyToUndefined, z.string().trim().regex(/^\d{8}$/, "NPSN harus 8 digit angka").optional()),
  libraryName: z
    .string()
    .trim()
    .min(1, "Nama perpustakaan wajib diisi")
    .max(200, "Nama perpustakaan maks. 200 karakter"),
  institutionName: z
    .string()
    .trim()
    .min(1, "Nama instansi/lembaga wajib diisi")
    .max(200, "Nama instansi/lembaga maks. 200 karakter"),
  typeId: z.uuid("Pilih jenis peserta"),
  districtId: z.uuid("Pilih kecamatan"),
  villageId: z.uuid("Pilih kelurahan"),
  address: z.string().trim().min(1, "Alamat wajib diisi"),
  headName: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  picName: z.string().trim().min(1, "Nama penanggung jawab/pengisi wajib diisi"),
  officialEmail: z.string().trim().toLowerCase().pipe(z.email("Format email tidak valid")),
  whatsapp: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^62\d{8,13}$/, "Nomor WhatsApp harus berformat 62xxxxxxxxxx (tanpa + atau spasi)")
      .optional(),
  ),
});

/** Akun peserta baru oleh admin: hanya identitas minimum; sisanya dilengkapi peserta sendiri. */
export const newParticipantSchema = z.object({
  institutionName: institutionSchema.shape.institutionName,
  typeId: institutionSchema.shape.typeId,
  email: institutionSchema.shape.officialEmail,
  password: z.string().min(1, "Password awal wajib diisi"),
});

export type InstitutionInput = z.infer<typeof institutionSchema>;
export type InstitutionFieldErrors = Partial<Record<keyof InstitutionInput, string[]>>;
