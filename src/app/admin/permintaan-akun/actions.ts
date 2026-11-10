"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { sendActivation } from "@/lib/auth/activation";
import { sendTemplateEmail } from "@/lib/email/send";
import { MAX_PARTICIPANT_ACCOUNTS, rejectAccountRequestSchema } from "@/lib/validation/accountRequest";

const PATH = "/admin/permintaan-akun";

function back(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params)}`);
}

async function loadPendingRequest(requestId: string) {
  const request = await prisma.accountRequest.findFirst({
    where: { id: requestId, status: "PENDING" },
    include: { institution: true, requestedBy: true },
  });
  if (!request) back({ error: "Permintaan tidak ditemukan atau sudah diproses" });
  return request;
}

/** FR-05.04: setujui → akun NPP-2 PENDING_ACTIVATION + email aktivasi 24 jam ke email pengisi kedua. */
export async function approveAccountRequestAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const parsed = z.uuid().safeParse(formData.get("requestId"));
  if (!parsed.success) back({ error: "Permintaan tidak valid" });
  const request = await loadPendingRequest(parsed.data);
  const { institution } = request;
  const username = `${institution.npp}-2`; // BR-02

  const [accountCount, usernameTaken, emailTaken] = await Promise.all([
    prisma.user.count({ where: { institutionId: institution.id, deletedAt: null } }),
    prisma.user.findUnique({ where: { username } }),
    prisma.user.findFirst({ where: { email: { equals: request.email, mode: "insensitive" } } }),
  ]);
  if (institution.deletedAt) back({ error: `${institution.libraryName} sedang nonaktif. Pulihkan lembaga dulu.` });
  if (accountCount >= MAX_PARTICIPANT_ACCOUNTS) back({ error: `${institution.libraryName} sudah punya 2 akun.` });
  if (usernameTaken) back({ error: `Username ${username} masih dipakai akun lain.` });
  if (emailTaken) back({ error: `Email ${request.email} sudah terdaftar. Tolak permintaan ini dengan alasan.` });

  const account = await runAsUser(user, () =>
    withDb(async (tx) => {
      const account = await tx.user.create({
        data: {
          role: "PARTICIPANT",
          institutionId: institution.id,
          username,
          email: request.email,
          fullName: request.fullName,
          status: "PENDING_ACTIVATION",
          isPrimary: false,
          createdBy: user.id,
        },
      });
      await tx.accountRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), createdUserId: account.id },
      });
      return account;
    }),
  );

  // Email di transaksi terpisah: persetujuan tetap tercatat walau pengiriman gagal (bisa kirim ulang dari detail lembaga).
  let ok = `Akun ${username} dibuat. Email aktivasi dikirim ke ${request.email}.`;
  try {
    await runAsUser(user, () =>
      withDb(async (tx) => {
        await sendActivation(tx, { ...account, institution }, user.id);
        await sendTemplateEmail(tx, {
          key: "ACCOUNT_REQUEST_APPROVED",
          to: request.requestedBy.email,
          variables: { nama_lembaga: institution.libraryName },
          createdBy: user.id,
          userId: request.requestedById,
          institutionId: institution.id,
          relatedType: "account_request",
          relatedId: request.id,
        });
      }),
    );
  } catch (error) {
    console.error("[permintaan-akun] gagal kirim email persetujuan/aktivasi", error);
    ok = `Akun ${username} dibuat, tetapi email gagal dikirim. Gunakan Kirim ulang aktivasi di detail lembaga.`;
  }
  back({ ok });
}

/** FR-05.05: tolak dengan alasan wajib, dikirim ke email akun pengaju. */
export async function rejectAccountRequestAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const parsed = rejectAccountRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) back({ error: parsed.error.issues[0].message });
  const request = await loadPendingRequest(parsed.data.requestId);

  await runAsUser(user, () =>
    withDb((tx) =>
      tx.accountRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), rejectReason: parsed.data.reason },
      }),
    ),
  );

  let ok = `Permintaan ${request.fullName} ditolak. Alasan dikirim ke ${request.requestedBy.email}.`;
  try {
    await runAsUser(user, () =>
      withDb((tx) =>
        sendTemplateEmail(tx, {
          key: "ACCOUNT_REQUEST_REJECTED",
          to: request.requestedBy.email,
          variables: { nama_lembaga: request.institution.libraryName, catatan: parsed.data.reason },
          createdBy: user.id,
          userId: request.requestedById,
          institutionId: request.institutionId,
          relatedType: "account_request",
          relatedId: request.id,
        }),
      ),
    );
  } catch (error) {
    console.error("[permintaan-akun] gagal kirim email penolakan", error);
    ok = `Permintaan ${request.fullName} ditolak, tetapi email penolakan gagal dikirim.`;
  }
  back({ ok });
}
