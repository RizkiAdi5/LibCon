# PRD LibCon — Sistem Penilaian Perpustakaan

Nov 8, 2026 · @bersyukur

LibCon adalah aplikasi web milik Perpustakaan Kota untuk mengumpulkan, memvalidasi, dan menilai survei dari perpustakaan di bawah naungannya sebagai dasar seleksi Lomba Perpustakaan Terbaik tingkat nasional.

## Info dokumen

| Atribut | Nilai |
| --- | --- |
| Produk | LibCon (Library Contest) |
| Versi dokumen | 1.0 (draf) |
| Pemilik produk | Perpustakaan Kota |
| Fase | Fase 1: perancangan sistem |
| Cakupan wilayah | Tingkat kota (Kecamatan, Kelurahan) |
| Dokumen terkait | Flowchart sistem LibCon, ERD LibCon (44 tabel), data contoh IPLM 2025 (13 perpustakaan, Kota Pontianak) |

PRD ini menjelaskan apa yang dibangun dan mengapa. Struktur tabel ada di dokumen ERD, sedangkan alur langkah per langkah ada di dokumen flowchart. Setiap modul di bawah merujuk nomor modul yang sama dengan flowchart (M02 sampai M11).

## 1. Ringkasan & latar belakang

Tanpa sistem terpusat, survei penilaian tersebar di formulir dan spreadsheet. Perpustakaan Kota jadi sulit mengetahui siapa yang sudah mengisi, data sering tidak konsisten, dan skor dihitung manual. LibCon menyatukan seluruh proses dalam satu sistem: pendaftaran lembaga, aktivasi akun, pengisian kuesioner, validasi otomatis, revisi, skoring, sampai laporan.

### Masalah yang diselesaikan

| Masalah sekarang | Dampak | Solusi di LibCon |
| --- | --- | --- |
| Tidak ada daftar terpusat lembaga peserta | Lembaga terlewat atau tercatat ganda | Master lembaga dengan NPP unik, dikelompokkan per wilayah dan jenis |
| Status pengisian tidak terlihat | Admin harus menghubungi satu per satu | Dashboard status real-time dan reminder email otomatis |
| Data tidak masuk akal (eksemplar lebih kecil dari judul, angka ekstrem) | Skor salah, harus dicek manual | Aturan validasi per soal: Blokir atau Flag |
| Revisi lewat chat atau telepon | Tidak ada jejak siapa mengubah apa | Alur revisi resmi dengan catatan per soal dan riwayat perubahan |
| Skor dihitung manual di Excel | Lambat, rawan salah rumus | Mesin skoring dengan rumus yang diatur admin dan bisa diuji |
| Laporan disusun manual | Butuh waktu berhari-hari | Report dengan filter, grafik, dan ekspor Excel/PDF |

### Konteks penilaian

Data contoh mengikuti struktur IPLM 2025. Empat subdimensi (Koleksi, SDM, Pelayanan, Pengelolaan) membentuk dua dimensi (Kepatuhan dan Kinerja), lalu menghasilkan Indeks Dasar 0–100. Pada ke-13 baris data contoh, Indeks Dasar sama dengan 30% Kepatuhan + 70% Kinerja, dengan selisih maksimal 0,04 poin akibat pembulatan. Rumus resmi dari jawaban mentah ke subdimensi belum tersedia, sehingga sistem wajib menyediakan editor rumus yang bisa diatur admin.

## 2. Tujuan, non-tujuan & metrik keberhasilan

### Tujuan

1. Semua lembaga di bawah naungan Perpustakaan Kota terdaftar dan punya akun aktif sebelum periode survei dibuka.
2. Admin mengetahui status pengisian setiap lembaga, per wilayah dan per jenis, tanpa menghubungi satu per satu.
3. Data yang masuk sudah tervalidasi otomatis, dan setiap koreksi tercatat.
4. Skor dihitung otomatis dengan rumus yang bisa diubah tanpa mengubah kode.
5. Laporan untuk pengusulan ke tingkat nasional bisa dibuat dalam hitungan menit.
6. Setiap perubahan data bisa ditelusuri: siapa, kapan, dan apa yang berubah.

### Non-tujuan (di luar cakupan versi ini)

- Penilaian lintas kota atau provinsi. LibCon hanya untuk satu Perpustakaan Kota.
- Penilaian juri manual dan visitasi lapangan.
- Aplikasi mobile native. Versi ini web responsif.
- Notifikasi WhatsApp. Semua notifikasi lewat email resmi.
- Integrasi langsung ke sistem Perpusnas pusat. Data diserahkan lewat ekspor Excel.
- Unggah file bukti dukung ke server. Versi awal memakai link Google Drive.

### Metrik keberhasilan

| Metrik | Target | Cara ukur |
| --- | --- | --- |
| Lembaga terdaftar yang berhasil aktivasi | ≥ 95% sebelum periode dibuka | users.status = ACTIVE dibagi total lembaga |
| Tingkat pengiriman survei | ≥ 90% lembaga mengirim sebelum tanggal tutup | submissions.status bukan NOT\_STARTED/DRAFT |
| Waktu dari tanggal tutup sampai skor dipublikasikan | ≤ 7 hari | scores\_published\_at dikurangi closes\_at |
| Jawaban yang lolos validasi otomatis tanpa revisi | ≥ 70% | submission tanpa revision\_requests |
| Waktu membuat laporan nasional | ≤ 5 menit | dari buka menu Report sampai file ekspor |
| Perubahan data yang tercatat di audit log | 100% | uji audit trigger pada semua tabel |

Angka target di atas adalah usulan awal dan perlu disepakati Perpustakaan Kota.

## 3. Pengguna, peran & persona

Pengguna penuh hanya staf Perpustakaan Kota. Lembaga peserta mendapat akses terbatas: hanya survei, skor, dan profil miliknya sendiri.

| Peran | Siapa | Login | Akses |
| --- | --- | --- | --- |
| Super Admin | Kepala bidang atau penanggung jawab sistem di Perpustakaan Kota | Email + password | Semua fitur, termasuk rumus skor, publikasi skor, pengguna admin, template email, log |
| Admin | Staf operasional Perpustakaan Kota | Email + password | Peserta, kuesioner, verifikasi, monitoring, report. Rumus hanya bisa dilihat |
| Peserta | Pengelola perpustakaan lembaga: SD, SMP, TBM, dan jenis lain yang ditambahkan admin | NPP + password (akun kedua: NPP-2) | Survei milik lembaganya, skor sendiri, profil, akun |
| SYSTEM | Akun teknis untuk cron, impor, dan trigger | Tidak bisa login | Pencatat aksi otomatis di log |

### Persona

**Rina, Admin Perpustakaan Kota.** Mengelola banyak lembaga yang tersebar di semua kecamatan. Butuh tahu dalam sekali lihat siapa yang belum mengisi, lalu mengirim pengingat ke mereka sekaligus. Tidak ingin menghitung skor di Excel.

**Pak Hendra, Super Admin.** Menerima juknis penilaian dari pusat setiap tahun. Butuh memasukkan rumus dan bobot baru sendiri, mengujinya pada data contoh, lalu memublikasikan skor resmi.

**Bu Widya, pustakawan SD.** Mengisi survei di sela mengajar, sering di ponsel. Butuh bisa menyimpan dan melanjutkan nanti, tahu soal mana yang salah sebelum mengirim, dan melihat hasil penilaian lembaganya.

**Pengelola TBM.** Tidak punya NPSN dan datanya lebih sederhana. Hanya melihat soal yang berlaku untuk TBM.

## 4. Ruang lingkup & fase rilis

Rilis dibagi dua. MVP memuat semua yang dibutuhkan untuk menjalankan satu periode lomba dari awal sampai laporan. Fitur yang disepakati untuk belakangan ditandai Tahap lanjutan.

