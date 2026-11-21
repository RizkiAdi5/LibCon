import type { UserRole } from "@prisma/client";
import type { Db } from "./db/client";

/**
 * FR-13.09: pulihkan soft delete dari tab Riwayat. Hanya tabel yang aman dipulihkan tanpa merusak
 * aturan bisnis lain; setiap tabel memeriksa ulang kondisinya (kuesioner/skema masih Draf, kode tidak bentrok).
 * Node skor sengaja tidak bisa dipulihkan: saat dihapus kodenya diganti & edge-nya dilepas (buat ulang saja).
 * Trigger audit mencatat aksi ini sebagai RESTORE (deleted_at → NULL).
 */
export const RESTORE_ROLES: Record<string, UserRole[]> = {
  questions: ["ADMIN", "SUPER_ADMIN"],
  validation_rules: ["ADMIN", "SUPER_ADMIN"],
  score_categories: ["SUPER_ADMIN"],
  institution_types: ["SUPER_ADMIN"],
};

const DRAFT_ONLY = "Struktur sudah terkunci (terbit/aktif) sehingga tidak bisa dipulihkan.";

/** Mengembalikan pesan sukses, atau melempar Error berisi alasan penolakan untuk pengguna. */
export async function restoreRecord(tx: Db, table: string, id: string, actorId: string): Promise<string> {
  const restored = { deletedAt: null, deletedBy: null, updatedBy: actorId };
  switch (table) {
    case "questions": {
      const q = await tx.question.findFirst({ where: { id, deletedAt: { not: null } }, include: { questionnaire: true, section: true } });
      if (!q) throw new Error("Soal tidak ditemukan atau sudah aktif");
      if (q.questionnaire.status !== "DRAFT") throw new Error(DRAFT_ONLY);
      if (q.section.deletedAt) throw new Error("Bagian soal ini sudah dihapus");
      if (await tx.question.findFirst({ where: { questionnaireId: q.questionnaireId, code: q.code, deletedAt: null } })) {
        throw new Error(`Kode ${q.code} sudah dipakai soal lain — ubah kode soal itu dulu`);
      }
      await tx.question.update({ where: { id }, data: restored });
      return `Soal ${q.code} dipulihkan`;
    }
    case "validation_rules": {
      const r = await tx.validationRule.findFirst({ where: { id, deletedAt: { not: null } }, include: { question: { include: { questionnaire: true } } } });
      if (!r) throw new Error("Aturan tidak ditemukan atau sudah aktif");
      if (r.question.questionnaire.status !== "DRAFT") throw new Error(DRAFT_ONLY);
      if (r.question.deletedAt) throw new Error("Soal pemilik aturan ini sudah dihapus — pulihkan soalnya dulu");
      await tx.validationRule.update({ where: { id }, data: restored });
      return `Aturan pada soal ${r.question.code} dipulihkan`;
    }
    case "score_categories": {
      const c = await tx.scoreCategory.findFirst({ where: { id, deletedAt: { not: null } }, include: { scheme: true } });
      if (!c) throw new Error("Kategori tidak ditemukan atau sudah aktif");
      if (c.scheme.status !== "DRAFT") throw new Error(DRAFT_ONLY);
      await tx.scoreCategory.update({ where: { id }, data: restored });
      return `Kategori ${c.name} dipulihkan`;
    }
    case "institution_types": {
      const t = await tx.institutionType.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!t) throw new Error("Jenis peserta tidak ditemukan atau sudah aktif");
      await tx.institutionType.update({ where: { id }, data: { ...restored, isActive: true } });
      return `Jenis peserta ${t.name} dipulihkan`;
    }
    default:
      throw new Error("Data ini tidak bisa dipulihkan dari Riwayat");
  }
}
