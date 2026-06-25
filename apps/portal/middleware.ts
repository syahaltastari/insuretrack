// Edge middleware: SSR-side auth handling untuk /portal/*.
//
// Setelah migrasi ke httpOnly cookie, token JWT ada di cookie
// `insuretrack_session`. Cookie HttpOnly → tidak bisa di-baca dari JS
// (tidak di document.cookie). Middleware ini cek NAMA cookie ada
// (presence) sebelum pass ke page. Page-level portal shell akan
// verify role via backend call.
//
// Path publik (`/portal/login`, `/portal/register`, `/portal/activate`,
// `/portal/forgot-password`) di-skip dari auth-required check. Kalau
// cookie absent di path yang butuh auth → redirect ke login.
//
// Tambahan: kalau user punya session valid (cookie ada) dan navigate ke
// salah satu halaman auth flow (login/activate/forgot-password) →
// redirect ke dashboard. Ini di-handle di middleware supaya:
//   1. Tidak ada flash form ke user yang sudah login
//   2. Tidak bergantung pada client bundle fresh (middleware server-side)
//   3. Konsisten untuk semua navigasi (link click, address bar, back/forward)
//
// Edge runtime — TIDAK ada Node.js APIs.

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "insuretrack_session";

// Path yang TIDAK butuh auth + path yang auth-aware (redirect ke dashboard
// kalau user sudah login).
const PUBLIC_PORTAL_PATHS = new Set<string>([
  "/portal/login",
  "/portal/register",
  "/portal/activate",
  "/portal/forgot-password",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Cek cookie name (HttpOnly → value tidak visible di sini, presence
  // saja cukup untuk early redirect). Backend tetap gate auth di
  // setiap request — middleware ini cuma optimasi UX supaya unauth user
  // tidak flash halaman protected.
  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);

  // Auth-aware public paths: kalau user sudah login → redirect ke
  // dashboard, skip form. Kalau belum → render normal.
  if (PUBLIC_PORTAL_PATHS.has(pathname)) {
    if (hasSession) {
      const dashboard = req.nextUrl.clone();
      dashboard.pathname = "/portal/dashboard";
      dashboard.search = "";
      return NextResponse.redirect(dashboard);
    }
    return NextResponse.next();
  }

  // Protected paths: kalau no session → redirect ke login.
  if (!hasSession) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/portal/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Jalankan untuk semua /portal/* termasuk halaman auth flow.
  matcher: ["/portal/:path*"],
};
