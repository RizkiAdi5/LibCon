-- Rekap pengunjung bulanan + akun peserta dibuat admin (email + password), profil dilengkapi peserta.
-- Dibuat dengan `migrate dev --create-only`; 113 DROP CONSTRAINT *_by_fkey dan drop/add
-- institutions_region_id_fkey (Prisma ingin ON DELETE SET NULL) dihapus manual — FK lama tetap.

-- AlterTable
ALTER TABLE "institutions" ADD COLUMN     "profile_completed_at" TIMESTAMP(3),
ALTER COLUMN "npp" DROP NOT NULL,
ALTER COLUMN "region_id" DROP NOT NULL,
ALTER COLUMN "address" DROP NOT NULL,
ALTER COLUMN "pic_name" DROP NOT NULL;

-- Lembaga lama dibuat admin dengan data lengkap → profilnya dianggap sudah lengkap.
UPDATE "institutions" SET "profile_completed_at" = "created_at";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "visitor_reports" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "male" INTEGER NOT NULL,
    "female" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "visitor_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "visitor_reports_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "visitor_reports_counts_check" CHECK ("male" >= 0 AND "female" >= 0)
);

-- CreateIndex
CREATE INDEX "visitor_reports_year_month_idx" ON "visitor_reports"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_reports_institution_id_year_month_key" ON "visitor_reports"("institution_id", "year", "month");

-- AddForeignKey
ALTER TABLE "visitor_reports" ADD CONSTRAINT "visitor_reports_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Kolom tracking → users.id (pola Tahap 3, bukan relasi Prisma)
ALTER TABLE "visitor_reports" ADD CONSTRAINT "visitor_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "visitor_reports" ADD CONSTRAINT "visitor_reports_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id");

-- Jejak perubahan (FR-13.x) lewat trigger audit generik Tahap 3
CREATE TRIGGER "visitor_reports_audit_trigger" AFTER INSERT OR UPDATE OR DELETE ON "visitor_reports"
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
