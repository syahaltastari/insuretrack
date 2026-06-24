// Logout helpers — panggil endpoint backend yang clear cookie session + CSRF.
// FE-only helpers: setelah call berhasil, browser auto-receive Set-Cookie
// dengan Max-Age=0 → cookie langsung hilang. Caller redirect ke login
// page setelahnya.

import { apiFetch } from "./api";

/** `POST /api/admin/logout` — clear session + CSRF cookie, return 204. */
export async function logoutAdmin(): Promise<void> {
  await apiFetch<void>("/admin/logout", { method: "POST" });
}

/** `POST /api/customer/logout` — clear session + CSRF cookie, return 204. */
export async function logoutCustomer(): Promise<void> {
  await apiFetch<void>("/customer/logout", { method: "POST" });
}
