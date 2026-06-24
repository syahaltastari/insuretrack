// Cookie auth helpers (browser only).
//
// Setelah migrasi dari localStorage ke httpOnly cookie, FE tidak lagi
// simpan token di JavaScript — token ada di `document.cookie` (HttpOnly
// = invisible, tapi cookie tetap dikirim otomatis oleh browser per-request).
//
// CATATAN PENTING tentang `hasSessionCookie()`: session cookie
// (`insuretrack_session`) di-set dengan flag `HttpOnly`. Browser
// MENYEMBUNYIKAN cookie HttpOnly sepenuhnya dari `document.cookie` —
// baik name maupun value tidak visible. Akibatnya,
// `hasSessionCookie()` SELALU return `false` untuk session cookie yang
// valid. Untuk deteksi auth client-side, pakai async `checkSession()`
// di bawah yang probe ke endpoint backend (cookie auto-attach via
// `credentials: include`).
//
// Yang masih bisa di-baca JS langsung di `document.cookie`:
//   - `insuretrack_csrf` cookie (companion non-HttpOnly) — dipakai untuk
//     mirror ke `X-CSRF-Token` header di setiap request mutating.
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
 * ⚠️ TIDAK reliable untuk HttpOnly session cookie. `insuretrack_session`
 * adalah HttpOnly → browser sembunyikan dari `document.cookie`. Function
 * ini hanya detect NON-HttpOnly cookies (mis. CSRF cookie, atau session
 * cookie dari sistem lain). Untuk deteksi session yang benar, pakai
 * `checkSession()` (async probe ke `/me` endpoint).
 */
export function hasSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
}

/**
 * Probe async ke backend `/customer/me` atau `/admin/me` untuk cek
 * apakah user terauthentikasi. Cookie session di-attach otomatis oleh
 * browser (HttpOnly tetap dikirim) — backend return 200 kalau valid,
 * 401 kalau tidak.
 *
 * Return `true` kalau ada session valid, `false` kalau tidak (termasuk
 * network error — caller harus treat sebagai "unknown", bukan
 * "definitely logged out"). Backend role check terpisah di handler
 * masing-masing (`/customer/me` butuh role customer, `/admin/me` butuh
 * role admin).
 */
export async function checkSession(
  role: "customer" | "admin",
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { apiFetch } = await import("./api");
    await apiFetch(`${role}/me`);
    return true;
  } catch {
    return false;
  }
}

/** Expose cookie names untuk diagnostic atau test. */
export const AUTH_COOKIE_NAMES = {
  session: SESSION_COOKIE_NAME,
  csrf: CSRF_COOKIE_NAME,
} as const;
