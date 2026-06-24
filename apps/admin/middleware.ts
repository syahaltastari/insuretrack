// Edge middleware: SSR-side auth guard untuk /admin/*.
//
// Setelah migrasi ke httpOnly cookie, token JWT ada di cookie
// `insuretrack_session`. Cookie HttpOnly → tidak bisa di-baca dari JS
// (tidak di document.cookie). Middleware ini cek NAMA cookie ada
// (presence) sebelum pass ke page. Page-level admin shell akan
// verify role via backend call.
//
// Path publik (`/admin/login`) di-skip. Kalau cookie absent di path
// yang butuh auth → redirect ke login. Backend authorize di setiap
// request mutating via CSRF guard + auth extractor.
//
// Edge runtime — TIDAK ada Node.js APIs. Pakai `cookies()` dari
// `next/headers` (edge-compatible).

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "insuretrack_session";

const PUBLIC_ADMIN_PATHS = new Set<string>(["/admin/login"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Path publik → bypass.
  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Cek cookie name (HttpOnly → value tidak visible di sini, presence
  // saja cukup untuk early redirect). Backend tetap gate auth di
  // setiap request — middleware ini cuma UX optimization supaya
  // unauth user tidak flash halaman protected.
  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Jalankan untuk semua /admin/* kecuali asset Next.js internal.
  matcher: ["/admin/:path*"],
};
