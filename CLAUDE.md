# LibCon — CLAUDE.md

Dibaca di setiap sesi. Sumber kebenaran produk: `docs/PRD.md` > `docs/ERD.md` > `docs/flowchart.md` (urutan prioritas jika bertentangan). Jangan ubah isi `docs/` tanpa izin eksplisit.

## Ringkasan proyek

LibCon (Library Contest) adalah aplikasi web milik satu Perpustakaan Kota untuk mendaftarkan lembaga (SD/SMP/TBM/jenis lain), mengelola aktivasi akun, menyusun kuesioner, mengisi & memvalidasi survei, menghitung skor dengan rumus yang diatur admin (graf node, bukan hardcode), dan menghasilkan report/ekspor — sebagai dasar seleksi Lomba Perpustakaan Terbaik tingkat nasional.

## Peran pengguna

| Peran | Login | Akses |
| --- | --- | --- |
| Super Admin | email + password | Semua fitur termasuk rumus skor, publikasi skor, user admin, template email, log |
| Admin | email + password | Peserta, kuesioner, verifikasi, monitoring, report. Rumus read-only |
| Peserta (lembaga) | NPP / NPP-2 + password | Hanya survei, skor, profil, akun miliknya sendiri |
| SYSTEM | tidak bisa login | Pelaku aksi otomatis (cron/trigger/impor) di log |

Otorisasi: **selalu** cek peran DAN kepemilikan lembaga (institution_id) di setiap server action/route — jangan hanya sembunyikan menu di UI.

## ⚠️ PERINGATAN KERAS: jangan jalankan `prisma migrate dev` biasa di DB yang sudah ada migrasi SQL manual

Karena 98 FK `*_by → users.id` (dan semua trigger/CHECK/partial-index Tahap 3) ditambahkan lewat SQL mentah — bukan relasi Prisma — `prisma migrate dev` akan **selalu** mendeteksinya sebagai "drift" dan menawarkan migrasi baru yang **men-drop semua 98 FK itu**. Ini sudah terjadi & terverifikasi saat Tahap 5: `prisma migrate dev` sukses apply dua migrasi, lalu nyangkut nanya "Enter a name for the new migration" — isinya 98 `DROP CONSTRAINT ..._by_fkey`. JANGAN PERNAH terima/apply migrasi semacam itu.

**Aturan wajib mulai sekarang:**
- Untuk **menerapkan** migrasi yang sudah ada (deploy ke DB manapun, termasuk setup dev awal): pakai `npx prisma migrate deploy`, BUKAN `prisma migrate dev`. `migrate deploy` hanya menjalankan file migrasi yang belum diterapkan, tanpa drift-check/prompt apa pun.
- Untuk **membuat migrasi baru** (menambah tabel/kolom di fase mendatang): pakai `npx prisma migrate dev --create-only --name <nama>`, lalu **baca migration.sql yang dihasilkan** — kalau ada baris `DROP CONSTRAINT` atau `DROP TRIGGER` yang menyentuh objek Tahap 3 (nama berakhiran `_by_fkey`, `_audit_trigger`, `users_max_participant_accounts`, dll.), **hapus baris itu manual** sebelum apply. Terapkan hasil akhirnya dengan `prisma migrate deploy`, jangan lanjutkan `prisma migrate dev` secara interaktif.
- Prisma Client tetap digenerate normal (`prisma generate`), itu tidak tersentuh masalah ini.

## Keputusan desain schema (Tahap 2, sudah diimplementasi)

