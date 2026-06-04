"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearCustomerToken, getCustomerToken } from "@/lib/auth";

const navItems = [
  { href: "/portal/dashboard", label: "Dashboard" },
  { href: "/portal/policies", label: "Polis Saya" },
  { href: "/portal/claims", label: "Klaim" },
  { href: "/portal/inquiries", label: "Pertanyaan" },
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
        <div className="brand">InsureTrack Portal</div>
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
            clearCustomerToken();
            router.replace("/portal/login");
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
