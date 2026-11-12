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

## Auth (Tahap 6, sudah diimplementasi & diuji)

- `src/lib/auth/`: `password.ts` (argon2id via `@node-rs/argon2` — dipilih daripada paket `argon2` klasik karena punya prebuilt binary untuk deploy Vercel, tidak butuh toolchain native), `passwordPolicy.ts` + `commonPasswords.ts` (pure, dipakai client DAN server — policy dibaca dinamis dari `app_settings`, bukan hardcode), `token.ts` (issue/peek/consume/findOwner — SHA-256, 24 jam, sekali pakai, revoke-on-reissue), `session.ts` (cookie `libcon_session`, HttpOnly/Secure/SameSite=Lax, TTL 8 jam admin / 24 jam peserta), `guard.ts` (`requireRole()` — otoritatif, Node runtime), `sessionCookie.ts` (konstanta nama cookie TANPA import lain, supaya aman dipakai dari Edge).
- `src/proxy.ts` (bukan `middleware.ts` — Next.js 16 me-rename konvensi ini jadi "Proxy", lihat `node_modules/next/dist/docs/.../proxy.md`): Edge runtime, **hanya** redirect cepat kalau cookie sesi tidak ada sama sekali. **Tidak bisa** dan tidak mencoba melakukan pengecekan peran yang sesungguhnya — Prisma Client dan `@node-rs/argon2` tidak jalan di Edge runtime. Pengecekan otoritatif selalu di `requireRole()` yang dipanggil dari `src/app/admin/layout.tsx` dan `src/app/portal/layout.tsx` (Node runtime, akses DB penuh) — konsisten dengan NFR "otorisasi dicek di setiap server action/route, tidak hanya middleware".
- Halaman publik `/login`, `/aktivasi/[token]`, `/lupa-password`, `/reset/[token]` pakai pola: Server Component (page.tsx) fetch data awal (policy, peek token) → Client Component form pakai `useActionState` (React 19) → server action di `actions.ts` kolokasi.
- Email dikirim lewat `src/lib/email/send.ts` (Resend) dengan template dari DB (`email_templates`, substitusi `{variabel}` sederhana). **Tanpa `RESEND_API_KEY`** (default dev kosong): email tidak benar-benar dikirim, hanya dicetak ke console dan `email_logs` ditandai SENT — supaya alur aktivasi/reset bisa diuji end-to-end tanpa akun Resend. Retry 3x dengan jeda bertahap (PRD §7) **belum diimplementasi** — butuh antrean background (Inngest/QStash) yang belum disetup; untuk sekarang kegagalan kirim langsung `FAILED` + `errorMessage`.
- **Enum `ActivityType.UNAUTHORIZED_ACCESS` ditambah** — tidak ada di ERD §09, tapi AC M04 ("peserta buka URL admin → 403 + activity_logs") butuh ini. Ditambah dengan migrasi `ALTER TYPE ... ADD VALUE` terpisah, SETELAH menghapus 98 baris `DROP CONSTRAINT` yang Prisma otomatis sertakan (lihat peringatan keras soal `migrate dev` di atas) — ini jadi bukti nyata pertama bahwa prosedur "create-only lalu bersihkan manual" benar-benar perlu dan berhasil dipakai.
- **Bug nyata yang ditemukan & diperbaiki saat Tahap 6** (ditemukan lewat e2e, bukan lewat tsc): Prisma extension di `client.ts` sempat menyuntik `createdBy` ke SEMUA model termasuk `AuditLog`/`ActivityLog` yang tidak punya kolom itu sama sekali → error runtime. Diperbaiki dengan daftar `NO_TRACKING_COLUMNS` yang dilewati extension.
- **Endpoint test-only** `src/app/api/test/fixtures/route.ts`: 404 kecuali `NODE_ENV === "development"`. Dibutuhkan karena generator Prisma `"prisma-client"` (ESM-only) tidak bisa di-import langsung di file spec Playwright (loader CJS Playwright tidak paham `import.meta`) — jadi Playwright membuat data uji lewat HTTP ke route ini, bukan import Prisma langsung. Jangan hapus guard `NODE_ENV` ini.
- e2e (`tests/e2e/auth.spec.ts`) menguji 3 AC inti M04: aktivasi→login sukses, lockout 5x gagal (AC FR-04.03), dan 403+activity_logs untuk peserta yang akses URL admin. Kalau menambah loop klik berurutan di test serupa, **tunggu tombol balik ke label idle sebelum klik berikutnya** — race condition pernah membuat sebagian klik tidak sampai ke server action (bug test, bukan bug aplikasi, tapi mahal untuk didiagnosis ulang).