- **Versi stabil dipin secara eksplisit**: `create-next-app`/`shadcn` menginstal Next.js 16 dengan `cacheComponents: true` secara default (model caching baru yang mewajibkan `use cache`/`Suspense` di setiap pembacaan sesi) — ini dimatikan di `next.config.ts` karena LibCon adalah aplikasi internal ber-auth penuh, bukan aplikasi dengan traffic publik yang perlu caching granular. Begitu juga `prisma` sempat terinstal sebagai `8.0.0-rc.33` (CLI baru berorientasi platform cloud Prisma sendiri) — dipin ulang ke `6.19.3` (ORM klasik, cocok untuk Supabase self-hosted).
- **Kolom tracking (`created_by/updated_by/deleted_by`) adalah UUID polos tanpa relasi Prisma.** Jika semua kolom `*_by` di 44 tabel dimodelkan sebagai relasi Prisma penuh ke `User`, model `User` akan punya ratusan field balik (`createdInstitutions`, `createdQuestions`, dst.) — tidak praktis dan ERD sendiri menyebut "garisnya tidak digambar [di diagram] supaya tetap terbaca". FK sesungguhnya ke `users.id` akan ditambahkan lewat `ALTER TABLE ... ADD CONSTRAINT` di migrasi SQL Tahap 3, bukan lewat skema Prisma. FK aktor yang bermakna bisnis (`verified_by`, `requested_by`, `published_by`, `triggered_by`, `uploaded_by`, dll.) tetap relasi Prisma penuh karena akan di-query/ditampilkan di UI.
- **Constraint yang tidak bisa diekspresikan Prisma schema** (partial unique index, CHECK constraint lintas kolom) ditandai komentar `// TODO(migrasi-sql):` di `schema.prisma` dan dikerjakan di Tahap 3: partial unique `auth_tokens(user_id, type) WHERE used_at IS NULL`, `revision_requests(submission_id) WHERE status='OPEN'`, `scoring_schemes(period_id) WHERE status='ACTIVE'`, `submission_scores(submission_id) WHERE is_current`, `users(institution_id) WHERE is_primary`; CHECK `score_node_edges(parent_node_id <> child_node_id)`; CHECK `users.role='PARTICIPANT' = (institution_id IS NOT NULL)`.
- **Migrasi awal sudah diverifikasi** terhadap Postgres 16 asli (kontainer Docker sementara, dibuang setelah tes) — menghasilkan tepat 44 tabel aplikasi, lolos `prisma validate`, `prisma generate`, dan `prisma migrate dev`. Artefak `prisma/migrations/<timestamp>_init/migration.sql` sudah ada di repo dan siap dijalankan ke Supabase.
- Dua enum inline yang tidak dikatalogkan di ERD §09 (`import_jobs.type`, `reminder_schedules.kind`) ditambahkan sebagai `ImportJobType` dan `ReminderKind` — kecil, tidak mengubah hitungan 44 tabel.
- `audit_logs.record_id` bertipe `text`, bukan `uuid` — tiga tabel riwayat (`login_attempts`, `answer_history`, `submission_snapshots`) pakai PK `bigint` dan `app_settings` pakai PK teks (`key`), tidak bisa masuk kolom `uuid`.

## Seed data (Tahap 5, sudah diimplementasi & diuji)

- `prisma/seed.ts`, dijalankan via `tsx` (`npx prisma db seed`, dikonfigurasi di `prisma.config.ts` → `migrations.seed`). Idempotent (pakai `upsert` di semua langkah) — aman dijalankan berkali-kali, sudah diuji jalan 2× berturut-turut tanpa duplikat/error.
- Isi: user SYSTEM (id tetap `SYSTEM_USER_ID`, self-referential `created_by`), 1 Super Admin (`PENDING_ACTIVATION`, tanpa password — aktivasi lewat token asli di Tahap 6, **tidak ada password hardcoded**), wilayah contoh Kota Pontianak → Pontianak Kota → Benua Melayu Laut, jenis peserta SD/SMP/TBM, 11 template email (semua `EmailTemplateKey`, isi placeholder sederhana — konten final diatur admin lewat menu Pengaturan nanti), `app_settings` (password_policy, lockout_policy, passing_score_threshold = 70).
- Email Super Admin lewat `SEED_SUPER_ADMIN_EMAIL` (default `superadmin@libcon.local`) — set env var ini sebelum seed production.
- **Diuji end-to-end** terhadap Postgres 16 asli: seed berjalan lewat `withDb()`/`runWithRequestContext()` yang sesungguhnya (bukan shortcut), dan `audit_logs` terkonfirmasi mencatat semua INSERT seed dengan `actor_user_id`/`actor_role` = SYSTEM yang benar — ini juga jadi pembuktian pertama bahwa pipeline Tahap 4 (`SET LOCAL` → trigger) bekerja sungguhan, bukan cuma lolos `tsc`.

## Keputusan desain migrasi SQL (Tahap 3, sudah diimplementasi & diuji)

