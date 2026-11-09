"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import {
  firstIssueMessage,
  institutionTypeSchema,
  institutionTypeUpdateSchema,
} from "@/lib/validation/masterData";

const PATH = "/admin/pengaturan/jenis-peserta";

function back(params: Record<string, string>): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${new URLSearchParams(params)}`);
}

const idSchema = z.object({ id: z.uuid() });

export async function createInstitutionTypeAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = institutionTypeSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder"),
  });
  if (!parsed.success) back({ error: firstIssueMessage(parsed.error) });
  const data = parsed.data;

  const error = await runAsUser(user, async () => {
    // kode tetap unik walau jenis lama sudah dihapus (soft delete) — UNIQUE di DB
    if (await prisma.institutionType.findUnique({ where: { code: data.code } })) {
      return `Kode ${data.code} sudah dipakai`;
    }
    await withDb((tx) => tx.institutionType.create({ data: { ...data, createdBy: user.id } }));
    return null;
  });

  if (error) back({ error });
  back({ ok: `Jenis ${data.name} ditambahkan` });
}

export async function updateInstitutionTypeAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = institutionTypeUpdateSchema.safeParse({
    id: formData.get("id"),
    code: formData.get("code"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder"),
  });
  if (!parsed.success) back({ error: firstIssueMessage(parsed.error) });
  const { id, ...data } = parsed.data;

  const error = await runAsUser(user, async () => {
    const clash = await prisma.institutionType.findUnique({ where: { code: data.code } });
    if (clash && clash.id !== id) return `Kode ${data.code} sudah dipakai jenis ${clash.name}`;
    await withDb((tx) => tx.institutionType.update({ where: { id }, data: { ...data, updatedBy: user.id } }));
    return null;
  });

  if (error) back({ error });
  back({ ok: `Jenis ${data.name} disimpan` });
}

export async function toggleInstitutionTypeActiveAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) back({ error: "Jenis tidak valid" });

  const type = await runAsUser(user, async () => {
    const current = await prisma.institutionType.findUniqueOrThrow({ where: { id: parsed.data.id } });
    return withDb((tx) =>
      tx.institutionType.update({
        where: { id: current.id },
        data: { isActive: !current.isActive, updatedBy: user.id },
      }),
    );
  });

  back({ ok: `Jenis ${type.name} ${type.isActive ? "diaktifkan" : "dinonaktifkan"}` });
}

/** FR-02.02 + AC M02: jenis yang sudah dipakai lembaga ditolak dihapus, ditawarkan nonaktifkan. */
export async function deleteInstitutionTypeAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) back({ error: "Jenis tidak valid" });

  const error = await runAsUser(user, async () => {
    const type = await prisma.institutionType.findUniqueOrThrow({
      where: { id: parsed.data.id },
      include: { _count: { select: { institutions: true } } },
    });
    if (type._count.institutions > 0) {
      return `Jenis ${type.name} sudah dipakai ${type._count.institutions} lembaga sehingga tidak bisa dihapus. Gunakan tombol Nonaktifkan.`;
    }
    await withDb((tx) =>
      tx.institutionType.update({
        where: { id: type.id },
        data: { deletedAt: new Date(), deletedBy: user.id, isActive: false },
      }),
    );
    return null;
  });

  if (error) back({ error });
  back({ ok: "Jenis peserta dihapus" });
}
