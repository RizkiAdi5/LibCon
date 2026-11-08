import { test, expect } from "@playwright/test";

const TEST_PASSWORD = "KataSandiKuat!2026";

test.describe("Auth: aktivasi, login, lockout, RBAC [FR-03.05, FR-04.01, FR-04.03, M04 AC]", () => {
  test("aktivasi akun lalu login berhasil masuk ke dashboard admin", async ({ page }) => {
    const res = await page.request.post("/api/test/fixtures", {
      data: { action: "issue-super-admin-activation-token" },
    });
    const { token, email } = await res.json();

    await page.goto(`/aktivasi/${token}`);
    await page.getByLabel("Password baru").fill(TEST_PASSWORD);
    await page.getByLabel("Konfirmasi password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Aktivasi & Masuk" }).click();

    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("NPP atau email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();

    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByText("LibCon Admin")).toBeVisible();
  });

  test("5x salah password mengunci akun [AC FR-04.03]", async ({ page }) => {
    const res = await page.request.post("/api/test/fixtures", {
      data: { action: "create-active-participant", password: TEST_PASSWORD },
    });
    const { username } = await res.json();

    await page.goto("/login");
    for (let i = 0; i < 5; i++) {
      await page.getByLabel("NPP atau email").fill(username);
      await page.getByLabel("Password").fill("password-salah-sekali");
      await page.getByRole("button", { name: "Masuk" }).click();
      // tunggu round-trip server action selesai (tombol balik ke label idle)
      // sebelum lanjut iterasi berikut — mencegah klik beruntun race dengan pending state
      await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();
      await expect(page.locator(`p[role="alert"]`)).toBeVisible();
    }

    await expect(page.locator(`p[role="alert"]`)).toContainText("terkunci sampai");

    // percobaan ke-6 dengan password yang BENAR tetap ditolak karena masih terkunci
    await page.getByLabel("NPP atau email").fill(username);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.locator(`p[role="alert"]`)).toContainText("terkunci sampai");
  });

  test("peserta yang membuka URL admin menerima 403 dan tercatat di activity_logs [AC M04]", async ({ page }) => {
    const res = await page.request.post("/api/test/fixtures", {
      data: { action: "create-active-participant", password: TEST_PASSWORD },
    });
    const { username, userId } = await res.json();

    await page.goto("/login");
    await page.getByLabel("NPP atau email").fill(username);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(/\/portal\/beranda/);

    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/403/);
    await expect(page.getByText("403")).toBeVisible();

    const check = await page.request.post("/api/test/fixtures", {
      data: { action: "check-unauthorized-access-log", userId },
    });
    const { found } = await check.json();
    expect(found).toBe(true);
  });
});
