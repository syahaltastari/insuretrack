"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { clearAdminToken, getAdminToken } from "@/lib/auth";

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

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
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
      <aside className="shell-aside">
        <div className="brand" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="ShieldCheck" size="md" style={{ color: "var(--ube-800)" }} />
          <span>InsureTrack Admin</span>
        </div>
        <nav>
          {navItems.map((item) => {
            const active = pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
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
        <button
          onClick={() => {
            clearAdminToken();
            router.replace("/admin/login");
          }}
          className="clay-button ghost size-small"
          style={{ marginTop: 32, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <Icon name="LogOut" size="sm" />
          <span>Logout</span>
        </button>
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}
