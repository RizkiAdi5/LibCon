-- Tahap 9 (M02 Periode). Dibuat dengan `migrate dev --create-only`, lalu 98 baris
-- `DROP CONSTRAINT ..._by_fkey` yang otomatis disertakan Prisma DIHAPUS manual
-- (FK Tahap 3 bukan relasi Prisma — lihat peringatan di CLAUDE.md).

-- FR-02.08: batas lolos per periode (default 70). Tidak ada di ERD, disetujui user.
ALTER TABLE "survey_periods" ADD COLUMN "passing_score" DECIMAL(6,2) NOT NULL DEFAULT 70;

-- FR-02.05: hanya satu periode berstatus OPEN dalam satu waktu (aman dari balapan dua admin)
CREATE UNIQUE INDEX survey_periods_single_open
  ON survey_periods (status)
  WHERE status = 'OPEN' AND deleted_at IS NULL;
