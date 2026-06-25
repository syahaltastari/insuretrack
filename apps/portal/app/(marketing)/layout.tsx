import { cookies } from "next/headers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { MotionProvider } from "@/components/motion-provider";

const SESSION_COOKIE_NAME =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "insuretrack_session";

// v2: force-dynamic untuk skip static prerender. Next.js 15.0.3 + React 19
// punya incompatibility saat static-generate marketing pages (error:
// "useContext of null" + "<Html> should not be imported outside of
// pages/_document"). SSR per-request adalah trade-off acceptable untuk
// MVP — marketing pages tidak traffic-nya setinggi admin/portal.
// Hapus flag ini setelah upgrade ke Next.js ≥15.1 yang fix bug-nya.
export const dynamic = "force-dynamic";

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
    // MotionProvider: global MotionConfig yang respect OS reduced motion
    // di production tapi override di development. Tanpa ini, useReducedMotion()
    // di Reveal/StaggerGroup/etc. selalu baca OS preference dan dev tidak
    // bisa verify animasi tanpa disable OS setting dulu.
    // Lihat components/motion-provider.tsx untuk rationale lengkap.
    <MotionProvider>
      {/* Wrapper bg-canvas: kasih Navbar (yang backdrop-blur) konsistensi
          warna dengan page content. Tanpa wrapper, Navbar akan blend dengan
          body bg (--warm-cream) bukan canvas — micro-shift visual.
          Footer punya bg sendiri (clay-black) jadi tidak terpengaruh. */}
      <div
        className="min-h-screen flex flex-col"
        style={{ background: "var(--canvas)" }}
      >
        <Navbar initialAuthed={initialAuthed} />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </MotionProvider>
  );
}
