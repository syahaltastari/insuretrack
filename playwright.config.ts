// Playwright config — E2E tests untuk FE surfaces (portal + admin).
//
// Setup: asumsi backend sudah running di port 8080 (lokal atau remote)
// + portal di 3000 + admin di 3001. webServer otomatis start jika belum.
//
// Mode:
// - Default (lokal/CI tanpa E2E_USE_PROD): `pnpm dev:portal` + `pnpm dev:admin`
//   (Next.js dev server, slower start tapi hot-reload friendly).
// - E2E_USE_PROD=1: pakai standalone server dari `next build`
//   (`node .next/standalone/apps/{portal,admin}/server.js`). Butuh
//   `pnpm build` dulu. Di CI, build sudah jalan di step sebelumnya,
//   jadi start ~3-5s. `next start` tidak dipakai karena kedua app
//   pakai `output: "standalone"` di next.config.ts — `next start` emit
//   warning dan mungkin tidak serve trace'd deps.
//
// Backend harus di-start manual via `cargo run` atau di-skip dengan
// `--mock` flag (frontend panggil MSW).

import { defineConfig, devices } from "@playwright/test";

const useProd = process.env.E2E_USE_PROD === "1";
// PORT dan ADMIN_PORT di-set agar server.js (yang baca dari process.env)
// respect custom port. Default Next.js standalone: 3000/3001.
const portalCmd = useProd
  ? "node .next/standalone/apps/portal/server.js"
  : "pnpm dev:portal";
const adminCmd = useProd
  ? "node .next/standalone/apps/admin/server.js"
  : "pnpm dev:admin";

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
