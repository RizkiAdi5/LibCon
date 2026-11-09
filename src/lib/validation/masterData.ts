import { z } from "zod";

/** Wilayah (FR-02.01). Level diturunkan dari induk di server, bukan dari input. */
export const regionSchema = z.object({
  parentId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  code: z.string().trim().min(1, "Kode wajib diisi").max(30, "Kode maks. 30 karakter"),
  name: z.string().trim().min(1, "Nama wajib diisi").max(100, "Nama maks. 100 karakter"),
});

export const regionUpdateSchema = regionSchema.omit({ parentId: true }).extend({ id: z.uuid() });

/** Jenis peserta (FR-02.02). */
export const institutionTypeSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi").max(30, "Kode maks. 30 karakter"),
  name: z.string().trim().min(1, "Nama wajib diisi").max(100, "Nama maks. 100 karakter"),
  sortOrder: z.coerce.number().int("Urutan harus bilangan bulat").min(0, "Urutan minimal 0"),
});

export const institutionTypeUpdateSchema = institutionTypeSchema.extend({ id: z.uuid() });

/** Pesan pertama dari hasil safeParse yang gagal — untuk ditampilkan di banner halaman. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Form tidak valid";
}
