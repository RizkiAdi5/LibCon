"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { withDb } from "@/lib/db/withDb";
import { parseVisitorForm, wibYearMonth } from "@/lib/visitors";

export type VisitorFormState = { error?: string; errors?: Record<number, string>; savedAt?: number; savedCount?: number };

/**
 * Simpan rekap pengunjung satu tahun. Lembaga SELALU dari sesi. Bulan yang dikosongkan
 * tidak menghapus isian lama.
 * shortcut: isian bulan lama tetap bisa dikoreksi kapan saja (jejak di audit_logs) — tambah kunci per bulan/tahun bila admin butuh data final.
 */
export async function saveVisitorReportAction(_prev: VisitorFormState, formData: FormData): Promise<VisitorFormState> {
  const user = await requireRole(["PARTICIPANT"]);
  const now = new Date();
  const year = z.coerce.number().int().min(2020).max(wibYearMonth(now).year).safeParse(formData.get("year"));
  if (!year.success) return { error: "Tahun tidak valid" };

  const parsed = parseVisitorForm((name) => formData.get(name), year.data, now);
  if (!parsed.ok) return { error: "Periksa kembali bulan yang ditandai.", errors: parsed.errors };
  if (parsed.entries.length === 0) return { error: "Belum ada bulan yang diisi." };

  const institutionId = user.institutionId!;
  await runAsUser(user, () =>
    withDb(async (tx) => {
      for (const e of parsed.entries) {
        await tx.visitorReport.upsert({
          where: { institutionId_year_month: { institutionId, year: year.data, month: e.month } },
          create: { institutionId, year: year.data, month: e.month, male: e.male, female: e.female, createdBy: user.id },
          update: { male: e.male, female: e.female, updatedBy: user.id },
        });
      }
    }),
  );
  revalidatePath("/portal/kunjungan");
  return { savedAt: Date.now(), savedCount: parsed.entries.length };
}
