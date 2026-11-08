import { Resend } from "resend";
import type { Db } from "../db/client";
import type { EmailTemplateKey } from "@/generated/prisma/client";

function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (match, key) => variables[key] ?? match);
}

/**
 * Kirim email dari template di DB (FR-14.02), catat ke email_logs.
 * Retry 3x dengan jeda bertahap (PRD §7) sengaja BELUM diimplementasikan di
 * sini — itu butuh antrean background (Inngest/QStash) yang belum disetup
 * di Fase 1; untuk sekarang kegagalan langsung ditandai FAILED dan terlihat
 * di panel admin (field errorMessage).
 */
export async function sendTemplateEmail(
  tx: Db,
  params: {
    key: EmailTemplateKey;
    to: string;
    variables: Record<string, string>;
    createdBy: string;
    userId?: string;
    institutionId?: string;
    relatedType?: string;
    relatedId?: string;
  },
): Promise<void> {
  const template = await tx.emailTemplate.findUnique({ where: { key: params.key } });
  if (!template || !template.isActive) {
    throw new Error(`Template email ${params.key} tidak ditemukan atau tidak aktif`);
  }

  const subject = renderTemplate(template.subject, params.variables);
  const html = renderTemplate(template.bodyHtml, params.variables);

  const log = await tx.emailLog.create({
    data: {
      templateId: template.id,
      userId: params.userId,
      institutionId: params.institutionId,
      toEmail: params.to,
      subject,
      status: "QUEUED",
      relatedType: params.relatedType,
      relatedId: params.relatedId,
      createdBy: params.createdBy,
    },
  });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev tanpa akun Resend: jangan blokir alur, tandai terkirim + cetak ke konsol.
    console.log(`[email:dev] ke ${params.to} — ${subject}\n${html}`);
    await tx.emailLog.update({
      where: { id: log.id },
      data: { status: "SENT", sentAt: new Date(), updatedBy: params.createdBy },
    });
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "LibCon <noreply@libcon.example>",
      to: params.to,
      subject,
      html,
    });
    await tx.emailLog.update({
      where: { id: log.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: result.data?.id,
        updatedBy: params.createdBy,
      },
    });
  } catch (error) {
    await tx.emailLog.update({
      where: { id: log.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedBy: params.createdBy,
      },
    });
    throw error;
  }
}
