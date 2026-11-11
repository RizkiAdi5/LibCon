-- Tahap 12 (M08). Dibuat `migrate dev --create-only`; 98 `DROP CONSTRAINT ..._by_fkey`
-- yang otomatis disertakan Prisma DIHAPUS manual (lihat peringatan CLAUDE.md).

-- FR-08.04: catatan opsional saat admin menandai flag Diterima. Tidak ada di ERD.
ALTER TABLE "validation_results" ADD COLUMN "review_note" TEXT;
