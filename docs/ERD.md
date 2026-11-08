PostgreSQL · Next.js · Vercel

# ERD sistem LibCon

Desain database untuk semua modul di flowchart: lembaga dan wilayah, akun peserta, kuesioner dengan aturan validasi, pengisian dan revisi, mesin skoring yang rumusnya diatur admin, email, report, dan audit.

**44** tabel

**7** domain

**29** enum

## 00 Konvensi

#### Kolom tracking di setiap tabel

| Grup | Kolom |
| --- | --- |
| Master & konfigurasi | `created_at/by` `updated_at/by` `deleted_at/by` |
| Transaksi | `created_at/by` `updated_at/by` |
| Log & riwayat | `created_at/by` (tidak bisa diubah) |

- Semua kolom `*_by` mengarah ke `users.id`. Garisnya tidak digambar supaya diagram tetap terbaca
- Aksi otomatis (cron, trigger, impor) tercatat atas nama user khusus **SYSTEM**, jadi tidak ada kolom `*_by` yang kosong
- `id uuid` PK, kecuali tabel log yang memakai `bigserial` supaya cepat
- Waktu disimpan dalam UTC dan ditampilkan dalam WIB

#### Prinsip desain

- **Per periode**: kuesioner, rumus, dan jawaban terikat ke periode. Menyalin periode berarti menduplikasi baris, tidak mereferensi baris lama
- **Tidak ada hapus permanen** untuk data inti; pakai `is_active` / `deleted_at`
- **Token disimpan sebagai hash**, tidak pernah plaintext
- **Jejak lengkap**: riwayat jawaban, snapshot tiap kirim, versi rumus, audit log

Legenda diagram: `PK` primary key, `FK` foreign key, `UK` unik. Garis `||--o{` berarti satu ke banyak, `|o--o{` berarti relasinya opsional.

## 01 Peta domain

Hubungan antardomain. Tabel **submissions** adalah pusatnya: satu baris per lembaga per periode.

```mermaid
flowchart LR
  subgraph M["Master & lembaga"]
    regions; institution_types; institutions; institution_change_requests
  end
  subgraph A["Akun & autentikasi"]
    users; auth_tokens; sessions; login_attempts; account_requests
  end
  subgraph Q["Periode & kuesioner"]
    survey_periods; period_extensions; questionnaires; sections; questions; question_options; question_institution_types; question_conditions; validation_rules
  end
  subgraph S["Pengisian & revisi"]
    submissions; answers; answer_history; submission_snapshots; validation_results; revision_requests; revision_request_items; evidence_files
  end
  subgraph K["Skoring"]
    scoring_schemes; score_nodes; score_node_edges; score_node_variables; score_node_type_overrides; score_categories; score_runs; submission_scores; submission_score_details
  end
  subgraph N["Email & reminder"]
    email_templates; reminder_schedules; email_logs
  end
  subgraph Y["Report, impor, sistem"]
    saved_report_filters; import_jobs; import_job_rows; audit_logs; activity_logs; app_settings
  end
  institutions --> users
  institutions --> submissions
  survey_periods --> submissions
  questions --> answers
  submissions --> submission_scores
  scoring_schemes --> submission_scores
  questions --> score_node_variables
  survey_periods --> reminder_schedules
  
```

## 02 Master data & lembaga

Wilayah memakai satu tabel bertingkat (kota → kecamatan → kelurahan). Lembaga ditautkan ke kelurahan, jadi kecamatan didapat dari parent-nya. Jenis peserta bisa ditambah admin.

```mermaid
erDiagram
  regions ||--o{ regions : "induk dari"
  regions ||--o{ institutions : "lokasi"
  institution_types ||--o{ institutions : "jenis"
  institutions ||--o{ institution_change_requests : "koreksi profil"
  users ||--o{ institution_change_requests : "mengajukan"

  regions {
    uuid id PK
    uuid parent_id FK "null untuk kota"
    enum level "CITY, DISTRICT, VILLAGE"
    string code UK "kode Kemendagri"
    string name
    boolean is_active
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  institution_types {
    uuid id PK
    string code UK "SD, SMP, TBM"
    string name
    text description
    int sort_order
    boolean is_active
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  institutions {
    uuid id PK
    string npp UK "Nomor Pokok Perpustakaan"
    string npsn "nullable, untuk sekolah"
    string library_name "nm_perpustakaan"
    string institution_name "nm_instansi_lembaga"
    uuid type_id FK
    uuid region_id FK "kelurahan"
    text address
    string official_email "email resmi"
    string whatsapp
    string head_name "kepala lembaga"
    string pic_name "penanggung jawab"
    boolean is_active
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  institution_change_requests {
    uuid id PK
    uuid institution_id FK
    uuid requested_by FK
    jsonb changes "field: lama, baru"
    text reason
    enum status "PENDING, APPROVED, REJECTED"
    uuid reviewed_by FK
    timestamptz reviewed_at
    text review_note
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  
```

