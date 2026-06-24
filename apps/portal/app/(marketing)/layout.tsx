import { cookies } from "next/headers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const SESSION_COOKIE_NAME =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "insuretrack_session";

/**
 * Layout untuk semua halaman marketing/publik: landing, FAQ, privacy,
 * terms, about. Menyediakan Navbar (top) + Footer (bottom) — page di
 * bawah layout ini tinggal render konten utama saja.
 *
 * Route group `(marketing)` TIDAK memengaruhi URL — file di dalamnya tetap
 * resolve ke `/`, `/faq`, `/privacy`, dll. (tanpa prefix `(marketing)`).
 *
 * SSR-side auth detection: `cookies()` baca request cookie langsung di
 * server (HttpOnly visible di sini). Pass `initialAuthed` ke Navbar
 * supaya initial render sudah correct (no flash "Login" → "Portal").
 * Cookie name "insuretrack_session" di-set oleh backend saat login.
 *
 * Dipakai oleh:
 *   - app/(marketing)/page.tsx        → /
 *   - app/(marketing)/faq/page.tsx     → /faq
 *   - app/(marketing)/privacy/page.tsx → /privacy
 *   - app/(marketing)/terms/page.tsx   → /terms
 *   - app/(marketing)/about/page.tsx   → /about
 */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side: baca session cookie. Tidak perlu validate JWT di
  // sini — cookie presence cukup untuk UI CTA. Actual auth check tetap
  // di backend per-request. Kalau cookie invalid, next API call return
  // 401 → Navbar's checkSession useEffect re-set authed=false.
  const cookieStore = await cookies();
  const initialAuthed = cookieStore.has(SESSION_COOKIE_NAME);

  return (
    <>
      <Navbar initialAuthed={initialAuthed} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