| Kode | Modul | MVP | Tahap lanjutan |
| --- | --- | --- | --- |
| M02 | Master data & periode | Wilayah, jenis peserta, periode, salin kuesioner, tanggal kedaluwarsa, perpanjangan | – |
| M03 | Peserta & aktivasi | Input manual, aktivasi lewat email 24 jam, buat password kuat, kirim ulang | Impor massal dari Excel |
| M04 | Login & keamanan | Login NPP/email, lupa password, kunci akun, reset oleh admin | 2FA untuk admin |
| M05 | Akun tambahan | Ajukan, setujui/tolak, maks. 2 akun per lembaga | – |
| M06 | Builder kuesioner | Bagian, soal, tipe jawaban, berlaku-untuk-jenis, logika tampil, aturan validasi, pratinjau | Bank soal lintas periode |
| M07 | Pengisian survei | Autosave, progres, link Google Drive, ringkasan, kirim, tanda terima | Unggah file bukti ke server |
| M08 | Validasi & revisi | Cek otomatis, flag, revisi per soal, batas waktu, riwayat versi | – |
| M09 | Mesin skoring | Graf node, editor rumus, normalisasi, bobot per jenis, uji, hitung ulang, publikasi | Impor rumus dari file |
| M10 | Monitoring & reminder | Dashboard, tabel per wilayah/jenis, aksi massal, reminder terjadwal | – |
| M11 | Report & analitik | Form filter, ranking, grafik, ekspor Excel/PDF, rapor peserta | Laporan terjadwal via email |
| – | Tracking & log | Kolom audit di semua tabel, audit\_logs, activity\_logs, tab Riwayat | – |
| – | Pengaturan | Template email, jadwal reminder, kebijakan password, admin | – |

## 5. Kebutuhan fungsional

Setiap modul berisi user story, kebutuhan fungsional (FR), dan kriteria penerimaan (AC). Kode FR dipakai untuk tiket pengembangan dan pengujian. Prioritas: P0 = wajib MVP, P1 = penting di MVP, P2 = tahap lanjutan.

### 5.1 M02 — Master data & periode survei

**Tujuan:** menyiapkan data dasar yang dipakai ulang setiap tahun: wilayah, jenis peserta, dan periode lomba.

| ID | Sebagai | Saya ingin | Agar |
| --- | --- | --- | --- |
| US-02.1 | Super Admin | mengelola daftar kecamatan dan kelurahan | lembaga bisa dikelompokkan per wilayah |
| US-02.2 | Super Admin | menambah, mengubah, dan menonaktifkan jenis peserta | jenis baru seperti LSM bisa ikut tanpa ubah kode |
| US-02.3 | Admin | membuat periode survei dengan tanggal buka dan tutup | survei hanya bisa diisi pada waktunya |
| US-02.4 | Admin | menyalin kuesioner, aturan, dan rumus dari periode lalu | tidak menyusun ulang dari nol setiap tahun |
| US-02.5 | Admin | memperpanjang tenggat untuk semua atau lembaga tertentu | lembaga yang terkendala tetap bisa mengirim |

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-02.01 | Wilayah bertingkat: Kota, Kecamatan, Kelurahan, dengan kode dan nama. Data awal satu kota. | P0 |
| FR-02.02 | Jenis peserta satu level dengan data awal SD, SMP, TBM. Bisa tambah, ubah nama, urutkan, nonaktifkan. Jenis yang sudah dipakai tidak bisa dihapus, hanya dinonaktifkan. | P0 |
| FR-02.03 | Periode punya nama, tahun, tanggal-jam buka, tanggal-jam tutup (kedaluwarsa), dan status DRAFT / OPEN / CLOSED / ARCHIVED. | P0 |
| FR-02.04 | Status periode berubah otomatis: OPEN saat tanggal buka tercapai, CLOSED saat tanggal tutup lewat. Admin juga bisa membuka/menutup manual. | P0 |
| FR-02.05 | Hanya satu periode berstatus OPEN dalam satu waktu. | P0 |
| FR-02.06 | Salin periode: menduplikasi bagian, soal, opsi, logika tampil, aturan validasi, dan skema skor. Hasil salinan berstatus DRAFT dan wajib diberi tanggal buka-tutup baru. | P0 |
| FR-02.07 | Perpanjangan tenggat untuk semua lembaga atau lembaga terpilih, dengan alasan wajib diisi. | P1 |
| FR-02.08 | Pengaturan periode: batas lolos (default 70), lama batas revisi (default 7 hari), cakupan revisi (soal terpilih / semua). | P0 |

**Kriteria penerimaan**

- Diberikan periode 2026 berstatus CLOSED, ketika admin menyalinnya menjadi 2027, maka semua soal dan aturan ikut tersalin, jawaban tidak ikut, dan periode 2027 berstatus DRAFT.
- Diberikan jenis TBM sudah dipakai lembaga, ketika admin mencoba menghapus, maka sistem menolak dan menawarkan nonaktifkan.
- Diberikan periode OPEN dengan tanggal tutup 30 Juni 23:59 WIB, ketika waktu lewat, maka status menjadi CLOSED dan tombol Kirim peserta terkunci, kecuali lembaga yang diperpanjang.

### 5.2 M03 — Input peserta & aktivasi akun

**Tujuan:** mendaftarkan lembaga dan memberinya akun aman tanpa admin perlu mengetahui password peserta.

| ID | Sebagai | Saya ingin | Agar |
| --- | --- | --- | --- |
| US-03.1 | Admin | menambah lembaga dengan data lengkap | lembaga terdaftar sebagai peserta |
| US-03.2 | Admin | sistem mengirim link aktivasi ke email resmi lembaga | lembaga membuat password sendiri |
| US-03.3 | Peserta | membuat password kuat lewat link aktivasi | akun saya aman |
| US-03.4 | Admin | mengirim ulang link aktivasi yang kedaluwarsa | lembaga yang terlambat tetap bisa aktivasi |
| US-03.5 | Admin | melihat daftar lembaga per wilayah lalu per jenis | mudah memantau per kelompok |

**Data lembaga (mengikuti format IPLM)**

| Field | Wajib | Validasi |
| --- | --- | --- |
| NPP (Nomor Pokok Perpustakaan) | Ya | Angka, unik di seluruh sistem. Dipakai sebagai username |
| NPSN | Untuk sekolah | Angka 8 digit |
| Nama perpustakaan | Ya | Maks. 200 karakter |
| Nama instansi/lembaga | Ya | Maks. 200 karakter |
| Jenis peserta | Ya | Dari master jenis yang aktif |
| Kecamatan, Kelurahan | Ya | Dari master wilayah. Kelurahan harus di dalam kecamatan yang dipilih |
| Alamat | Ya | Teks bebas |
| Nama kepala lembaga | Tidak | – |
| Nama penanggung jawab/pengisi | Ya | – |
| Email resmi | Ya | Format email valid, unik |
| Nomor WhatsApp | Tidak | Format 62xxxxxxxxxx, disimpan untuk kontak manual |

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-03.01 | Form tambah dan ubah lembaga dengan field di atas. Ubah NPP hanya oleh Super Admin dan tercatat di audit. | P0 |
| FR-03.02 | Saat lembaga disimpan, sistem membuat akun peserta utama (username = NPP, status PENDING\_ACTIVATION) dan token aktivasi. | P0 |
| FR-03.03 | Token aktivasi sekali pakai, berlaku 24 jam, disimpan sebagai hash. Mengirim ulang mencabut token lama. | P0 |
| FR-03.04 | Email aktivasi dikirim ke email resmi lembaga, berisi nama lembaga, username NPP, tombol aktivasi, dan masa berlaku. | P0 |
| FR-03.05 | Halaman aktivasi menampilkan nama lembaga, form password + konfirmasi, meter kekuatan, dan daftar aturan yang tercentang saat terpenuhi. | P0 |
| FR-03.06 | Aturan password: min. 10 karakter, huruf besar, huruf kecil, angka, simbol, tidak memuat NPP atau nama lembaga, tidak ada di daftar password umum. Bisa diubah di Pengaturan. | P0 |
| FR-03.07 | Link kedaluwarsa menampilkan pesan jelas dan tombol Minta link baru (dikirim ke email resmi yang sama). | P0 |
| FR-03.08 | Daftar lembaga bisa dikelompokkan Kecamatan, lalu Jenis, dengan jumlah per kelompok, pencarian, dan filter status akun. | P0 |
| FR-03.09 | Aksi massal: kirim ulang aktivasi ke lembaga terpilih. | P1 |
| FR-03.10 | Nonaktifkan lembaga (soft delete) dan pulihkan. Lembaga nonaktif tidak bisa login dan tidak masuk report default. | P0 |
| FR-03.11 | Impor massal dari Excel di menu khusus: unggah, pratinjau per baris dengan error, simpan, opsi kirim aktivasi. | P2 |

