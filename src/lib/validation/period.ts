import { z } from "zod";
import { parseWibDateTime } from "../date";

const wibDateTime = (label: string) =>
  z
    .string()
    .transform((v, ctx) => {
      const date = parseWibDateTime(v);
      if (!date) ctx.addIssue({ code: "custom", message: `${label} wajib diisi (tanggal dan jam)` });
      return date as Date;
    });

const datesSchema = z
  .object({ opensAt: wibDateTime("Tanggal buka"), closesAt: wibDateTime("Tanggal tutup") })
  .refine((d) => !d.opensAt || !d.closesAt || d.closesAt > d.opensAt, {
    message: "Tanggal tutup harus setelah tanggal buka",
    path: ["closesAt"],
  });

/** FR-02.03 + FR-02.08. Tanggal dari input datetime-local dibaca sebagai WIB. */
export const periodSchema = z
  .object({
    name: z.string().trim().min(1, "Nama periode wajib diisi").max(200, "Nama maks. 200 karakter"),
    year: z.coerce.number().int("Tahun harus bilangan bulat").min(2000, "Tahun tidak valid").max(2100, "Tahun tidak valid"),
    revisionDeadlineDays: z.coerce.number().int("Batas revisi harus bilangan bulat").min(1, "Batas revisi minimal 1 hari"),
    revisionScope: z.enum(["SELECTED_QUESTIONS", "ALL"], "Pilih cakupan revisi"),
    passingScore: z.coerce.number("Batas lolos harus angka").min(0, "Batas lolos minimal 0").max(9999.99, "Batas lolos terlalu besar"),
    showRankingToParticipants: z.preprocess((v) => v === "on", z.boolean()),
  })
  .and(datesSchema);

export type PeriodInput = z.infer<typeof periodSchema>;

/** FR-02.06: salinan wajib diberi nama, tahun, dan tanggal buka-tutup baru. */
export const copyPeriodSchema = z
  .object({
    name: z.string().trim().min(1, "Nama periode wajib diisi").max(200, "Nama maks. 200 karakter"),
    year: z.coerce.number().int().min(2000, "Tahun tidak valid").max(2100, "Tahun tidak valid"),
  })
  .and(datesSchema);

/** FR-02.07: perpanjangan, alasan wajib. Kosong `institutionIds` = semua lembaga. */
export const extensionSchema = z.object({
  newClosesAt: wibDateTime("Tanggal tutup baru"),
  reason: z.string().trim().min(1, "Alasan perpanjangan wajib diisi"),
  scope: z.enum(["ALL", "SELECTED"]),
  institutionIds: z.array(z.uuid()),
}).refine((d) => d.scope === "ALL" || d.institutionIds.length > 0, {
  message: "Pilih minimal satu lembaga",
  path: ["institutionIds"],
});