- **Trigger `audit_logs`** dipasang di 39 dari 44 tabel — dikecualikan: `audit_logs`/`activity_logs` (log itu sendiri, akan infinite-loop), dan `login_attempts`/`answer_history`/`submission_snapshots` (PK `bigint`, append-only, sudah punya riwayatnya sendiri by design). Fungsi generik `audit_log_trigger()` membedakan `SOFT_DELETE`/`RESTORE` dari `UPDATE` biasa dengan membandingkan `deleted_at` sebelum/sesudah.
- **Aktor & peran diambil dari `SET LOCAL app.user_id`** (di-set per transaksi, lihat Tahap 4) — fungsi trigger melakukan `SELECT role FROM users WHERE id = ...` untuk `actor_role`, fallback ke `SYSTEM` jika `app.user_id` tidak di-set.
- **Role Postgres `libcon_app`** dibuat tanpa password di migrasi (jangan commit secret). **Penting untuk deployment:** `REVOKE UPDATE, DELETE` pada tabel log hanya bermakna jika aplikasi production benar-benar connect sebagai `libcon_app`, bukan sebagai superuser `postgres` Supabase (superuser selalu bisa bypass GRANT/REVOKE). Set password lewat `ALTER ROLE libcon_app WITH PASSWORD '...'` manual per environment, lalu pakai kredensial itu di `DATABASE_URL` production/preview.
- **Sudah diuji fungsional** terhadap Postgres 16 asli (kontainer Docker sementara): trigger audit tercatat benar untuk INSERT, trigger batas 2 akun peserta menolak akun ke-3, CHECK constraint `users` menolak admin dengan `institution_id`, partial unique index menolak akun utama kedua, dan `libcon_app` terkonfirmasi hanya punya SELECT/INSERT (tanpa UPDATE/DELETE) di `audit_logs`/`activity_logs`.

## Tech stack (keputusan tetap — jangan tambah library besar tanpa izin)

- Next.js App Router + TypeScript strict + Tailwind CSS + shadcn/ui
- React Hook Form + Zod (skema sama di klien & server)
- PostgreSQL + Prisma; migrasi SQL tambahan untuk trigger, RLS, partisi log
- Auth custom: sesi di DB, password argon2id, token hash SHA-256 (tidak ada auth pihak ketiga)
- Evaluasi rumus: mathjs dengan scope terbatas — **tidak pernah `eval`**
- Email: Resend + React Email
- Deploy: Vercel; Vercel Cron untuk reminder & transisi status periode
- Testing: Vitest (unit), Playwright (e2e)
- TanStack Table, Recharts, dnd-kit, ExcelJS, @react-pdf/renderer (dipakai mulai fase yang relevan)

## Struktur folder (usulan)

```
libcon/
  prisma/
    schema.prisma
    migrations/          # migrasi Prisma + migrasi SQL manual (trigger, RLS, grant)
    seed.ts
  src/
    app/
      (public)/
        login/
        aktivasi/[token]/
        lupa-password/
        reset/[token]/
      admin/            # panel admin, dilindungi middleware role ADMIN/SUPER_ADMIN
        dashboard/
        peserta/
        permintaan-akun/
        periode/
        kuesioner/
        verifikasi/
        skoring/
        report/
        log-aktivitas/
        pengaturan/
      portal/           # portal peserta, dilindungi middleware role PARTICIPANT
        beranda/
        survei/
        skor-saya/
        profil/
        akun/
      api/
        cron/           # endpoint dipanggil Vercel Cron
    lib/
      auth/             # session, password policy, token
      db/               # prisma client, extension *_by, SET LOCAL app.*
      validation/       # skema Zod bersama, mesin aturan validasi soal
      formula/          # parser rumus aman (mathjs scope terbatas), evaluator graf node
      email/            # kirim email, render template
      rbac.ts           # helper cek peran + kepemilikan lembaga
    components/
      ui/               # shadcn
    types/
  tests/
    unit/
    e2e/
  docs/                 # jangan diubah tanpa izin
  CLAUDE.md
```

Server action diletakkan colocated per route (`actions.ts` di sebelah `page.tsx`), memanggil logic bersama dari `src/lib`.

## Konvensi