**Kriteria penerimaan**

- Diberikan NPP 61710513 sudah terdaftar, ketika admin menyimpan lembaga lain dengan NPP sama, maka sistem menolak dengan pesan "NPP sudah dipakai oleh \[nama lembaga\]".
- Diberikan link aktivasi dibuat pukul 10.00, ketika peserta membukanya keesokan hari pukul 10.01, maka halaman menampilkan "Link sudah kedaluwarsa" dan tombol Minta link baru.
- Diberikan password "Pontianak2026", ketika peserta menyimpan, maka sistem menolak karena tidak ada simbol, dan tombol Simpan tetap nonaktif.
- Diberikan aktivasi berhasil, maka status akun menjadi ACTIVE, token ditandai terpakai, dan peserta diarahkan ke halaman login dengan NPP terisi.

### 5.3 M04 — Login & keamanan akun

**Tujuan:** satu halaman login untuk admin dan peserta, dengan perlindungan dari tebak password.

| ID | Sebagai | Saya ingin | Agar |
| --- | --- | --- | --- |
| US-04.1 | Peserta | login dengan NPP dan password | tidak perlu mengingat username lain |
| US-04.2 | Admin | login dengan email dan password | akses panel admin |
| US-04.3 | Pengguna | mereset password lewat email | tetap bisa masuk jika lupa |
| US-04.4 | Admin | mereset password dan menonaktifkan akun peserta | menangani akun bermasalah |

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-04.01 | Satu halaman login. Kolom username menerima NPP, NPP-2, atau email. Sistem mengenali peran dari akun. | P0 |
| FR-04.02 | Pesan gagal login generik ("NPP/email atau password salah") supaya tidak membocorkan akun mana yang ada. | P0 |
| FR-04.03 | 5 kali gagal berturut-turut mengunci akun 15 menit dan mengirim email peringatan. Angka bisa diubah di Pengaturan. | P0 |
| FR-04.04 | Lupa password: masukkan NPP atau email, sistem mengirim link reset 24 jam ke email terdaftar. Respons selalu sama, baik akun ada maupun tidak. | P0 |
| FR-04.05 | Sesi berakhir setelah 8 jam tidak aktif untuk admin dan 24 jam untuk peserta. Logout menghapus sesi di server. | P0 |
| FR-04.06 | Ganti password dari menu Akun dengan memasukkan password lama. Semua sesi lain ikut diakhiri. | P0 |
| FR-04.07 | Admin bisa: reset password (mengirim link reset, admin tidak pernah melihat password), nonaktifkan, dan aktifkan kembali akun. | P0 |
| FR-04.08 | Setiap login, logout, login gagal, dan penguncian dicatat di login\_attempts dan activity\_logs beserta IP dan perangkat. | P0 |
| FR-04.09 | Rate limit endpoint login dan lupa password per IP. | P0 |
| FR-04.10 | Verifikasi dua langkah untuk admin. | P2 |

**Kriteria penerimaan**

- Diberikan akun peserta aktif, ketika login dengan password salah 5 kali, maka percobaan ke-6 ditolak dengan pesan "Akun terkunci sampai \[jam\]" walau password benar, dan email peringatan terkirim.
- Diberikan peserta login, ketika membuka URL panel admin, maka sistem menampilkan halaman 403 dan mencatatnya di activity\_logs.
- Diberikan admin menekan Reset password, maka peserta menerima email link reset dan password lama tetap berlaku sampai link dipakai.

### 5.4 M05 — Request akun tambahan

**Tujuan:** lembaga bisa punya pengisi kedua, maksimal dua akun per lembaga.

| ID | Sebagai | Saya ingin | Agar |
| --- | --- | --- | --- |
| US-05.1 | Peserta | mengajukan akun kedua untuk rekan saya | pengisian bisa dibagi |
| US-05.2 | Admin | menyetujui atau menolak permintaan akun | jumlah akun terkendali |

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-05.01 | Menu Akun > Ajukan akun tambahan, hanya tampil jika lembaga punya kurang dari 2 akun dan tidak ada permintaan yang masih menunggu. | P0 |
| FR-05.02 | Form: nama lengkap, email, alasan. Email tidak boleh sudah terdaftar. | P0 |
| FR-05.03 | Antrean Permintaan Akun di panel admin dengan badge jumlah yang menunggu. | P0 |
| FR-05.04 | Setuju: sistem membuat akun dengan username NPP-2, status PENDING\_ACTIVATION, lalu mengirim email aktivasi 24 jam ke email pengisi kedua. | P0 |
| FR-05.05 | Tolak: alasan wajib diisi dan dikirim ke email akun pengaju. | P0 |
| FR-05.06 | Batas 2 akun per lembaga ditegakkan di aplikasi dan trigger database. | P0 |
| FR-05.07 | Kedua akun mengisi submission yang sama. Setiap perubahan jawaban mencatat akun pengubahnya. | P0 |
| FR-05.08 | Akun utama bisa melihat siapa akun kedua dan meminta admin menonaktifkannya. | P1 |

**Kriteria penerimaan**

- Diberikan lembaga sudah punya 2 akun, maka tombol Ajukan akun tambahan tidak tampil, dan request lewat API ditolak dengan kode 409.
- Diberikan dua akun mengedit soal yang sama, maka jawaban terakhir yang tersimpan berlaku, dan answer\_history menampilkan kedua perubahan dengan nama masing-masing.

### 5.5 M06 — Builder kuesioner

**Tujuan:** admin menyusun soal sendiri, lengkap dengan tipe jawaban, jenis peserta yang berlaku, logika tampil, dan aturan validasi, tanpa bantuan developer.

| ID | Sebagai | Saya ingin | Agar |
| --- | --- | --- | --- |
| US-06.1 | Admin | menyusun soal per bagian (Koleksi, SDM, Pelayanan, Pengelolaan, dll.) | kuesioner terstruktur |
| US-06.2 | Admin | memilih tipe jawaban yang sesuai | jawaban terukur dan mudah dihitung |
| US-06.3 | Admin | menentukan soal berlaku untuk jenis tertentu | SD tidak melihat soal khusus TBM |
| US-06.4 | Admin | menambah aturan validasi per soal | data salah tertahan sebelum masuk penilaian |
| US-06.5 | Admin | melihat pratinjau sebagai jenis peserta tertentu | memastikan tampilan benar sebelum terbit |

**Tipe jawaban yang disediakan**

| Tipe | Contoh penggunaan | Pengaturan |
| --- | --- | --- |
| Angka bulat | Jumlah siswa, jumlah eksemplar | Min, maks, satuan |
| Desimal | Luas ruang (m²) | Jumlah desimal, min, maks |
| Rupiah | Anggaran koleksi | Pemisah ribuan otomatis, min |
| Persentase | Persentase koleksi digital | 0–100 |
| Teks pendek / Paragraf | Nama program, deskripsi kegiatan | Panjang maks. |
| Pilihan tunggal / Dropdown | Status akreditasi | Daftar opsi + nilai skor per opsi |
| Pilihan ganda | Jenis layanan yang tersedia | Daftar opsi, min/maks pilihan |
| Ya / Tidak | Memiliki kebijakan layanan tertulis | Nilai skor Ya/Tidak |
| Tanggal | Tanggal SK perpustakaan | Rentang tanggal |
| Skala 1–5 | Penilaian diri | Label ujung skala |
| Link (URL) | Link Google Drive bukti dukung | Pola domain yang diizinkan |
| Tabel isian | Daftar kegiatan budaya baca (nama, tanggal, peserta) | Kolom dan tipe per kolom, min/maks baris |
| Unggah file | Bukti dukung langsung | Tahap lanjutan |

