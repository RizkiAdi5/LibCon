import { z } from "zod";
import { institutionSchema } from "./institution";

/** Pendaftaran mandiri lembaga (di luar PRD/ERD) — identitas minimum, sisanya dilengkapi peserta sendiri setelah disetujui. */
export const registrationRequestSchema = z.object({
  institutionName: institutionSchema.shape.institutionName,
  typeId: institutionSchema.shape.typeId,
  officialEmail: institutionSchema.shape.officialEmail,
  picName: institutionSchema.shape.picName,
  whatsapp: institutionSchema.shape.whatsapp,
});

export type RegistrationRequestInput = z.infer<typeof registrationRequestSchema>;
export type RegistrationRequestFieldErrors = Partial<Record<keyof RegistrationRequestInput, string[]>>;
