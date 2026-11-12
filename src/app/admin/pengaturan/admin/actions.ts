"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { sendActivation, sendPasswordReset } from "@/lib/auth/activation";
import { destroyAllSessionsForUser } from "@/lib/auth/session";

const PATH = "/admin/pengaturan/admin";
const back = (msg: { ok?: string; error?: string }): never => redirect(`${PATH}?${new URLSearchParams(msg as Record<string, string>)}`);
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Nama minimal 2 karakter").max(120),
  email: z.email("Email tidak valid").trim().toLowerCase(),
  role: z.enum(ADMIN_ROLES),
});

/** FR-14.01: tambah admin lewat undangan email (link aktivasi 24 jam, BR-03). Username = email. */
export async function inviteAdminAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back({ error: parsed.error!.issues[0].message });
  const { fullName, email, role } = parsed.data!;
  const taken = await prisma.user.findFirst({
    where: { OR: [{ email: { equals: email, mode: "insensitive" } }, { username: { equals: email, mode: "insensitive" } }] },
  });
  if (taken) back({ error: `Email ${email} sudah dipakai akun lain` });
  const account = await runAsUser(user, () =>
    withDb((tx) => tx.user.create({ data: { role, username: email, email, fullName, status: "PENDING_ACTIVATION", createdBy: user.id } })),
  );
  // email di transaksi terpisah: akun tetap tersimpan walau pengiriman gagal (pola sama dengan lembaga baru)
  try {
    await runAsUser(user, () => withDb((tx) => sendActivation(tx, { ...account, institution: null }, user.id)));
  } catch (error) {
    console.error("[admin] gagal kirim undangan", error);
    back({ ok: `Admin ${email} ditambahkan, tetapi email undangan gagal dikirim. Gunakan Kirim ulang undangan.` });
  }
  back({ ok: `Undangan dikirim ke ${email}` });
}

const ACTIONS = ["role-admin", "role-super", "disable", "enable", "reset-password", "resend", "unblock"] as const;

/** FR-14.01: ubah peran, nonaktifkan/aktifkan, reset password, kirim ulang undangan, buka blokir akun admin. */
export async function adminAccountAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = z.object({ userId: z.uuid(), action: z.enum(ACTIONS) }).safeParse({ userId: formData.get("userId"), action: formData.get("action") });
  if (!parsed.success) back({ error: "Aksi tidak valid" });
  const { userId, action } = parsed.data!;
  const account = await prisma.user.findFirst({ where: { id: userId, role: { in: [...ADMIN_ROLES] }, deletedAt: null } });
  if (!account) back({ error: "Akun admin tidak ditemukan" });
  const a = account!;

  const losesSuper = a.role === "SUPER_ADMIN" && (action === "role-admin" || action === "disable");
  if (losesSuper || action === "disable") {
    if (a.id === user.id) back({ error: "Tidak bisa menurunkan peran atau menonaktifkan akun sendiri" });
    if (losesSuper) {
      const others = await prisma.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null, id: { not: a.id } } });
      if (others === 0) back({ error: "Harus tetap ada minimal satu Super Admin aktif" });
    }
  }
  if (action === "reset-password" && a.status !== "ACTIVE") back({ error: `Akun ${a.email} belum aktif atau dinonaktifkan` });
  if (action === "resend" && a.status !== "PENDING_ACTIVATION") back({ error: `Akun ${a.email} sudah diaktivasi` });

  await runAsUser(user, () =>
    withDb(async (tx) => {
      switch (action) {
        case "role-admin":
        case "role-super":
          await tx.user.update({ where: { id: a.id }, data: { role: action === "role-super" ? "SUPER_ADMIN" : "ADMIN", updatedBy: user.id } });
          return;
        case "disable":
          await tx.user.update({ where: { id: a.id }, data: { status: "DISABLED", updatedBy: user.id } });
          await destroyAllSessionsForUser(tx, a.id);
          return;
        case "enable":
          await tx.user.update({ where: { id: a.id }, data: { status: a.activatedAt ? "ACTIVE" : "PENDING_ACTIVATION", updatedBy: user.id } });
          return;
        case "unblock":
          await tx.user.update({ where: { id: a.id }, data: { failedLoginCount: 0, lockedUntil: null, updatedBy: user.id } });
          return;
        case "reset-password":
          return sendPasswordReset(tx, { ...a, institution: null }, user.id);
        case "resend":
          return sendActivation(tx, { ...a, institution: null }, user.id);
      }
    }),
  );
  const messages: Record<(typeof ACTIONS)[number], string> = {
    "role-admin": `${a.email} sekarang Admin`,
    "role-super": `${a.email} sekarang Super Admin`,
    disable: `${a.email} dinonaktifkan dan tidak bisa login`,
    enable: `${a.email} diaktifkan kembali`,
    "reset-password": `Link reset password dikirim ke ${a.email}`,
    resend: `Undangan dikirim ulang ke ${a.email}`,
    unblock: `Blokir ${a.email} dibuka`,
  };
  back({ ok: messages[action] });
}