## 03 Akun & autentikasi

Admin dan peserta disimpan di satu tabel `users` dan dibedakan oleh `role`. Untuk peserta `username` = NPP (akun kedua `NPP-2`); untuk admin username = email. Token aktivasi dan reset ada di satu tabel.

```mermaid
erDiagram
  institutions |o--o{ users : "maks 2 akun peserta"
  users ||--o{ auth_tokens : "aktivasi / reset"
  users ||--o{ sessions : "login aktif"
  users |o--o{ login_attempts : "percobaan"
  institutions ||--o{ account_requests : "minta akun ke-2"
  users ||--o{ account_requests : "diajukan oleh"
  account_requests |o--o| users : "menghasilkan akun"

  users {
    uuid id PK
    enum role "SUPER_ADMIN, ADMIN, PARTICIPANT"
    uuid institution_id FK "null untuk admin"
    string username UK "NPP / NPP-2 / email"
    string email UK
    string full_name "nama pengisi"
    string password_hash "argon2id, null sebelum aktivasi"
    enum status "PENDING_ACTIVATION, ACTIVE, DISABLED"
    boolean is_primary "akun utama lembaga"
    int failed_login_count
    timestamptz locked_until
    timestamptz activated_at
    timestamptz last_login_at
    timestamptz password_changed_at
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  auth_tokens {
    uuid id PK
    uuid user_id FK
    enum type "ACTIVATION, PASSWORD_RESET"
    string token_hash UK "sha256"
    timestamptz expires_at "now + 24 jam"
    timestamptz used_at
    timestamptz revoked_at "token lama dicabut saat kirim ulang"
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  sessions {
    uuid id PK
    uuid user_id FK
    string session_token_hash UK
    timestamptz expires_at
    string ip_address
    text user_agent
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  login_attempts {
    uuid id PK
    string username_input
    uuid user_id FK "null jika tidak dikenal"
    boolean success
    string ip_address
    text user_agent
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
  }
  account_requests {
    uuid id PK
    uuid institution_id FK
    uuid requested_by FK
    string full_name
    string email
    text reason
    enum status "PENDING, APPROVED, REJECTED"
    uuid reviewed_by FK
    timestamptz reviewed_at
    text reject_reason
    uuid created_user_id FK "akun yang dibuat"
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  
```

Batas 2 akun ditegakkan di dua tempat: pengecekan dalam transaksi saat admin menyetujui request, dan trigger database yang menolak akun peserta ke-3 untuk satu `institution_id`. Partial unique index menjamin hanya ada satu `is_primary = true` per lembaga.

## 04 Periode & kuesioner

Satu periode punya satu kuesioner. Soal punya `code` (kode variabel) yang dipakai di aturan validasi dan rumus skor. Aturan validasi dan logika tampil disimpan sebagai baris terpisah, sehingga admin bisa menambahkan sebanyak yang diperlukan per soal.

