import "dotenv/config"; // CRON_SECRET untuk memanggil endpoint cron
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

async function loginSuperAdmin(page: Page) {
  const { username } = await fixture(page, { action: "create-active-admin", role: "SUPER_ADMIN", password: TEST_PASSWORD });
  await page.goto("/login");
  await page.getByLabel("NPP atau email").fill(username);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

async function fillAndSubmit(page: Page, v: { judul: string; eksemplar: string; siswa: string }) {
  await page.goto("/portal/survei");
  await page.waitForLoadState("networkidle");
  await savedAfter(page, async () => {
    await answer(page, "Jumlah judul *", v.judul);
    await answer(page, "Jumlah eksemplar", v.eksemplar);
    await answer(page, "Jumlah siswa *", v.siswa);
    await answer(page, "Link bukti dukung bagian Koleksi *", "https://drive.google.com/drive/folders/uji");
  });
  await submitSurvey(page, "Pengisi");
}

const flash = (page: Page) => page.locator('p[role="status"]');

async function addNode(page: Page, n: { level: string; code: string; name: string; formula: string; normalization: string; target?: string }) {
  const form = page.locator("section", { has: page.getByRole("heading", { name: "Tambah node" }) });
  await form.getByLabel("Level").selectOption(n.level);
  await form.getByLabel("Kode node").fill(n.code);
  await form.getByLabel("Nama node").fill(n.name);
  await form.getByLabel("Rumus node baru").fill(n.formula);
  await form.getByLabel("Normalisasi").selectOption(n.normalization);
  if (n.target) await form.getByLabel("Target (rasio terhadap target)").fill(n.target);
  await form.getByRole("button", { name: "Tambah node" }).click();
  await expect(flash(page)).toContainText(`Node ${n.code} disimpan`);
}

async function connect(page: Page, parentCode: string, parentName: string, childLabel: string, weight: string) {
  const card = page.getByTestId(`node-${parentCode}`);
  await card.getByLabel(`Anak baru untuk ${parentName}`, { exact: true }).selectOption({ label: childLabel });
  await card.getByLabel(`Bobot anak baru untuk ${parentName}`).fill(weight);
  await card.getByRole("button", { name: "Hubungkan" }).click();
  await expect(flash(page)).toContainText("Bobot disimpan");
}

async function setWeight(page: Page, label: string, weight: string) {
  await page.getByLabel(label).fill(weight);
  await page.getByLabel(label).press("Enter");
  await expect(flash(page)).toContainText("Bobot disimpan");
}

test("skoring: preset 30/70 → validasi bobot → aktifkan → uji → hitung resmi + ranking → publikasi → versi baru & hitung ulang [FR-09.01-09.11, AC M09]", async ({ page, browser }) => {
  const { username: a, periodName } = await fixture(page, { action: "setup-open-survey", password: TEST_PASSWORD });
  await login(page, a);
  await fillAndSubmit(page, { judul: "3914", eksemplar: "8000", siswa: "120" });
  const other = await freshPage(browser);
  const { username: b } = await fixture(other, { action: "create-active-participant", password: TEST_PASSWORD });
  await login(other, b);
  await fillAndSubmit(other, { judul: "1000", eksemplar: "2000", siswa: "400" });
  await fixture(page, { action: "force-verify", username: a });
  await fixture(page, { action: "force-verify", username: b });

  const admin = await freshPage(browser);
  await loginSuperAdmin(admin);
  await admin.goto("/admin/skoring");
  await admin.getByRole("button", { name: `Buat skema baru (preset 30/70) untuk ${periodName}` }).click();
  await expect(flash(admin)).toContainText("Skema dibuat dari preset 30/70");
  const problems = admin.getByTestId("scheme-problems");
  await expect(problems).toContainText("Kepatuhan belum punya node anak.");

  // indikator: rasio eksemplar per siswa (target 10) & jumlah judul (min-max antar peserta)
  await addNode(admin, { level: "INDICATOR", code: "i_rasio", name: "Rasio eksemplar per siswa", formula: "j_eksemplar / j_siswa", normalization: "TARGET_RATIO", target: "10" });
  await addNode(admin, { level: "INDICATOR", code: "i_judul", name: "Jumlah judul", formula: "j_judul", normalization: "MIN_MAX" });
  await connect(admin, "dim_kepatuhan", "Kepatuhan", "Indikator: Rasio eksemplar per siswa", "100");
  await connect(admin, "dim_kinerja", "Kinerja", "Indikator: Jumlah judul", "100");
  for (const code of ["sub_koleksi", "sub_sdm", "sub_pelayanan", "sub_pengelolaan"]) {
    const card = admin.getByTestId(`node-${code}`);
    await card.getByText("Hapus node", { exact: true }).click();
    await card.getByRole("button", { name: `Ya, hapus ${code}` }).click();
    await expect(flash(admin)).toContainText("Node dihapus");
  }

  // AC M09: bobot Kinerja 60% → ditolak dengan pesan total bobot
  await setWeight(admin, "Bobot Kinerja di Indeks Dasar", "60");
  await expect(problems).toContainText("Total bobot Indeks Dasar 90%, harus 100%");
  await expect(admin.getByText("Aktifkan skema", { exact: true })).toHaveCount(0);
  await setWeight(admin, "Bobot Kinerja di Indeks Dasar", "70");
  await expect(problems).toContainText("Skema lolos validasi");
  await admin.getByText("Aktifkan skema", { exact: true }).click();
  await admin.getByRole("button", { name: "Ya, aktifkan" }).click();
  await expect(flash(admin)).toContainText("Skema aktif");
  const schemeV1 = admin.url().split("?")[0];

  // FR-09.07: uji rumus — A: rasio 66,7 → 1; judul tertinggi → 1 ⇒ 100
  await admin.getByRole("link", { name: "Uji & hitung skor" }).click();
  const optionA = await admin.locator("#uji option", { hasText: "Perpus Survei" }).getAttribute("value");
  await admin.getByLabel("Kiriman").selectOption(optionA!);
  await admin.getByRole("button", { name: "Uji" }).click();
  await expect(admin.getByTestId("test-result")).toContainText("Indeks: 100,00");
  await expect(admin.getByTestId("official-scores")).toHaveCount(0); // uji tidak menyimpan skor resmi

  // FR-09.08: hitung resmi — B: rasio 5 → 0,5; judul terendah → 0 ⇒ 0,3 × 0,5 × 100 = 15
  await admin.getByText("Hitung resmi", { exact: true }).click();
  await admin.getByRole("button", { name: "Ya, hitung resmi" }).click();
  await expect(flash(admin)).toContainText("Hitung resmi selesai: 2 kiriman");
  const scores = admin.getByTestId("official-scores");
  await expect(scores.getByRole("row", { name: /Perpus Survei/ })).toContainText("100,00");
  await expect(scores.getByRole("row", { name: /Perpus Survei/ })).toContainText("Lolos Nasional");
  await expect(scores.getByRole("row", { name: /Perpus E2E/ })).toContainText("15,00");
  await expect(scores.getByRole("row", { name: /Perpus E2E/ })).toContainText("Belum Lolos");
  await expect(scores.getByRole("row", { name: /Perpus E2E/ }).getByRole("cell").first()).toHaveText("2");

  // FR-09.11: publikasi
  await admin.getByText("Publikasikan skor", { exact: true }).click();
  await admin.getByRole("button", { name: "Ya, publikasikan" }).click();
  await expect(flash(admin)).toContainText("dipublikasikan ke 2 lembaga");

  // FR-09.09 + AC M09: rumus diubah lewat versi baru → hitung ulang; skor lama tetap di riwayat dengan versinya
  await admin.goto(schemeV1);
  await admin.getByRole("button", { name: "Buat versi baru (Draf)" }).click();
  await expect(flash(admin)).toContainText("Skema versi 2 dibuat");
  await setWeight(admin, "Bobot Kepatuhan di Indeks Dasar", "50");
  await setWeight(admin, "Bobot Kinerja di Indeks Dasar", "50");
  await admin.getByText("Aktifkan skema", { exact: true }).click();
  await admin.getByRole("button", { name: "Ya, aktifkan" }).click();
  await admin.getByRole("link", { name: "Uji & hitung skor" }).click();
  await admin.getByText("Hitung resmi", { exact: true }).click();
  await admin.getByRole("button", { name: "Ya, hitung resmi" }).click();
  await expect(flash(admin)).toContainText("Hitung resmi selesai");
  await expect(scores.getByRole("row", { name: /Perpus E2E/ })).toContainText("25,00"); // 0,5 × 0,5 × 100
  await expect(scores.getByRole("row", { name: /Perpus E2E/ })).toContainText("v2");
  await expect(admin.getByText(/v1 · Resmi · Selesai · 2 kiriman/)).toBeVisible();
  await expect(admin.getByText(/v2 · Resmi · Selesai · 2 kiriman/)).toBeVisible();

  await fixture(page, { action: "close-e2e-periods" });
});

test("monitoring: kartu & filter, reminder massal tercatat, cron H-1 hanya Draf & maks sekali sehari, ekspor CSV, timeline [FR-10.01-10.07, AC M10]", async ({ page, browser }) => {
  const { username: a, periodName } = await fixture(page, { action: "setup-open-survey", password: TEST_PASSWORD });
  await login(page, a);
  await page.goto("/portal/survei");
  await page.waitForLoadState("networkidle");
  await savedAfter(page, () => answer(page, "Jumlah judul *", "10")); // A = Draf
  const other = await freshPage(browser);
  const { username: c } = await fixture(other, { action: "create-active-participant", password: TEST_PASSWORD });
  await login(other, c);
  await fillAndSubmit(other, { judul: "1000", eksemplar: "2000", siswa: "400" }); // C = Terkirim

  // FR-10.01: kartu memfilter tabel
  const admin = await freshPage(browser);
  await loginAdmin(admin);
  await admin.goto("/admin/dashboard");
  await admin.getByLabel("Periode").selectOption({ label: periodName });
  await admin.getByRole("button", { name: "Tampilkan" }).click();
  await expect(admin.getByTestId("card-Draf")).toContainText("1");
  await expect(admin.getByTestId("card-Terkirim")).toContainText("1");
  await admin.getByTestId("card-Draf").click();
  await expect(admin).toHaveURL(/status=DRAFT/);
  await expect(admin.getByRole("link", { name: /Perpus Survei/ })).toBeVisible();
  await expect(admin.getByRole("link", { name: /Perpus E2E/ })).toHaveCount(0);
  const periodId = new URL(admin.url()).searchParams.get("periode")!;

  // FR-10.04 + AC M10: kirim reminder ke lembaga terpilih, tercatat di activity_logs dengan jumlah penerima
  await admin.getByLabel(/Pilih Perpus Survei/).check();
  await admin.getByRole("button", { name: "Kirim reminder" }).click();
  await expect(admin.locator('p[role="status"]')).toContainText("Reminder dikirim ke 1 lembaga (1 email)");
  const activity = await fixture(page, { action: "latest-activity", activity: "SEND_BULK_REMINDER" });
  expect(activity.description).toContain("1 penerima");

  // AC M10: cron H-1 → Draf dikirimi, Terkirim tidak; FR-10.06: A sudah dikirimi hari ini → tidak dobel
  const cron = await page.request.get("/api/cron/reminders", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(cron.status()).toBe(200);
  const countA = await fixture(page, { action: "email-count", username: a, key: "REMINDER_DEADLINE" });
  const countC = await fixture(page, { action: "email-count", username: c, key: "REMINDER_DEADLINE" });
  expect(countA.count).toBe(1);
  expect(countC.count).toBe(0);

  // FR-10.04: ekspor daftar
  const csv = await admin.request.get(`/admin/dashboard/ekspor?periode=${periodId}&status=DRAFT`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text).toContain("Nama perpustakaan");
  expect(text).toContain("Perpus Survei");
  expect(text).not.toContain("Perpus E2E");

  // FR-10.07: timeline aktivitas lembaga
  await admin.goto(`/admin/peserta/${countA.institutionId}`);
  await expect(admin.getByTestId("timeline")).toContainText("Login");
  await expect(admin.getByTestId("timeline")).toContainText("Email reminder deadline");
  await expect(admin.getByTestId("timeline")).toContainText("Terakhir menyimpan isian");

  await fixture(page, { action: "close-e2e-periods" });
});