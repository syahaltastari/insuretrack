"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@insuretrack/ui";
import { apiFetch, logoutAdmin } from "@insuretrack/api-client";

export type AdminProfile = {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
  last_login_at: string | null;
  password_changed_at: string | null;
};

function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}

export function AdminUserMenu({ profile }: { profile: AdminProfile | null }) {
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

  const display = profile?.full_name?.trim() || profile?.username || "Admin";
  const role = profile?.role ?? "admin";

  const onLogout = async () => {
    try {
      // Backend POST /api/admin/logout → Set-Cookie Max-Age=0 untuk
      // session + csrf cookie. Browser auto-hapus. Backend logout sudah
      // idempotent (pakai OptionalAuth extractor) — call selalu return
      // 204 + clear cookies.
      await logoutAdmin();
    } catch {
      // Best-effort — tetap navigasi ke login. Pakai hard navigation
      // (window.location) bukan router.replace supaya admin middleware
      // re-evaluate session state dari awal. router.replace() bisa
      // stuck kalau Next.js client cache masih anggap user authed.
      window.location.href = "/admin/login";
      return;
    }
    router.replace("/admin/login");
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
          <span className="user-menu-role">{role}</span>
        </span>
        <Icon name="ChevronDown" size="sm" />
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu">
          <Link
            href="/admin/profile"
            className="user-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Icon name="User" size="sm" />
            <span>Profil Saya</span>
          </Link>
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
 * Fetch the logged-in admin's profile. Returns null if not authenticated
 * or the request fails (e.g. 401 with stale cookie).
 *
 * Cookie di-attach otomatis oleh browser — kita tidak bisa early-bail
 * dengan check localStorage lagi. Kalau tidak ada session, backend
 * return 401 dan kita return null (sama dengan stale token lama).
 */
export async function fetchAdminProfile(): Promise<AdminProfile | null> {
  try {
    return await apiFetch<AdminProfile>("/admin/me");
  } catch {
    return null;
  }
}
