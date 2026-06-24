"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@insuretrack/ui";
import { checkSession } from "@insuretrack/api-client";
import { CustomerUserMenu, fetchCustomerProfile, type CustomerProfile } from "@/components/CustomerUserMenu";

const navItems: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/portal/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/portal/policies", label: "Polis Saya", icon: "FileText" },
  { href: "/portal/invoices", label: "Invoice", icon: "Receipt" },
  { href: "/portal/claims", label: "Klaim", icon: "ShieldAlert" },
  { href: "/portal/inquiries", label: "Pertanyaan", icon: "MessageCircle" },
];

const SIDEBAR_MINIMIZED_KEY = "portal_sidebar_minimized";

// Path di /portal/* yang TIDAK butuh auth (login/register/activate/reset).
// Shell yang sama membungkus semuanya, jadi auth guard di bawah harus
// skip cek token untuk path-path ini — kalau tidak, user yang belum login
// terjebak di "Memuat..." karena `router.replace("/portal/login")` jadi
// no-op (sudah di /portal/login) dan `setReady(true)` tidak dipanggil.
const PUBLIC_PORTAL_PATHS = new Set<string>([
  "/portal/login",
  "/portal/register",
  "/portal/activate",
  "/portal/reset",
]);

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [minimizedHydrated, setMinimizedHydrated] = useState(false);

  useEffect(() => {
    // Halaman publik (login, register, dll.) tidak butuh auth.
    // setReady(true) langsung supaya shell render — kalau tidak, user
    // stuck di loading state selamanya.
    if (pathname && PUBLIC_PORTAL_PATHS.has(pathname)) {
      setReady(true);
      return;
    }
    // Cookie session HttpOnly — JS tidak bisa deteksi via `document.cookie`.
    // Trust Next.js middleware (server-side, baca cookie via req.cookies)
    // untuk auth gate. Di sini cukup fetch profile; kalau backend 401
    // (stale cookie / logout), return null dan menu render placeholder.
    setReady(true);
    fetchCustomerProfile().then(setProfile);
  }, [router, pathname]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_MINIMIZED_KEY);
      if (stored === "true") setMinimized(true);
    } catch {
      // ignore
    }
    setMinimizedHydrated(true);
  }, []);

  useEffect(() => {
    if (!minimizedHydrated) return;
    try {
      window.localStorage.setItem(SIDEBAR_MINIMIZED_KEY, minimized ? "true" : "false");
    } catch {
      // ignore
    }
  }, [minimized, minimizedHydrated]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!ready) {
    return (
      <main className="clay-container clay-section">
        <p>Memuat...</p>
      </main>
    );
  }

  // Halaman publik (login, register, activate, reset) tidak butuh
  // sidebar/topbar shell — render children polos supaya page bisa pakai
  // full-viewport layout sendiri (mis. form auth yang height: 100vh).
  if (pathname && PUBLIC_PORTAL_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="shell-grid">
      {sidebarOpen && (
        <div
          className="shell-aside-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`shell-aside ${sidebarOpen ? "open" : ""} ${minimized ? "minimized" : ""}`.trim()}>
        <div
          className="brand"
          style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: minimized ? "center" : "flex-start" }}
        >
          <Icon name="ShieldCheck" size="md" style={{ color: "var(--matcha-600)" }} />
          {!minimized && <span>InsureTrack Portal</span>}
        </div>
        <nav>
          {navItems.map((item) => {
            const active = pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "active" : ""}
                title={minimized ? item.label : undefined}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <Icon name={item.icon} size="sm" />
                {!minimized && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div>
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="hamburger"
              aria-label="Buka menu"
              onClick={() => setSidebarOpen((o) => !o)}
            >
              ☰
            </button>
            <button
              type="button"
              className="hamburger"
              aria-label={minimized ? "Expand sidebar" : "Minimize sidebar"}
              title={minimized ? "Expand sidebar" : "Minimize sidebar"}
              onClick={() => setMinimized((m) => !m)}
            >
              <Icon name={minimized ? "PanelLeftOpen" : "PanelLeftClose"} size="sm" />
            </button>
            <span className="brand-mobile">InsureTrack Portal</span>
          </div>
          <div className="admin-topbar-right">
            <CustomerUserMenu profile={profile} />
          </div>
        </header>
        <main className="shell-main">{children}</main>
      </div>
    </div>
  );
}
