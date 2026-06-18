// Playwright config — E2E tests untuk FE surfaces (portal + admin).
//
// Setup: asumsi backend sudah running di port 8080 (lokal atau remote)
// + portal di 3000 + admin di 3001. webServer otomatis start jika belum.
//
// Default: pakai `pnpm dev` (turbo run dev) untuk start portal+admin secara
// parallel. Backend harus di-start manual via `cargo run` atau di-skip
// dengan `--mock` flag (frontend panggil MSW).

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "portal",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000" },
      testMatch: /portal\.spec\.ts$/,
    },
    {
      name: "admin",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3001" },
      testMatch: /admin\.spec\.ts$/,
    },
  ],
  // webServer otomatis start portal + admin jika belum jalan. Untuk lokal
  // tanpa backend, skip webServer & pakai FE-only smoke test.
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : [
        {
          command: "pnpm dev:portal",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: "pnpm dev:admin",
          url: "http://localhost:3001",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
