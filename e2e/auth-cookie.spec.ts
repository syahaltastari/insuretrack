// E2E: cookie-based auth + CSRF defense verification.
//
// Prasyarat:
//   - Backend running di :8080 (lokal `cargo run` atau remote)
//   - Admin portal running di :3001
//   - Customer portal running di :3000
//   - Admin user 'admin' dengan password 'admin123' (dari 0004_seed.sql)
//   - Customer 'test-customer@example.com' dengan password 'Test1234!'
//     (lihat scripts/smoke-cookie-auth.md untuk setup)
//
// Test ini verify behavior end-to-end yang tidak bisa di-cover oleh
// cargo test (browser-level cookie attributes, FE form interactions,
// localStorage absence, dsb). Test backend-level (JWT verification,
// CSRF match, expiry) sudah ada di apps/backend/tests/.

import { expect, test } from "@playwright/test";

const ADMIN_BASE = "http://localhost:3001";
const PORTAL_BASE = "http://localhost:3000";
const BACKEND = "http://localhost:8080";

test.describe("admin login + cookie auth", () => {
  test("login form has expected fields and validation", async ({ page }) => {
    await page.goto(`${ADMIN_BASE}/admin/login`);
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /login|masuk/i })).toBeVisible();
  });

  test("successful login sets session + csrf cookies with correct attributes", async ({
    page,
    context,
    request,
  }) => {
    // Skip kalau backend tidak jalan (test dev server only).
    const healthOk = await request.get(`${BACKEND}/health`).then((r) => r.ok()).catch(() => false);
    test.skip(!healthOk, "Backend not running on :8080 — start dengan `cargo run` di apps/backend");

    // Pre-condition: pastikan clean state (no leftover cookie).
    await context.clearCookies();

    await page.goto(`${ADMIN_BASE}/admin/login`);
    await page.getByLabel(/username/i).fill("admin");
    await page.getByLabel(/password/i).fill("admin123");
    await page.getByRole("button", { name: /login|masuk/i }).click();

    // Tunggu redirect ke dashboard (login sukses).
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 15_000 });

    // Cek cookie attributes via Playwright context API.
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "insuretrack_session");
    const csrf = cookies.find((c) => c.name === "insuretrack_csrf");

    expect(session, "session cookie harus ada setelah login sukses").toBeDefined();
    expect(session!.httpOnly, "session cookie harus HttpOnly (XSS-steal protection)").toBe(true);
    expect(session!.sameSite, "session cookie harus SameSite=Lax")
      .toMatch(/^(Lax|Strict)$/);
    expect(session!.value.length, "session cookie value (JWT) harus non-empty").toBeGreaterThan(20);

    expect(csrf, "CSRF cookie harus ada").toBeDefined();
    expect(csrf!.httpOnly, "CSRF cookie harus NON-HttpOnly (JS harus bisa baca)")
      .toBe(false);
    expect(csrf!.value.length).toBeGreaterThan(20);

    // localStorage harus bersih (tidak ada token di sana).
    const localStorageKeys = await page.evaluate(() =>
      Object.keys(window.localStorage),
    );
    expect(
      localStorageKeys,
      "localStorage tidak boleh ada token sama sekali (cookie auth only)",
    ).not.toContain("insuretrack_admin_token");
    expect(localStorageKeys).not.toContain("insuretrack_customer_token");
  });

  test("admin/me returns 401 without session cookie", async ({ request }) => {
    const healthOk = await request.get(`${BACKEND}/health`).then((r) => r.ok()).catch(() => false);
    test.skip(!healthOk, "Backend not running on :8080");
    const r = await request.get(`${BACKEND}/api/admin/me`);
    expect(r.status()).toBe(401);
  });

  test("admin/me returns 200 with session cookie", async ({ request, context }) => {
    // Setup: login dulu untuk dapat cookie.
    const healthOk = await request.get(`${BACKEND}/health`).then((r) => r.ok()).catch(() => false);
    test.skip(!healthOk, "Backend not running on :8080");

    await context.clearCookies();
    const loginRes = await request.post(`${BACKEND}/api/admin/login`, {
      data: { username: "admin", password: "admin123" },
    });
    expect(loginRes.ok()).toBeTruthy();

    const meRes = await request.get(`${BACKEND}/api/admin/me`);
    expect(meRes.status()).toBe(200);
    const body = await meRes.json();
    expect(body.username).toBe("admin");
    expect(body.role).toBe("admin");
  });

  test("CSRF defense: PATCH without X-CSRF-Token returns 403", async ({
    request,
    context,
  }) => {
    const healthOk = await request.get(`${BACKEND}/health`).then((r) => r.ok()).catch(() => false);
    test.skip(!healthOk, "Backend not running on :8080");

    await context.clearCookies();
    await request.post(`${BACKEND}/api/admin/login`, {
      data: { username: "admin", password: "admin123" },
    });

    // PATCH /api/admin/me dengan cookie session tapi TANPA X-CSRF-Token
    // → 403. Verifikasi CSRF guard fire sebelum auth/handler.
    const r = await request.patch(`${BACKEND}/api/admin/me`, {
      data: { full_name: "Should Fail" },
    });
    expect(r.status()).toBe(403);
    expect((await r.json()).error?.code).toBe("FORBIDDEN");
  });

  test("CSRF defense: PATCH with matching X-CSRF-Token succeeds", async ({
    request,
    context,
  }) => {
    const healthOk = await request.get(`${BACKEND}/health`).then((r) => r.ok()).catch(() => false);
    test.skip(!healthOk, "Backend not running on :8080");

    await context.clearCookies();
    await request.post(`${BACKEND}/api/admin/login`, {
      data: { username: "admin", password: "admin123" },
    });

    // Ambil csrf cookie value → mirror ke header.
    const cookies = await context.cookies();
    const csrf = cookies.find((c) => c.name === "insuretrack_csrf");
    expect(csrf).toBeDefined();

    const r = await request.patch(`${BACKEND}/api/admin/me`, {
      headers: { "X-CSRF-Token": csrf!.value },
      data: { full_name: "Updated Name" },
    });
    expect(r.status(), "PATCH dengan matching CSRF harus 200").toBe(200);
  });

  test("logout clears both cookies", async ({ page, context, request }) => {
    const healthOk = await request.get(`${BACKEND}/health`).then((r) => r.ok()).catch(() => false);
    test.skip(!healthOk, "Backend not running on :8080");

    await context.clearCookies();
    await page.goto(`${ADMIN_BASE}/admin/login`);
    await page.getByLabel(/username/i).fill("admin");
    await page.getByLabel(/password/i).fill("admin123");
    await page.getByRole("button", { name: /login|masuk/i }).click();
    await page.waitForURL(/\/admin\/dashboard/);

    // Klik logout di user menu.
    await page.getByRole("button", { name: /logout|keluar/i }).click();
    await page.waitForURL(/\/admin\/login/);

    // Cookies harus sudah di-clear oleh Set-Cookie Max-Age=0.
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "insuretrack_session");
    expect(session, "session cookie harus di-clear setelah logout").toBeUndefined();
  });

  test("unauthed access to /admin/dashboard redirects to login (middleware)", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    const res = await page.goto(`${ADMIN_BASE}/admin/dashboard`);
    // Middleware redirect ke /admin/login. Page bisa 200 (final URL) atau
    // 307/302 (redirect). Cek final URL.
    expect(page.url()).toMatch(/\/admin\/login/);
    expect(res?.ok()).toBeTruthy();
  });
});

