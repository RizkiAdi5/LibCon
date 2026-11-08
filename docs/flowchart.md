Perpustakaan Kota · Lomba Perpustakaan Terbaik

# Flow sistem LibCon

Perpustakaan Kota mendaftarkan lembaga di bawah naungannya, mengirim akun lewat email resmi, menyusun kuesioner beserta aturan validasinya, lalu memantau pengisian sampai skor dan laporan keluar. Semua aturan (jenis, soal, validasi, rumus skor) diatur admin dari sistem.

Next.js · TypeScript · Tailwind · Vercel · Postgres · Cakupan: tingkat kota ·

## 00 Ringkasan & peran

Hanya ada dua sisi. Staf Perpustakaan Kota memakai panel admin penuh. Lembaga peserta hanya melihat menu survei miliknya sendiri.

#### Admin Perpustakaan Kota

- Mengelola master data: wilayah, jenis, periode
- Input dan mengelola peserta, kirim aktivasi
- Menyusun kuesioner, aturan validasi, dan rumus skor
- Memeriksa flag, membuka revisi
- Monitoring, reminder, report, analitik

Login: email + password ·

#### Peserta (lembaga)

- Aktivasi akun dan membuat password
- Mengisi survei periode aktif, simpan draf, kirim
- Memperbaiki jawaban saat diminta revisi
- Melihat skor dan rapornya sendiri
- Mengajukan akun kedua (maks. 2 per lembaga)

Login: NPP + password ·

Admin bisa terdiri dari beberapa staf. Usulan saya: dua level, **Super Admin** (rumus, pengguna admin, pengaturan) dan **Admin** (operasional harian). Keduanya tetap orang Perpustakaan Kota.

## 01 Alur utama

Gambaran satu siklus lomba dari awal sampai akhir, dibagi menurut siapa yang mengerjakan.

```mermaid
flowchart TB
  subgraph A["Admin Perpustakaan Kota"]
    A1["Atur master datawilayah, jenis, periode"] --> A2["Input pesertamanual / impor Excel"]
    A2 --> A3["Susun kuesioner+ aturan validasi per soal"]
    A3 --> A4["Atur rumus skor"]
    A4 --> A5["Buka periode survei"]
    A8["Tinjau flag & jawaban"]
    A9{"Perlu revisi?"}
    A10["Kunci & verifikasi"]
    A11["Hitung & publikasi skor"]
    A12["Report, analitik, ekspor"]
  end
  subgraph S["Sistem"]
    S1["Kirim email aktivasilink berlaku 24 jam"]
    S2["Validasi otomatissesuai aturan soal"]
    S3["Reminder emailH-7, H-3, H-1"]
    S4["Email: revisi dibuka"]
  end
  subgraph P["Peserta"]
    P1["Klik link, buatpassword kuat"] --> P2["Login dengan NPP"]
    P2 --> P3["Isi surveiautosave draf"]
    P3 --> P4["Kirim jawaban"]
    P5["Perbaiki soal yang diflag"]
    P6["Lihat skor & rapor"]
  end
  A2 --> S1 --> P1
  A5 --> S3 -.-> P3
  P4 --> S2 --> A8 --> A9
  A9 -- Ya --> S4 --> P5 --> P4
  A9 -- Tidak --> A10 --> A11 --> A12
  A11 --> P6
  
```

## 02 Master data & periode

Disiapkan sekali, lalu dipakai ulang setiap tahun. Semua bisa diubah admin.

```mermaid
flowchart LR
  M0(["Mulai"]) --> M1["WilayahKota > Kecamatan > Kelurahan"]
  M1 --> M2["Jenis pesertaawal: SD, SMP, TBMtambah / ubah / nonaktifkan"]
  M2 --> M3["Periode surveinama, tanggal buka, tanggal tutup"]
  M3 --> M4{"Salin kuesionerperiode lalu?"}
  M4 -- Ya --> M5["Duplikasi soal, aturan,dan rumus ke periode baru"]
  M4 -- Tidak --> M6["Mulai kuesioner kosong"]
  M5 --> M7["Set tanggal kedaluwarsa"]
  M6 --> M7
  M7 --> M8(["Siap diisi peserta"])
  
```

#### Jenis peserta

Hanya satu level, nilai awal **SD, SMP, TBM**. Admin bisa menambah (misalnya LSM, Perpus Kelurahan, Perpus Kecamatan) dan menonaktifkan jenis tanpa menghapus data lama.

