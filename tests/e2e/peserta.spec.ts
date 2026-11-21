import { test, expect, type Page } from "@playwright/test";

const TEST_PASSWORD = "KataSandiKuat!2026";

// alur di sini berisi 2-4 login (argon2) + banyak navigasi `next dev` — 30 dtk default terlalu mepet
test.describe.configure({ timeout: 90_000 });

async function createAdmin(page: Page, role: "ADMIN" | "SUPER_ADMIN") {
  const res = await page.request.post("/api/test/fixtures", {
    data: { action: "create-active-admin", role, password: TEST_PASSWORD },
  });
  return (await res.json()).username as string;
}

async function login(page: Page, identifier: string, expectedUrl: RegExp) {
  await page.goto("/login");
  await page.getByLabel("NPP atau email").fill(identifier);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(expectedUrl);
}

function uniqueNpp() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

const NEW_PASSWORD = "PasswordBaru!2026";

/** Admin membuat akun peserta (email + password awal). */
async function createAccount(page: Page, name: string, email: string) {
  await page.goto("/admin/peserta/baru");
  await page.waitForLoadState("networkidle"); // input terkontrol: ketikan sebelum hidrasi bisa ter-reset
  await page.getByLabel("Nama sekolah/lembaga").fill(name);
  await page.getByLabel("Jenis peserta").selectOption({ label: "Sekolah Dasar" });
  await page.getByLabel("Email (dipakai untuk login)").fill(email);
  await page.getByLabel("Password awal").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page.getByRole("status")).toContainText(`Akun ${email} dibuat`);
}

