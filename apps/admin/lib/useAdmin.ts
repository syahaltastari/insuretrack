"use client";

// Hook untuk akses current admin profile. Loading dilakukan sekali per
// mount — caller tidak perlu panggil `fetchAdminProfile` lagi.
//
// `isSuperAdmin` adalah gate utama untuk menu Manajemen User di
// AdminShell.tsx dan untuk client-side guards di halaman user management.

import { useEffect, useState } from "react";
import {
  fetchAdminProfile,
  type AdminProfile,
} from "@/components/AdminUserMenu";

export interface UseAdminResult {
  profile: AdminProfile | null;
  isSuperAdmin: boolean;
  /** True setelah fetch pertama selesai (baik sukses maupun null).
   *  Pakai ini untuk hindari flash "belum login" sebelum fetch balik. */
  ready: boolean;
}

export function useAdmin(): UseAdminResult {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminProfile().then((p) => {
      if (cancelled) return;
      setProfile(p);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    profile,
    isSuperAdmin: profile?.is_super_admin ?? false,
    ready,
  };
}
