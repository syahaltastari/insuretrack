"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { checkSession, logoutCustomer } from "@insuretrack/api-client";

const navItems = [
  { href: "/#products", label: "Produk" },
  { href: "/#how", label: "Cara Kerja" },
  { href: "/#why", label: "Kenapa" },
  { href: "/#contact", label: "Kontak" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Marketing navbar di admin app detect customer-auth (lihat memory
    // [[hybrid-local-dev]] untuk konteks). Cookie session HttpOnly
    // tidak bisa dibaca dari JS — pakai async probe ke `/customer/me`.
    // 200 = customer terauthentikasi, 401 = tidak. Probe run di tiap
    // navigasi (pathname change) supaya CTA stay in sync.
    let cancelled = false;
    checkSession("customer").then((ok) => {
      if (!cancelled) setAuthed(ok);
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

  const buyPolis = (e: React.MouseEvent) => {
    e.preventDefault();
    if (authed) {
      router.push("/portal/dashboard");
    } else {
      router.push("/portal/login?next=/register");
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
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="navbar-actions">
          {authed ? (
            <>
              <Link href="/portal/dashboard" className="clay-button ghost size-small">
                Portal
              </Link>
              <button onClick={logout} className="clay-button solid-pomegranate size-small">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/portal/login" className="navbar-link navbar-link-cta">
                Login
              </Link>
              <button onClick={buyPolis} className="clay-button solid-ube size-small pill">
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

      {open && (
        <div className="navbar-mobile">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="navbar-mobile-link">
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
        </div>
      )}
    </header>
  );
}
