"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { firstIssueMessage, regionSchema, regionUpdateSchema } from "@/lib/validation/masterData";

const PATH = "/admin/pengaturan/wilayah";

function back(params: Record<string, string>): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${new URLSearchParams(params)}`);
}

export async function createRegionAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = regionSchema.safeParse({
    parentId: formData.get("parentId"),
    code: formData.get("code"),
    name: formData.get("name"),
  });
  if (!parsed.success) back({ error: firstIssueMessage(parsed.error) });
  const { parentId, code, name } = parsed.data;

  const error = await runAsUser(user, async () => {
    const parent = parentId ? await prisma.region.findFirst({ where: { id: parentId, deletedAt: null } }) : null;
    if (parentId && !parent) return "Wilayah induk tidak ditemukan";
    if (parent?.level === "VILLAGE") return "Kelurahan tidak bisa punya sub-wilayah";
    if (await prisma.region.findUnique({ where: { code } })) return `Kode ${code} sudah dipakai wilayah lain`;

    // FR-02.01: Kota > Kecamatan > Kelurahan — level mengikuti induknya
    const level = !parent ? "CITY" : parent.level === "CITY" ? "DISTRICT" : "VILLAGE";
    await withDb((tx) => tx.region.create({ data: { parentId, level, code, name, createdBy: user.id } }));
    return null;
  });

  if (error) back({ error });
  back({ ok: `Wilayah ${name} ditambahkan` });
}

export async function updateRegionAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = regionUpdateSchema.safeParse({
    id: formData.get("id"),
    code: formData.get("code"),
    name: formData.get("name"),
  });
  if (!parsed.success) back({ error: firstIssueMessage(parsed.error) });
  const { id, code, name } = parsed.data;

  const error = await runAsUser(user, async () => {
    const clash = await prisma.region.findUnique({ where: { code } });
    if (clash && clash.id !== id) return `Kode ${code} sudah dipakai wilayah ${clash.name}`;
    await withDb((tx) => tx.region.update({ where: { id }, data: { code, name, updatedBy: user.id } }));
    return null;
  });

  if (error) back({ error });
  back({ ok: `Wilayah ${name} disimpan` });
}

/** Wilayah tidak pernah dihapus (keputusan Tahap 7) — hanya nonaktif/aktif. */
export async function toggleRegionActiveAction(formData: FormData) {
  const user = await requireRole(["SUPER_ADMIN"]);
  const parsed = z.object({ id: z.uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) back({ error: "Wilayah tidak valid" });

  const region = await runAsUser(user, async () => {
    const current = await prisma.region.findUniqueOrThrow({ where: { id: parsed.data.id } });
    return withDb((tx) =>
      tx.region.update({ where: { id: current.id }, data: { isActive: !current.isActive, updatedBy: user.id } }),
    );
  });

  back({ ok: `Wilayah ${region.name} ${region.isActive ? "diaktifkan" : "dinonaktifkan"}` });
}