#### Periode & kedaluwarsa

Setiap periode punya tanggal buka dan tutup. Setelah tanggal tutup, tombol Kirim terkunci. Admin bisa memperpanjang untuk semua peserta atau untuk peserta tertentu saja.

## 03 Input peserta & aktivasi akun

Admin mengisi data lembaga, lalu sistem membuat akun dengan username = NPP dan mengirim link aktivasi ke email resmi lembaga.

```mermaid
flowchart TB
  B1["Admin buka menu Peserta > Tambah"] --> B2["Isi data lembaga"]
  B2 --> B3{"NPP & email validdan belum terdaftar?"}
  B3 -- Tidak --> B2
  B3 -- Ya --> B4["Simpan pesertastatus: Belum Aktivasi"]
  B4 --> B5["Buat token aktivasisekali pakai, 24 jam"]
  B5 --> B6["Kirim email resmiberisi link aktivasi"]
  B6 --> B7{"Peserta klik linkdalam 24 jam?"}
  B7 -- Tidak --> B8["Token kedaluwarsa"] --> B9["Admin klik Kirim Ulangatau peserta minta link baru"] --> B5
  B7 -- Ya --> B10["Form buat password+ meter kekuatan"]
  B10 --> B11{"Memenuhi aturan?"}
  B11 -- Tidak --> B10
  B11 -- Ya --> B12["Akun aktifstatus: Belum Mengisi"]
  B12 --> B13(["Diarahkan ke login"])
  
```

#### Data lembaga (mengikuti format IPLM)

- Nama perpustakaan, nama instansi/lembaga
- **NPP** (username, unik), NPSN
- Jenis peserta
- Alamat, kecamatan, kelurahan
- Nama penanggung jawab/pengisi
- Email resmi, no. WhatsApp

#### Aturan password kuat

- Minimal 10 karakter
- Huruf besar, huruf kecil, angka, simbol
- Tidak boleh memuat NPP atau nama lembaga
- Ditolak jika ada di daftar password umum
- Disimpan sebagai hash (argon2/bcrypt)

Impor massal dari Excel dimasukkan ke menu khusus dan dikerjakan di tahap akhir, sesuai permintaan. Alurnya: unggah file, pratinjau dan validasi per baris, simpan, lalu kirim aktivasi massal.

## 04 Login & keamanan

```mermaid
flowchart TB
  L1["Halaman login"] --> L2{"Jenis pengguna"}
  L2 -- Peserta --> L3["NPP + password"]
  L2 -- Admin --> L4["Email + password"]
  L3 --> L5{"Benar?"}
  L4 --> L5
  L5 -- Tidak --> L6["Hitung gagal"] --> L7{"5x gagal?"}
  L7 -- Ya --> L8["Kunci 15 menit+ email peringatan"]
  L7 -- Tidak --> L1
  L5 -- Ya --> L9{"Peran"}
  L9 -- Admin --> L10["Dashboard admin"]
  L9 -- Peserta --> L11["Halaman survei saya"]
  L1 --> L12["Lupa password"] --> L13["Masukkan NPP / email"] --> L14["Email link reset24 jam"] --> L15["Buat password baru"] --> L1
  
```

Admin juga bisa mereset password dan menonaktifkan akun peserta. Setiap tindakan penting (login, kirim, revisi, ubah rumus) dicatat di **log aktivitas**.

## 05 Request akun tambahan

Satu lembaga memulai dengan satu akun dan bisa mengajukan satu akun lagi, jadi maksimal dua. Kedua akun mengisi survei yang sama milik lembaga itu.

```mermaid
flowchart LR
  R1["Peserta: menu Akun >Ajukan akun tambahan"] --> R2{"Jumlah akunlembaga < 2?"}
  R2 -- Tidak --> R3["Tombol nonaktifsudah maksimal"]
  R2 -- Ya --> R4["Isi nama & email pengisi kedua"]
  R4 --> R5["Masuk antrean admin"]
  R5 --> R6{"Admin setujui?"}
  R6 -- Tolak --> R7["Email penolakan + alasan"]
  R6 -- Setuju --> R8["Buat akun kedualogin: NPP-2"] --> R9["Email aktivasi 24 jam"]
  
```

