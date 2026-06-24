// Cookie auth helpers (browser only).
//
// Setelah migrasi dari localStorage ke httpOnly cookie, FE tidak lagi
// simpan token di JavaScript — token ada di `document.cookie` (HttpOnly
// = invisible, tapi cookie tetap dikirim otomatis oleh browser per-request).
//
// Yang masih bisa di-baca JS:
//   - `insuretrack_csrf` cookie (companion non-HttpOnly) — dipakai untuk
//     mirror ke `X-CSRF-Token` header di setiap request mutating.
//   - `insuretrack_session` cookie — HttpOnly, return undefined di sini.
//     FE cukup tahu "ada session atau tidak" via probe ke `/admin/me` atau
//     `/customer/me`.
//
// Nama cookie configurable via env (NEXT_PUBLIC_SESSION_COOKIE_NAME /
// NEXT_PUBLIC_CSRF_COOKIE_NAME) — default = `insuretrack_session` /
// `insuretrack_csrf` (lihat backend `Config`).

const SESSION_COOKIE_NAME =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME) ||
  "insuretrack_session";

const CSRF_COOKIE_NAME =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME) ||
  "insuretrack_csrf";

/**
 * Baca `insuretrack_csrf` cookie value. Return `null` di server-side
 * (cookies() ada tapi tidak applicable untuk FE mirror) atau kalau
 * cookie absent.
 *
 * Pakai di client component SEBELUM fetch mutating: ambil value, kirim
 * sebagai header `X-CSRF-Token`. Backend cocokkan dengan companion
 * cookie (double-submit pattern).
 */
export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Probe sederhana apakah user punya session cookie (bukan token —
 * cookie value HttpOnly, JS tidak bisa baca). TRUE kalau cookie name
 * ada di `document.cookie`, irrespective of value.
 *
 * Untuk cross-app detection (mis. Navbar admin detect customer-login),
 * pakai ini sebagai hint, lalu confirm via GET `/customer/me`. Jangan
 * pakai sebagai authz — selalu verify via endpoint.
 */
export function hasSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
}

/** Expose cookie names untuk diagnostic atau test. */
export const AUTH_COOKIE_NAMES = {
  session: SESSION_COOKIE_NAME,
  csrf: CSRF_COOKIE_NAME,
} as const;
