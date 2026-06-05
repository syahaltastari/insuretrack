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

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
    fetchAdminProfile().then(setProfile);
  }, [router]);

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

  return (
    <div className="shell-grid">
      {sidebarOpen && (
        <div
          className="shell-aside-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`shell-aside ${sidebarOpen ? "open" : ""}`}>
        <div
          className="brand"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <Icon name="ShieldCheck" size="md" style={{ color: "var(--ube-800)" }} />
          <span>InsureTrack Admin</span>
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
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <Icon name={item.icon} size="sm" />
                <span>{item.label}</span>
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
