-- Tahap 11 (M07). Dibuat `migrate dev --create-only`; 98 `DROP CONSTRAINT ..._by_fkey`
-- yang otomatis disertakan Prisma DIHAPUS manual (lihat peringatan CLAUDE.md).

-- FR-06.08: link bukti dukung per bagian ({ section_id: url }). ERD hanya punya
-- answers.evidence_url (per soal) — kolom ini menutup celah itu.
ALTER TABLE "submissions" ADD COLUMN "section_evidence" JSONB NOT NULL DEFAULT '{}';