```mermaid
erDiagram
  survey_periods |o--o{ survey_periods : "disalin dari"
  survey_periods ||--o{ period_extensions : "perpanjangan"
  institutions |o--o{ period_extensions : "khusus lembaga"
  survey_periods ||--|| questionnaires : "punya"
  questionnaires ||--o{ sections : "bagian"
  sections ||--o{ questions : "soal"
  questionnaires ||--o{ questions : "kode unik per kuesioner"
  questions ||--o{ question_options : "opsi"
  questions ||--o{ question_institution_types : "berlaku untuk"
  institution_types ||--o{ question_institution_types : ""
  questions ||--o{ validation_rules : "aturan"
  questions ||--o{ question_conditions : "ditampilkan jika"
  questions ||--o{ question_conditions : "bergantung pada"

  survey_periods {
    uuid id PK
    string name "Lomba Perpustakaan 2026"
    int year
    timestamptz opens_at
    timestamptz closes_at "tanggal kedaluwarsa"
    enum status "DRAFT, OPEN, CLOSED, ARCHIVED"
    uuid copied_from_id FK
    int revision_deadline_days "default batas revisi"
    enum revision_scope "SELECTED_QUESTIONS, ALL"
    timestamptz scores_published_at
    uuid scores_published_by FK
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  period_extensions {
    uuid id PK
    uuid period_id FK
    uuid institution_id FK "null = semua lembaga"
    timestamptz new_closes_at
    text reason
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  questionnaires {
    uuid id PK
    uuid period_id FK, UK
    string title
    text instructions
    enum status "DRAFT, PUBLISHED"
    int version
    timestamptz published_at
    uuid published_by FK
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  sections {
    uuid id PK
    uuid questionnaire_id FK
    string code "KOLEKSI"
    string title
    text description
    string evidence_label "link bukti per bagian"
    boolean evidence_required
    int sort_order
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  questions {
    uuid id PK
    uuid questionnaire_id FK
    uuid section_id FK
    string code "j_eksemplar_koleksi_tercetak"
    text label
    text help_text
    enum type "lihat daftar enum"
    boolean is_required
    jsonb config "unit, desimal, min, max, kolom tabel"
    boolean has_evidence_url "link Drive per soal"
    int sort_order
    boolean is_active
    uuid copied_from_id FK
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  question_options {
    uuid id PK
    uuid question_id FK
    string label
    string value
    numeric score_value "nilai untuk skoring"
    int sort_order
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  question_institution_types {
    uuid question_id PK, FK
    uuid institution_type_id PK, FK
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
  }
  question_conditions {
    uuid id PK
    uuid question_id FK "soal yang diatur"
    uuid depends_on_question_id FK
    enum operator "EQ, NEQ, GT, GTE, LT, LTE, IN, NOT_EMPTY"
    jsonb value
    enum effect "SHOW, REQUIRE"
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  validation_rules {
    uuid id PK
    uuid question_id FK
    enum rule_type "REQUIRED, RANGE, COMPARE, FORMAT, YOY_CHANGE, EXPRESSION"
    jsonb params "min, max, other_question_id, regex, pct"
    enum severity "BLOCK, FLAG"
    string message "pesan ke peserta / admin"
    boolean is_active
    int sort_order
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  
```

#### Contoh `validation_rules.params`

- RANGE: `{"min":0,"max":1000000}`
- COMPARE: `{"op":"GTE","other_question_id":"…judul"}`
- FORMAT: `{"pattern":"drive.google.com"}`
- YOY\_CHANGE: `{"max_pct":50}` dibandingkan dengan jawaban periode lalu lewat `questions.copied_from_id`
- EXPRESSION: `{"expr":"j_siswa > 0 OR jenis != 'SD'"}`

#### Aturan berlaku-untuk

Jika soal tidak punya baris di `question_institution_types`, soal berlaku untuk **semua jenis**. Jika ada barisnya, soal hanya muncul untuk jenis yang terdaftar.

## 05 Pengisian, validasi & revisi

Satu `submission` per lembaga per periode. Jawaban disimpan per soal dalam kolom yang sesuai tipenya. Setiap kali dikirim dibuat snapshot, setiap perubahan jawaban dicatat di riwayat, dan setiap revisi punya daftar soal yang dibuka.