Usulan: akun kedua memakai username NPP-2, karena NPP harus unik per akun. Riwayat edit menyimpan siapa yang mengubah jawaban apa, supaya dua pengisi tidak saling menimpa tanpa jejak.

## 06 Builder kuesioner

Admin menyusun soal per bagian. Setiap soal punya tipe jawaban, berlaku untuk jenis tertentu, aturan validasi sendiri, dan bisa dihubungkan ke rumus skor.

```mermaid
flowchart TB
  K1["Pilih periode"] --> K2["Buat bagianmis. Koleksi, SDM, Pelayanan, Pengelolaan"]
  K2 --> K3["Tambah soal"]
  K3 --> K4["Pilih tipe jawaban"]
  K4 --> K5["Berlaku untuk jenissemua / SD / SMP / TBM / ..."]
  K5 --> K6["Tambah aturan validasi"]
  K6 --> K7["Beri kode variabelmis. j_eksemplar_cetak"]
  K7 --> K8{"Soal lagi?"}
  K8 -- Ya --> K3
  K8 -- Tidak --> K9["Pratinjau sebagai pesertapilih jenis"]
  K9 --> K10{"Sudah benar?"}
  K10 -- Belum --> K3
  K10 -- Ya --> K11["Terbitkan kuesioner"]
  K11 --> K12["Soal terkunci strukturnyateks bantuan masih bisa diedit"]
  
```

#### Tipe jawaban yang disediakan

Angka bulat · Desimal · Rupiah · Persentase · Teks pendek · Paragraf · Pilihan tunggal · Pilihan ganda · Ya / Tidak · Dropdown · Tanggal · Skala 1–5 · Link (URL) · Tabel isian · Unggah file (nanti) ·

#### Aturan validasi per soal

- **Wajib diisi**
- **Rentang**: min/maks, mis. 0–1.000.000
- **Perbandingan antarsoal**: eksemplar ≥ judul, koleksi termanfaat ≤ total koleksi
- **Format**: URL Google Drive, angka saja
- **Kewajaran**: beri flag jika naik/turun > X% dari tahun lalu
- **Kondisional**: tampil/wajib jika soal lain bernilai tertentu

Setiap aturan bisa diset sebagai Blokir ·  (tidak bisa kirim) atau Flag ·  (boleh kirim, tapi ditandai untuk admin).

## 07 Pengisian survei

```mermaid
flowchart TB
  I1["Login peserta"] --> I2{"Periode aktif?"}
  I2 -- Belum buka --> I3["Tampil hitung mundur"]
  I2 -- Sudah tutup --> I4["Mode baca saja"]
  I2 -- Aktif --> I5["Tampil soal sesuai jenis lembaga+ progres per bagian"]
  I5 --> I6["Isi jawaban"]
  I6 --> I7["Autosave tiap perubahanstatus: Draf"]
  I7 --> I8["Cek aturan Blokir langsungtampil pesan di bawah soal"]
  I8 --> I9{"Selesai semua?"}
  I9 -- Belum --> I6
  I9 -- Ya --> I10["Halaman ringkasan jawaban"]
  I10 --> I11{"Ada error Blokir?"}
  I11 -- Ya --> I6
  I11 -- Tidak --> I12["Konfirmasi: data benar+ nama pengisi"]
  I12 --> I13["Kirim, jawaban dikunci"]
  I13 --> I14["Email tanda terima+ ringkasan PDF"]
  
```

Bukti dukung untuk sementara berupa **link Google Drive** per bagian atau per soal, dengan format folder mengikuti template dari pusat. Fitur unggah file langsung disiapkan untuk nanti.

## 08 Validasi otomatis & revisi

Setelah peserta mengirim, sistem menjalankan semua aturan soal. Jawaban yang melanggar aturan Flag muncul sebagai tanda di panel admin. Admin yang memutuskan perlu revisi atau tidak.

```mermaid
flowchart TB
  V1["Peserta kirim"] --> V2["Mesin aturan memeriksasetiap soal"]
  V2 --> V3{"Ada flag?"}
  V3 -- Tidak --> V4["Status: Terkirim, Lolos Cek"]
  V3 -- Ya --> V5["Status: Terkirim, Ada Flagikon merah di daftar admin"]
  V4 --> V6["Admin tinjau"]
  V5 --> V6
  V6 --> V7{"Keputusan"}
  V7 -- Terima --> V8["Status: Terverifikasimasuk perhitungan skor"]
  V7 -- Minta revisi --> V9["Pilih soal yang dibuka+ tulis catatan per soal"]
  V9 --> V10["Status: Perlu Revisi+ batas waktu revisi"]
  V10 --> V11["Email ke peserta"]
  V11 --> V12["Peserta hanya bisa ubahsoal yang dibuka"]
  V12 --> V13["Kirim ulang"] --> V2
  V10 --> V14{"Lewat batas waktu?"}
  V14 -- Ya --> V15["Jawaban terakhir dipakaiflag tetap tercatat"]
  
```

