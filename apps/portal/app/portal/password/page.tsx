"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

// Halaman ganti password sudah di-merge ke /portal/profile (lihat
// app/portal/profile/page.tsx). Redirect supaya link lama / bookmark
// tidak 404, dan user yang datang dari notifikasi email lama tetap
// menemukan form-nya (di-scroll ke section Ganti Password).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PortalPasswordRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/portal/profile#ganti-password");
  }, [router]);
  return <p>Mengalihkan ke Profil Saya...</p>;
}