```mermaid
erDiagram
  survey_periods ||--o{ submissions : ""
  institutions ||--o{ submissions : "1 per periode"
  submissions ||--o{ answers : "jawaban"
  questions ||--o{ answers : ""
  answers ||--o{ answer_history : "perubahan"
  submissions ||--o{ submission_snapshots : "tiap kirim"
  submissions ||--o{ validation_results : "hasil cek"
  validation_rules ||--o{ validation_results : ""
  questions ||--o{ validation_results : ""
  submissions ||--o{ revision_requests : "putaran revisi"
  revision_requests ||--o{ revision_request_items : "soal dibuka"
  questions ||--o{ revision_request_items : ""
  submissions ||--o{ evidence_files : "unggahan (nanti)"
  users ||--o{ answers : "diubah oleh"

  submissions {
    uuid id PK
    uuid period_id FK
    uuid institution_id FK
    enum status "NOT_STARTED, DRAFT, SUBMITTED, NEEDS_REVISION, VERIFIED, NOT_SUBMITTED"
    numeric progress_pct "0-100"
    int revision_round "0 = kiriman pertama"
    int open_flag_count "cache untuk daftar admin"
    string submitter_name "nama pengisi saat kirim"
    timestamptz first_submitted_at
    timestamptz last_submitted_at
    uuid last_submitted_by FK
    timestamptz last_saved_at
    timestamptz verified_at
    uuid verified_by FK
    text admin_note
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  answers {
    uuid id PK
    uuid submission_id FK
    uuid question_id FK
    numeric value_number
    text value_text
    date value_date
    jsonb value_json "pilihan ganda, tabel isian"
    string evidence_url "link Google Drive"
    boolean is_locked
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  answer_history {
    uuid id PK
    uuid answer_id FK
    jsonb old_value
    jsonb new_value
    int revision_round
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
  }
  submission_snapshots {
    uuid id PK
    uuid submission_id FK
    int revision_round
    jsonb answers "salinan semua jawaban"
    uuid submitted_by FK
    timestamptz submitted_at
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
  }
  validation_results {
    uuid id PK
    uuid submission_id FK
    uuid question_id FK
    uuid rule_id FK
    enum severity "BLOCK, FLAG"
    string message
    int revision_round
    enum status "OPEN, ACCEPTED_BY_ADMIN, RESOLVED"
    uuid reviewed_by FK
    timestamptz reviewed_at
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  revision_requests {
    uuid id PK
    uuid submission_id FK
    int round
    text general_note
    timestamptz deadline_at
    enum status "OPEN, RESUBMITTED, EXPIRED, CANCELLED"
    uuid requested_by FK
    timestamptz resubmitted_at
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  revision_request_items {
    uuid id PK
    uuid revision_request_id FK
    uuid question_id FK
    text note "catatan per soal"
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  evidence_files {
    uuid id PK
    uuid submission_id FK
    uuid question_id FK "atau per bagian"
    string storage_key "Vercel Blob / S3"
    string file_name
    string mime_type
    bigint size_bytes
    uuid uploaded_by FK
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  
```

Soal yang terbuka saat revisi ditentukan oleh `revision_request_items` pada revisi berstatus OPEN. Soal lain tetap `is_locked = true`. Jika `revision_scope = ALL`, semua jawaban dibuka.

## 06 Mesin skoring

Rumus disimpan sebagai **graf node**, tidak sebagai pohon biasa. Alasannya, di data IPLM satu indikator bisa masuk ke subdimensi (misalnya Koleksi) dan sekaligus ke dimensi (Kepatuhan atau Kinerja). Tabel `score_node_edges` menampung hubungan banyak-ke-banyak itu beserta bobotnya.

```mermaid
erDiagram
  survey_periods ||--o{ scoring_schemes : "versi rumus"
  scoring_schemes |o--o{ scoring_schemes : "disalin dari"
  scoring_schemes ||--o{ score_nodes : "node"
  score_nodes ||--o{ score_node_edges : "induk"
  score_nodes ||--o{ score_node_edges : "anak"
  score_nodes ||--o{ score_node_variables : "memakai"
  questions ||--o{ score_node_variables : "dipakai di rumus"
  score_nodes ||--o{ score_node_type_overrides : "beda per jenis"
  institution_types ||--o{ score_node_type_overrides : ""
  scoring_schemes ||--o{ score_categories : "kategori"
  scoring_schemes ||--o{ score_runs : "perhitungan"
  score_runs ||--o{ submission_scores : "hasil"
  submissions ||--o{ submission_scores : ""
  score_categories |o--o{ submission_scores : ""
  submission_scores ||--o{ submission_score_details : "rincian per node"
  score_nodes ||--o{ submission_score_details : ""

  scoring_schemes {
    uuid id PK
    uuid period_id FK
    string name "IPLM 2026 v2"
    int version
    enum status "DRAFT, ACTIVE, ARCHIVED"
    numeric scale "100"
    uuid copied_from_id FK
    text notes
    timestamptz activated_at
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  score_nodes {
    uuid id PK
    uuid scheme_id FK
    enum level "INDICATOR, SUBDIMENSION, DIMENSION, INDEX"
    string code UK "sub_koleksi, dim_kinerja"
    string name
    text formula "ekspresi, mis. j_eksemplar / j_siswa"
    enum normalization "NONE, TARGET_RATIO, MIN_MAX, THRESHOLD_TABLE, OPTION_SCORE"
    jsonb normalization_params "target, cap, ambang"
    enum aggregation "WEIGHTED_SUM, AVERAGE, FORMULA"
    boolean is_root "indeks akhir"
    int sort_order
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  score_node_edges {
    uuid parent_node_id PK, FK
    uuid child_node_id PK, FK
    numeric weight "0-1, total per induk = 1"
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  score_node_variables {
    uuid node_id PK, FK
    uuid question_id PK, FK
    string variable_code "salinan kode saat disimpan"
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
  }
  score_node_type_overrides {
    uuid id PK
    uuid node_id FK
    uuid institution_type_id FK
    jsonb normalization_params "target berbeda untuk TBM, dst."
    text formula "opsional"
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  score_categories {
    uuid id PK
    uuid scheme_id FK
    string name "Lolos Nasional"
    numeric min_score "70"
    numeric max_score "100"
    string color
    int sort_order
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  score_runs {
    uuid id PK
    uuid scheme_id FK
    enum mode "TEST, OFFICIAL"
    enum status "RUNNING, DONE, FAILED"
    int submission_count
    text error_log
    uuid triggered_by FK
    timestamptz started_at
    timestamptz finished_at
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  submission_scores {
    uuid id PK
    uuid run_id FK
    uuid submission_id FK
    uuid scheme_id FK
    numeric index_score "0-100"
    uuid category_id FK
    int rank_overall
    int rank_in_type
    int rank_in_district
    boolean is_current "skor yang berlaku"
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  submission_score_details {
    uuid id PK
    uuid submission_score_id FK
    uuid node_id FK
    numeric raw_value
    numeric normalized_value "0-1"
    numeric weighted_value
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
  }
  
```

