-- Pendaftaran mandiri lembaga (di luar PRD/ERD, permintaan user — lihat CLAUDE.md).
-- Dibuat dengan `migrate dev --create-only`; 98 DROP CONSTRAINT *_by_fkey dihapus manual — FK lama tetap.

-- CreateTable
CREATE TABLE "institution_registration_requests" (
    "id" UUID NOT NULL,
    "institution_name" TEXT NOT NULL,
    "type_id" UUID NOT NULL,
    "official_email" TEXT NOT NULL,
    "pic_name" TEXT NOT NULL,
    "whatsapp" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_institution_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "institution_registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institution_registration_requests_created_institution_id_key" ON "institution_registration_requests"("created_institution_id");

-- AddForeignKey
ALTER TABLE "institution_registration_requests" ADD CONSTRAINT "institution_registration_requests_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "institution_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_registration_requests" ADD CONSTRAINT "institution_registration_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_registration_requests" ADD CONSTRAINT "institution_registration_requests_created_institution_id_fkey" FOREIGN KEY ("created_institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Kolom tracking → users.id (pola Tahap 3, bukan relasi Prisma)
ALTER TABLE "institution_registration_requests" ADD CONSTRAINT "institution_registration_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "institution_registration_requests" ADD CONSTRAINT "institution_registration_requests_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id");

-- Jejak perubahan (FR-13.x) lewat trigger audit generik Tahap 3
CREATE TRIGGER "institution_registration_requests_audit_trigger" AFTER INSERT OR UPDATE OR DELETE ON "institution_registration_requests"
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