## Master data & peserta (Tahap 7, sudah diimplementasi & diuji)

- Keputusan user: **NPSN selalu opsional** (8 digit jika diisi) — master jenis tidak menandai mana yang sekolah. **Wilayah tidak pernah dihapus**, hanya nonaktif/aktif. Jenis peserta boleh dihapus (soft) hanya jika belum dipakai lembaga (AC M02).
- Ubah email resmi lembaga → email akun utama ikut berubah + token aktivasi yang belum terpakai dicabut. Ubah NPP (Super Admin saja) → username akun utama = NPP, akun kedua = `NPP-2`.
- **Nonaktifkan lembaga** = `is_active=false` + `deleted_at/deleted_by`, sesi akun lembaga dihapus, **status akun tidak diubah** (supaya pulih seperti semula). Penolakan login lewat cek `institution.deletedAt` di `loginAction` dan `getSessionUser`.
- `PRD` minta email resmi unik, tapi ERD tidak punya `UNIQUE(official_email)` — dicek di aplikasi (case-insensitive, ke `institutions` dan `users`). Kalau mau dikunci DB, perlu migrasi.
- Pola server action panel admin: `requireRole([...])` → Zod → `runAsUser(user, () => ...)` (di `guard.ts`, memasang request context atas nama admin) → `withDb()`. Aksi sederhana memakai `<form action>` + `redirect(path?ok=|error=)` dan `FlashMessage`; form kompleks memakai `useActionState`. Tindakan berbahaya pakai `ConfirmAction` (konfirmasi di halaman, PRD §8).
- `sendActivation()` (`src/lib/auth/activation.ts`) = satu-satunya jalur terbitkan token + email ACTIVATION. Lembaga baru: email dikirim di transaksi **terpisah** dari pembuatan lembaga/akun, supaya lembaga tetap tersimpan kalau pengiriman gagal.
- e2e: Playwright `workers: 2` + `expect.timeout` 15 dtk — semua worker memukul satu `next dev` dan argon2 di setiap login; >2 worker membuat request 8+ dtk dan timeout. Locator alert pakai `p[role="alert"]` (Next punya route announcer ber-role alert). Masih ada flakiness jarang (1 dari ~6 run) karena beban mesin.
- Setup lokal di clone baru: `npm ci --legacy-peer-deps` (konflik peer `@types/node@^20` vs `vitest@5`), `.env` dari `.env.example`, Postgres lokal, `prisma migrate deploy` → `generate` → `db seed`, `npx playwright install chromium`, dan `npx next typegen` sebelum `typecheck` (tipe global `LayoutProps`).
- **DB lokal yang sebenarnya dipakai = PostgreSQL 18 native Windows** (`C:\Program Files\PostgreSQL\18`, layanan di `localhost:5432`, user `postgres`), BUKAN kontainer Docker `libcon-pg` — kontainer itu juga map port 5432 tapi kalah oleh layanan native, jadi kosong. Untuk query manual: `& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d libcon`.
- `next dev` di Windows kadang **tidak me-reload modul `src/lib` yang diubah** (HMR) — gejalanya e2e gagal dengan perilaku kode lama. Restart dev server sebelum menyimpulkan ada bug.

