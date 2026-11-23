import { test, expect, type Page } from "@playwright/test";

const TEST_PASSWORD = "KataSandiKuat!2026";
const HOUR = 60 * 60 * 1000;

test.describe.configure({ timeout: 120_000 });

const wib = (offsetMs: number) => new Date(Date.now() + offsetMs + 7 * HOUR).toISOString().slice(0, 16);

async function loginSuperAdmin(page: Page) {
  const res = await page.request.post("/api/test/fixtures", {
    data: { action: "create-active-admin", role: "SUPER_ADMIN", password: TEST_PASSWORD },
  });
  const { username } = await res.json();
  await page.goto("/login");
  await page.getByLabel("NPP atau email").fill(username);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

/** Periode Draf baru + kuesionernya. Nama TIDAK berawalan "E2E " — fixture periode.spec mengarsipkan itu. */
async function createQuestionnaire(page: Page) {
  const name = `Kuesioner Uji ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; // tes paralel bisa jalan di ms yang sama
  await page.goto("/admin/periode/baru");
  await page.getByLabel("Nama periode").fill(name);
  await page.getByLabel("Tahun").fill("2026");
  await page.getByLabel("Tanggal-jam buka (WIB)").fill(wib(30 * 24 * HOUR));
  await page.getByLabel("Tanggal-jam tutup (WIB)").fill(wib(60 * 24 * HOUR));
  await page.getByRole("button", { name: "Simpan periode" }).click();
  await expect(flash(page)).toContainText("dibuat (Draf)");

  await page.goto("/admin/kuesioner");
  await page.getByRole("button", { name: `Buat kuesioner ${name}` }).click();
  await expect(flash(page)).toContainText("Kuesioner dibuat (Draf)");
  return name;
}

async function addSection(page: Page, title: string, evidence = "") {
  const form = page.locator("section", { has: page.getByRole("heading", { name: "Tambah bagian" }) });
  await form.getByLabel("Judul bagian").fill(title);
  if (evidence) await form.getByLabel(/Petunjuk link bukti dukung/).fill(evidence);
  await form.getByRole("button", { name: "Tambah bagian" }).click();
  await expect(flash(page)).toContainText(`Bagian ${title} ditambahkan`);
}

// p[role=status]: dnd-kit punya live region ber-role status sendiri
const flash = (page: Page) => page.locator('p[role="status"]');
const sectionTitles = (page: Page) => page.locator("li > div > section h2").allTextContents();

test("builder: bagian, soal per tipe, kode otomatis & unik, berlaku-untuk, urutan [FR-06.01-06.04, 06.07, 06.08]", async ({ page }) => {
  await loginSuperAdmin(page);
  await createQuestionnaire(page);
  const builderUrl = page.url().split("?")[0];

  await addSection(page, "Koleksi", "Folder 01_Koleksi sesuai template pusat");
  await addSection(page, "SDM");
  await expect(page.getByText("Bukti dukung: Folder 01_Koleksi sesuai template pusat")).toBeVisible();

  // FR-06.03: kode variabel otomatis dari teks soal; FR-06.04 berlaku untuk SD saja
  await page.getByRole("link", { name: "+ Tambah soal di Koleksi" }).click();
  await page.getByLabel("Teks soal").fill("Jumlah eksemplar cetak");
  await expect(page.getByLabel(/Kode variabel/)).toHaveValue("jumlah_eksemplar_cetak");
  await page.getByLabel("Min.").fill("0");
  await page.getByLabel("Satuan").fill("buah");
  await page.getByLabel("Sekolah Dasar").check();
  await page.getByLabel("Wajib diisi").check();
  await page.getByRole("button", { name: "Simpan soal" }).click();
  await expect(flash(page)).toContainText("Soal jumlah_eksemplar_cetak ditambahkan");
  await expect(page.getByText("Angka bulat, wajib, berlaku: SD")).toBeVisible();

  // FR-06.07: opsi pilihan dengan nilai skor
  await page.getByRole("link", { name: "+ Tambah soal di Koleksi" }).click();
  await page.getByLabel("Teks soal").fill("Status akreditasi");
  await page.getByLabel("Tipe jawaban").selectOption("SINGLE_CHOICE");
  await page.getByRole("button", { name: "+ Opsi" }).click();
  await page.getByRole("button", { name: "+ Opsi" }).click();
  await page.getByLabel("Teks opsi 1").fill("A");
  await page.getByLabel("Skor opsi A").fill("3");
  await page.getByLabel("Teks opsi 2").fill("B");
  await page.getByLabel("Skor opsi B").fill("2");
  await page.getByRole("button", { name: "Simpan soal" }).click();
  await expect(flash(page)).toContainText("Soal status_akreditasi ditambahkan");

  // validasi: opsi kurang dari 2 ditolak dengan pesan di field
  await page.getByRole("link", { name: "+ Tambah soal di SDM" }).click();
  await page.getByLabel("Teks soal").fill("Jenis layanan");
  await page.getByLabel("Tipe jawaban").selectOption("MULTI_CHOICE");
  await page.getByRole("button", { name: "Simpan soal" }).click();
  await expect(page.getByText("Minimal 2 opsi jawaban")).toBeVisible();

  // kode variabel unik dalam satu kuesioner
  await page.getByLabel("Tipe jawaban").selectOption("INTEGER");
  await page.getByLabel(/Kode variabel/).fill("jumlah_eksemplar_cetak");
  await page.getByRole("button", { name: "Simpan soal" }).click();
  await expect(page.getByText('Kode jumlah_eksemplar_cetak sudah dipakai soal "Jumlah eksemplar cetak"')).toBeVisible();

  // FR-06.01: urutkan bagian dengan keyboard (drag and drop yang aksesibel), tersimpan di server
  await page.goto(builderUrl);
  expect(await sectionTitles(page)).toEqual(["Koleksi", "SDM"]);
  await page.waitForLoadState("networkidle"); // listener keyboard baru terpasang setelah hidrasi
  const handle = page.getByRole("button", { name: "Seret untuk mengurutkan Koleksi" });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true"); // dnd-kit: sedang diangkat
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(500); // sensor keyboard menganimasikan perpindahan sebelum drop dihitung
  await page.keyboard.press("Space");
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => {
    await page.reload();
    return sectionTitles(page);
  }).toEqual(["SDM", "Koleksi"]);
});

async function addIntegerQuestion(page: Page, section: string, label: string, code: string) {
  await page.getByRole("link", { name: `+ Tambah soal di ${section}` }).click();
  await page.getByLabel("Teks soal").fill(label);
  await page.getByLabel(/Kode variabel/).fill(code);
  await page.getByRole("button", { name: "Simpan soal" }).click();
  await expect(flash(page)).toContainText(`Soal ${code} ditambahkan`);
}

test("riwayat kuesioner: soal dihapus saat Draf → Pulihkan dari tab Riwayat [FR-13.06, FR-13.09]", async ({ page }) => {
  await loginSuperAdmin(page);
  await createQuestionnaire(page);
  const builderUrl = page.url().split("?")[0];
  await addSection(page, "Koleksi");
  await addIntegerQuestion(page, "Koleksi", "Jumlah rak", "j_rak");
  await page.goto(builderUrl);
  await page.waitForLoadState("networkidle");
  // :visible — entri Riwayat (tersembunyi dalam <details>) juga memuat teks j_rak
  const row = page.locator("li:visible", { hasText: "j_rak" }).last();
  await row.getByTitle("Hapus", { exact: true }).click();
  await row.getByRole("button", { name: "Ya, hapus j_rak" }).click();
  await expect(flash(page)).toContainText("Soal dihapus");
  await expect(page.locator("li:visible", { hasText: "j_rak" })).toHaveCount(0);

  await page.waitForLoadState("networkidle");
  const history = page.getByTestId("record-history");
  await history.getByText(/^Riwayat/).click();
  await history.locator("li", { hasText: "Hapus (soft)" }).filter({ hasText: "j_rak" }).getByRole("button", { name: "Pulihkan" }).click();
  await expect(flash(page)).toContainText("Soal j_rak dipulihkan");
  await expect(page.getByText("j_rak", { exact: true }).first()).toBeVisible();
});

test("aturan validasi + uji nilai + logika tampil tanpa siklus [FR-06.05, FR-06.06, AC M06]", async ({ page }) => {
  await loginSuperAdmin(page);
  await createQuestionnaire(page);
  await addSection(page, "Koleksi");
  await addIntegerQuestion(page, "Koleksi", "Jumlah judul tercetak", "j_judul");
  await addIntegerQuestion(page, "Koleksi", "Jumlah eksemplar tercetak", "j_eksemplar");

  // AC M06: aturan Blokir "eksemplar ≥ judul" — editor menunjukkan contoh gagal & lolos (FR-06.06)
  await page.getByText("Jumlah eksemplar tercetak").locator("..").locator("..").getByRole("link", { name: "Ubah" }).click();
  await page.getByLabel("Jenis aturan").selectOption("COMPARE");
  await page.getByLabel("Nilai soal ini harus").selectOption("GTE");
  await page.getByLabel("Soal pembanding").selectOption({ label: "j_judul — Jumlah judul tercetak" });
  await page.getByLabel("Pesan untuk peserta").fill("Eksemplar harus lebih besar atau sama dengan judul");
  await page.getByLabel("Nilai j_eksemplar").fill("3000");
  await page.getByLabel("Nilai j_judul").fill("3914");
  await expect(page.getByTestId("rule-test-result")).toContainText("Gagal — “Eksemplar harus lebih besar atau sama dengan judul”");
  await page.getByLabel("Nilai j_eksemplar").fill("4000");
  await expect(page.getByTestId("rule-test-result")).toContainText("Lolos");
  await page.getByRole("button", { name: "Tambah aturan" }).click();
  await expect(page.getByText("Blokir · Perbandingan antarsoal ≥ j_judul")).toBeVisible();

  // ekspresi hanya boleh merujuk kode soal yang ada (FR-06.10) — dicek juga di server
  await page.getByLabel("Jenis aturan").selectOption("EXPRESSION");
  await page.getByLabel(/^Ekspresi/).fill("j_guru > 0");
  await expect(page.getByText("Variabel tidak dikenal: j_guru")).toBeVisible();
  await page.getByLabel(/^Ekspresi/).fill("j_eksemplar > 0 OR jenis != 'SD'");
  await page.getByLabel("Tingkat").selectOption("FLAG");
  await page.getByLabel("Pesan untuk peserta").fill("Eksemplar 0 untuk SD perlu dicek");
  await page.getByRole("button", { name: "Tambah aturan" }).click();
  await expect(page.getByText("Flag · Ekspresi bebas j_eksemplar > 0 OR jenis != 'SD'")).toBeVisible();

  // FR-06.05: j_eksemplar tampil jika j_judul > 0
  await page.getByLabel("Soal ini", { exact: true }).selectOption("SHOW");
  await page.getByLabel("jika soal", { exact: true }).selectOption({ label: "j_judul" });
  await page.getByLabel("operator", { exact: true }).selectOption("GT");
  await page.getByLabel(/^nilai/).fill("0");
  await page.getByRole("button", { name: "Tambah kondisi" }).click();
  await expect(page.getByText("Tampil jika j_judul > 0")).toBeVisible();

  // FR-06.10: j_judul bergantung pada j_eksemplar → siklus ditolak
  await page.getByRole("link", { name: "← Builder kuesioner" }).click();
  await page.getByText("Jumlah judul tercetak").locator("..").locator("..").getByRole("link", { name: "Ubah" }).click();
  await page.getByLabel("jika soal", { exact: true }).selectOption({ label: "j_eksemplar" });
  await page.getByLabel("operator", { exact: true }).selectOption("NOT_EMPTY");
  await page.getByRole("button", { name: "Tambah kondisi" }).click();
  await expect(page.locator(`p[role="alert"]`)).toContainText("siklus");
});

async function openQuestion(page: Page, code: string) {
  // :visible — entri Riwayat (tersembunyi dalam <details>) juga memuat <code> kode soal
  await page.locator("li:visible", { has: page.locator("code", { hasText: new RegExp(`^${code}$`) }) }).last().getByRole("link", { name: /Ubah|Lihat/ }).click();
}

test("pratinjau per jenis, terbit + struktur terkunci, duplikat, salin periode [FR-06.09-06.11, FR-02.06, AC M06]", async ({ page }) => {
  await loginSuperAdmin(page);
  const periodName = await createQuestionnaire(page);
  const builderUrl = page.url().split("?")[0];
  await addSection(page, "Koleksi");
  await addIntegerQuestion(page, "Koleksi", "Jumlah judul tercetak", "j_judul");
  await addIntegerQuestion(page, "Koleksi", "Jumlah eksemplar tercetak", "j_eksemplar");

  // soal khusus SD & SMP, wajib
  await page.getByRole("link", { name: "+ Tambah soal di Koleksi" }).click();
  await page.getByLabel("Teks soal").fill("Jumlah siswa");
  await page.getByLabel(/Kode variabel/).fill("j_siswa");
  await page.getByLabel("Sekolah Dasar").check();
  await page.getByLabel("Sekolah Menengah Pertama").check();
  await page.getByLabel("Wajib diisi").check();
  await page.getByRole("button", { name: "Simpan soal" }).click();
  await expect(flash(page)).toContainText("Soal j_siswa ditambahkan");

  // aturan Blokir eksemplar ≥ judul
  await openQuestion(page, "j_eksemplar");
  await page.getByLabel("Jenis aturan").selectOption("COMPARE");
  await page.getByLabel("Nilai soal ini harus").selectOption("GTE");
  await page.getByLabel("Soal pembanding").selectOption({ label: "j_judul — Jumlah judul tercetak" });
  await page.getByLabel("Pesan untuk peserta").fill("Eksemplar harus ≥ judul");
  await page.getByRole("button", { name: "Tambah aturan" }).click();
  await expect(page.getByText("Blokir · Perbandingan antarsoal ≥ j_judul")).toBeVisible();

  // FR-06.11: duplikat soal
  await page.goto(builderUrl);
  await page.getByRole("button", { name: "Duplikat j_judul" }).click();
  await expect(flash(page)).toContainText("Soal diduplikat");
  await expect(page.getByText("j_judul_2", { exact: true }).first()).toBeVisible(); // first: Riwayat (di bawah) juga memuat kodenya

  // FR-06.09 + AC M06: sebagai TBM soal j_siswa tidak tampil dan tidak dihitung di progres
  await page.getByRole("link", { name: "Pratinjau sebagai peserta" }).click();
  await page.getByLabel("Lihat sebagai jenis").selectOption({ label: "Taman Bacaan Masyarakat" });
  await page.getByRole("button", { name: "Tampilkan" }).click();
  await page.waitForLoadState("networkidle"); // input terkontrol: mengetik sebelum hidrasi bisa ter-reset React
  await expect(page.getByTestId("question-j_siswa")).toHaveCount(0);
  await expect(page.getByTestId("survey-progress")).toContainText("0 dari 3 soal");
  // AC M06: judul 3.914, eksemplar 3.000 → pesan admin di bawah soal, Kirim nonaktif
  await page.getByLabel("Jumlah judul tercetak", { exact: true }).fill("3914");
  await page.getByLabel("Jumlah eksemplar tercetak").fill("3000");
  await expect(page.getByTestId("question-j_eksemplar")).toContainText("Harus diperbaiki: Eksemplar harus ≥ judul");
  await expect(page.getByRole("button", { name: "Kirim (pratinjau)" })).toBeDisabled();
  await page.getByLabel("Jumlah eksemplar tercetak").fill("4000");
  await expect(page.getByRole("button", { name: "Kirim (pratinjau)" })).toBeEnabled();
  await page.getByLabel("Lihat sebagai jenis").selectOption({ label: "Sekolah Dasar" });
  await page.getByRole("button", { name: "Tampilkan" }).click();
  await expect(page.getByTestId("question-j_siswa")).toBeVisible();

  // FR-06.10: terbitkan
  await page.goto(builderUrl);
  await page.getByTitle("Terbitkan kuesioner", { exact: true }).click();
  await page.getByRole("button", { name: "Ya, terbitkan" }).click();
  await expect(flash(page)).toContainText("Kuesioner terbit dengan 4 soal");

  // AC M06: ubah tipe soal setelah terbit ditolak server (payload dipalsukan melewati UI yang terkunci)
  await openQuestion(page, "j_judul");
  await expect(page.getByLabel("Tipe jawaban")).toBeDisabled();
  await page.locator('input[name="payload"]').evaluate((el: HTMLInputElement) => {
    el.value = JSON.stringify({ ...JSON.parse(el.value), type: "DECIMAL" });
  });
  await page.getByRole("button", { name: "Simpan teks bantuan" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("strukturnya terkunci");

  // teks bantuan tetap boleh diubah
  await page.reload();
  await page.getByLabel("Teks bantuan").fill("Hitung semua judul buku tercetak.");
  await page.getByRole("button", { name: "Simpan teks bantuan" }).click();
  await expect(flash(page)).toContainText("Teks bantuan disimpan");

  // FR-02.06: salin periode ikut menyalin kuesioner sebagai Draf
  await page.goto("/admin/periode");
  await page.getByRole("link", { name: periodName }).click();
  await page.getByLabel("Nama periode baru").fill(`${periodName} salinan`);
  await page.getByLabel("Tanggal-jam buka baru (WIB)").fill(wib(400 * 24 * HOUR));
  await page.getByLabel("Tanggal-jam tutup baru (WIB)").fill(wib(430 * 24 * HOUR));
  await page.getByRole("button", { name: "Salin periode" }).click();
  await expect(flash(page)).toContainText("termasuk kuesioner (Draf)");
  await page.goto("/admin/kuesioner");
  await expect(page.getByRole("row", { name: new RegExp(`${periodName} salinan`) })).toContainText("Draf · 4 soal");
});
