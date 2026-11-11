import { test, expect, type Browser, type Page } from "@playwright/test";

const TEST_PASSWORD = "KataSandiKuat!2026";

// state global (satu periode OPEN) — urut dalam file, dan project global-survei berjalan setelah global-periode
test.describe.configure({ mode: "serial", timeout: 150_000 });

async function fixture(page: Page, data: Record<string, unknown>) {
  return (await page.request.post("/api/test/fixtures", { data })).json();
}

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("NPP atau email").fill(username);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/portal\/beranda/);
}

async function freshPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

/** Jalankan aksi lalu tunggu autosave BARU selesai (bukan status "Tersimpan" lama yang sudah tampil). */
async function savedAfter(page: Page, act: () => Promise<void>) {
  const status = page.getByTestId("save-status");
  const before = await status.getAttribute("data-saved-at");
  await act();
  await expect.poll(() => status.getAttribute("data-saved-at")).not.toBe(before);
  await expect(status).toContainText("Tersimpan pukul");
}

/** Isi lalu tinggalkan isian (blur) supaya autosave & cek Blokir berjalan (FR-07.04, FR-07.06). */
async function answer(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.blur();
}

test("peserta: autosave, cek Blokir, ringkasan, kirim, terkunci, flag tahun lalu [FR-07.01-07.09, AC M07, AC M08]", async ({ page, browser }) => {
  const setup = await fixture(page, { action: "setup-open-survey", password: TEST_PASSWORD });
  expect(setup.error).toBeUndefined();
  const { username, periodName } = setup;

  // FR-07.01: beranda
  await login(page, username);
  await expect(page.getByText(periodName)).toBeVisible();
  await expect(page.getByText("Status: Belum Mengisi")).toBeVisible();
  await page.getByRole("link", { name: "Mulai mengisi" }).click();
  await page.waitForLoadState("networkidle"); // input terkontrol: mengetik sebelum hidrasi bisa ter-reset React

  // FR-07.03: soal khusus TBM tidak tampil untuk SD
  await expect(page.getByTestId("question-j_siswa")).toBeVisible();
  await expect(page.getByTestId("question-j_anggota_tbm")).toHaveCount(0);

  // FR-07.06: Blokir tampil setelah isian ditinggalkan (AC M06: judul 3.914, eksemplar 3.000)
  await savedAfter(page, async () => {
    await answer(page, "Jumlah judul *", "3914");
    await answer(page, "Jumlah eksemplar", "3000");
  });
  await expect(page.getByTestId("question-j_eksemplar")).toContainText("Harus diperbaiki: Eksemplar harus ≥ judul");
  // FR-07.07: format ribuan Indonesia setelah ditinggalkan
  await expect(page.getByLabel("Jumlah judul *", { exact: true })).toHaveValue("3.914");

  // AC M07: tutup browser lalu login lagi → jawaban tetap ada
  const again = await freshPage(browser);
  await login(again, username);
  await again.goto("/portal/survei");
  await expect(again.getByLabel("Jumlah judul *", { exact: true })).toHaveValue("3.914");
  await expect(again.getByLabel("Jumlah eksemplar", { exact: true })).toHaveValue("3.000");
  await expect(again.getByTestId("survey-progress")).toContainText("2 dari 3 soal");

  // AC M07: masih ada Blokir → Kirim nonaktif dan menunjuk soal yang salah (FR-07.08)
  await page.goto("/portal/survei/ringkasan");
  const issues = page.getByTestId("blocking-issues");
  await expect(issues).toContainText("Jumlah eksemplar: Eksemplar harus ≥ judul");
  await expect(issues).toContainText("Jumlah siswa: Wajib diisi");
  await expect(issues).toContainText("Bagian Koleksi: link bukti dukung wajib diisi");
  await expect(page.getByRole("button", { name: "Kirim survei" })).toBeDisabled();

  // perbaiki: eksemplar 8.000 (naik dari 2.292 tahun lalu → Flag, tidak memblokir)
  await issues.getByRole("link", { name: "Jumlah eksemplar" }).click();
  await page.waitForLoadState("networkidle");
  await savedAfter(page, async () => {
    await answer(page, "Jumlah eksemplar", "8000");
    await answer(page, "Jumlah siswa *", "120");
    await answer(page, "Link bukti dukung bagian Koleksi *", "https://drive.google.com/drive/folders/uji");
  });
  // FR-07.06: Flag tidak ditampilkan ke peserta sebelum kirim
  await expect(page.getByText("Naik/turun > 50% dari tahun lalu")).toHaveCount(0);

  // FR-07.09: kirim dengan konfirmasi + nama pengisi
  await page.goto("/portal/survei/ringkasan");
  await expect(page.getByTestId("blocking-issues")).toHaveCount(0);
  await expect(page.getByText("8.000")).toBeVisible();
  await page.getByLabel(/Saya menyatakan data yang diisi sudah benar/).check();
  await page.getByLabel("Nama pengisi").fill("Budi Santoso");
  await page.getByRole("button", { name: "Kirim survei" }).click();
  await expect(page.locator('p[role="status"]')).toContainText("Survei berhasil dikirim");

  // BR-10: terkunci setelah kirim
  await page.goto("/portal/survei");
  await expect(page.getByText("Survei sudah dikirim — jawaban terkunci")).toBeVisible();
  await expect(page.getByLabel("Jumlah judul *", { exact: true })).toBeDisabled();
  await page.goto("/portal/beranda");
  await expect(page.getByText("Status: Terkirim")).toBeVisible();

  // FR-08.01 + AC M08: flag tercatat; snapshot; jawaban terkunci; riwayat per akun (FR-05.07); tanda terima (FR-07.10)
  const state = await fixture(page, { action: "submission-state", username });
  expect(state.status).toBe("SUBMITTED");
  expect(state.openFlagCount).toBe(1);
  expect(state.flags).toEqual(["Naik/turun > 50% dari tahun lalu"]);
  expect(state.snapshots).toBe(1);
  expect(state.allLocked).toBe(true);
  expect(state.historyByUser).toBe(true);
  expect(state.receipts).toBe(1);
});