## Monitoring & reminder (Tahap 14, sudah diimplementasi & diuji)

- Tidak ada migrasi. `src/lib/monitoring.ts` (murni): tanggal WIB (`wibDate`, `startOfWibDay`, `wibDaysUntil`), `reminderDueToday`, `monitoringStatus` (satu status per lembaga: Belum Aktivasi / status kiriman / Tidak Mengisi bila draf lewat tenggat — BR-12 hanya untuk TAMPILAN, status DB tidak diubah), `stackCounts`, `csvCell` (cegah formula injection).
- Reminder (`src/lib/reminders.ts`, cron `/api/cron/reminders` harian 00.00 UTC = 07.00 WIB): DEADLINE = H-n sebelum tenggat berlaku per lembaga untuk status sasaran; ACTIVATION = n hari setelah akun dibuat, selalu dengan link aktivasi BARU; REVISION = H-n sebelum batas revisi. **FR-10.06**: template sama ke lembaga sama maks. sekali per hari WIB (cek `email_logs`) — berlaku juga untuk aksi massal. Jadwal default dipasang saat periode dibuat (`createDefaultSchedules`), ikut tersalin saat salin periode. `?now=` di route cron hanya aktif di development.
- Dashboard `/admin/dashboard` (`loadMonitoring` di `src/lib/monitoringData.ts`): kartu = filter, grafik batang CSS (tanpa Recharts), tabel Kecamatan > Jenis, aksi massal (reminder → `SEND_BULK_REMINDER` dengan jumlah penerima; kirim ulang aktivasi via `resendActivations` di `lib/auth/activation.ts`), ekspor CSV `/admin/dashboard/ekspor`. Timeline aktivitas di detail lembaga (FR-10.07).
- `next.config.ts` `devIndicators: false` — indikator "N" mode dev menutupi checkbox pojok kiri bawah. Playwright `actionTimeout: 30_000` supaya aksi macet gagal dengan pesan langkah, bukan timeout tes.
- Fixture `setup-open-survey` memasang SATU jadwal H-1 untuk Draf saja (jadwal default menyasar Belum Mengisi = ratusan lembaga uji lain di DB lokal).

## Mesin skoring (Tahap 13, sudah diimplementasi & diuji)

- Tidak ada migrasi. Mesin murni `src/lib/formula/scoring.ts` (`validateScheme`, `computeScores`, `normalize`, `rankBy`, `pickCategory`) — SATU-SATUNYA tempat skor dihitung. Rumus memakai whitelist mathjs yang sama dengan validasi (`analyzeExpression(..., FORMULA_FUNCTIONS)` + `evaluateNumber`); `MIN/MAX/IF/SUM/AVG/ROUND` gaya PRD dinormalisasi ke mathjs (`AVG`→`mean`, `IF`→`ifelse`).
- **Keputusan (tanpa juknis Q2):** jawaban kosong / bagi nol → nilai indikator 0 (rincian mencatat "tidak ada data"); min-max saat semua sama → 1; tabel ambang [min, max), baris terakhir boleh tanpa batas atas; OPTION_SCORE = rumus satu kode soal pilihan, pilihan ganda dijumlah; ranking kompetisi (1,1,3); indeks = normalized akar × `scale`, dibulatkan 2 desimal (AC: 0,865/0,858 → 86,01).
- Preset (`createPresetScheme`): Indeks Dasar ← Kepatuhan 0,30 / Kinerja 0,70 + 4 subdimensi tak terhubung + kategori dari `passing_score` periode — **sengaja belum bisa diaktifkan** sampai indikator diisi (juknis Q2).
- Skema DRAFT saja yang bisa diubah; ACTIVE/ARCHIVED terkunci → ubah lewat "versi baru" (`copyScheme`). Aktivasi mengarsipkan ACTIVE lain di periode & mengisi `score_node_variables`. Salin periode ikut menyalin skema ACTIVE (shortcut Tahap 9 sudah ditutup).
- Hitung resmi (`runOfficialScoring`, `src/lib/scoringRun.ts`): hanya skema ACTIVE, hanya kiriman VERIFIED (BR-13); `is_current` lama dimatikan untuk SEMUA kiriman periode lalu skor baru dibuat (kiriman yang batal diverifikasi tidak lagi punya skor berlaku). Uji rumus tidak menyimpan apa pun (tidak membuat `score_runs` TEST).
- Publikasi: `survey_periods.scores_published_*`; tarik dengan alasan → `scores_unpublished_*`; status publikasi = `scoresPublished()` (`submissionReview.ts`). Halaman "Skor Saya" peserta (PRD §5.11) **belum dibuat**.
- e2e skoring ada di `survei.spec.ts` (serial, butuh periode OPEN) — jangan buat spec terpisah yang juga membuat periode OPEN.

