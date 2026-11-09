import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  // semua worker memukul satu `next dev` + argon2 di tiap login — >2 worker membuat request 8+ dtk dan timeout
  workers: 2,
  reporter: "html",
  // kompilasi pertama sebuah route di `next dev` bisa >5 dtk (default expect) — terukur 5,5 dtk di /admin/dashboard
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
