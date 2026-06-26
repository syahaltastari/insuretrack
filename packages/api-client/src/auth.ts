// Cookie auth helpers (browser only).
//
// Setelah migrasi dari localStorage ke httpOnly cookie, FE tidak lagi
// simpan token di JavaScript — token ada di `document.cookie` (HttpOnly
// = invisible, tapi cookie tetap dikirim otomatis oleh browser per-request).
//
// CATATAN PENTING tentang `hasSessionCookie()`: session cookie di-set
// dengan flag `HttpOnly`. Browser MENYEMBUNYIKAN cookie HttpOnly
// sepenuhnya dari `document.cookie` — baik name maupun value tidak
// visible. Akibatnya, `hasSessionCookie()` SELALU return `false` untuk
// session cookie yang valid. Untuk deteksi auth client-side, pakai async
// `checkSession()` di bawah yang probe ke endpoint backend (cookie
// auto-attach via `credentials: include`).
//
// Yang masih bisa di-baca JS langsung di `document.cookie`:
//   - cookie CSRF (companion non-HttpOnly) — dipakai untuk mirror ke
//     `X-CSRF-Token` header di setiap request mutating.
//
// Admin & customer pakai nama cookie TERPISAH (bukan satu nama shared).
// Alasan: cookie di-scope per host, BUKAN per port — browser kirim
// cookie `localhost` yang sama ke `localhost:3000` (portal) maupun
// `localhost:3001` (admin) kalau nama+domain sama. Dengan nama sama,
// login admin lalu buka portal di browser yang sama akan kirim JWT
// role=admin ke `/api/customer/me` → backend correctly reject (403
// Forbidden — role mismatch) padahal user cuma belum pernah login
// customer. Nama terpisah menghilangkan collision ini. Konfigurasi via
// env (NEXT_PUBLIC_ADMIN_SESSION_COOKIE_NAME dst) — default sudah match
// backend default (lihat `Config`).

const ADMIN_SESSION_COOKIE_NAME =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_ADMIN_SESSION_COOKIE_NAME) ||
  "insuretrack_admin_session";

const CUSTOMER_SESSION_COOKIE_NAME =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_CUSTOMER_SESSION_COOKIE_NAME) ||
  "insuretrack_customer_session";

const ADMIN_CSRF_COOKIE_NAME =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_ADMIN_CSRF_COOKIE_NAME) ||
  "insuretrack_admin_csrf";

const CUSTOMER_CSRF_COOKIE_NAME =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_CUSTOMER_CSRF_COOKIE_NAME) ||
  "insuretrack_customer_csrf";

type Role = "admin" | "customer";

function sessionCookieName(role: Role): string {
  return role === "admin" ? ADMIN_SESSION_COOKIE_NAME : CUSTOMER_SESSION_COOKIE_NAME;
}

function csrfCookieName(role: Role): string {
  return role === "admin" ? ADMIN_CSRF_COOKIE_NAME : CUSTOMER_CSRF_COOKIE_NAME;
}

/**
 * Baca cookie CSRF value untuk role tertentu. Return `null` di
 * server-side (cookies() ada tapi tidak applicable untuk FE mirror) atau
 * kalau cookie absent.
 *
 * Pakai di client component SEBELUM fetch mutating: ambil value, kirim
 * sebagai header `X-CSRF-Token`. Backend cocokkan dengan companion
 * cookie (double-submit pattern).
 */
export function readCsrfCookie(role: Role): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${csrfCookieName(role)}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * ⚠️ TIDAK reliable untuk HttpOnly session cookie — session cookie
 * adalah HttpOnly → browser sembunyikan dari `document.cookie`. Function
 * ini hanya detect NON-HttpOnly cookies (mis. CSRF cookie, atau session
 * cookie dari sistem lain). Untuk deteksi session yang benar, pakai
 * `checkSession()` (async probe ke `/me` endpoint).
 */
export function hasSessionCookie(role: Role): boolean {
  if (typeof document === "undefined") return false;
  const name = sessionCookieName(role);
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${name}=`));
}

/**
 * Probe async ke backend `/customer/me` atau `/admin/me` untuk cek
 * apakah user terauthentikasi. Cookie session di-attach otomatis oleh
 * browser (HttpOnly tetap dikirim) — backend return 200 kalau valid,
 * 401 kalau tidak ada session, 403 kalau session valid tapi role beda.
 *
 * Return `true` kalau ada session valid, `false` kalau tidak (termasuk
 * network error — caller harus treat sebagai "unknown", bukan
 * "definitely logged out").
 */
export async function checkSession(role: Role): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { apiFetch } = await import("./api");
    await apiFetch(`/${role}/me`);
    return true;
  } catch {
    return false;
  }
}

/** Expose cookie names untuk diagnostic atau test. */
export const AUTH_COOKIE_NAMES = {
  admin: {
    session: ADMIN_SESSION_COOKIE_NAME,
    csrf: ADMIN_CSRF_COOKIE_NAME,
  },
  customer: {
    session: CUSTOMER_SESSION_COOKIE_NAME,
    csrf: CUSTOMER_CSRF_COOKIE_NAME,
  },
} as const;