#### Preset dari data contoh

- Node INDEX `indeks_dasar` (root)
- Edge ke `dim_kepatuhan`, bobot 0,30
- Edge ke `dim_kinerja`, bobot 0,70
- Node SUBDIMENSION: koleksi, sdm, pelayanan, pengelolaan
- Node INDICATOR menyusul setelah juknis resmi didapat

#### Cara hitung

Graf dihitung dari bawah ke atas (topological sort). Validasi sebelum aktivasi: tidak boleh ada siklus, total bobot setiap induk = 1, dan semua variabel di rumus harus ada di kuesioner. Rumus dievaluasi dengan parser ekspresi yang aman (misalnya `mathjs` dengan scope terbatas), bukan `eval`.

## 07 Email & reminder

```mermaid
erDiagram
  email_templates ||--o{ email_logs : "dipakai"
  survey_periods ||--o{ reminder_schedules : "jadwal"
  email_templates ||--o{ reminder_schedules : ""
  users |o--o{ email_logs : "penerima"
  institutions |o--o{ email_logs : ""

  email_templates {
    uuid id PK
    enum key UK "ACTIVATION, PASSWORD_RESET, REMINDER_DEADLINE, ..."
    string subject
    text body_html "variabel: nama_lembaga, link, tenggat"
    jsonb available_variables
    boolean is_active
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  reminder_schedules {
    uuid id PK
    uuid period_id FK
    enum kind "DEADLINE, ACTIVATION, REVISION"
    int offset_days "7, 3, 1 sebelum"
    jsonb target_statuses "NOT_STARTED, DRAFT"
    uuid template_id FK
    boolean is_active
    timestamptz last_run_at
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  email_logs {
    uuid id PK
    uuid template_id FK
    uuid user_id FK
    uuid institution_id FK
    string to_email
    string subject
    enum status "QUEUED, SENT, FAILED, OPENED, BOUNCED"
    string provider_message_id
    text error_message
    string related_type "submission, account_request"
    uuid related_id
    timestamptz sent_at
    timestamptz opened_at
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  
```

Reminder dijalankan oleh Vercel Cron setiap hari. Sebelum mengirim, sistem mengecek `email_logs` agar email yang sama tidak terkirim dua kali ke lembaga yang sama pada hari yang sama.

## 08 Report, impor & sistem