**Aturan validasi**

| Jenis aturan | Contoh | Parameter |
| --- | --- | --- |
| Wajib | Jumlah siswa wajib diisi | – |
| Rentang | Anggaran 0 sampai 10.000.000.000 | Min, maks |
| Perbandingan antarsoal | Eksemplar tercetak ≥ judul tercetak; koleksi termanfaat ≤ total koleksi | Soal pembanding, operator |
| Format | Link harus dari drive.google.com | Pola teks |
| Perubahan dari tahun lalu | Flag jika naik atau turun lebih dari 50% | Persentase maks. |
| Ekspresi bebas | j\_siswa > 0 jika jenis SD atau SMP | Ekspresi dengan kode variabel |

Setiap aturan punya tingkat **Blokir** (peserta tidak bisa mengirim sampai diperbaiki) atau **Flag** (boleh mengirim, ditandai untuk ditinjau admin), plus pesan yang ditulis admin.

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-06.01 | Satu kuesioner per periode, terdiri dari bagian yang bisa diurutkan dengan drag and drop. | P0 |
| FR-06.02 | Soal punya: kode variabel unik (huruf kecil, angka, garis bawah), teks soal, teks bantuan, tipe, wajib/tidak, urutan. | P0 |
| FR-06.03 | Kode variabel dibuat otomatis dari teks soal dan bisa diubah. Tidak bisa diubah setelah terbit karena dipakai di rumus. | P0 |
| FR-06.04 | Berlaku-untuk: kosong berarti semua jenis, atau pilih satu/lebih jenis. | P0 |
| FR-06.05 | Logika tampil: soal tampil atau menjadi wajib jika soal lain memenuhi kondisi (sama dengan, lebih dari, berisi, dll.). | P1 |
| FR-06.06 | Aturan validasi tanpa batas jumlah per soal, masing-masing dengan tingkat dan pesan. Editor menampilkan contoh nilai lolos dan gagal. | P0 |
| FR-06.07 | Opsi jawaban bisa diberi nilai skor untuk dipakai mesin skoring. | P0 |
| FR-06.08 | Bukti dukung: kolom link Google Drive per bagian atau per soal, dengan petunjuk format folder dari pusat. | P0 |
| FR-06.09 | Pratinjau sebagai jenis tertentu, termasuk uji coba isi dan lihat pesan validasi, tanpa menyimpan data. | P0 |
| FR-06.10 | Terbitkan: sistem memeriksa kode variabel unik, aturan yang merujuk soal yang ada, dan logika tampil tanpa siklus. Setelah terbit, struktur terkunci; hanya teks bantuan dan pesan yang masih bisa diedit. | P0 |
| FR-06.11 | Duplikat soal dan duplikat bagian. | P1 |

**Kriteria penerimaan**

- Diberikan soal "Jumlah siswa" berlaku untuk SD dan SMP, ketika peserta TBM membuka survei, maka soal itu tidak tampil dan tidak dihitung di progres.
- Diberikan aturan Blokir "eksemplar ≥ judul", ketika peserta mengisi judul 3.914 dan eksemplar 3.000, maka pesan admin tampil di bawah soal dan tombol Kirim nonaktif.
- Diberikan kuesioner sudah terbit, ketika admin mencoba mengubah tipe soal, maka sistem menolak dan menjelaskan bahwa struktur terkunci.

### 5.6 M07 — Pengisian survei (portal peserta)

**Tujuan:** peserta mengisi dengan nyaman, termasuk di ponsel, tanpa kehilangan data, dan tahu kesalahan sebelum mengirim.

| ID | Sebagai | Saya ingin | Agar |
| --- | --- | --- | --- |
| US-07.1 | Peserta | jawaban tersimpan otomatis | tidak hilang jika koneksi putus |
| US-07.2 | Peserta | melihat progres per bagian | tahu berapa yang tersisa |
| US-07.3 | Peserta | melihat ringkasan sebelum mengirim | yakin data benar |
| US-07.4 | Peserta | menerima tanda terima | punya bukti sudah mengirim |

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-07.01 | Beranda peserta: status submission, sisa hari ke tenggat, catatan revisi (jika ada), tombol Lanjutkan mengisi. | P0 |
| FR-07.02 | Sebelum periode buka: hitung mundur. Setelah tutup: mode baca saja. | P0 |
| FR-07.03 | Hanya soal yang berlaku untuk jenis lembaga dan memenuhi logika tampil yang ditampilkan. | P0 |
| FR-07.04 | Autosave setiap perubahan (debounce 1 detik) dengan indikator "Tersimpan pukul 10.42". Jika gagal, tampil peringatan dan coba ulang otomatis. | P0 |
| FR-07.05 | Navigasi per bagian dengan progres (%) dan penanda bagian yang masih punya error. | P0 |
| FR-07.06 | Aturan Blokir dicek langsung saat isian ditinggalkan; pesan tampil di bawah soal. Aturan Flag tidak ditampilkan ke peserta sebelum kirim. | P0 |
| FR-07.07 | Input angka dan rupiah memakai format ribuan Indonesia (titik). | P0 |
| FR-07.08 | Halaman ringkasan: semua jawaban per bagian, soal kosong, dan error Blokir dengan link langsung ke soal. | P0 |
| FR-07.09 | Kirim: konfirmasi pernyataan data benar + nama pengisi. Setelah kirim, semua jawaban terkunci. | P0 |
| FR-07.10 | Email tanda terima berisi waktu kirim dan ringkasan PDF jawaban. | P1 |
| FR-07.11 | Tampilan responsif sampai lebar 360 px. | P0 |

**Kriteria penerimaan**

- Diberikan peserta mengisi 10 soal lalu menutup browser, ketika login kembali, maka 10 jawaban tetap ada dan progres sesuai.
- Diberikan masih ada 1 error Blokir, maka tombol Kirim di ringkasan nonaktif dan menunjuk soal yang salah.
- Diberikan periode sudah tutup dan lembaga tidak diperpanjang, maka semua isian bisa dilihat tapi tidak bisa diubah.

### 5.7 M08 — Validasi otomatis & revisi

**Tujuan:** sistem memeriksa dulu, admin memutuskan. Revisi dibuka hanya untuk soal yang bermasalah, dengan catatan dan batas waktu.

| ID | Sebagai | Saya ingin | Agar |
| --- | --- | --- | --- |
| US-08.1 | Admin | melihat tanda pada kiriman yang melanggar aturan Flag | tahu mana yang perlu dicek |
| US-08.2 | Admin | membuka revisi untuk soal tertentu dengan catatan | peserta tahu apa yang harus diperbaiki |
| US-08.3 | Peserta | melihat soal yang harus direvisi beserta catatannya | memperbaiki dengan tepat |
| US-08.4 | Admin | membandingkan jawaban sebelum dan sesudah revisi | memastikan perbaikan benar |

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-08.01 | Saat peserta mengirim, mesin aturan menjalankan semua aturan aktif dan menyimpan hasilnya di validation\_results. | P0 |
| FR-08.02 | Daftar Verifikasi: semua kiriman, kolom jumlah flag terbuka, ikon merah untuk yang punya flag, filter wilayah/jenis/status. | P0 |
| FR-08.03 | Halaman detail kiriman: jawaban per bagian, flag di samping soal terkait, link bukti dukung, riwayat versi. | P0 |
| FR-08.04 | Per flag, admin bisa menandai Diterima (data memang benar) dengan catatan opsional. | P0 |
| FR-08.05 | Minta revisi: pilih soal yang dibuka (atau semua, sesuai pengaturan periode), tulis catatan per soal dan catatan umum, tentukan batas waktu (default dari pengaturan periode). | P0 |
| FR-08.06 | Status menjadi NEEDS\_REVISION; email terkirim ke semua akun lembaga berisi daftar soal dan catatan. | P0 |
| FR-08.07 | Peserta hanya bisa mengubah soal yang dibuka; soal lain terkunci dan ditandai "tidak perlu diubah". | P0 |
| FR-08.08 | Kirim ulang menjalankan aturan lagi; putaran revisi bertambah satu; snapshot baru disimpan. | P0 |
| FR-08.09 | Lewat batas revisi: revisi berstatus EXPIRED, jawaban terakhir dipakai, flag tetap tercatat. Admin bisa memperpanjang batas revisi. | P0 |
| FR-08.10 | Bandingkan versi: tampilan berdampingan antar putaran dengan perubahan disorot. | P1 |
| FR-08.11 | Verifikasi: admin menandai kiriman Terverifikasi; hanya kiriman terverifikasi yang masuk perhitungan skor resmi. | P0 |
| FR-08.12 | Admin bisa membatalkan verifikasi (dengan alasan) selama skor belum dipublikasikan. | P1 |

