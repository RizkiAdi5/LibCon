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

async function fillInstitutionForm(page: Page, npp: string, email: string) {
  await page.getByLabel("NPP (Nomor Pokok Perpustakaan)").fill(npp);
  await page.getByLabel("Nama perpustakaan").fill(`Perpustakaan Uji ${npp}`);
  await page.getByLabel("Nama instansi/lembaga").fill(`SD Uji ${npp}`);
  await page.getByLabel("Jenis peserta").selectOption({ label: "Sekolah Dasar" });
  await page.getByLabel("Kecamatan").selectOption({ label: "Pontianak Kota" });
  await page.getByLabel("Kelurahan").selectOption({ label: "Benua Melayu Laut" });
  await page.getByLabel("Alamat").fill("Jl. Uji No. 1");
  await page.getByLabel("Nama penanggung jawab/pengisi").fill("Pengisi Uji");
  await page.getByLabel("Email resmi").fill(email);
}

test.describe("Peserta & aktivasi [FR-03.01-03.10, BR-01]", () => {
  test("admin tambah lembaga → email aktivasi → kirim ulang massal → aktivasi → login peserta", async ({
    page,
    browser,
  }) => {
    const admin = await createAdmin(page, "ADMIN");
    await login(page, admin, /\/admin\/dashboard/);

    const npp = uniqueNpp();
    const email = `uji-${npp}@example.com`;
    await page.goto("/admin/peserta/baru");
    await fillInstitutionForm(page, npp, email);
    await page.getByRole("button", { name: "Simpan lembaga" }).click();

    // FR-03.02: akun utama otomatis, username = NPP, belum aktivasi
    await expect(page.getByRole("status")).toContainText(`Email aktivasi dikirim ke ${email}`);
    await expect(page.getByRole("row", { name: new RegExp(`${npp} \\(utama\\)`) })).toContainText("Belum aktivasi");

    // FR-03.08 + FR-03.09: muncul di kelompok Kecamatan > Jenis, kirim ulang massal
    await page.goto(`/admin/peserta?q=${npp}`);
    await expect(page.getByRole("heading", { name: /Kec\. Pontianak Kota \(1\)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Sekolah Dasar \(1\)/ })).toBeVisible();
    await page.getByLabel(`Pilih Perpustakaan Uji ${npp}`).check();
    await page.getByRole("button", { name: "Kirim ulang aktivasi ke yang dipilih" }).click();
    await expect(page.getByRole("status")).toContainText("dikirim ulang ke 1 lembaga");

    const res = await page.request.post("/api/test/fixtures", {
      data: { action: "reissue-activation-token", username: npp },
    });
    const { token, activationEmailSent, sentTo } = await res.json();
    expect(activationEmailSent).toBe(true);
    expect(sentTo).toBe(email); // FR-03.04: ke email resmi lembaga

    const participant = await (await browser.newContext()).newPage();
    await participant.goto(`/aktivasi/${token}`);
    await participant.getByLabel("Password baru").fill(TEST_PASSWORD);
    await participant.getByLabel("Konfirmasi password").fill(TEST_PASSWORD);
    await participant.getByRole("button", { name: "Aktivasi & Masuk" }).click();
    await expect(participant).toHaveURL(/\/login/);
    await login(participant, npp, /\/portal\/beranda/);
  });

  test("NPP yang sudah terdaftar ditolak dengan nama lembaga pemiliknya [AC M03, BR-01]", async ({ page }) => {
    const admin = await createAdmin(page, "ADMIN");
    await login(page, admin, /\/admin\/dashboard/);

    const npp = uniqueNpp();
    await page.goto("/admin/peserta/baru");
    await fillInstitutionForm(page, npp, `uji-${npp}@example.com`);
    await page.getByRole("button", { name: "Simpan lembaga" }).click();
    await expect(page.getByRole("status")).toContainText("ditambahkan");

    await page.goto("/admin/peserta/baru");
    await fillInstitutionForm(page, npp, `lain-${npp}@example.com`);
    await page.getByRole("button", { name: "Simpan lembaga" }).click();
    await expect(page.getByText(`NPP sudah dipakai oleh Perpustakaan Uji ${npp}`)).toBeVisible();
    // isian tetap ada setelah error
    await expect(page.getByLabel("Email resmi")).toHaveValue(`lain-${npp}@example.com`);
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
    await page.getByText("Nonaktifkan lembaga").click();
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

    const sd = page.locator("li").filter({ has: page.getByLabel("Nama Sekolah Dasar") });
    await sd.getByText("Hapus", { exact: true }).click();
    await sd.getByRole("button", { name: "Ya, hapus Sekolah Dasar" }).click();
    // p[role=alert]: Next.js punya route announcer ber-role alert sendiri
    await expect(page.locator(`p[role="alert"]`)).toContainText("tidak bisa dihapus. Gunakan tombol Nonaktifkan.");

    const code = `X${Date.now()}`;
    await page.getByLabel("Kode", { exact: true }).fill(code);
    await page.getByLabel("Nama", { exact: true }).fill(`Jenis Uji ${code}`);
    await page.getByRole("button", { name: "Tambah jenis" }).click();
    await expect(page.getByRole("status")).toContainText(`Jenis Uji ${code} ditambahkan`);

    const row = page.locator("li").filter({ has: page.getByLabel(`Nama Jenis Uji ${code}`) });
    await row.getByText("Hapus", { exact: true }).click();
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
