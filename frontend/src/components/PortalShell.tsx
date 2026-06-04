"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { clearCustomerToken, getCustomerToken } from "@/lib/auth";

const navItems: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/portal/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/portal/policies", label: "Polis Saya", icon: "FileText" },
  { href: "/portal/claims", label: "Klaim", icon: "ShieldAlert" },
  { href: "/portal/inquiries", label: "Pertanyaan", icon: "MessageCircle" },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) {
      router.replace("/portal/login");
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
          <Icon name="ShieldCheck" size="md" style={{ color: "var(--matcha-600)" }} />
          <span>InsureTrack Portal</span>
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
            clearCustomerToken();
            router.replace("/portal/login");
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
