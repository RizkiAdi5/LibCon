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
  const name = `Kuesioner Uji ${Date.now()}`;
  await page.goto("/admin/periode");
  await page.getByLabel("Nama periode").fill(name);
  await page.getByLabel("Tahun").fill("2026");
  await page.getByLabel("Tanggal-jam buka (WIB)").fill(wib(30 * 24 * HOUR));
  await page.getByLabel("Tanggal-jam tutup (WIB)").fill(wib(60 * 24 * HOUR));
  await page.getByRole("button", { name: "Simpan periode" }).click();
  await expect(flash(page)).toContainText("dibuat (Draf)");

  await page.goto("/admin/kuesioner");
  await page.getByRole("button", { name: `Buat kuesioner ${name}` }).click();
  await expect(flash(page)).toContainText("Kuesioner dibuat (Draf)");
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