test("periode ditutup & tidak diperpanjang → isian bisa dilihat tapi tidak bisa diubah [FR-07.02, AC M07]", async ({ page }) => {
  const { username, periodName } = await fixture(page, { action: "setup-open-survey", password: TEST_PASSWORD });
  await login(page, username);
  await page.goto("/portal/survei");
  await page.waitForLoadState("networkidle");
  await savedAfter(page, () => answer(page, "Jumlah judul *", "10"));

  await fixture(page, { action: "expire-period", name: periodName, includeExtensions: true });
  await page.reload();
  await expect(page.getByText("Periode pengisian sudah ditutup")).toBeVisible();
  await expect(page.getByLabel("Jumlah judul *", { exact: true })).toHaveValue("10");
  await expect(page.getByLabel("Jumlah judul *", { exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Lihat ringkasan & kirim" })).toHaveCount(0);

  // bersihkan: arsipkan periode uji supaya tidak menahan slot OPEN
  await fixture(page, { action: "close-e2e-periods" });
});

async function loginAdmin(page: Page) {
  const { username } = await fixture(page, { action: "create-active-admin", role: "ADMIN", password: TEST_PASSWORD });
  await page.goto("/login");
  await page.getByLabel("NPP atau email").fill(username);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

async function submitSurvey(page: Page, name: string) {
  await page.goto("/portal/survei/ringkasan");
  await expect(page.getByTestId("blocking-issues")).toHaveCount(0);
  await page.getByLabel(/Saya menyatakan data yang diisi sudah benar/).check();
  await page.getByLabel("Nama pengisi").fill(name);
  await page.getByRole("button", { name: "Kirim survei" }).click();
  await expect(page.locator('p[role="status"]')).toContainText("Survei berhasil dikirim");
}

test("admin: flag ikon merah → minta revisi 2 soal → peserta revisi & kirim ulang → bandingkan versi → terima flag → verifikasi [FR-08.02-08.11, AC M08]", async ({ page, browser }) => {
  const { username } = await fixture(page, { action: "setup-open-survey", password: TEST_PASSWORD });
  await login(page, username);
  await page.goto("/portal/survei");
  await page.waitForLoadState("networkidle");
  await savedAfter(page, async () => {
    await answer(page, "Jumlah judul *", "3914");
    await answer(page, "Jumlah eksemplar", "8000"); // naik > 50% dari 2.292 → Flag
    await answer(page, "Jumlah siswa *", "120");
    await answer(page, "Link bukti dukung bagian Koleksi *", "https://drive.google.com/drive/folders/uji");
  });
  await submitSurvey(page, "Budi");

  // FR-08.02 + AC M08: kiriman dengan 1 flag dan ikon merah di daftar admin
  const admin = await freshPage(browser);
  await loginAdmin(admin);
  await admin.goto(`/admin/verifikasi?q=${username}`);
  const row = admin.getByRole("row", { name: /Perpus Survei/ });
  await expect(row.getByTestId("flag-count")).toContainText("1 flag");
  await row.getByRole("link").click();
  await expect(admin.getByTestId("review-j_eksemplar")).toContainText("Naik/turun > 50% dari tahun lalu");

  // FR-08.05: buka revisi untuk 2 soal dengan catatan
  await admin.getByText("Minta revisi", { exact: true }).click();
  await admin.getByLabel("Buka revisi Jumlah judul").check();
  await admin.getByLabel("Buka revisi Jumlah eksemplar").check();
  await admin.getByLabel("Catatan revisi Jumlah eksemplar").fill("Cek ulang buku induk");
  await admin.getByLabel("Catatan umum").fill("Mohon dicek kembali data koleksi");
  await admin.getByRole("button", { name: "Buka revisi & kirim email" }).click();
  await expect(admin.locator('p[role="status"]')).toContainText("Revisi dibuka untuk 2 soal");

  // AC M08: beranda banner revisi, 2 soal bisa diedit dengan catatan, soal lain terkunci
  await page.goto("/portal/beranda");
  await expect(page.getByTestId("revision-banner")).toContainText("Perlu revisi: 2 soal");
  await expect(page.getByTestId("revision-banner")).toContainText("Mohon dicek kembali data koleksi");
  await page.getByRole("link", { name: "Perbaiki soal revisi" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("revision-note-j_eksemplar")).toContainText("Cek ulang buku induk");
  await expect(page.getByLabel("Jumlah siswa *", { exact: true })).toBeDisabled();
  await expect(page.getByTestId("question-j_siswa")).toContainText("Tidak perlu diubah");
  await savedAfter(page, async () => {
    await answer(page, "Jumlah judul *", "3500");
    await answer(page, "Jumlah eksemplar", "4000");
  });
  await submitSurvey(page, "Budi");

  // FR-08.10 + AC M08: versi 1 dan 2 berdampingan, nilai yang berubah disorot
  await admin.reload();
  const compare = admin.getByTestId("version-compare");
  await expect(compare.locator('tr[data-changed="true"]')).toHaveCount(2);
  await expect(compare.getByRole("row", { name: /Jumlah eksemplar/ })).toContainText("8.000");
  await expect(compare.getByRole("row", { name: /Jumlah eksemplar/ })).toContainText("4.000");
  await expect(compare.getByRole("row", { name: /Jumlah siswa/ })).toHaveAttribute("data-changed", "false");

  // FR-08.04: terima flag putaran baru dengan catatan; FR-08.11: verifikasi
  const flagRow = admin.getByTestId("review-j_eksemplar");
  await flagRow.getByLabel(/Catatan terima flag/).first().fill("Ada hibah buku tahun ini");
  await flagRow.getByRole("button", { name: "Terima" }).first().click();
  await expect(admin.locator('p[role="status"]')).toContainText("Flag ditandai Diterima");
  await admin.getByText("Verifikasi kiriman", { exact: true }).click();
  await admin.getByRole("button", { name: "Ya, verifikasi" }).click();
  await expect(admin.locator('p[role="status"]')).toContainText("Terverifikasi");

  const state = await fixture(page, { action: "submission-state", username });
  expect(state.status).toBe("VERIFIED");
  expect(state.openFlagCount).toBe(0);
  expect(state.snapshots).toBe(2);

  await fixture(page, { action: "close-e2e-periods" });
});