Admin bisa mengatur apakah revisi membuka **soal tertentu saja** (usulan default) atau **seluruh kuesioner**. Setiap putaran revisi disimpan sebagai versi, sehingga perbedaan sebelum dan sesudah revisi bisa dilihat.

## 09 Mesin skoring (rumus diatur admin)

Rumus tidak ditanam di kode. Admin menyusun pohon penilaian: **soal → indikator → subdimensi → dimensi → indeks**. Di setiap level admin memilih cara normalisasi dan bobotnya.

```mermaid
flowchart LR
  Q["Jawaban soalvariabel mentah"] --> N["Indikatorrumus + normalisasi 0–1"]
  N --> SD["SubdimensiKoleksi · SDM · Pelayanan · Pengelolaan"]
  SD --> D["DimensiKepatuhan · Kinerja"]
  D --> IX["Indeks Dasar 0–100"]
  IX --> R["Ranking & kategori"]
  
```

### Cara admin menulis rumus indikator

rasio\_koleksi\_per\_siswa = j\_eksemplar\_cetak / j\_siswa
normalisasi = MIN(nilai / target, 1) ← target diisi admin, mis. 10
atau MIN-MAX antar peserta
atau tabel ambang (0–2 = 0,25 · 2–5 = 0,5 · …)
skor\_subdimensi\_koleksi = Σ (skor\_indikator × bobot) ← bobot total = 100%
Indeks\_Dasar = (0,30 × Kepatuhan + 0,70 × Kinerja) × 100

#### Fitur editor rumus

- Pilih variabel dari soal (autocomplete kode variabel)
- Operator + − × ÷, MIN MAX IF SUM AVG
- Peringatan jika total bobot ≠ 100%
- **Uji rumus**: jalankan pada data contoh sebelum dipakai
- Rumus diberi versi; skor menyimpan versi rumus yang dipakai
- Hitung ulang semua skor saat rumus diubah

#### Preset awal dari data contoh Anda

Saya cek ke 13 baris di file Excel. Indeks Dasar sama dengan **30% Kepatuhan + 70% Kinerja**, dengan selisih maksimal 0,04 poin akibat pembulatan (contoh: Perpustakaan Kota Pontianak, 0,3×0,865 + 0,7×0,858 = 86,01; tercatat 85,99). Pembobotan ini jadi preset awal. Rumus dari indikator ke subdimensi akan diisi saat juknis resmi didapat.

## 10 Monitoring & reminder

```mermaid
flowchart TB
  O1["Dashboard admin"] --> O2["Kartu ringkastotal, belum aktivasi, belum isi,draf, terkirim, perlu revisi, terverifikasi"]
  O1 --> O3["Tabel pesertakelompokkan: wilayah lalu jenis"]
  O3 --> O4["Filter status / wilayah / jenis+ % progres draf"]
  O4 --> O5["Aksi massal: kirim reminder,kirim ulang aktivasi, ekspor"]
  C1(["Jadwal harian sistem"]) --> C2{"H-7, H-3, H-1sebelum tutup?"}
  C2 -- Ya --> C3["Email ke yang belum kirim"]
  C1 --> C4{"Token aktivasihampir kedaluwarsa?"}
  C4 -- Ya --> C5["Email pengingat aktivasi"]
  C1 --> C6{"Batas revisi besok?"}
  C6 -- Ya --> C7["Email pengingat revisi"]
  
```

Jadwal reminder (H-berapa) dan isi template email bisa diubah admin. Semua email tercatat di **log email**: terkirim, gagal, atau dibuka.

## 11 Report & analitik

Admin memilih data lewat form filter, lalu melihat grafik dan tabel atau mengekspornya. Peserta melihat skornya sendiri.

