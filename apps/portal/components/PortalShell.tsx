"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@insuretrack/ui";
import { clearCustomerToken, getCustomerToken } from "@insuretrack/api-client";

const navItems: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/portal/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/portal/policies", label: "Polis Saya", icon: "FileText" },
  { href: "/portal/claims", label: "Klaim", icon: "ShieldAlert" },
  { href: "/portal/inquiries", label: "Pertanyaan", icon: "MessageCircle" },
];

const SIDEBAR_MINIMIZED_KEY = "portal_sidebar_minimized";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [minimizedHydrated, setMinimizedHydrated] = useState(false);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) {
      router.replace("/portal/login");
      return;
    }
    setReady(true);
  }, [router]);

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
        <button
          onClick={() => {
            clearCustomerToken();
            router.replace("/portal/login");
          }}
          className="clay-button ghost size-small"
          title={minimized ? "Logout" : undefined}
          style={{ marginTop: 32, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <Icon name="LogOut" size="sm" />
          {!minimized && <span>Logout</span>}
        </button>
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
        </header>
        <main className="shell-main">{children}</main>
      </div>
    </div>
  );
}