**Kriteria penerimaan**

- Diberikan aturan Flag "naik > 50% dari tahun lalu" dan eksemplar naik dari 2.292 ke 8.000, ketika peserta mengirim, maka kiriman masuk dengan 1 flag dan ikon merah di daftar admin.
- Diberikan admin membuka revisi untuk 2 soal, ketika peserta login, maka beranda menampilkan banner revisi, 2 soal itu bisa diedit dengan catatan admin, dan soal lain terkunci.
- Diberikan revisi sudah dikirim ulang, maka admin melihat versi 1 dan versi 2 berdampingan dengan nilai yang berubah disorot.

### 5.8 M09 — Mesin skoring

**Tujuan:** rumus penilaian diatur admin dari sistem, bisa diuji sebelum dipakai, dan setiap skor bisa ditelusuri asal angkanya.

**Model penilaian.** Rumus disusun sebagai graf node bertingkat: soal (variabel) → indikator → subdimensi → dimensi → indeks. Satu indikator boleh masuk ke lebih dari satu induk, misalnya subdimensi Koleksi dan dimensi Kinerja, masing-masing dengan bobotnya.

**Normalisasi yang disediakan**

| Metode | Cara kerja | Contoh |
| --- | --- | --- |
| Tanpa normalisasi | Nilai dipakai apa adanya (sudah 0–1) | Rasio yang sudah dihitung |
| Rasio terhadap target | MIN(nilai / target, 1) | Eksemplar per siswa, target 10 |
| Min-max antar peserta | (nilai − min) / (maks − min) di periode yang sama | Jumlah pemustaka |
| Tabel ambang | Rentang nilai dipetakan ke skor | 0–2 = 0,25; 2–5 = 0,5; 5–10 = 0,75; >10 = 1 |
| Nilai opsi | Skor diambil dari nilai opsi jawaban | Ya = 1, Tidak = 0 |

Pengaturan awal mengikuti data contoh:

```latex
\text{Indeks Dasar} = (0{,}30 \times \text{Kepatuhan} + 0{,}70 \times \text{Kinerja}) \times 100
```

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-09.01 | Skema skor per periode, bisa punya beberapa versi; hanya satu berstatus ACTIVE. | P0 |
| FR-09.02 | Editor pohon: tambah node (indikator, subdimensi, dimensi, indeks), hubungkan ke induk dengan bobot. | P0 |
| FR-09.03 | Editor rumus indikator dengan autocomplete kode variabel, operator + − × ÷, fungsi MIN, MAX, IF, SUM, AVG, ROUND. Dievaluasi dengan parser aman, bukan eval. | P0 |
| FR-09.04 | Pilihan normalisasi dan parameternya per node. | P0 |
| FR-09.05 | Target atau rumus bisa dibedakan per jenis peserta (misalnya target eksemplar per siswa SD berbeda dengan TBM). | P1 |
| FR-09.06 | Validasi sebelum aktif: total bobot setiap induk = 100%, tidak ada siklus, semua variabel ada di kuesioner, tepat satu node indeks. | P0 |
| FR-09.07 | Uji rumus: hitung pada kiriman terpilih atau data contoh, tampilkan rincian per node, tanpa menyimpan sebagai skor resmi. | P0 |
| FR-09.08 | Hitung resmi: berjalan pada semua kiriman Terverifikasi, menyimpan skor indeks, rincian per node, kategori, dan ranking (keseluruhan, per jenis, per kecamatan). | P0 |
| FR-09.09 | Hitung ulang saat rumus berubah; skor lama tetap tersimpan dengan versi rumusnya, skor baru menjadi yang berlaku. | P0 |
| FR-09.10 | Kategori skor diatur admin, misalnya ≥ 70 Lolos Nasional, dengan warna. | P0 |
| FR-09.11 | Publikasikan skor (Super Admin): skor tampil ke peserta dan email pemberitahuan terkirim. Bisa ditarik kembali dengan alasan. | P0 |
| FR-09.12 | Salin skema dari periode lalu. | P0 |

**Kriteria penerimaan**

- Diberikan bobot Kepatuhan 30% dan Kinerja 60%, ketika admin mengaktifkan skema, maka sistem menolak dengan pesan "Total bobot Indeks Dasar 90%, harus 100%".
- Diberikan Kepatuhan 0,865 dan Kinerja 0,858, maka Indeks Dasar = 86,01. Data contoh Perpustakaan Kota Pontianak mencatat 85,99; selisih ≤ 0,05 berasal dari pembulatan dimensi ke 3 desimal dan dianggap lolos uji.
- Diberikan rumus diubah setelah hitung resmi, ketika dihitung ulang, maka setiap skor menyimpan versi rumus yang dipakai dan skor lama masih bisa dilihat di riwayat.

### 5.9 M10 — Monitoring & reminder

**Tujuan:** admin tahu siapa yang belum mengisi dalam sekali lihat, dan sistem mengingatkan peserta tanpa kerja manual.

| ID | Sebagai | Saya ingin | Agar |
| --- | --- | --- | --- |
| US-10.1 | Admin | melihat jumlah lembaga per status | tahu kondisi periode berjalan |
| US-10.2 | Admin | melihat status per lembaga, dikelompokkan wilayah lalu jenis | tahu kecamatan mana yang tertinggal |
| US-10.3 | Admin | mengirim pengingat ke lembaga terpilih sekaligus | menghemat waktu |
| US-10.4 | Peserta | menerima pengingat sebelum tenggat | tidak lupa mengirim |

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-10.01 | Kartu ringkas: total lembaga, Belum Aktivasi, Belum Mengisi, Draf, Terkirim, Ada Flag, Perlu Revisi, Terverifikasi. Klik kartu memfilter tabel. | P0 |
| FR-10.02 | Grafik progres per kecamatan dan per jenis (batang bertumpuk menurut status). | P0 |
| FR-10.03 | Tabel lembaga dengan kelompok Kecamatan > Jenis, kolom status, progres draf (%), terakhir disimpan, jumlah flag, tenggat. | P0 |
| FR-10.04 | Aksi massal: kirim reminder, kirim ulang aktivasi, ekspor daftar. | P0 |
| FR-10.05 | Reminder terjadwal (Vercel Cron harian 07.00 WIB): tenggat (H-7, H-3, H-1), aktivasi belum dilakukan, batas revisi besok. Jadwal dan status sasaran diatur admin per periode. | P0 |
| FR-10.06 | Tidak mengirim email yang sama ke lembaga yang sama lebih dari sekali per hari. | P0 |
| FR-10.07 | Halaman detail lembaga: data, akun, status, timeline aktivitas (aktivasi, login terakhir, simpan, kirim, revisi, email). | P1 |

**Kriteria penerimaan**

- Diberikan tenggat 30 Juni dan jadwal H-3, ketika cron 27 Juni berjalan, maka lembaga berstatus Belum Mengisi dan Draf menerima email, lembaga Terkirim tidak.
- Diberikan admin memilih 12 lembaga dan menekan Kirim reminder, maka 12 email masuk antrean dan aksi tercatat di activity\_logs dengan jumlah penerima.

### 5.10 M11 — Report & analitik

