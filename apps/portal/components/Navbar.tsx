"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { checkSession, logoutCustomer } from "@insuretrack/api-client";
import { useShouldAnimate } from "@/hooks/use-should-animate";

const navItems = [
  { href: "/#products", label: "Produk" },
  { href: "/#how", label: "Cara Kerja" },
  { href: "/#why", label: "Kenapa" },
  { href: "/#contact", label: "Kontak" },
];

/**
 * Marketing Navbar dengan auth-aware CTA. `initialAuthed` di-pass dari
 * server component (MarketingLayout baca `cookies()` server-side) supaya
 * initial render sudah benar (no flash "Login" → "Portal"). Setelah mount,
 * useEffect re-check via `/customer/me` untuk kasus cookie berubah
 * (login/logout) tanpa navigasi.
 */
export function Navbar({ initialAuthed = false }: { initialAuthed?: boolean } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(initialAuthed);
  const [scrolled, setScrolled] = useState(false);
  // Custom hook bypass motion warning.
  const shouldAnimate = useShouldAnimate();

  useEffect(() => {
    // Cookie session HttpOnly — JS tidak bisa deteksi via `document.cookie`.
    // Pakai async probe ke `/customer/me` (cookie auto-attach). 200 =
    // authed, 401/throw = not authed. Probe ini run di setiap navigasi
    // (pathname change) supaya CTA stay in sync dengan actual state.
    //
    // Asymmetric update: hanya set ke `true` JANGAN ke `false`. Kalau
    // SSR `initialAuthed=true` (cookie present di request) tapi
    // checkSession return false (transient CORS/network/race), kita trust
    // SSR — lebih baik user lihat "Portal" walaupun sebenarnya sesi
    // invalid (next API call return 401), daripada flicker ke "Login".
    // Logout explicit set ke false via `logout()` function.
    let cancelled = false;
    checkSession("customer").then((ok) => {
      if (cancelled) return;
      if (ok) setAuthed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Handler untuk anchor link (#products, #how, dll) di navbar.
  //
  // Kenapa perlu JS handler meskipun CSS `html { scroll-behavior: smooth }`
  // sudah di-set di globals.css:
  //   - Same-page click: CSS scroll-behavior biasanya jalan di Chrome/Edge,
  //     TAPI Safari & Firefox kadang ignore rule untuk anchor dengan
  //     absolute path (`/#products` bukan `#products`). JS scrollIntoView
  //     lebih reliable cross-browser.
  //   - Reduced-motion user: respect OS preference via useShouldAnimate
  //     (dev = always smooth, prod = respect OS). Browser default
  //     `behavior: 'auto'` kalau user minta reduce.
  //   - Cross-page navigation (mis. dari /faq → klik "Produk"): handled
  //     oleh browser + CSS scroll-behavior di landing page. Untuk
  //     Chrome/Edge/Firefox/Safari modern, post-load hash scroll sudah
  //     smooth out-of-the-box.
  //
  // Alasan pakai scrollIntoView (bukan custom requestAnimationFrame loop):
  //   - Native, browser-optimized (GPU-accelerated di modern browsers).
  //   - Respect prefers-reduced-motion secara built-in via option `behavior`.
  //   - scroll-margin-top CSS di section[id] otomatis apply — section
  //     berhenti di 80px dari top (di bawah navbar), tidak ketutup.
  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    // Extract hash. href format: "/path#hash" atau "/#hash" atau "#hash"
    const hashIdx = href.indexOf("#");
    if (hashIdx === -1) return; // no anchor — biarkan default link behavior

    const targetPath = href.substring(0, hashIdx) || "/";
    const hash = href.substring(hashIdx + 1);
    if (!hash) return;

    // Cross-page: biarkan browser navigate. CSS scroll-behavior di
    // landing page handle post-load smooth scroll.
    if (targetPath !== pathname) return;

    // Same-page: prevent default & smooth-scroll manual.
    e.preventDefault();
    const target = document.getElementById(hash);
    if (!target) return;

    target.scrollIntoView({
      behavior: shouldAnimate ? "smooth" : "auto",
      block: "start",
    });

    // Update URL hash tanpa trigger scroll default. `replaceState` (bukan
    // `pushState`) supaya back button tidak isi history dengan hash per
    // click — back akan langsung ke previous page, bukan previous section.
    window.history.replaceState(null, "", href);

    // Close mobile menu kalau terbuka.
    setOpen(false);
  };

  const buyPolis = (e: React.MouseEvent) => {
    e.preventDefault();
    if (authed) {
      router.push("/portal/dashboard");
    } else {
      router.push("/portal/login?next=/portal/dashboard");
    }
  };

  const logout = async () => {
    try {
      await logoutCustomer();
    } catch {
      // best-effort — tetap redirect.
    }
    setAuthed(false);
    router.push("/");
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/#")) return false;
    return pathname === href;
  };

  return (
    <header className={`navbar ${scrolled ? "navbar-scrolled" : ""}`}>
      <div className="navbar-inner clay-container">
        <Link href="/" className="navbar-brand">
          <span className="navbar-logo-mark" aria-hidden="true">◆</span>
          <span className="navbar-logo-text">InsureTrack</span>
        </Link>

        <nav className="navbar-links" aria-label="Primary">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`navbar-link ${isActive(item.href) ? "active" : ""}`}
              onClick={(e) => handleNavClick(e, item.href)}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="navbar-actions">
          {authed ? (
            <>
              <Link href="/portal/dashboard" className="clay-button outline-honey size-small">
                Portal
              </Link>
              <button onClick={logout} className="clay-button solid-pomegranate size-small">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/portal/login" className="navbar-link">
                Login
              </Link>
              <button onClick={buyPolis} className="clay-button solid-honey size-small pill">
                Beli Polis →
              </button>
            </>
          )}
        </div>

        <button
          className="navbar-burger"
          onClick={() => setOpen((s) => !s)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <span className={`burger-bar ${open ? "open" : ""}`} />
          <span className={`burger-bar ${open ? "open" : ""}`} />
          <span className={`burger-bar ${open ? "open" : ""}`} />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          // Mobile dropdown menu. Pakai AnimatePresence + motion.div
          // supaya exit animation jalan (close = fade+slide up).
          // Pre-hydration SSR renders plain div via class .navbar-mobile
          // (yang punya `display: none` di desktop, `display: flex` di
          // mobile). Post-hydration, motion.div tambah inline transform
          // untuk animasi. CSS class wins untuk display, motion menang
          // untuk transform/opacity — no conflict.
          <motion.div
            key="mobile-menu"
            className="navbar-mobile"
            initial={shouldAnimate ? { opacity: 0, y: -8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldAnimate ? { opacity: 0, y: -8 } : { opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="navbar-mobile-link"
                onClick={(e) => handleNavClick(e, item.href)}
              >
                {item.label}
              </a>
            ))}
            <div className="navbar-mobile-divider" />
            {authed ? (
              <>
                <Link href="/portal/dashboard" className="navbar-mobile-link">
                  Portal
                </Link>
                <button onClick={logout} className="navbar-mobile-link navbar-mobile-cta">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/portal/login" className="navbar-mobile-link">
                  Login
                </Link>
                <button onClick={buyPolis} className="navbar-mobile-link navbar-mobile-cta">
                  Beli Polis →
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