```mermaid
flowchart LR
  F1["Form filter report"] --> F2["Periode"]
  F1 --> F3["Wilayahkecamatan / kelurahan"]
  F1 --> F4["Jenis peserta"]
  F1 --> F5["Status pengisian"]
  F1 --> F6["Rentang skormis. ≥ 70 / < 70 / kustom"]
  F2 & F3 & F4 & F5 & F6 --> G["Tampilkan"]
  G --> G1["Ranking per jenis"]
  G --> G2["Grafik per subdimensiradar & batang"]
  G --> G3["Sebaran skor per wilayah"]
  G --> G4["Tren antar periode"]
  G --> X["Ekspor"]
  X --> X1["Excel format IPLM"]
  X --> X2["PDF laporan"]
  X --> X3["Rapor per peserta"]
  
```

#### Yang dilihat peserta

- Indeks Dasar dan kategori
- Grafik radar empat subdimensi
- Perbandingan dengan rata-rata jenisnya
- Rapor PDF yang bisa diunduh
- Riwayat skor tahun-tahun sebelumnya

#### Kapan skor terlihat peserta

Usulan: skor baru tampil setelah admin menekan **Publikasikan Skor** untuk periode itu, supaya tidak ada skor sementara yang bocor sebelum verifikasi selesai.

## 12 Status peserta

```mermaid
stateDiagram-v2
  [*] --> BelumAktivasi: admin input
  BelumAktivasi --> BelumMengisi: aktivasi & buat password
  BelumMengisi --> Draf: mulai isi
  Draf --> Terkirim: kirim
  Terkirim --> PerluRevisi: admin buka revisi
  PerluRevisi --> Terkirim: kirim ulang
  Terkirim --> Terverifikasi: admin terima
  Terverifikasi --> [*]
  BelumMengisi --> TidakMengisi: periode tutup
  Draf --> TidakMengisi: periode tutup
  
```

Belum Aktivasi · Belum Mengisi · Draf · 45% · Terkirim · Terkirim · Ada Flag · Perlu Revisi · Terverifikasi · Tidak Mengisi ·

## 13 Hak akses

| Fitur | Super Admin | Admin | Peserta |
| --- | --- | --- | --- |
| Master wilayah, jenis, periode | Penuh | Lihat | – |
| Kelola peserta & aktivasi | Penuh | Penuh | – |
| Setujui akun tambahan | Ya | Ya | Ajukan |
| Builder kuesioner & aturan | Penuh | Penuh | – |
| Editor rumus skor | Penuh | Lihat | – |
| Tinjau flag & buka revisi | Ya | Ya | – |
| Isi survei | – | – | Milik sendiri |
| Publikasi skor | Ya | – | – |
| Report & analitik | Semua | Semua | Skor sendiri |
| Kelola pengguna admin, template email, log | Ya | – | – |

## 14 Struktur menu

#### Panel admin

- **Dashboard**: ringkasan status, grafik progres
- **Peserta**: daftar (per wilayah dan jenis), tambah, detail, kirim ulang aktivasi, reset password
- **Permintaan Akun**: antrean akun kedua
- **Periode Survei**: buat, salin, tanggal kedaluwarsa
- **Kuesioner**: bagian, soal, aturan validasi, pratinjau
- **Verifikasi**: antrean jawaban terkirim, flag, revisi
- **Skoring**: pohon penilaian, editor rumus, uji, hitung ulang, publikasi
- **Report & Analitik**: form filter, grafik, ekspor
- **Pengaturan**: wilayah, jenis, template email, jadwal reminder, admin, log
- **Impor Data**: impor Excel (tahap akhir)

#### Portal peserta

- **Beranda**: status, tenggat, catatan revisi
- **Survei**: isi, progres, ringkasan, kirim
- **Skor Saya**: indeks, radar subdimensi, rapor PDF
- **Profil Lembaga**: lihat data, ajukan koreksi
- **Akun**: ganti password, ajukan akun kedua

## 15 Yang masih ditunggu

Template bukti dukung
:   Format link atau folder Google Drive dari pusat (Anda yang akan tanyakan)

Rumus resmi
:   Cara jawaban mentah menjadi skor indikator dan subdimensi. Sementara memakai preset dari data contoh dan editor rumus.

Indeks\_Final
:   Angka 34,85 di file belum dipakai sampai artinya jelas

Kategori skor
:   Usulan: ≥ 70 lolos ke tahap nasional, tapi batasnya bisa diubah admin