## Validasi & revisi (Tahap 12, sudah diimplementasi & diuji)

- **Kolom baru `validation_results.review_note`** (FR-08.04, tidak ada di ERD; migrasi `20261111012904_...`). Alasan batal verifikasi (FR-08.12) disimpan di `submissions.admin_note` + jejak `audit_logs` (tidak ada kolom khusus).
- `surveyMode` punya mode **`revision`**: NEEDS_REVISION + revisi OPEN + sebelum `deadline_at` (terlepas dari tanggal tutup periode). Autosave & kirim di server menolak soal yang tidak dibuka (`survey.revisionNotes`). Membuka revisi: `revision_round` naik, jawaban soal terbuka `is_locked=false`. Kirim ulang: revisi RESUBMITTED, flag OPEN lama → RESOLVED, flag yang sudah ACCEPTED untuk soal+aturan sama tidak dibuat ulang, snapshot putaran baru.
- Cron `/api/cron/period-status` juga memanggil `expireRevisions()` (`src/lib/revision.ts`): lewat batas → EXPIRED, kiriman kembali SUBMITTED, jawaban dikunci.
- Verifikasi hanya dari SUBMITTED; batal verifikasi hanya selama `scoresPublished(period)` false (`src/lib/submissionReview.ts`). Halaman detail mencatat `VIEW_SUBMISSION` di `activity_logs`.
- **Email**: `sendTemplateEmail` kini meng-escape semua variabel di body HTML (`htmlVariables`), baris baru → `<br>`. Jangan sisipkan HTML lewat variabel; pakai `\n`.
- Shared: `formatAnswer` (`src/lib/answerFormat.ts`), `decodeSubmissionAnswers` (`participantSurvey.ts`), `diffAnswers` (`answers.ts`, FR-08.10).

## Pengisian survei portal (Tahap 11, sudah diimplementasi & diuji)