```mermaid
erDiagram
  users ||--o{ saved_report_filters : "simpan filter"
  users ||--o{ import_jobs : "unggah"
  import_jobs ||--o{ import_job_rows : "baris"
  import_job_rows |o--o| institutions : "hasil"
  users |o--o{ audit_logs : "pelaku perubahan data"
  users |o--o{ activity_logs : "pelaku aktivitas"
  users |o--o{ app_settings : "diubah oleh"

  saved_report_filters {
    uuid id PK
    uuid user_id FK
    string name "SD Pontianak Barat lolos"
    jsonb filters "period, region, type, status, skor"
    boolean is_shared "terlihat semua admin"
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
    timestamptz deleted_at "soft delete"
    uuid deleted_by FK "dihapus oleh"
  }
  import_jobs {
    uuid id PK
    enum type "INSTITUTIONS"
    string file_name
    enum status "UPLOADED, VALIDATED, COMMITTED, FAILED"
    int total_rows
    int valid_rows
    int error_rows
    boolean send_activation
    timestamptz committed_at
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  import_job_rows {
    uuid id PK
    uuid import_job_id FK
    int row_number
    jsonb payload
    enum status "VALID, ERROR, IMPORTED, SKIPPED"
    jsonb errors
    uuid institution_id FK
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  audit_logs {
    bigint id PK "bigserial, partisi per bulan"
    timestamptz created_at "waktu kejadian"
    uuid actor_user_id FK "siapa pelakunya"
    enum actor_role "peran saat itu"
    enum action "INSERT, UPDATE, DELETE, SOFT_DELETE, RESTORE"
    string table_name "tabel yang berubah"
    uuid record_id "baris yang berubah"
    jsonb old_data "nilai sebelum"
    jsonb new_data "nilai sesudah"
    jsonb changed_fields "kolom yang berubah"
    enum source "WEB, CRON, IMPORT, SYSTEM"
    uuid request_id "satu aksi = satu id"
    string ip_address
    text user_agent
  }
  activity_logs {
    bigint id PK "bigserial, partisi per bulan"
    timestamptz created_at "waktu kejadian"
    uuid user_id FK "siapa"
    enum actor_role
    enum activity "LOGIN, LOGOUT, EXPORT_REPORT, ..."
    string entity_type "submission, report"
    uuid entity_id
    string description "Admin Rina mengekspor report SD"
    jsonb metadata "filter, jumlah baris, nama file"
    uuid request_id
    string ip_address
    text user_agent
  }
  app_settings {
    string key PK "password_policy, lockout, pass_threshold"
    jsonb value
    timestamptz created_at "dibuat kapan"
    uuid created_by FK "dibuat oleh"
    timestamptz updated_at "diubah kapan"
    uuid updated_by FK "diubah oleh"
  }
  
```

### Query report (form filter)

Report disusun dengan join: `submissions` ⟶ `institutions` ⟶ `regions` (kelurahan → kecamatan) ⟶ `institution_types`, ditambah `submission_scores` dengan `is_current = true`. Filter rentang skor (misalnya ≥ 70) diterapkan ke `index_score`, dan grafik subdimensi diambil dari `submission_score_details`.

## T Tracking & audit

Setiap kejadian di sistem bisa dijawab: **siapa**, **kapan**, **apa yang berubah**, **dari mana**. Ada empat lapis pencatatan.

```mermaid
flowchart LR
  U["Aksi pengguna / cron / impor"] --> T["Transaksi DBSET LOCAL app.user_id, app.request_id, app.ip"]
  T --> L1["1 · Kolom bariscreated/updated/deleted at & by"]
  T --> L2["2 · audit_logstrigger Postgres: data sebelum & sesudah"]
  U --> L3["3 · activity_logslogin, ekspor, unduh, kirim email"]
  T --> L4["4 · Riwayat domainanswer_history, snapshots, score_runs, email_logs"]
  L1 & L2 & L3 & L4 --> V["Menu Log Aktivitas+ tab Riwayat di setiap data"]
  
```

#### 1 · Kolom di setiap baris

Menunjukkan siapa yang membuat, terakhir mengubah, dan menghapus sebuah baris. Diisi otomatis oleh Prisma extension dari user yang sedang login. Data tidak dihapus permanen; baris hanya ditandai `deleted_at` dan bisa dipulihkan.

#### 2 · audit\_logs: perubahan data

Trigger Postgres pada **semua** tabel non-log mencatat setiap INSERT, UPDATE, dan DELETE beserta nilai lama, nilai baru, dan kolom yang berubah. Karena dicatat di level database, perubahan tetap terekam meskipun terjadi di luar aplikasi.

#### 3 · activity\_logs: aksi pengguna

Aksi yang tidak mengubah data tapi penting dilacak: login, logout, login gagal, membuka jawaban peserta, ekspor report, unduh rapor, kirim ulang aktivasi, kirim reminder massal.

#### 4 · Riwayat khusus domain

Riwayat yang tampil langsung di layar terkait: perubahan jawaban per soal (`answer_history`), salinan setiap kiriman (`submission_snapshots`), setiap perhitungan skor beserta versi rumusnya (`score_runs`), dan setiap email (`email_logs`).

### Contoh yang bisa ditelusuri