- **Nama tabel & kolom DB**: `snake_case` (sesuai ERD).
- **Kode TypeScript**: `camelCase` untuk variabel/fungsi, `PascalCase` untuk tipe/komponen. Prisma Client otomatis map ke camelCase di JS meski kolom DB snake_case — jangan ubah nama kolom DB demi gaya TS.
- **Kode variabel soal** (`questions.code`): huruf kecil + underscore, mis. `j_eksemplar_cetak`. Tidak bisa diubah setelah kuesioner terbit (BR-17).
- **Server action**: validasi Zod dulu → cek sesi & peran → cek kepemilikan institution_id → panggil `withDb(async (tx) => { ... })` dari `src/lib/db/withDb.ts` untuk SEMUA operasi tulis. Tidak pernah percaya `institution_id` dari client tanpa verifikasi ulang dari sesi.
  - `withDb()` membuka transaksi dan memasang `SET LOCAL app.user_id/app.request_id/app.ip/app.user_agent/app.source` (dibaca trigger `audit_logs`).
  - `created_by` tetap **wajib diisi manual** di setiap `create`/`upsert.create` (`createdBy: ctx.userId`, dari `getRequestContext()`) — TypeScript memaksa ini karena kolomnya NOT NULL tanpa default DB. Prisma extension di `src/lib/db/client.ts` lalu **menimpa ulang** nilai itu dari context yang sama (jaring pengaman: mencegah actor id yang salah/dipalsukan, bukan cara menghindari mengisinya). `updatedBy`/`deletedBy` nullable, jadi boleh diisi manual atau dibiarkan — extension tetap mengisi dari context kalau kosong.
  - `prisma` (client biasa, tanpa transaksi) hanya untuk **baca**. Jangan panggil `prisma.<model>.create/update/upsert` langsung di luar `withDb()` — baris di tabel akan tetap benar (extension tetap jalan) tapi `audit_logs` akan kehilangan atribusi aktor (`app.user_id` tidak ter-set).
  - Setiap entry point (server action, route handler, cron job) wajib membungkus dirinya dengan `runWithRequestContext(ctx, () => { ... })` dari `src/lib/db/requestContext.ts` sebelum memanggil `withDb()` — kalau tidak, `withDb()`/extension akan throw (disengaja, mencegah `created_by` kosong per FR-13.02). Cron/impor pakai `ctx.userId = SYSTEM_USER_ID` (`src/lib/auth/constants.ts`) dan `source: "CRON"/"IMPORT"`.
- **Error handling**: validasi di server selalu (client-side hanya UX). Pesan error ke peserta harus jelas dan actionable (lihat Prinsip UX PRD §8). Jangan menelan error diam-diam — log ke Sentry + pesan generik ke user untuk error tak terduga.
- **Format tanggal**: simpan `timestamptz` UTC di DB, selalu format/tampilkan ke WIB di UI. Pakai satu util terpusat (`src/lib/date.ts`), jangan format tanggal ad-hoc di banyak tempat.
- **Format angka**: tampilan Indonesia (pemisah ribuan titik, desimal koma, mis. `1.234,56`). Pakai `Intl.NumberFormat('id-ID')`.
- **Soft delete**: tabel master/transaksi inti tidak pernah hard delete — set `deleted_at/deleted_by`. Query default selalu filter `deleted_at IS NULL` kecuali di tab Riwayat/Log Aktivitas.
- **Bahasa**: teks UI Bahasa Indonesia sederhana. Kode, nama variabel/tabel/fungsi dalam Bahasa Inggris.

## Aturan wajib

