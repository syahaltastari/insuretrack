"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@insuretrack/ui";
import { AdminUserMenu, fetchAdminProfile, type AdminProfile } from "@/components/AdminUserMenu";
import { clearAdminToken, getAdminToken } from "@insuretrack/api-client";

const navItems: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/admin/registrations", label: "Registrasi", icon: "ClipboardList" },
  { href: "/admin/invoices", label: "Invoice", icon: "Receipt" },
  { href: "/admin/policies", label: "Polis", icon: "FileText" },
  { href: "/admin/claims", label: "Klaim", icon: "Siren" },
  { href: "/admin/inquiries", label: "Inquiry", icon: "MessageCircle" },
  { href: "/admin/clients", label: "Klien", icon: "Building2" },
  { href: "/admin/testimonials", label: "Testimoni", icon: "Quote" },
  { href: "/admin/email-logs", label: "Email Log", icon: "Mail" },
  { href: "/admin/audit-logs", label: "Audit Trail", icon: "ScrollText" },
];

const SIDEBAR_MINIMIZED_KEY = "admin_sidebar_minimized";

// Path di /admin/* yang TIDAK butuh auth (cuma login). Shell yang sama
// membungkus semuanya, jadi auth guard di bawah harus skip cek token
// untuk path ini — kalau tidak, admin yang belum login terjebak di
// "Memuat..." karena `router.replace("/admin/login")` jadi no-op
// (sudah di /admin/login) dan `setReady(true)` tidak dipanggil.
const PUBLIC_ADMIN_PATHS = new Set<string>([
  "/admin/login",
]);

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [minimizedHydrated, setMinimizedHydrated] = useState(false);

  useEffect(() => {
    // Halaman publik (login) tidak butuh token. setReady(true) langsung
    // supaya shell render — kalau tidak, admin yang belum login stuck
    // di loading state selamanya.
    if (pathname && PUBLIC_ADMIN_PATHS.has(pathname)) {
      setReady(true);
      return;
    }
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
    fetchAdminProfile().then(setProfile);
  }, [router, pathname]);

  // Load minimized state from localStorage on mount (SSR-safe).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_MINIMIZED_KEY);
      if (stored === "true") setMinimized(true);
    } catch {
      // localStorage unavailable (private mode, etc.) — ignore
    }
    setMinimizedHydrated(true);
  }, []);

  // Persist minimized state to localStorage.
  useEffect(() => {
    if (!minimizedHydrated) return;
    try {
      window.localStorage.setItem(SIDEBAR_MINIMIZED_KEY, minimized ? "true" : "false");
    } catch {
      // ignore
    }
  }, [minimized, minimizedHydrated]);

  // Close mobile sidebar on route change.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // If token is cleared (e.g. another tab logged out), kick back to login.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "insuretrack_admin_token" && !e.newValue) {
        clearAdminToken();
        router.replace("/admin/login");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [router]);

  if (!ready) {
    return (
      <main className="clay-container clay-section">
        <p>Memuat...</p>
      </main>
    );
  }

  // Halaman publik (login) tidak butuh sidebar/topbar shell — render
  // children polos supaya page bisa pakai full-viewport layout sendiri.
  if (pathname && PUBLIC_ADMIN_PATHS.has(pathname)) {
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
          <Icon name="ShieldCheck" size="md" style={{ color: "var(--ube-800)" }} />
          {!minimized && <span>InsureTrack Admin</span>}
        </div>
        <nav>
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (pathname?.startsWith(item.href + "/") ?? false);
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
      <div className="shell-content">
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
            <span className="brand-mobile">InsureTrack</span>
          </div>
          <div className="admin-topbar-right">
            <AdminUserMenu profile={profile} />
          </div>
        </header>
        <main className="shell-main">{children}</main>
      </div>
    </div>
  );
}