| Pertanyaan | Sumber |
| --- | --- |
| Siapa yang mengubah jumlah eksemplar SDN 24 dari 8.174 menjadi 9.000, dan kapan? | answer\_history + audit\_logs |
| Siapa yang mengubah bobot Kinerja dari 0,70 ke 0,60? | audit\_logs (score\_node\_edges) |
| Siapa yang membuka revisi untuk SMP Suster, dan apa catatannya? | revision\_requests.created\_by + audit\_logs |
| Siapa yang mengekspor data peserta minggu ini? | activity\_logs (EXPORT\_REPORT) |
| Siapa yang menghapus lembaga ini, dan bisakah dipulihkan? | institutions.deleted\_by + audit\_logs.old\_data |
| Apakah email aktivasi benar-benar terkirim? | email\_logs + activity\_logs |

Log bersifat **append-only**: aplikasi tidak punya izin UPDATE/DELETE ke `audit_logs` dan `activity_logs` (dicabut lewat GRANT). Tabel log dipartisi per bulan dan disimpan minimal 5 tahun. Durasi ini bisa diubah di `app_settings`.

## 09 Daftar enum

| Enum | Nilai | Dipakai di |
| --- | --- | --- |
| `user_role` | SUPER\_ADMIN, ADMIN, PARTICIPANT, SYSTEM | users, audit\_logs, activity\_logs |
| `audit_action` | INSERT, UPDATE, DELETE, SOFT\_DELETE, RESTORE | audit\_logs |
| `log_source` | WEB, CRON, IMPORT, SYSTEM | audit\_logs |
| `activity_type` | LOGIN, LOGOUT, LOGIN\_FAILED, ACCOUNT\_LOCKED, PASSWORD\_CHANGED, VIEW\_SUBMISSION, EXPORT\_REPORT, DOWNLOAD\_RAPOR, RESEND\_ACTIVATION, SEND\_BULK\_REMINDER, PUBLISH\_SCORES, RUN\_SCORING, IMPERSONATE\_VIEW | activity\_logs |
| `user_status` | PENDING\_ACTIVATION, ACTIVE, DISABLED | users |
| `token_type` | ACTIVATION, PASSWORD\_RESET | auth\_tokens |
| `request_status` | PENDING, APPROVED, REJECTED | account\_requests, institution\_change\_requests |
| `region_level` | CITY, DISTRICT, VILLAGE | regions |
| `period_status` | DRAFT, OPEN, CLOSED, ARCHIVED | survey\_periods |
| `revision_scope` | SELECTED\_QUESTIONS, ALL | survey\_periods |
| `questionnaire_status` | DRAFT, PUBLISHED | questionnaires |
| `question_type` | INTEGER, DECIMAL, CURRENCY, PERCENT, SHORT\_TEXT, LONG\_TEXT, SINGLE\_CHOICE, MULTI\_CHOICE, YES\_NO, DROPDOWN, DATE, SCALE, URL, TABLE, FILE | questions |
| `condition_operator` | EQ, NEQ, GT, GTE, LT, LTE, IN, NOT\_EMPTY | question\_conditions |
| `condition_effect` | SHOW, REQUIRE | question\_conditions |
| `rule_type` | REQUIRED, RANGE, COMPARE, FORMAT, YOY\_CHANGE, EXPRESSION | validation\_rules |
| `rule_severity` | BLOCK, FLAG | validation\_rules, validation\_results |
| `submission_status` | NOT\_STARTED, DRAFT, SUBMITTED, NEEDS\_REVISION, VERIFIED, NOT\_SUBMITTED | submissions |
| `validation_result_status` | OPEN, ACCEPTED\_BY\_ADMIN, RESOLVED | validation\_results |
| `revision_status` | OPEN, RESUBMITTED, EXPIRED, CANCELLED | revision\_requests |
| `scheme_status` | DRAFT, ACTIVE, ARCHIVED | scoring\_schemes |
| `node_level` | INDICATOR, SUBDIMENSION, DIMENSION, INDEX | score\_nodes |
| `normalization_type` | NONE, TARGET\_RATIO, MIN\_MAX, THRESHOLD\_TABLE, OPTION\_SCORE | score\_nodes |
| `aggregation_type` | WEIGHTED\_SUM, AVERAGE, FORMULA | score\_nodes |
| `run_mode` / `run_status` | TEST, OFFICIAL / RUNNING, DONE, FAILED | score\_runs |
| `email_template_key` | ACTIVATION, PASSWORD\_RESET, ACCOUNT\_LOCKED, REMINDER\_DEADLINE, REMINDER\_ACTIVATION, REMINDER\_REVISION, SUBMISSION\_RECEIPT, REVISION\_OPENED, ACCOUNT\_REQUEST\_APPROVED, ACCOUNT\_REQUEST\_REJECTED, SCORE\_PUBLISHED | email\_templates |
| `email_status` | QUEUED, SENT, FAILED, OPENED, BOUNCED | email\_logs |
| `import_status` / `import_row_status` | UPLOADED, VALIDATED, COMMITTED, FAILED / VALID, ERROR, IMPORTED, SKIPPED | import\_jobs, import\_job\_rows |