- **Kolom baru `submissions.section_evidence jsonb`** (`{section_id: url}`) — link bukti dukung per bagian tidak punya tempat di ERD. Migrasi `20261110081809_...` (`--create-only`, 98 DROP dihapus).
- `src/lib/answers.ts`: codec jawaban ↔ kolom `answers` (`encodeAnswer` = validasi BENTUK saja; aturan isi dinilai mesin saat kirim), `parseIdNumber` (titik ribuan, koma desimal), `surveyMode` (countdown/editable/submitted/closed — penguncian Kirim memakai `effectiveClosesAt` per lembaga, bukan status periode), `pickPortalPeriod`, `evidenceKey`/`parseAnswerKey` (kunci `evidence:section|question:<id>`).
- `loadParticipantSurvey(institutionId)` + `checkSubmission(survey)` (`src/lib/participantSurvey.ts`) — SATU-SATUNYA jalur baca survei peserta & pemeriksaan kirim; server selalu menilai ulang dari DB. YOY_CHANGE memakai jawaban periode lalu lewat `questions.copied_from_id`.
- Autosave: debounce 1 dtk, satu request pada satu waktu, retry bertahap saat jaringan gagal, **flush saat unmount & `visibilitychange`** (navigasi Link tidak memicu `beforeunload` — bug ini ditemukan e2e). `answer_history.created_by` = akun pengubah (FR-05.07).
- Kirim: status SUBMITTED, `answers.is_locked`, `submission_snapshots`, Flag → `validation_results` + `open_flag_count`, email `SUBMISSION_RECEIPT` di luar transaksi. **Belum:** lampiran PDF tanda terima (FR-07.10, butuh @react-pdf), status NOT_SUBMITTED otomatis saat tenggat lewat (BR-12), alur NEEDS_REVISION (M08).
- e2e: project Playwright `global-periode` → `global-survei` (dependencies) karena state satu periode OPEN; spec lain di project `chromium` paralel. Fixture `setup-open-survey` mengarsipkan periode `E2E ` lama & menolak jika ada periode OPEN non-uji. Input terkontrol: `waitForLoadState("networkidle")` sebelum mengetik (ketikan sebelum hidrasi bisa ter-reset). Tunggu autosave baru lewat atribut `data-saved-at`, bukan teks "Tersimpan".

## Builder kuesioner (Tahap 10, sudah diimplementasi & diuji)

- Tidak ada migrasi skema; library baru dari tech stack: `@dnd-kit/core|sortable|utilities`, `mathjs`.
- **Bug Tahap 3 diperbaiki** (migrasi `20261110080000_audit_composite_pk`, SQL murni): trigger `audit_logs` mengambil `record_id` dari kolom `id`, padahal `question_institution_types`, `score_node_edges`, `score_node_variables` ber-PK komposit → INSERT ditolak. Sekarang fallback ke kolom PK dari `pg_index` digabung `:`. **Migrasi SQL murni dibuat manual** (folder bertimestamp + `migration.sql`), lalu `prisma migrate deploy`.
- **Mesin validasi** `src/lib/validation/engine.ts` (murni, klien & server) — SATU-SATUNYA tempat aturan dinilai; M07/M08 wajib memakainya, jangan menulis ulang. Jawaban dikunci per question id; soal tidak tampil/tidak berlaku tidak divalidasi; aturan yang datanya kosong = "tidak bisa dinilai" (bukan gagal). Link bukti dukung memakai kunci `evidence:section:<id>` / `evidence:question:<id>` (`evidenceKey()` di `survey-form.tsx`).
- **Ekspresi bebas**: mathjs + whitelist node AST (`analyzeExpression`), tanpa `eval`; `OR/AND/NOT` gaya ERD diterima; `==`/`!=` diberi signature teks (mathjs bawaan gagal untuk `jenis != 'SD'`). Variabel = kode soal + `jenis` (kode jenis lembaga, dicadangkan). Kode soal wajib diawali huruf.
- Setelah terbit, struktur terkunci di SERVER (`structureChanged`, bandingkan JSON berkunci terurut — jsonb mengubah urutan kunci): hanya teks bantuan soal, deskripsi & petunjuk bukti bagian, judul/petunjuk kuesioner, dan **pesan** aturan yang bisa diubah. Tidak ada batalkan terbit.
- `SurveyForm`/`AnswerInput` (`src/components/survey/`) + `loadSurveyDefinition()` disiapkan untuk dipakai ulang portal M07.
- Salin periode kini ikut menyalin kuesioner (Draf, `copied_from_id` diisi untuk YOY_CHANGE); skema skor masih `shortcut:` sampai M09.
- e2e: dnd-kit punya live region ber-role `status` → flash pakai `p[role="status"]`; uji drag keyboard tunggu `networkidle` (hidrasi) + `aria-pressed`. Nama periode uji kuesioner TIDAK berawalan `E2E ` (fixture periode mengarsipkannya) dan diberi sufiks acak (tes paralel).

