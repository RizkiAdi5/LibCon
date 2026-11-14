import { test, expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const TEST_PASSWORD = "KataSandiKuat!2026";

test.describe.configure({ timeout: 120_000 }); // beberapa login argon2 + tabel admin besar di DB uji
const flash = (page: Page, role: "status" | "alert") => page.locator(`p[role="${role}"]`);

async function fixture(page: Page, data: Record<string, unknown>) {
  return (await page.request.post("/api/test/fixtures", { data })).json();
}

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("NPP atau email").fill(username);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

async function superAdmin(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  const { username } = await fixture(page, { action: "create-active-admin", role: "SUPER_ADMIN", password: TEST_PASSWORD });
  await login(page, username);
  return { page, username: username as string };
}

test("admin: undang → aktivasi → login → Admin tidak bisa buka Log/Pengaturan → nonaktifkan mengakhiri sesi → tercatat di log [FR-14.01, FR-13.07]", async ({ browser }) => {
  const { page: sa, username: saEmail } = await superAdmin(browser);
  const email = `e2e-undang-${randomUUID().slice(0, 8)}@libcon.local`;

  // DB uji berisi ratusan admin e2e → daftar dipersempit dengan pencarian
  await sa.goto("/admin/pengaturan/admin?q=e2e-undang-");
  await sa.waitForLoadState("networkidle");
  await sa.getByLabel("Nama lengkap").fill("Admin Undangan");
  await sa.getByLabel("Email", { exact: true }).fill(email);
  await sa.getByRole("button", { name: "Kirim undangan" }).click();
  await expect(flash(sa, "status")).toContainText(`Undangan dikirim ke ${email}`, { timeout: 30_000 });
  await sa.waitForLoadState("networkidle");
  await sa.getByLabel("Nama lengkap").fill("Admin Ganda");
  await sa.getByLabel("Email", { exact: true }).fill(email.toUpperCase());
  await sa.getByRole("button", { name: "Kirim undangan" }).click();
  await expect(flash(sa, "alert")).toContainText("sudah dipakai", { timeout: 30_000 });
  // akun sendiri tidak bisa dinonaktifkan / diturunkan
  await sa.goto(`/admin/pengaturan/admin?q=${encodeURIComponent(saEmail)}`);
  const myRow = sa.getByTestId("admin-table").locator("tr", { hasText: saEmail });
  await expect(myRow.getByText("Nonaktifkan")).toHaveCount(0);
  await expect(myRow.getByRole("button", { name: "Jadikan Admin" })).toHaveCount(0);

  const admin = await (await browser.newContext()).newPage();
  const { token, activationEmailSent } = await fixture(admin, { action: "reissue-activation-token", username: email });
  expect(activationEmailSent).toBe(true);
  await admin.goto(`/aktivasi/${token}`);
  await admin.getByLabel("Password baru").fill(TEST_PASSWORD);
  await admin.getByLabel("Konfirmasi password").fill(TEST_PASSWORD);
  await admin.getByRole("button", { name: "Aktivasi & Masuk" }).click();
  await expect(admin).toHaveURL(/\/login/);
  await login(admin, email);
  await expect(admin.getByRole("link", { name: "Log Aktivitas" })).toHaveCount(0);
  await admin.goto("/admin/log-aktivitas");
  await expect(admin).toHaveURL(/\/403/);
  await admin.goto("/admin/pengaturan/admin");
  await expect(admin).toHaveURL(/\/403/);

  // nonaktifkan → sesi berjalan berakhir
  await sa.goto(`/admin/pengaturan/admin?q=${encodeURIComponent(email)}`);
  await sa.waitForLoadState("networkidle"); // <details> konfirmasi dibuka sebelum hidrasi → submit hilang
  const row = sa.getByTestId("admin-table").locator("tr", { hasText: email });
  await row.getByTitle("Nonaktifkan", { exact: true }).click();
  await row.getByRole("button", { name: `Ya, nonaktifkan ${email}` }).click();
  await expect(flash(sa, "status")).toContainText(`${email} dinonaktifkan`, { timeout: 30_000 });
  await admin.goto("/admin/dashboard");
  await expect(admin).toHaveURL(/\/login/);

  // FR-13.07: perubahan tercatat — filter tabel users + pelaku super admin, detail sebelum-sesudah
  await sa.goto(`/admin/log-aktivitas?tab=audit&tabel=users&pengguna=${encodeURIComponent(saEmail)}`);
  const log = sa.getByTestId("log-table");
  const disabled = log.getByRole("row").filter({ hasText: "Ubah" }).first();
  await disabled.getByText("Sebelum → sesudah").click();
  await expect(disabled).toContainText("ACTIVE");
  await expect(disabled).toContainText("DISABLED");
  await expect(log.getByRole("row").filter({ hasText: "Tambah" }).first()).toBeVisible();
  const [csv] = await Promise.all([sa.waitForEvent("download"), sa.getByRole("link", { name: "Ekspor CSV" }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^log-audit-.*\.csv$/);

  await sa.goto("/admin/log-aktivitas?tab=aktivitas&aksi=LOGIN&pengguna=" + encodeURIComponent(email));
  await expect(sa.getByTestId("log-table").getByRole("row")).toHaveCount(2); // header + 1 login
});

test("template email: variabel tak dikenal ditolak, simpan, pratinjau, kirim uji [FR-14.02]", async ({ browser }) => {
  const { page } = await superAdmin(browser);
  await page.goto("/admin/pengaturan/template-email");
  await page.getByRole("link", { name: "Permintaan akun kedua ditolak" }).click();
  const body = page.getByLabel("Isi (HTML)");
  const original = await body.inputValue();
  await body.fill(`${original}<p>{tanggal_lahir}</p>`);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(flash(page, "alert")).toContainText("{tanggal_lahir}");
  await page.getByLabel("Isi (HTML)").fill(original); // simpan ulang isi asli (template dipakai tes lain)
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(flash(page, "status")).toContainText("Template disimpan");
  await expect(page.getByTestId("preview-subject")).toContainText("Permintaan akun kedua ditolak");
  await expect(page.frameLocator('iframe[title="Pratinjau email"]').locator("body")).toContainText("Perpustakaan SD Contoh 01");
  await page.getByRole("button", { name: "Kirim uji ke email saya" }).click();
  await expect(flash(page, "status")).toContainText("Email uji dikirim ke");
});

test("riwayat jenis peserta: hapus → Pulihkan dari tab Riwayat [FR-13.06, FR-13.09]", async ({ browser }) => {
  const { page } = await superAdmin(browser);
  const code = `R${randomUUID().slice(0, 6).toUpperCase()}`;
  const name = `Jenis Pulih ${code}`;
  await page.goto("/admin/pengaturan/jenis-peserta");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Kode", { exact: true }).fill(code);
  await page.getByLabel("Nama", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Tambah jenis" }).click();
  await expect(flash(page, "status")).toContainText(`Jenis ${name} ditambahkan`);
  await page.waitForLoadState("networkidle");
  const item = page.locator("li:visible", { hasText: code }).first();
  await item.getByTitle("Hapus", { exact: true }).click();
  await item.getByRole("button", { name: `Ya, hapus ${name}` }).click();
  await expect(flash(page, "status")).toContainText("Jenis peserta dihapus");
  await expect(page.getByLabel(`Nama ${name}`)).toHaveCount(0);

  await page.waitForLoadState("networkidle");
  const history = page.getByTestId("record-history");
  await history.getByText(/^Riwayat/).click();
  const entry = history.locator("li", { hasText: "Hapus (soft)" }).filter({ hasText: code }).first();
  await entry.getByRole("button", { name: "Pulihkan" }).click();
  await expect(flash(page, "status")).toContainText(`Jenis peserta ${name} dipulihkan`);
  await expect(page.getByLabel(`Nama ${name}`)).toBeVisible();
  // setelah dipulihkan, kejadian terakhir record itu = RESTORE → tombol Pulihkan tidak muncul lagi
  await page.getByTestId("record-history").getByText(/^Riwayat/).click();
  await expect(page.getByTestId("record-history").locator("li", { hasText: code }).getByRole("button", { name: "Pulihkan" })).toHaveCount(0);
});

test("keamanan & identitas: simpan nilai tetap tervalidasi [FR-14.03, FR-14.04]", async ({ browser }) => {
  const { page } = await superAdmin(browser);
  await page.goto("/admin/pengaturan/keamanan");
  const min = page.getByLabel("Panjang minimum");
  const value = await min.inputValue();
  await min.fill("4");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(flash(page, "alert")).toContainText("Panjang password minimal 8");
  await page.getByLabel("Panjang minimum").fill(value); // nilai asli — pengaturan global dipakai tes paralel
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(flash(page, "status")).toContainText("Pengaturan disimpan");

  await page.goto("/admin/pengaturan/identitas");
  await expect(page.getByLabel("Provinsi")).toHaveValue("PROVINSI KALIMANTAN BARAT");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(flash(page, "status")).toContainText("Pengaturan disimpan");
});