## 10 Constraint & index penting

| Tabel | Constraint / index | Tujuan |
| --- | --- | --- |
| institutions | `UNIQUE(npp)`, `INDEX(region_id, type_id)` | NPP sebagai login; daftar peserta per wilayah dan jenis |
| users | `UNIQUE(username)`, `UNIQUE(email)` | Login unik |
| users | `UNIQUE(institution_id) WHERE is_primary` | Satu akun utama per lembaga |
| users | Trigger: maks. 2 baris PARTICIPANT per `institution_id` | Batas akun kedua |
| users | `CHECK(role = 'PARTICIPANT') = (institution_id IS NOT NULL)` | Admin tidak terikat lembaga |
| auth\_tokens | `UNIQUE(token_hash)`, `INDEX(user_id, type) WHERE used_at IS NULL` | Cek token cepat; token lama dicabut |
| questionnaires | `UNIQUE(period_id)` | Satu kuesioner per periode |
| questions | `UNIQUE(questionnaire_id, code)` | Kode variabel unik untuk rumus |
| submissions | `UNIQUE(period_id, institution_id)`, `INDEX(period_id, status)` | Satu kiriman per lembaga; dashboard status |
| answers | `UNIQUE(submission_id, question_id)`, `INDEX(question_id)` | Upsert autosave; report per soal |
| revision\_requests | `UNIQUE(submission_id) WHERE status = 'OPEN'` | Hanya satu revisi terbuka |
| scoring\_schemes | `UNIQUE(period_id) WHERE status = 'ACTIVE'` | Satu rumus aktif per periode |
| score\_nodes | `UNIQUE(scheme_id, code)` | Kode node unik |
| score\_node\_edges | `CHECK(parent_node_id <> child_node_id)` + cek siklus di aplikasi | Graf tanpa siklus |
| submission\_scores | `UNIQUE(submission_id) WHERE is_current`, `INDEX(scheme_id, index_score)` | Satu skor berlaku; filter rentang skor |
| email\_logs | `INDEX(status)`, `INDEX(institution_id, template_id, sent_at)` | Kirim ulang yang gagal; cegah duplikat reminder |
| audit\_logs | `INDEX(table_name, record_id, created_at)`, `INDEX(actor_user_id, created_at)`, `INDEX(request_id)` | Riwayat per data, per pengguna, per aksi |
| activity\_logs | `INDEX(user_id, created_at)`, `INDEX(activity, created_at)` | Filter di menu Log Aktivitas |
| Semua tabel FULL | `INDEX(...) WHERE deleted_at IS NULL` | Query harian tidak menyentuh data terhapus |
| Semua tabel | `FK *_by → users.id`, `NOT NULL` untuk `created_by` | Pembuat setiap baris selalu tercatat |

## 11 Modul flowchart ke tabel

| Modul | Tabel utama |
| --- | --- |
| 02 Master data & periode | regions, institution\_types, survey\_periods, period\_extensions |
| 03 Peserta & aktivasi | institutions, users, auth\_tokens (ACTIVATION), email\_logs |
| 04 Login & keamanan | users, sessions, login\_attempts, auth\_tokens (PASSWORD\_RESET), app\_settings |
| 05 Request akun tambahan | account\_requests, users |
| 06 Builder kuesioner | questionnaires, sections, questions, question\_options, question\_institution\_types, question\_conditions, validation\_rules |
| 07 Pengisian survei | submissions, answers, answer\_history, submission\_snapshots, evidence\_files (nanti) |
| 08 Validasi & revisi | validation\_results, revision\_requests, revision\_request\_items |
| 09 Mesin skoring | scoring\_schemes, score\_nodes, score\_node\_edges, score\_node\_variables, score\_node\_type\_overrides, score\_categories, score\_runs, submission\_scores, submission\_score\_details |
| 10 Monitoring & reminder | submissions (status, progress\_pct), reminder\_schedules, email\_templates, email\_logs |
| 11 Report & analitik | submission\_scores, submission\_score\_details, saved\_report\_filters |
| Profil lembaga | institution\_change\_requests |
| Impor data (tahap akhir) | import\_jobs, import\_job\_rows |
| Lintas modul (tracking) | audit\_logs, activity\_logs, kolom \*\_at/\*\_by di semua tabel, app\_settings |