1. Rencana dulu, kode kemudian. Tunjukkan rencana singkat & minta persetujuan untuk perubahan yang menyentuh skema DB, auth, atau >5 file.
2. Jangan mengarang rumus/aturan/field yang tidak ada di dokumen — tanya dulu. Pertanyaan terbuka diketahui: PRD §12 (Q1–Q8).
3. Keamanan bukan opsional: cek peran DAN kepemilikan lembaga di setiap server action & route API. Tidak ada password/token plaintext. Tidak ada `eval` untuk rumus.
4. Semua perubahan data terlacak: kolom `*_by` selalu terisi (aksi otomatis atas nama user SYSTEM). Tidak ada hapus permanen data inti.
5. Setiap fitur disertai test: unit test untuk logika (validasi, skoring, password, token), minimal satu e2e untuk alur utama.
6. Commit/deskripsi tes merujuk kode FR/BR/AC PRD, contoh: `feat(auth): aktivasi akun 24 jam [FR-03.03, BR-03]`.
7. Kerjakan bertahap, commit kecil. Jalankan lint + typecheck + test sebelum menyatakan satu tahap selesai.
8. Jika menemukan kesalahan/kekurangan di dokumen, laporkan + usulkan perbaikan. Jangan ubah `docs/` sendiri.
9. Akhir sesi: ringkas apa yang selesai/belum, keputusan yang diambil, langkah berikutnya. Perbarui file ini jika ada konvensi baru.

## Keputusan yang sudah diambil (Fase 1, disetujui user)

- `user_role` punya nilai `SYSTEM` eksplisit; 1 baris `users` nyata dibuat saat seed untuk SYSTEM (`institution_id = NULL`, tidak bisa login, dipakai sebagai `created_by` default untuk aksi cron/trigger/impor).
- `evidence_files` dimigrasikan penuh di Fase 1 (idle, tanpa UI upload) supaya skema 44 tabel utuh dari awal.
- NPP **wajib untuk semua jenis peserta**, tetap `UNIQUE NOT NULL` sesuai ERD. Tidak ada kebijakan NPP sementara/placeholder di MVP ini.
- Penyedia PostgreSQL development: **Supabase**.
- `survey_periods` ditambah kolom `scores_unpublished_at`, `scores_unpublished_by`, `scores_unpublish_reason` untuk mencatat penarikan publikasi skor (FR-09.11), simetris dengan `scores_published_at/by`.
- `institution_change_requests`: tabelnya tetap dimigrasikan (bagian dari 44 tabel ERD), tapi UI/server action "ajukan koreksi profil" ditunda — bukan bagian Tahap 7 Fase 1.
- Enum `IMPERSONATE_VIEW` di `activity_type` tetap ada di schema (mengikuti ERD resmi) tapi **tidak diimplementasi** di Fase 1 — tidak ada server action yang memakainya sampai ada FR resmi.
- `survey_periods` ditambah kolom `show_ranking_to_participants boolean default false` untuk mendukung FR-12.03 (ranking ditampilkan/disembunyikan sesuai pengaturan periode) — additive, konsisten dengan pola kolom pengaturan periode yang sudah ada (`revision_scope`, dll).

## Pertanyaan PRD §12 yang masih terbuka (tidak menghalangi Fase 1)

Q1 (template bukti dukung), Q2 (rumus resmi indikator→subdimensi), Q3 (arti kolom `Indeks_Final`), Q6 (domain email pengirim resmi), Q8 (target metrik keberhasilan) — ini memengaruhi Fase 3 (Kuesioner) dan Fase 5 (Skoring), bukan Fase 1 Fondasi. Akan ditanyakan ulang saat fase terkait dimulai.

## Perintah penting

Akan diisi begitu proyek Next.js dibuat di Fase 1 (belum ada `package.json` saat file ini ditulis):

```
npm run dev                                    # jalankan dev server
npm run lint                                    # ESLint
npm run typecheck                                # tsc --noEmit
npm run format                                    # Prettier --write
npm run test                                       # Vitest (sekali jalan)
npm run test:watch                                  # Vitest watch mode
npm run test:e2e                                     # Playwright
npx prisma validate                                   # cek schema.prisma valid
npx prisma format                                      # rapikan schema.prisma
npx prisma generate                                     # generate Prisma Client ke src/generated/prisma
npx prisma migrate deploy                                # terapkan migrasi yang SUDAH ADA ke DB manapun — AMAN, tidak drift-check
npx prisma migrate dev --create-only --name <nama>         # buat migrasi baru dari perubahan schema.prisma — JANGAN lanjut apply otomatis, baca dulu (lihat peringatan di atas)
npx prisma db seed                                           # jalankan seed.ts (ditulis di Tahap 5)
```

**Jangan pernah jalankan `npx prisma migrate dev` tanpa `--create-only`** di proyek ini — lihat peringatan keras di atas.