**Tujuan:** laporan dan grafik siap pakai dengan filter yang bisa diatur, termasuk memilih kiriman di atas atau di bawah batas skor.

| ID | Sebagai | Saya ingin | Agar |
| --- | --- | --- | --- |
| US-11.1 | Admin | memilih data lewat form filter | laporan sesuai kebutuhan, misalnya hanya skor ≥ 70 |
| US-11.2 | Admin | melihat ranking dan grafik | mudah mengambil keputusan |
| US-11.3 | Admin | mengekspor ke Excel format IPLM | menyerahkan ke tingkat nasional |
| US-11.4 | Admin | menyimpan filter yang sering dipakai | tidak mengatur ulang setiap kali |

**Form filter report**

| Filter | Pilihan |
| --- | --- |
| Periode | Satu atau beberapa periode (untuk tren) |
| Wilayah | Kecamatan, Kelurahan (multi-pilih) |
| Jenis peserta | Multi-pilih |
| Status pengisian | Multi-pilih |
| Rentang skor | ≥ batas lolos, < batas lolos, atau rentang kustom |
| Kategori skor | Dari skema aktif |
| Flag | Semua / ada flag / tanpa flag |

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-11.01 | Form filter di atas; hasil langsung diperbarui; filter bisa disimpan dan dibagikan ke admin lain. | P0 |
| FR-11.02 | Tabel ranking: keseluruhan, per jenis, per kecamatan, dengan skor indeks, dimensi, subdimensi, kategori. | P0 |
| FR-11.03 | Grafik: sebaran skor (histogram), rata-rata subdimensi per jenis, perbandingan antar kecamatan, tren antar periode, profil radar satu lembaga. | P0 |
| FR-11.04 | Analitik jawaban: statistik per soal (rata-rata, median, min, maks, jumlah kosong). | P1 |
| FR-11.05 | Ekspor Excel dengan kolom persis seperti file IPLM (Provinsi, Kab/Kota, nm\_perpustakaan, ..., Indeks\_Dasar\_0\_100, data\_dukung). | P0 |
| FR-11.06 | Ekspor PDF laporan ringkas dan rapor per peserta (satu atau massal dalam ZIP). | P0 |
| FR-11.07 | Setiap ekspor dicatat di activity\_logs beserta filter dan jumlah baris. | P0 |

**Kriteria penerimaan**

- Diberikan filter jenis SD dan skor ≥ 70, maka hanya kiriman SD dengan skor berlaku ≥ 70 yang tampil dan ikut terekspor.
- Diberikan ekspor Excel, maka urutan dan nama kolom sama dengan file IPLM contoh sehingga bisa langsung diserahkan.

### 5.11 Skor & rapor peserta

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-12.01 | Menu Skor Saya tampil setelah skor periode dipublikasikan; sebelumnya menampilkan "Penilaian sedang diproses". | P0 |
| FR-12.02 | Menampilkan Indeks Dasar, kategori, nilai dimensi dan subdimensi, grafik radar, dan perbandingan dengan rata-rata jenisnya. | P0 |
| FR-12.03 | Ranking ditampilkan atau disembunyikan sesuai pengaturan periode. | P1 |
| FR-12.04 | Unduh rapor PDF berlogo LibCon dan Perpustakaan Kota. | P0 |
| FR-12.05 | Riwayat skor periode-periode sebelumnya. | P1 |

### 5.12 Tracking, audit & log

**Tujuan:** setiap perubahan dan aksi penting bisa dijawab: siapa, kapan, apa yang berubah, dari mana.

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-13.01 | Semua tabel punya created\_at dan created\_by. Tabel yang bisa diubah punya updated\_at dan updated\_by. Tabel master punya deleted\_at dan deleted\_by (soft delete). | P0 |
| FR-13.02 | Kolom \*\_by diisi otomatis dari pengguna yang login. Aksi cron, impor, dan trigger dicatat atas nama user SYSTEM. created\_by tidak boleh kosong. | P0 |
| FR-13.03 | audit\_logs: trigger Postgres pada semua tabel non-log mencatat INSERT, UPDATE, DELETE, SOFT\_DELETE, RESTORE dengan data lama, data baru, kolom berubah, pelaku, peran, IP, user agent, request\_id, sumber. | P0 |
| FR-13.04 | activity\_logs: login, logout, login gagal, akun terkunci, ganti password, lihat jawaban peserta, ekspor report, unduh rapor, kirim ulang aktivasi, reminder massal, hitung skor, publikasi skor. | P0 |
| FR-13.05 | Riwayat domain: answer\_history per soal, submission\_snapshots per kiriman, score\_runs per perhitungan, email\_logs per email. | P0 |
| FR-13.06 | Tab Riwayat di halaman detail lembaga, kiriman, soal, dan skema skor. | P0 |
| FR-13.07 | Menu Log Aktivitas (Super Admin): filter pengguna, aksi, tabel, rentang waktu; detail perubahan sebelum-sesudah; ekspor CSV. | P0 |
| FR-13.08 | Log append-only: role database aplikasi tidak punya izin UPDATE/DELETE pada tabel log. Partisi per bulan, retensi minimal 5 tahun. | P0 |
| FR-13.09 | Pulihkan data yang di-soft delete dari tab Riwayat. | P1 |

### 5.13 Pengaturan sistem

| FR | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-14.01 | Kelola pengguna admin (Super Admin): tambah lewat undangan email, ubah peran, nonaktifkan. | P0 |
| FR-14.02 | Template email: ubah subjek dan isi dengan variabel ({nama\_lembaga}, {npp}, {link}, {tenggat}, {catatan}), pratinjau, kirim uji. | P0 |
| FR-14.03 | Kebijakan keamanan: panjang password minimum, batas gagal login, lama kunci, lama sesi. | P1 |
| FR-14.04 | Identitas: nama Perpustakaan Kota, logo, alamat, email pengirim, tanda tangan rapor. | P0 |
| FR-14.05 | Petunjuk format bukti dukung (template dari pusat) yang tampil di portal peserta. | P1 |

## 6. Aturan bisnis

Ringkasan aturan yang berlaku di seluruh sistem. Nilai bertanda (ubah) bisa diatur admin.

| Kode | Aturan |
| --- | --- |
| BR-01 | Satu lembaga = satu NPP unik. NPP menjadi username akun utama. |
| BR-02 | Maksimal 2 akun peserta per lembaga: akun utama (NPP) dan akun kedua (NPP-2) lewat persetujuan admin. |
| BR-03 | Link aktivasi dan reset password berlaku 24 jam, sekali pakai. Link baru mencabut link lama. |
| BR-04 | Password minimal 10 karakter dengan huruf besar, kecil, angka, dan simbol (ubah). |
| BR-05 | 5 kali gagal login mengunci akun 15 menit (ubah). |
| BR-06 | Hanya satu periode OPEN pada satu waktu. Satu kuesioner per periode. |
| BR-07 | Satu submission per lembaga per periode, dibuat saat peserta pertama kali membuka survei. |
| BR-08 | Soal tampil jika berlaku untuk jenis lembaga dan memenuhi logika tampil. Soal tersembunyi tidak divalidasi dan tidak dihitung. |
| BR-09 | Aturan Blokir mencegah kirim. Aturan Flag tidak mencegah kirim tetapi menandai kiriman untuk admin. |
| BR-10 | Setelah dikirim, semua jawaban terkunci. Hanya admin yang bisa membuka lewat revisi. |
| BR-11 | Revisi membuka soal terpilih saja (ubah: atau semua). Batas revisi default 7 hari (ubah). Hanya satu revisi terbuka per kiriman. |
| BR-12 | Lewat tanggal tutup, peserta tidak bisa mengirim kecuali diperpanjang. Draf yang tidak dikirim berstatus Tidak Mengisi. |
| BR-13 | Hanya kiriman Terverifikasi yang masuk skor resmi. |
| BR-14 | Satu skema skor ACTIVE per periode. Total bobot setiap induk = 100%. |
| BR-15 | Batas lolos default 70 (ubah). Kiriman di bawah batas tetap tersimpan dan bisa dilaporkan. |
| BR-16 | Skor tampil ke peserta hanya setelah Super Admin memublikasikan skor periode itu. |
| BR-17 | Kode variabel soal dan struktur kuesioner terkunci setelah terbit. |
| BR-18 | Tidak ada hapus permanen untuk data inti. Semua perubahan tercatat di audit log. |
| BR-19 | Data periode lalu tidak berubah saat periode baru diedit, karena salinan berupa baris baru. |