/** Login pertama peserta: wajib ganti password awal → halaman lengkapi profil. */
async function firstLogin(page: Page, email: string) {
  await login(page, email, /\/portal\/mulai/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Password lama").fill(TEST_PASSWORD);
  await page.getByLabel("Password baru", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Konfirmasi password baru").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Ganti password" }).click();
  await expect(page.getByRole("heading", { name: "Lengkapi profil lembaga" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function fillProfile(page: Page, npp: string) {
  await page.getByLabel("NPP (Nomor Pokok Perpustakaan)").fill(npp);
  await page.getByLabel("Nama perpustakaan").fill(`Perpustakaan Uji ${npp}`);
  await page.getByLabel("Kecamatan").selectOption({ label: "Pontianak Kota" });
  await page.getByLabel("Kelurahan").selectOption({ label: "Benua Melayu Laut" });
  await page.getByLabel("Alamat").fill("Jl. Uji No. 1");
  await page.getByLabel("Nama penanggung jawab/pengisi").fill("Pengisi Uji");
  await page.getByRole("button", { name: "Simpan & lanjutkan" }).click();
}

test.describe("Akun peserta dibuat admin + lengkapi profil [FR-03.01, BR-01, BR-02]", () => {
  test("admin buat akun email+password → peserta wajib ganti password & lengkapi profil → isi rekap kunjungan → admin memantau", async ({
    page,
    browser,
  }) => {
    const admin = await createAdmin(page, "ADMIN");
    await login(page, admin, /\/admin\/dashboard/);
    const npp = uniqueNpp();
    const email = `uji-${npp}@example.com`;
    await createAccount(page, `SD Uji ${npp}`, email);

    const participant = await (await browser.newContext()).newPage();
    await firstLogin(participant, email);
    // fitur lain dikunci sampai profil lengkap
    await participant.goto("/portal/survei");
    await expect(participant).toHaveURL(/\/portal\/mulai/);
    await fillProfile(participant, npp);
    await expect(participant).toHaveURL(/\/portal\/beranda/);

    // BR-02: setelah NPP diisi, username = NPP (login dengan email tetap bisa)
    await page.goto(`/admin/peserta?q=${npp}`);
    await expect(page.getByRole("heading", { name: /Kec\. Pontianak Kota \(1\)/ })).toBeVisible();

    // rekap kunjungan bulanan: Januari tahun lalu selalu sudah dibuka
    const year = new Date().getFullYear() - 1;
    await participant.goto(`/portal/kunjungan?tahun=${year}`);
    await participant.waitForLoadState("networkidle");
    await participant.getByLabel("Laki-laki Januari").fill("1.200");
    await participant.getByLabel("Perempuan Januari").fill("34");
    await participant.getByLabel("Laki-laki Februari").fill("5");
    await participant.getByRole("button", { name: "Simpan rekap" }).click();
    await expect(participant.locator(`tr[data-month="2"]`)).toContainText("Isi jumlah laki-laki dan perempuan");
    await participant.getByLabel("Perempuan Februari").fill("6");
    await participant.getByRole("button", { name: "Simpan rekap" }).click();
    await expect(participant.getByRole("status")).toContainText("Rekap 2 bulan tersimpan");

    await page.goto(`/admin/kunjungan?tahun=${year}&q=${npp}`);
    const row = page.locator("tr", { hasText: `SD Uji ${npp}` });
    await expect(row).toContainText("1.234");
    await expect(row).toContainText("1.245");
    await expect(row).toContainText("Sebagian");
    const download = page.waitForEvent("download");
    await page.getByText("Unduh Excel").click();
    expect((await download).suggestedFilename()).toBe(`libcon-kunjungan-${year}.xlsx`);
  });

  test("NPP yang sudah terdaftar ditolak dengan nama lembaga pemiliknya [AC M03, BR-01]", async ({ page, browser }) => {
    const admin = await createAdmin(page, "ADMIN");
    await login(page, admin, /\/admin\/dashboard/);
    const npp = uniqueNpp();
    await createAccount(page, `SD Uji ${npp}`, `uji-${npp}@example.com`);
    await createAccount(page, `SD Lain ${npp}`, `lain-${npp}@example.com`);

    const first = await (await browser.newContext()).newPage();
    await firstLogin(first, `uji-${npp}@example.com`);
    await fillProfile(first, npp);
    await expect(first).toHaveURL(/\/portal\/beranda/);

    const second = await (await browser.newContext()).newPage();
    await firstLogin(second, `lain-${npp}@example.com`);
    await fillProfile(second, npp);
    await expect(second.getByText(`NPP sudah dipakai oleh Perpustakaan Uji ${npp}`)).toBeVisible();
    // isian tetap ada setelah error
    await expect(second.getByLabel("Alamat")).toHaveValue("Jl. Uji No. 1");
  });

  test("lembaga nonaktif tidak bisa login, sesi dicabut, lalu bisa dipulihkan [FR-03.10]", async ({
    page,
    browser,
  }) => {
    const res = await page.request.post("/api/test/fixtures", {
      data: { action: "create-active-participant", password: TEST_PASSWORD },
    });
    const { username } = await res.json();

    const participant = await (await browser.newContext()).newPage();
    await login(participant, username, /\/portal\/beranda/);

    const admin = await createAdmin(page, "ADMIN");
    await login(page, admin, /\/admin\/dashboard/);
    await page.goto(`/admin/peserta?q=${username}`);
    await page.getByRole("link", { name: /Perpus E2E/ }).click();
    await page.getByTitle("Nonaktifkan lembaga", { exact: true }).click();
    await page.getByRole("button", { name: /Ya, nonaktifkan/ }).click();
    await expect(page.getByRole("status")).toContainText("tidak bisa login");

    await participant.goto("/portal/beranda");
    await expect(participant).toHaveURL(/\/login/);
    await participant.getByLabel("NPP atau email").fill(username);
    await participant.getByLabel("Password").fill(TEST_PASSWORD);
    await participant.getByRole("button", { name: "Masuk" }).click();
    await expect(participant.locator(`p[role="alert"]`)).toContainText("NPP/email atau password salah");

    await page.getByRole("button", { name: "Pulihkan lembaga" }).click();
    await expect(page.getByRole("status")).toContainText("dipulihkan");
    await login(participant, username, /\/portal\/beranda/);
  });
});

test.describe("Master data [FR-02.01, FR-02.02]", () => {
  test("jenis yang dipakai lembaga ditolak dihapus; jenis baru yang belum dipakai bisa dihapus [AC M02]", async ({
    page,
  }) => {
    const superAdmin = await createAdmin(page, "SUPER_ADMIN");
    await login(page, superAdmin, /\/admin\/dashboard/);
    await page.goto("/admin/pengaturan/jenis-peserta");
    await page.waitForLoadState("networkidle"); // <details> konfirmasi dibuka sebelum hidrasi → klik hilang

    const sd = page.locator("li").filter({ has: page.getByLabel("Nama Sekolah Dasar") });
    await sd.getByTitle("Hapus", { exact: true }).click();
    await sd.getByRole("button", { name: "Ya, hapus Sekolah Dasar" }).click();
    // p[role=alert]: Next.js punya route announcer ber-role alert sendiri
    await expect(page.locator(`p[role="alert"]`)).toContainText("tidak bisa dihapus. Gunakan tombol Nonaktifkan.");

    const code = `X${Date.now()}`;
    await page.getByLabel("Kode", { exact: true }).fill(code);
    await page.getByLabel("Nama", { exact: true }).fill(`Jenis Uji ${code}`);
    await page.getByRole("button", { name: "Tambah jenis" }).click();
    await expect(page.getByRole("status")).toContainText(`Jenis Uji ${code} ditambahkan`);
    await page.waitForLoadState("networkidle");

    const row = page.locator("li").filter({ has: page.getByLabel(`Nama Jenis Uji ${code}`) });
    await row.getByTitle("Hapus", { exact: true }).click();
    await row.getByRole("button", { name: `Ya, hapus Jenis Uji ${code}` }).click();
    await expect(page.getByRole("status")).toContainText("Jenis peserta dihapus");
  });

  test("tambah kelurahan di bawah kecamatan; admin biasa tidak bisa membuka Pengaturan", async ({ page }) => {
    const superAdmin = await createAdmin(page, "SUPER_ADMIN");
    await login(page, superAdmin, /\/admin\/dashboard/);
    await page.goto("/admin/pengaturan/wilayah");

    const code = `9${Date.now()}`;
    await page.getByLabel("Induk").selectOption({ label: "Kecamatan Pontianak Kota" });
    await page.getByLabel("Kode", { exact: true }).fill(code);
    await page.getByLabel("Nama", { exact: true }).fill(`Kelurahan Uji ${code}`);
    await page.getByRole("button", { name: "Tambah wilayah" }).click();
    await expect(page.getByRole("status")).toContainText(`Kelurahan Uji ${code} ditambahkan`);
    await expect(page.getByLabel(`Nama Kelurahan Uji ${code}`)).toBeVisible();

    const admin = await createAdmin(page, "ADMIN");
    await page.context().clearCookies();
    await login(page, admin, /\/admin\/dashboard/);
    await page.goto("/admin/pengaturan/wilayah");
    await expect(page).toHaveURL(/\/403/);
  });
});
