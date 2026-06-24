"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@insuretrack/ui";
import { apiFetch, logoutCustomer } from "@insuretrack/api-client";

export type CustomerProfile = {
  customer_id: string;
  email: string;
  full_name: string;
  mobile_number: string;
};

function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}

export function CustomerUserMenu({ profile }: { profile: CustomerProfile | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const display = profile?.full_name?.trim() || profile?.email || "Customer";
  const subline = profile?.email ?? "";

  const onLogout = async () => {
    try {
      // Backend POST /api/customer/logout → Set-Cookie Max-Age=0 untuk
      // session + csrf cookie. Browser auto-hapus.
      await logoutCustomer();
    } catch {
      // Logout endpoint failure shouldn't block UX — tetap redirect.
    }
    router.replace("/portal/login");
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className={`user-menu-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="user-avatar" aria-hidden="true">
          {initials(display)}
        </span>
        <span className="user-menu-meta">
          <span className="user-menu-name">{display}</span>
          <span className="user-menu-role">{subline}</span>
        </span>
        <Icon name="ChevronDown" size="sm" />
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu">
          <Link
            href="/portal/profile"
            className="user-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Icon name="User" size="sm" />
            <span>Profil Saya</span>
          </Link>
          <div className="user-menu-divider" />
          <button
            type="button"
            className="user-menu-item danger"
            role="menuitem"
            onClick={onLogout}
          >
            <Icon name="LogOut" size="sm" />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Fetch the logged-in customer's profile. Returns null if not authenticated
 * or the request fails (e.g. 401 with stale cookie).
 *
 * Cookie di-attach otomatis oleh browser — tidak bisa early-bail dengan
 * localStorage. Backend return 401 kalau session tidak valid → kita
 * return null.
 */
export async function fetchCustomerProfile(): Promise<CustomerProfile | null> {
  try {
    const json = await apiFetch<{
      customer_id: string;
      email: string;
      full_name: string;
      mobile_number: string;
      active_policy_count: number;
      total_sum_assured: string;
      open_claim_count: number;
      open_inquiry_count: number;
    }>("/customer/me");
    return {
      customer_id: json.customer_id,
      email: json.email,
      full_name: json.full_name,
      mobile_number: json.mobile_number,
    };
  } catch {
    return null;
  }
}
