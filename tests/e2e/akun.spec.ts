import { test, expect, type Browser, type Page } from "@playwright/test";

const TEST_PASSWORD = "KataSandiKuat!2026";
const NEW_PASSWORD = "SandiBaruLebihKuat#77";

// alur berisi beberapa login (argon2) di beberapa browser context — 30 dtk default terlalu mepet
test.describe.configure({ timeout: 90_000 });

async function fixture(page: Page, data: Record<string, unknown>) {
  return (await page.request.post("/api/test/fixtures", { data })).json();
}

async function login(page: Page, identifier: string, password: string, expectedUrl: RegExp) {
  await page.goto("/login");
  await page.getByLabel("NPP atau email").fill(identifier);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(expectedUrl);
}

async function failLogin(page: Page, identifier: string) {
  await page.getByLabel("NPP atau email").fill(identifier);
  await page.getByLabel("Password").fill("password-salah-sekali");
  await page.getByRole("button", { name: "Masuk" }).click();
  // tunggu round-trip selesai sebelum klik berikutnya (lihat catatan race di CLAUDE.md)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();
  await expect(page.locator(`p[role="alert"]`)).toBeVisible();
}

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

async function participantAndAdmin(page: Page, browser: Browser) {
  const { username } = await fixture(page, { action: "create-active-participant", password: TEST_PASSWORD });
  const admin = await newPage(browser);
  const { username: adminUsername } = await fixture(admin, {
    action: "create-active-admin",
    role: "ADMIN",
    password: TEST_PASSWORD,
  });
  return { username: username as string, admin, adminUsername: adminUsername as string };
}

async function openInstitution(admin: Page, adminUsername: string, npp: string) {
  await login(admin, adminUsername, TEST_PASSWORD, /\/admin\/dashboard/);
  await admin.goto(`/admin/peserta?q=${npp}`);
  await admin.getByRole("link", { name: /Perpus E2E/ }).click();
  await expect(admin.getByRole("heading", { name: "Akun" })).toBeVisible();
}

