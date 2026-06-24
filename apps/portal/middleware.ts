// Edge middleware: SSR-side auth guard untuk /portal/*.
//
// Sama dengan admin middleware — cookie name presence check, redirect
// ke login kalau absent. Backend tetap authorize di setiap request.
//
// Path publik (login, register, activate, reset) di-skip. Edge
// runtime — TIDAK ada Node.js APIs.

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "insuretrack_session";

const PUBLIC_PORTAL_PATHS = new Set<string>([
  "/portal/login",
  "/portal/register",
  "/portal/activate",
  "/portal/reset",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Path publik → bypass.
  if (PUBLIC_PORTAL_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Presence check — value HttpOnly tidak visible dari middleware.
  // Backend tetap gate auth per-request; ini cuma optimasi UX
  // supaya unauth user tidak flash halaman protected.
  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/portal/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*"],
};