## Periode survei (Tahap 9, sudah diimplementasi & diuji)

- **Kolom baru `survey_periods.passing_score DECIMAL(6,2) default 70`** (FR-02.08, tidak ada di ERD — disetujui user) + **partial unique index `survey_periods_single_open`** (FR-02.05). Migrasi `20261110040541_...` dibuat `--create-only`, 98 `DROP CONSTRAINT` dihapus manual, FK terverifikasi utuh. `app_settings.passing_score_threshold` global (seed) sekarang tidak dipakai periode.
- Menu Periode: Super Admin ubah, Admin lihat. Tanggal diinput WIB lewat `parseWibDateTime`/`toWibInputValue` di `src/lib/date.ts`. Transisi manual `MANUAL_TRANSITIONS` (CLOSED bisa dibuka lagi kalau tanggal tutup belum lewat; ARCHIVED final).
- Cron `/api/cron/period-status` (GET, `Authorization: Bearer $CRON_SECRET`, `vercel.json` tiap 5 menit — butuh Vercel Pro saat deploy). Perpanjangan **semua lembaga** menahan periode tetap OPEN; perpanjangan **khusus lembaga** tidak — M07 wajib mengunci tombol Kirim dengan `effectiveClosesAt(closesAt, extensions, institutionId)` dari `src/lib/period.ts`, bukan dengan `status`.
- **Salin periode baru menyalin pengaturan periode** — kuesioner/soal/aturan/skema skor WAJIB ditambahkan ke `copyPeriodAction` saat M06/M09 dibuat (ada komentar `shortcut:`).
- e2e periode `mode: "serial"` karena state global (satu OPEN); fixture `close-e2e-periods` mengarsipkan periode berawalan `E2E ` yang tersisa. Periode OPEN buatan manual (non-`E2E `) di DB lokal akan membuat tes ini gagal dengan pesan jelas.
- **Setelah `prisma generate`, restart `next dev`** — server yang sedang jalan memegang Prisma Client lama (`Unknown argument ...`).

## Keamanan akun & akun kedua (Tahap 8, sudah diimplementasi & diuji)

- **Batas percobaan (FR-04.09) dihitung per AKUN, bukan per IP** — keputusan user, menyimpang dari teks PRD (perlu diperbarui di PRD): 10 percobaan gagal dalam 3 menit (termasuk saat terkunci, dihitung dari `login_attempts`) → kunci 1 jam; 50 salah password sejak login berhasil terakhir (`users.failed_login_count`) → blokir dengan pesan "Hubungi admin", dibuka admin lewat "Buka blokir" (reset ke 0). Lupa password maks. 5 permintaan per akun per jam (hitung `auth_tokens` PASSWORD_RESET `created_by = SYSTEM`; reset oleh admin tidak dihitung), respons tetap sama. Angka di `app_settings.lockout_policy`, default `DEFAULT_LOCKOUT_POLICY` (di-merge, baris lama tanpa field baru tetap jalan). Kunci 5x/15 menit lama tetap berlaku. Tidak ada tabel baru.
- **Sesi (FR-04.05)**: `expires_at` diperpanjang di `getSessionUser` (paling sering tiap 15 menit). Cookie sesi **tanpa `maxAge`** — tidak bisa diperpanjang dari Server Component; masa berlaku otoritatif hanya di DB.
- Email aktivasi/reset dikirim ke **`users.email`** (akun utama = email resmi lembaga, akun kedua = email pengisi kedua).
- AC M05 "ditolak 409": server action tidak punya kode HTTP → ditolak dengan pesan error setara (disetujui user; teks AC perlu diperbarui).
- Ditunda: FR-05.07 (riwayat jawaban per akun, bersama M07), FR-05.08 (P1, minta admin nonaktifkan akun kedua — belum ada tabel/alur). Reset/nonaktif/blokir akun **admin** (bukan peserta) belum ada UI — menunggu menu Pengaturan > Admin.

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
