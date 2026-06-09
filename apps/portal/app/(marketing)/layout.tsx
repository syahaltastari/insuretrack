import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

/**
 * Layout untuk semua halaman marketing/publik: landing, FAQ, privacy,
 * terms, about. Menyediakan Navbar (top) + Footer (bottom) — page di
 * bawah layout ini tinggal render konten utama saja.
 *
 * Route group `(marketing)` TIDAK memengaruhi URL — file di dalamnya tetap
 * resolve ke `/`, `/faq`, `/privacy`, dll. (tanpa prefix `(marketing)`).
 *
 * Dipakai oleh:
 *   - app/(marketing)/page.tsx        → /
 *   - app/(marketing)/faq/page.tsx     → /faq
 *   - app/(marketing)/privacy/page.tsx → /privacy
 *   - app/(marketing)/terms/page.tsx   → /terms
 *   - app/(marketing)/about/page.tsx   → /about
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  );
}
