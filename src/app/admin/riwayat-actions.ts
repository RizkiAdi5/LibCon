"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { RESTORE_ROLES, restoreRecord } from "@/lib/restore";

/** FR-13.09: tombol Pulihkan di tab Riwayat. Peran diperiksa per tabel; aturan bisnis diperiksa di `restoreRecord`. */
export async function restoreAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const parsed = z
    .object({
      table: z.string().regex(/^[a-z_]+$/),
      recordId: z.uuid(),
      // hanya kembali ke halaman admin internal (cegah open redirect)
      returnTo: z.string().regex(/^\/admin\/[\w\-/]*$/),
    })
    .safeParse({ table: formData.get("table"), recordId: formData.get("recordId"), returnTo: formData.get("returnTo") });
  if (!parsed.success) redirect("/admin/dashboard");
  const { table, recordId, returnTo } = parsed.data;

  let result: { ok: string } | { error: string };
  if (!RESTORE_ROLES[table]?.includes(user.role)) result = { error: "Anda tidak berwenang memulihkan data ini" };
  else {
    try {
      result = { ok: await runAsUser(user, () => withDb((tx) => restoreRecord(tx, table, recordId, user.id))) };
    } catch (error) {
      result = { error: error instanceof Error ? error.message : "Gagal memulihkan" };
    }
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?${new URLSearchParams(result)}`);
}
