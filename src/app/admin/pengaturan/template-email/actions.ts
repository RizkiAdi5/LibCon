"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { sendTemplateEmail } from "@/lib/email/send";
import { SAMPLE_VARIABLES, TEMPLATE_INFO, unknownVariables } from "@/lib/email/templates";
import type { EmailTemplateKey } from "@/generated/prisma/client";

const keySchema = z.enum(Object.keys(TEMPLATE_INFO) as [EmailTemplateKey, ...EmailTemplateKey[]]);
const back = (key: string, msg: Record<string, string>): never => redirect(`/admin/pengaturan/template-email/${key}?${new URLSearchParams(msg)}`);

/** FR-14.02: ubah subjek & isi. Variabel tak dikenal ditolak supaya tidak terkirim mentah. */
export async function saveTemplateAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const key = keySchema.safeParse(formData.get("key"));
  if (!key.success) redirect("/admin/pengaturan/template-email");
  const parsed = z
    .object({ subject: z.string().trim().min(1, "Subjek wajib diisi").max(200), bodyHtml: z.string().trim().min(1, "Isi wajib diisi").max(20_000) })
    .safeParse({ subject: formData.get("subject"), bodyHtml: formData.get("bodyHtml") });
  if (!parsed.success) back(key.data, { error: parsed.error.issues[0].message });
  const { subject, bodyHtml } = parsed.data!;
  const unknown = unknownVariables(`${subject} ${bodyHtml}`, TEMPLATE_INFO[key.data].variables);
  if (unknown.length) back(key.data, { error: `Variabel tidak tersedia untuk template ini: ${unknown.map((v) => `{${v}}`).join(", ")}` });
  await runAsUser(user, () => withDb((tx) => tx.emailTemplate.update({ where: { key: key.data }, data: { subject, bodyHtml, updatedBy: user.id } })));
  back(key.data, { ok: "Template disimpan" });
}

/** FR-14.02: kirim uji (versi tersimpan, contoh variabel) ke email admin yang login. Tercatat di email_logs. */
export async function sendTestAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const key = keySchema.safeParse(formData.get("key"));
  if (!key.success) redirect("/admin/pengaturan/template-email");
  const { email } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } });
  try {
    await runAsUser(user, () =>
      withDb((tx) => sendTemplateEmail(tx, { key: key.data, to: email, variables: SAMPLE_VARIABLES, createdBy: user.id, userId: user.id, relatedType: "test" })),
    );
  } catch (error) {
    console.error("[template-email] kirim uji gagal", error);
    back(key.data, { error: "Kirim uji gagal. Periksa konfigurasi email pengirim." });
  }
  back(key.data, { ok: `Email uji dikirim ke ${email}` });
}
