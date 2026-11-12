"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { filterToQuery, parseReportFilter } from "@/lib/report";

/** FR-11.01: simpan filter, opsional dibagikan ke admin lain. Isinya dinormalisasi lewat skema filter. */
export async function saveFilterAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const query = String(formData.get("query") ?? "");
  const name = z.string().trim().min(1, "Nama filter wajib diisi").max(100).safeParse(formData.get("name"));
  if (!name.success) redirect(`/admin/report?${query}&error=${encodeURIComponent(name.error.issues[0].message)}`);
  const params = new URLSearchParams(query);
  const filter = parseReportFilter(Object.fromEntries([...params.keys()].map((k) => [k, params.getAll(k)])));
  await runAsUser(user, () =>
    withDb((tx) =>
      tx.savedReportFilter.create({ data: { userId: user.id, name: name.data, filters: filter, isShared: formData.get("isShared") === "on", createdBy: user.id } }),
    ),
  );
  redirect(`/admin/report?${filterToQuery(filter)}&ok=${encodeURIComponent(`Filter "${name.data}" disimpan`)}`);
}

export async function deleteFilterAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const id = z.uuid().safeParse(formData.get("filterId"));
  if (id.success) {
    // hanya pemilik yang bisa menghapus filternya
    await runAsUser(user, () =>
      withDb((tx) => tx.savedReportFilter.updateMany({ where: { id: id.data, userId: user.id, deletedAt: null }, data: { deletedAt: new Date(), deletedBy: user.id } })),
    );
  }
  redirect(`/admin/report?ok=${encodeURIComponent("Filter dihapus")}`);
}
