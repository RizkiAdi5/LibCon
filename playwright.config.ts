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
  // periode.spec & survei.spec memakai state global (hanya satu periode OPEN, FR-02.05):
  // dijalankan berurutan lewat dependencies, terpisah dari spec lain yang boleh paralel
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: [/periode\.spec/, /survei\.spec/] },
    { name: "global-periode", use: { ...devices["Desktop Chrome"] }, testMatch: /periode\.spec/ },
    { name: "global-survei", use: { ...devices["Desktop Chrome"] }, testMatch: /survei\.spec/, dependencies: ["global-periode"] },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
