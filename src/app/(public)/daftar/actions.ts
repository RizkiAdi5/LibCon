"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { runWithRequestContext } from "@/lib/db/requestContext";
import { getClientMeta } from "@/lib/auth/guard";
import { SYSTEM_USER_ID } from "@/lib/auth/constants";
import { officialEmailTaken } from "@/lib/institution";
import { registrationRequestSchema, type RegistrationRequestFieldErrors } from "@/lib/validation/registration";

export type RegistrationRequestState = {
  error?: string;
  fieldErrors?: RegistrationRequestFieldErrors;
  values?: Record<string, string>;
  success?: boolean;
};

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/** Pendaftaran mandiri lembaga (di luar PRD/ERD) — publik, anonim; dicatat atas nama SYSTEM seperti lupa-password. */
export async function submitRegistrationRequestAction(
  _prev: RegistrationRequestState,
  formData: FormData,
): Promise<RegistrationRequestState> {
  const values = formValues(formData);
  const parsed = registrationRequestSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors, error: "Periksa kembali isian yang ditandai." };
  }
  const data = parsed.data;

  const type = await prisma.institutionType.findFirst({ where: { id: data.typeId, deletedAt: null, isActive: true } });
  if (!type) return { values, fieldErrors: { typeId: ["Jenis peserta tidak tersedia atau sudah nonaktif"] } };

  const emailError = await officialEmailTaken(data.officialEmail);
  if (emailError) return { values, fieldErrors: { officialEmail: [emailError] } };

  const existingPending = await prisma.institutionRegistrationRequest.findFirst({
    where: { officialEmail: { equals: data.officialEmail, mode: "insensitive" }, status: "PENDING" },
  });
  if (existingPending) {
    return { values, fieldErrors: { officialEmail: ["Email ini sudah punya pendaftaran yang masih menunggu persetujuan"] } };
  }

  const { ip, userAgent } = await getClientMeta();
  await runWithRequestContext({ userId: SYSTEM_USER_ID, requestId: randomUUID(), ip, userAgent, source: "WEB" }, () =>
    withDb((tx) =>
      tx.institutionRegistrationRequest.create({
        data: {
          institutionName: data.institutionName,
          typeId: data.typeId,
          officialEmail: data.officialEmail,
          picName: data.picName,
          whatsapp: data.whatsapp,
          createdBy: SYSTEM_USER_ID,
        },
      }),
    ),
  );

  return { success: true };
}
