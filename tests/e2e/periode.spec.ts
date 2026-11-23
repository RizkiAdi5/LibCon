import "dotenv/config"; // CRON_SECRET dari .env untuk memanggil endpoint cron
import { test, expect, type Page } from "@playwright/test";

const TEST_PASSWORD = "KataSandiKuat!2026";
const HOUR = 60 * 60 * 1000;

// Periode memakai state global (hanya satu OPEN, FR-02.05) — jangan paralel dengan dirinya sendiri
test.describe.configure({ mode: "serial", timeout: 120_000 });

const wib = (offsetMs: number) => new Date(Date.now() + offsetMs + 7 * HOUR).toISOString().slice(0, 16);

async function fixture(page: Page, data: Record<string, unknown>) {
  return (await page.request.post("/api/test/fixtures", { data })).json();
}

async function runCron(page: Page) {
  const res = await page.request.get("/api/cron/period-status", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

async function createPeriod(page: Page, name: string, opensOffset: number, closesOffset: number) {
  await page.goto("/admin/periode/baru");
  await page.getByLabel("Nama periode").fill(name);
  await page.getByLabel("Tahun").fill("2026");
  await page.getByLabel("Tanggal-jam buka (WIB)").fill(wib(opensOffset));
  await page.getByLabel("Tanggal-jam tutup (WIB)").fill(wib(closesOffset));
  await page.getByRole("button", { name: "Simpan periode" }).click();
  await expect(page.getByRole("status")).toContainText(`Periode ${name} dibuat (Draf)`);
}

const statusText = (page: Page) => page.locator("p", { hasText: "Status:" });

test("siklus periode: buat → buka → satu OPEN → perpanjang → salin → cron tutup & buka [FR-02.03-02.08, AC M02]", async ({
  page,
}) => {
  const { otherOpen } = await fixture(page, { action: "close-e2e-periods" });
  expect(otherOpen, `Tutup dulu periode OPEN non-uji "${otherOpen}" di DB lokal`).toBeNull();

  const { username } = await fixture(page, { action: "create-active-admin", role: "SUPER_ADMIN", password: TEST_PASSWORD });
  await page.goto("/login");
  await page.getByLabel("NPP atau email").fill(username);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);

  const stamp = Date.now();
  const a = `E2E A ${stamp}`;
  const b = `E2E B ${stamp}`;

  // FR-02.03: periode baru berstatus Draf; buka manual (FR-02.04)
  await createPeriod(page, a, -HOUR, 24 * HOUR);
  const urlA = page.url().split("?")[0];
  await expect(statusText(page)).toContainText("Draf");
  await page.getByRole("button", { name: "Buka periode" }).click();
  await expect(page.getByRole("status")).toContainText("Status periode menjadi Dibuka");

  // FR-02.05: periode kedua tidak bisa dibuka selama A masih OPEN
  await createPeriod(page, b, -HOUR, 48 * HOUR);
  await page.getByRole("button", { name: "Buka periode" }).click();
  await expect(page.locator(`p[role="alert"]`)).toContainText(`Masih ada periode lain yang Dibuka: ${a}`);

  // FR-02.07: perpanjangan semua lembaga, alasan wajib
  await page.goto(urlA);
  await page.getByLabel("Perpanjang sampai (WIB)").fill(wib(72 * HOUR));
  await page.getByLabel("Alasan", { exact: true }).fill("Jaringan internet terganggu");
  await page.getByRole("button", { name: "Simpan perpanjangan" }).click();
  await expect(page.getByRole("status")).toContainText("untuk semua lembaga");
  await expect(page.getByText("Semua lembaga — Jaringan internet terganggu")).toBeVisible();

  // FR-02.06: salinan berstatus Draf dengan tanggal baru
  await page.getByLabel("Nama periode baru").fill(`E2E Salinan ${stamp}`);
  await page.getByLabel("Tanggal-jam buka baru (WIB)").fill(wib(365 * 24 * HOUR));
  await page.getByLabel("Tanggal-jam tutup baru (WIB)").fill(wib(395 * 24 * HOUR));
  await page.getByRole("button", { name: "Salin periode" }).click();
  await expect(page.getByRole("status")).toContainText(`sebagai salinan ${a} (Draf)`);
  await expect(page.getByText(`Salinan dari ${a}`)).toBeVisible();

  // Tanggal tutup lewat tapi masih ada perpanjangan semua lembaga → tetap OPEN
  await fixture(page, { action: "expire-period", name: a });
  expect((await runCron(page)).closed).not.toContain(a);

  // Perpanjangan juga lewat → cron menutup A (AC M02), lalu membuka B yang sudah waktunya (FR-02.04)
  await fixture(page, { action: "expire-period", name: a, includeExtensions: true });
  const result = await runCron(page);
  expect(result.closed).toContain(a);
  expect(result.opened).toContain(b);

  await page.goto(urlA);
  await expect(statusText(page)).toContainText("Ditutup");

  // bersihkan: tutup B supaya tidak menghalangi run berikutnya
  await page.goto("/admin/periode");
  await page.getByRole("link", { name: b }).click();
  await page.getByTitle("Tutup periode", { exact: true }).click();
  await page.getByRole("button", { name: "Ya, tutup periode" }).click();
  await expect(page.getByRole("status")).toContainText("Ditutup");
});

test("cron menolak request tanpa CRON_SECRET", async ({ page }) => {
  const res = await page.request.get("/api/cron/period-status");
  expect(res.status()).toBe(401);
});
