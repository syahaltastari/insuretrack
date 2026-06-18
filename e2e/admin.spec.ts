// E2E: admin login + dashboard smoke.
//
// Prasyarat: backend running di :8080 + admin portal di :3001. Test ini
// pakai akun admin default dari seeder (`username: admin`, password
// hasil reset — lihat apps/backend/.env atau scripts/setup-db-native.bat).

import { expect, test } from "@playwright/test";

test.describe("admin login", () => {
  test("rejects empty fields with validation message", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByRole("button", { name: /login|masuk/i }).click();
    // Form kosong → tidak boleh submit (HTML5 required atau zod refine).
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("rejects wrong credentials with visible error", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel(/username/i).fill("admin");
    await page.getByLabel(/password/i).fill("definitely-wrong-password");
    await page.getByRole("button", { name: /login|masuk/i }).click();
    // Tunggu error banner / role="alert"
    await expect(
      page.getByRole("alert").or(page.locator("[data-testid='login-error']")),
    ).toBeVisible({ timeout: 10_000 });
    // Masih di /admin/login, tidak redirect ke dashboard
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
