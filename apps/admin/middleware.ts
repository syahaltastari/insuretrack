// Edge middleware: SSR-side auth handling untuk /admin/*.
//
// Sama dengan apps/portal/middleware.ts — kalau user sudah login dan
// navigate ke /admin/login, redirect ke /admin/dashboard. Lebih reliable
// dari useEffect client-side karena:
//   1. Tidak ada flash form
//   2. Tidak bergantung pada FE bundle fresh
//   3. Konsisten untuk semua navigasi (link click, address bar, dsb.)
//
// Edge runtime — TIDAK ada Node.js APIs.

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "insuretrack_session";

const PUBLIC_ADMIN_PATHS = new Set<string>([
  "/admin/login",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);

  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    if (hasSession) {
      const dashboard = req.nextUrl.clone();
      dashboard.pathname = "/admin/dashboard";
      dashboard.search = "";
      return NextResponse.redirect(dashboard);
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
