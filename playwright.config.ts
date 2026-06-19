// Playwright config — E2E tests untuk FE surfaces (portal + admin).
//
// Setup: asumsi backend sudah running di port 8080 (lokal atau remote)
// + portal di 3000 + admin di 3001. webServer otomatis start jika belum.
//
// Mode:
// - Default (lokal/CI tanpa E2E_USE_PROD): `pnpm dev:portal` + `pnpm dev:admin`
//   (Next.js dev server, slower start tapi hot-reload friendly).
// - E2E_USE_PROD=1: `next start` (production, butuh `pnpm build` dulu).
//   Di CI, build sudah jalan di step sebelumnya, jadi `next start` cuma
//   ~3-5s untuk siap. Lebih cepat total wall time.
//
// Backend harus di-start manual via `cargo run` atau di-skip dengan
// `--mock` flag (frontend panggil MSW).

import { defineConfig, devices } from "@playwright/test";

const useProd = process.env.E2E_USE_PROD === "1";
const portalCmd = useProd ? "pnpm --filter @insuretrack/portal start" : "pnpm dev:portal";
const adminCmd = useProd ? "pnpm --filter @insuretrack/admin start" : "pnpm dev:admin";

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
  // webServer otomatis start portal + admin jika belum jalan. Untuk
  // skip (mis. server sudah jalan manual / pakai remote), set
  // E2E_SKIP_SERVER=1.
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : [
        {
          command: portalCmd,
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: useProd ? 30_000 : 120_000,
        },
        {
          command: adminCmd,
          url: "http://localhost:3001",
          reuseExistingServer: true,
          timeout: useProd ? 30_000 : 120_000,
        },
      ],
});
