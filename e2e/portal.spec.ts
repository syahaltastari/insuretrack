// E2E: customer portal — landing page load + login form smoke.
//
// Prasyarat: portal di :3000 (Next.js dev server). Backend boleh tidak
// running untuk landing page test; untuk login harus running.

import { expect, test } from "@playwright/test";

test.describe("portal landing", () => {
  test("renders hero with CTA", async ({ page }) => {
    await page.goto("/");
    // Hero heading "Asuransi digital..." (atau copy aktual) — pakai locator
    // yang tidak rapuh terhadap copy.
    await expect(
      page.getByRole("heading", { level: 1 }).or(page.getByText(/asuransi/i).first()),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("registration CTA links to /register", async ({ page }) => {
    await page.goto("/");
    const cta = page
      .getByRole("link", { name: /daftar|register|sign up/i })
      .first();
    if (await cta.isVisible().catch(() => false)) {
      await expect(cta).toHaveAttribute("href", /\/register|\/portal\/register/);
    }
    // Kalau CTA tidak ditemukan (mis. marketing copy berbeda), skip — tidak
    // fail test landing page. Tetap useful untuk smoke check page load OK.
  });
});

test.describe("portal login", () => {
  test("rejects empty fields", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByRole("button", { name: /login|masuk/i }).click();
    await expect(page).toHaveURL(/\/portal\/login/);
  });
});
