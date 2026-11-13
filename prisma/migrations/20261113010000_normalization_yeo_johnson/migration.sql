-- Q2 (jawaban Perpusnas via user, 2026-11-13): nilai IPLM memakai transformasi Yeo-Johnson
-- lalu normalisasi. Tambah jenis normalisasi baru; tidak ada di ERD §09. Migrasi SQL murni.
ALTER TYPE "NormalizationType" ADD VALUE IF NOT EXISTS 'YEO_JOHNSON';