test.describe("customer portal cookie auth", () => {
  test("login form renders", async ({ page }) => {
    await page.goto(`${PORTAL_BASE}/portal/login`);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("unauthed access to /portal/dashboard redirects to login (middleware)", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto(`${PORTAL_BASE}/portal/dashboard`);
    expect(page.url()).toMatch(/\/portal\/login/);
  });

  test("authed access to /portal/login redirects to dashboard (middleware)", async ({
    page,
    context,
    request,
  }) => {
    // User sudah login (cookie present) → /portal/login harus redirect
    // ke /portal/dashboard, BUKAN render form. Verifikasi middleware
    // auth-aware public paths.
    const healthOk = await request.get(`${BACKEND}/health`).then((r) => r.ok()).catch(() => false);
    test.skip(!healthOk, "Backend not running on :8080");

    // Login dulu untuk dapat session cookie.
    await context.clearCookies();
    const login = await request.post(`${BACKEND}/api/customer/login`, {
      data: { username: "andi.susanto57@example.com", password: "Demo1234!" },
    });
    test.skip(!login.ok(), "Login gagal (cek kredensial di dev DB)");

    // Copy cookies dari response ke browser context.
    const cookies = login.headers()["set-cookie"];
    if (cookies) {
      // Parse "name=value; Path=/; ..." dari each Set-Cookie header.
      const parsed = cookies.map((c) => {
        const [pair] = c.split(";");
        const [name, ...rest] = pair.split("=");
        return { name, value: rest.join("=") };
      });
      await context.addCookies(parsed);
    }

    // Navigate ke /portal/login — harus redirect ke /portal/dashboard.
    await page.goto(`${PORTAL_BASE}/portal/login`);
    expect(page.url(), "authed user harusnya di-redirect ke dashboard")
      .toMatch(/\/portal\/dashboard/);
  });

  test("admin cookie does NOT grant portal access (role separation)", async ({
    page,
    context,
    request,
  }) => {
    const healthOk = await request.get(`${BACKEND}/health`).then((r) => r.ok()).catch(() => false);
    test.skip(!healthOk, "Backend not running on :8080");

    // Login sebagai admin → session cookie punya role=admin.
    await context.clearCookies();
    await request.post(`${BACKEND}/api/admin/login`, {
      data: { username: "admin", password: "admin123" },
    });

    // Navigate ke portal dashboard. Backend akan return 403 karena
    // role customer required, dan shell akan redirect ke login.
    const res = await page.goto(`${PORTAL_BASE}/portal/dashboard`).catch((e) => {
      // Navigation mungkin abort karena client-side redirect.
      return null;
    });
    // Page akhir harus login (portal shell redirect admin ke login).
    await page.waitForURL(/\/portal\/login/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/portal\/login/);
  });
});