## 7. Notifikasi email

Semua notifikasi dikirim lewat email dari alamat resmi Perpustakaan Kota. Isi template bisa diubah admin, dan setiap pengiriman tercatat di email\_logs.

| Kode template | Pemicu | Penerima | Isi utama |
| --- | --- | --- | --- |
| ACTIVATION | Lembaga atau akun kedua dibuat; kirim ulang | Email akun | Nama lembaga, username, tombol aktivasi, berlaku 24 jam |
| PASSWORD\_RESET | Lupa password atau reset oleh admin | Email akun | Tombol reset, berlaku 24 jam |
| ACCOUNT\_LOCKED | 5 kali gagal login | Email akun | Waktu kunci, saran reset password |
| ACCOUNT\_REQUEST\_APPROVED | Admin setujui akun kedua | Akun pengaju | Akun kedua dibuat, email aktivasi menyusul |
| ACCOUNT\_REQUEST\_REJECTED | Admin tolak akun kedua | Akun pengaju | Alasan penolakan |
| REMINDER\_ACTIVATION | Cron: akun belum aktivasi | Email resmi lembaga | Ajakan aktivasi, tombol minta link baru |
| REMINDER\_DEADLINE | Cron: H-7, H-3, H-1 (ubah) | Semua akun lembaga Belum Mengisi / Draf | Tenggat, progres saat ini, tombol lanjut mengisi |
| SUBMISSION\_RECEIPT | Peserta mengirim | Semua akun lembaga | Waktu kirim, lampiran ringkasan PDF |
| REVISION\_OPENED | Admin minta revisi | Semua akun lembaga | Daftar soal + catatan, batas revisi |
| REMINDER\_REVISION | Cron: batas revisi besok | Semua akun lembaga | Sisa waktu, soal yang belum diperbaiki |
| SCORE\_PUBLISHED | Super Admin publikasi skor | Semua akun lembaga | Ajakan melihat skor dan mengunduh rapor |

**Persyaratan teknis email**

- Domain pengirim memakai SPF, DKIM, dan DMARC supaya tidak masuk spam.
- Penyedia email transaksional (misalnya Resend, SendGrid, atau SMTP resmi Pemkot) dengan webhook status terkirim, gagal, bounce, dan dibuka.
- Email gagal dicoba ulang 3 kali dengan jeda bertahap, lalu ditandai FAILED dan tampil di panel admin.
- Setiap email punya versi teks biasa dan HTML.

## 8. Struktur menu & daftar layar

Aplikasi punya dua area: panel admin (/admin) dan portal peserta (/portal), ditambah halaman publik untuk login, aktivasi, dan reset.

### Halaman publik

| Layar | Rute | Isi |
| --- | --- | --- |
| Login | /login | Username (NPP/email), password, lupa password |
| Aktivasi | /aktivasi/\[token\] | Nama lembaga, buat password + meter kekuatan |
| Lupa password | /lupa-password | Input NPP atau email |
| Reset password | /reset/\[token\] | Password baru |
| Link kedaluwarsa | – | Pesan + tombol minta link baru |

### Panel admin

| Menu | Layar | Peran |
| --- | --- | --- |
| Dashboard | Kartu status, grafik progres per kecamatan dan jenis, tenggat terdekat | Admin, Super Admin |
| Peserta | Daftar (kelompok kecamatan > jenis), tambah/ubah, detail lembaga dengan tab Data, Akun, Kiriman, Riwayat | Admin, Super Admin |
| Permintaan Akun | Antrean persetujuan akun kedua | Admin, Super Admin |
| Periode | Daftar periode, buat, salin, perpanjangan | Super Admin (Admin lihat) |
| Kuesioner | Builder bagian dan soal, panel aturan validasi, logika tampil, pratinjau, terbitkan | Admin, Super Admin |
| Verifikasi | Antrean kiriman, detail kiriman dengan flag, minta revisi, bandingkan versi, verifikasi | Admin, Super Admin |
| Skoring | Pohon penilaian, editor rumus, uji rumus, hitung, kategori, publikasi | Super Admin (Admin lihat) |
| Report | Form filter, ranking, grafik, analitik soal, ekspor, filter tersimpan | Admin, Super Admin |
| Log Aktivitas | Audit log dan activity log dengan filter | Super Admin |
| Pengaturan | Wilayah, jenis peserta, template email, jadwal reminder, keamanan, identitas, admin | Super Admin |
| Impor Data | Unggah Excel, pratinjau, simpan (tahap lanjutan) | Admin, Super Admin |

### Portal peserta

| Menu | Layar |
| --- | --- |
| Beranda | Status, tenggat, banner revisi, tombol lanjut mengisi |
| Survei | Navigasi bagian, soal, autosave, ringkasan, kirim |
| Skor Saya | Indeks, kategori, radar subdimensi, rapor PDF, riwayat |
| Profil Lembaga | Data lembaga, ajukan koreksi |
| Akun | Ganti password, daftar akun lembaga, ajukan akun kedua |

### Prinsip UX

- Bahasa Indonesia sederhana, istilah yang dikenal pustakawan.
- Status selalu ditampilkan dengan warna dan teks (bukan warna saja).
- Tindakan berbahaya (hapus, tolak, publikasi) memakai konfirmasi di halaman, menyebut dampaknya.
- Setiap tabel punya pencarian, filter, urut, dan ekspor.
- Pesan error menjelaskan apa yang salah dan cara memperbaikinya.
- Memenuhi WCAG 2.1 AA: kontras, navigasi keyboard, label form.

## 9. Kebutuhan non-fungsional

| Kategori | Kebutuhan |
| --- | --- |
| Kinerja | Halaman utama tampil < 2 detik di koneksi 4G. Autosave < 500 ms. Hitung skor 1.000 kiriman < 60 detik. |
| Kapasitas | Dirancang untuk minimal 2.000 lembaga dan 200 pertanyaan per kuesioner tanpa perubahan arsitektur. |
| Ketersediaan | Target 99,5% per bulan, terutama selama periode survei terbuka. |
| Keamanan akun | Password di-hash argon2id. Token di-hash SHA-256. Cookie sesi HttpOnly, Secure, SameSite=Lax. |
| Keamanan aplikasi | Proteksi CSRF, validasi input di server (Zod), rate limit login, header keamanan (CSP, HSTS), mengikuti OWASP Top 10. |
| Otorisasi | Pengecekan peran dan kepemilikan lembaga di setiap server action dan route API, tidak hanya menyembunyikan menu. Row-level security Postgres sebagai lapis kedua untuk data peserta. |
| Privasi data | Data pribadi (nama, email, WhatsApp) hanya terlihat oleh admin dan lembaga terkait. Mengikuti UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi. |
| Audit | 100% perubahan data tercatat di audit\_logs. Log disimpan minimal 5 tahun. |
| Cadangan data | Backup otomatis harian dengan point-in-time recovery 7 hari. Uji pemulihan setiap periode baru. |
| Kompatibilitas | Chrome, Edge, Firefox, Safari dua versi terakhir. Responsif dari lebar 360 px. |
| Aksesibilitas | WCAG 2.1 AA. |
| Bahasa & zona waktu | Antarmuka Bahasa Indonesia. Waktu disimpan UTC, ditampilkan WIB. Format angka Indonesia (1.234,56). |
| Observabilitas | Error tracking (misalnya Sentry), log server terstruktur dengan request\_id yang sama dengan audit\_logs. |

## 10. Arsitektur & tech stack

LibCon adalah satu aplikasi Next.js (TypeScript, Tailwind) yang di-deploy ke Vercel, dengan PostgreSQL sebagai satu-satunya sumber data.