test.describe("Akun kedua [FR-05.01-05.06, BR-02]", () => {
  test("peserta ajukan → admin setujui → aktivasi NPP-2 → login; tombol ajukan hilang di 2 akun", async ({
    page,
    browser,
  }) => {
    const { username, admin, adminUsername } = await participantAndAdmin(page, browser);
    const secondEmail = `kedua-${username.toLowerCase()}@example.com`;

    await login(page, username, TEST_PASSWORD, /\/portal\/beranda/);
    await page.goto("/portal/akun");
    await page.getByLabel("Nama lengkap pengisi kedua").fill("Siti Pengisi Kedua");
    await page.getByLabel("Email pengisi kedua").fill(secondEmail);
    await page.getByLabel("Alasan").fill("Membantu mengisi survei");
    await page.getByRole("button", { name: "Ajukan akun tambahan" }).click();
    await expect(page.getByRole("status")).toContainText("Permintaan terkirim");
    await page.reload();
    await expect(page.getByText("sedang menunggu persetujuan admin")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajukan akun tambahan" })).toHaveCount(0);

    await login(admin, adminUsername, TEST_PASSWORD, /\/admin\/dashboard/);
    await admin.goto("/admin/permintaan-akun");
    // antrean dipakai bersama tes paralel — pilih item milik lembaga tes ini
    await admin
      .locator("li")
      .filter({ hasText: secondEmail })
      .getByRole("button", { name: "Setujui Siti Pengisi Kedua" })
      .click();
    await expect(admin.getByRole("status")).toContainText(`Akun ${username}-2 dibuat`);

    const { token, sentTo } = await fixture(page, { action: "reissue-activation-token", username: `${username}-2` });
    expect(sentTo).toBe(secondEmail); // FR-05.04: ke email pengisi kedua, bukan email resmi lembaga

    const second = await newPage(browser);
    await second.goto(`/aktivasi/${token}`);
    await second.getByLabel("Password baru").fill(TEST_PASSWORD);
    await second.getByLabel("Konfirmasi password").fill(TEST_PASSWORD);
    await second.getByRole("button", { name: "Aktivasi & Masuk" }).click();
    await expect(second).toHaveURL(/\/login/);
    await login(second, `${username}-2`, TEST_PASSWORD, /\/portal\/beranda/);

    // AC M05: sudah 2 akun → form ajukan tidak tampil
    await page.goto("/portal/akun");
    await expect(page.getByText(`${username}-2`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajukan akun tambahan" })).toHaveCount(0);
  });

  test("admin tolak dengan alasan → peserta melihat alasannya dan bisa mengajukan lagi [FR-05.05]", async ({
    page,
    browser,
  }) => {
    const { username, admin, adminUsername } = await participantAndAdmin(page, browser);

    await login(page, username, TEST_PASSWORD, /\/portal\/beranda/);
    await page.goto("/portal/akun");
    await page.getByLabel("Nama lengkap pengisi kedua").fill(`Ditolak ${username}`);
    await page.getByLabel("Email pengisi kedua").fill(`tolak-${username.toLowerCase()}@example.com`);
    await page.getByLabel("Alasan").fill("Coba");
    await page.getByRole("button", { name: "Ajukan akun tambahan" }).click();
    await expect(page.getByRole("status")).toContainText("Permintaan terkirim");

    await login(admin, adminUsername, TEST_PASSWORD, /\/admin\/dashboard/);
    await admin.goto("/admin/permintaan-akun");
    const item = admin.locator("li").filter({ hasText: `Ditolak ${username}` });
    await item.getByLabel(`Alasan penolakan Ditolak ${username}`).fill("Email bukan milik pegawai lembaga");
    await item.getByRole("button", { name: "Tolak", exact: true }).click();
    await expect(admin.getByRole("status")).toContainText("ditolak");

    const { sentTo } = await fixture(page, { action: "latest-email", username, key: "ACCOUNT_REQUEST_REJECTED" });
    expect(sentTo).toBeTruthy();

    await page.goto("/portal/akun");
    await expect(page.getByText("Alasan: Email bukan milik pegawai lembaga")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajukan akun tambahan" })).toBeVisible();
  });
});

test.describe("Keamanan akun [FR-04.05-04.09]", () => {
  test("ganti password mengakhiri sesi lain; password baru berlaku [FR-04.06]", async ({ page, browser }) => {
    const { username } = await fixture(page, { action: "create-active-participant", password: TEST_PASSWORD });
    const other = await newPage(browser);
    await login(other, username, TEST_PASSWORD, /\/portal\/beranda/);
    await login(page, username, TEST_PASSWORD, /\/portal\/beranda/);

    await page.goto("/portal/akun");
    await page.getByLabel("Password lama").fill(TEST_PASSWORD);
    await page.getByLabel("Password baru", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Konfirmasi password baru").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Ganti password" }).click();
    await expect(page.getByRole("status")).toContainText("Password berhasil diganti");

    await page.goto("/portal/beranda"); // sesi saat ini tetap
    await expect(page).toHaveURL(/\/portal\/beranda/);
    await other.goto("/portal/beranda"); // sesi lain diakhiri
    await expect(other).toHaveURL(/\/login/);
    await login(other, username, NEW_PASSWORD, /\/portal\/beranda/);
  });

  test("admin reset password: email terkirim, password lama tetap berlaku [FR-04.07, AC M04]", async ({
    page,
    browser,
  }) => {
    const { username, admin, adminUsername } = await participantAndAdmin(page, browser);
    await openInstitution(admin, adminUsername, username);
    await admin.getByRole("button", { name: "Reset password" }).click();
    await expect(admin.getByRole("status")).toContainText("Link reset password dikirim");

    const { status } = await fixture(page, { action: "latest-email", username, key: "PASSWORD_RESET" });
    expect(status).toBe("SENT");
    await login(page, username, TEST_PASSWORD, /\/portal\/beranda/);
  });

  test("10 gagal dalam 3 menit → kunci 1 jam; 50 salah → blokir, admin buka blokir [FR-04.09]", async ({
    page,
    browser,
  }) => {
    const { username, admin, adminUsername } = await participantAndAdmin(page, browser);

    await page.goto("/login");
    for (let i = 0; i < 10; i++) await failLogin(page, username);
    const { lockedUntil } = await fixture(page, { action: "user-lock-state", username });
    expect(new Date(lockedUntil).getTime() - Date.now()).toBeGreaterThan(55 * 60 * 1000);

    await fixture(page, { action: "set-failed-login-count", username, count: 49 });
    await failLogin(page, username);
    await expect(page.locator(`p[role="alert"]`)).toContainText("Hubungi admin");
    // password benar pun ditolak selama diblokir
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.locator(`p[role="alert"]`)).toContainText("Hubungi admin");

    await openInstitution(admin, adminUsername, username);
    await expect(admin.getByText("Diblokir: terlalu banyak percobaan gagal")).toBeVisible();
    await admin.getByRole("button", { name: "Buka blokir" }).click();
    await expect(admin.getByRole("status")).toContainText("Blokir akun");

    await login(page, username, TEST_PASSWORD, /\/portal\/beranda/);
  });
});
