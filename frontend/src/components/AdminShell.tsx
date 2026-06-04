"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAdminToken, getAdminToken } from "@/lib/auth";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/registrations", label: "Registrasi" },
  { href: "/admin/invoices", label: "Invoice" },
  { href: "/admin/policies", label: "Polis" },
  { href: "/admin/claims", label: "Klaim" },
  { href: "/admin/inquiries", label: "Inquiry" },
  { href: "/admin/email-logs", label: "Email Log" },
  { href: "/admin/audit-logs", label: "Audit Trail" },
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
        <div className="brand">InsureTrack Admin</div>
        <nav>
          {navItems.map((item) => {
            const active = pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                {item.label}
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
          style={{ marginTop: 32, width: "100%" }}
        >
          Logout
        </button>
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}