&#91;embedded content: arsitektur LibCon · 1 aplikasi, 4 layanan pendukung\]

Panel admin dan portal peserta berada di aplikasi yang sama dan dipisahkan oleh peran. Cron Vercel memanggil aplikasi setiap hari untuk reminder dan perubahan status periode.

| Lapisan | Pilihan | Catatan |
| --- | --- | --- |
| Framework | Next.js App Router + TypeScript | Server Components untuk halaman, Server Actions untuk simpan data |
| UI | Tailwind CSS + shadcn/ui | Komponen konsisten dan aksesibel |
| Form & validasi | React Hook Form + Zod | Skema Zod sama di klien dan server |
| Tabel & grafik | TanStack Table, Recharts | Tabel peserta besar, grafik dashboard dan report |
| Drag and drop | dnd-kit | Urutan bagian dan soal di builder |
| ORM & migrasi | Prisma (atau Drizzle) | Migrasi versi, seed data awal; trigger dan RLS lewat migrasi SQL |
| Database | PostgreSQL (Neon, Supabase, atau Vercel Postgres) | Trigger audit, RLS, partisi tabel log, point-in-time recovery |
| Autentikasi | Sesi di database + argon2id | Login NPP/email, kunci akun, reset; tanpa login pihak ketiga |
| Evaluasi rumus | mathjs dengan scope terbatas | Tidak memakai eval; hanya variabel dan fungsi yang diizinkan |
| Tugas berat | Antrean background (misalnya Inngest atau Upstash QStash) | Hitung skor massal, email massal, ZIP rapor; menghindari batas waktu fungsi serverless |
| Penjadwalan | Vercel Cron | Reminder 07.00 WIB, buka/tutup periode otomatis |
| Email | Resend + React Email (atau SMTP resmi) | Template HTML, webhook status |
| Ekspor | ExcelJS, @react-pdf/renderer | Excel format IPLM, rapor PDF |
| Penyimpanan file | Vercel Blob | Tahap lanjutan untuk unggah bukti dukung |
| Monitoring | Sentry, Vercel Analytics | Error dan performa |
| Pengujian | Vitest, Playwright | Unit test mesin aturan dan skoring, uji alur end-to-end |

**Lingkungan:** Development (lokal), Preview (setiap pull request, database cabang), Production. Migrasi database dijalankan otomatis saat deploy ke Production.

**Dokumen pendukung:** struktur 44 tabel, relasi, enum, dan constraint ada di dokumen ERD LibCon. Alur langkah per modul ada di dokumen Flowchart LibCon.

## 11. Milestone & rencana rilis

Usulan urutan pengerjaan MVP dalam 6 fase, sekitar 15 minggu. Durasi adalah estimasi awal dan perlu disesuaikan dengan jumlah developer dan tanggal periode survei yang direncanakan.

&#91;embedded content: rencana rilis · 6 fase, 1 gate go-live\]

Setiap fase diakhiri demo ke Perpustakaan Kota. Fase 4 baru bisa final setelah rumus resmi (Q2) tersedia; sebelum itu dikerjakan dengan pengaturan awal 30/70.

**Tahap lanjutan setelah go-live:** impor massal peserta dari Excel, unggah file bukti dukung ke server, verifikasi dua langkah untuk admin, bank soal lintas periode, dan laporan terjadwal lewat email.

## 12. Asumsi, risiko & pertanyaan terbuka

### Asumsi

- Setiap lembaga punya email resmi yang aktif dan bisa diakses pengelola perpustakaan.
- Setiap lembaga punya NPP. Lembaga tanpa NPP (misalnya TBM baru) perlu kebijakan khusus, lihat pertanyaan terbuka.
- Satu Perpustakaan Kota menjalankan satu instance LibCon.
- Bukti dukung disimpan peserta di Google Drive miliknya dan dibagikan dengan akses lihat.

### Risiko

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Email aktivasi masuk spam atau email resmi tidak aktif | Lembaga tidak bisa aktivasi | SPF/DKIM/DMARC, status bounce terlihat di admin, admin bisa mengubah email lalu kirim ulang |
| Rumus resmi berbeda dari model graf | Skor tidak bisa dihitung sesuai juknis | Editor rumus bebas dan ekspresi per node; uji pada data contoh begitu juknis didapat |
| Juknis berubah setelah periode berjalan | Skor perlu dihitung ulang | Versi skema dan hitung ulang tanpa menghapus skor lama |
| Lonjakan akses menjelang tenggat | Lambat atau gagal simpan | Autosave ringan, retry otomatis, reminder H-7 agar beban tersebar |
| Link Google Drive tidak bisa dibuka admin | Bukti tidak bisa diverifikasi | Aturan format link, petunjuk berbagi akses, flag "bukti tidak bisa diakses" saat verifikasi |
| Dua pengisi mengubah soal yang sama | Jawaban tertimpa | answer\_history per soal dengan nama pengubah; indikator "terakhir diubah oleh" |
| Kebocoran data pribadi | Pelanggaran UU PDP | Otorisasi berlapis, RLS, enkripsi transit dan saat tersimpan, audit log |

### Pertanyaan terbuka

| No | Pertanyaan | Pemilik | Status |
| --- | --- | --- | --- |
| Q1 | Format template bukti dukung (struktur folder Google Drive) dari pusat | Perpustakaan Kota | Ditanyakan ke pusat |
| Q2 | Rumus resmi dari jawaban mentah ke indikator dan subdimensi | Perpustakaan Kota | Menunggu juknis |
| Q3 | Arti kolom Indeks\_Final (34,85 di semua baris data contoh) dan apakah ikut dihitung | Perpustakaan Kota | Terbuka |
| Q4 | Kebijakan untuk lembaga yang belum punya NPP | Perpustakaan Kota | Terbuka |
| Q5 | Apakah peserta boleh melihat ranking, atau hanya skor sendiri | Perpustakaan Kota | Terbuka |
| Q6 | Alamat email pengirim resmi dan domain yang dipakai | Perpustakaan Kota / Diskominfo | Terbuka |
| Q7 | Penyedia database (Neon, Supabase, atau Vercel Postgres) dan region server | Tim teknis | Terbuka |
| Q8 | Target metrik keberhasilan di bagian 2 | Perpustakaan Kota | Perlu disepakati |

## 13. Glosarium

| Istilah | Arti |
| --- | --- |
| LibCon | Library Contest, nama sistem ini |
| IPLM | Indeks Pembangunan Literasi Masyarakat, kerangka penilaian yang menjadi acuan data contoh |
| NPP | Nomor Pokok Perpustakaan, identitas unik perpustakaan dan username login peserta |
| NPSN | Nomor Pokok Sekolah Nasional |
| TBM | Taman Bacaan Masyarakat |
| Lembaga / Peserta | Perpustakaan di bawah naungan Perpustakaan Kota yang mengisi survei |
| Periode | Satu siklus lomba dengan tanggal buka dan tutup |
| Kuesioner | Kumpulan bagian dan soal untuk satu periode |
| Kode variabel | Nama unik soal (misalnya j\_siswa) yang dipakai di aturan dan rumus |
| Submission / Kiriman | Seluruh jawaban satu lembaga pada satu periode |
| Aturan Blokir | Aturan validasi yang mencegah peserta mengirim |
| Aturan Flag | Aturan validasi yang tidak mencegah kirim, tetapi menandai kiriman untuk admin |
| Revisi | Pembukaan kembali soal tertentu oleh admin agar peserta memperbaiki |
| Skema skor | Satu versi rumus penilaian untuk satu periode |
| Node | Satu unsur di rumus: indikator, subdimensi, dimensi, atau indeks |
| Indeks Dasar | Skor akhir 0–100 hasil gabungan dimensi |
| Batas lolos | Skor minimum untuk diusulkan ke tingkat nasional, default 70 |
| Soft delete | Data ditandai terhapus tetapi tetap tersimpan dan bisa dipulihkan |
| Audit log | Catatan otomatis setiap perubahan data |
| Activity log | Catatan aksi pengguna yang tidak mengubah data, seperti login dan ekspor |
