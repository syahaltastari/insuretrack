"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PortalShell } from "@/components/PortalShell";
import { API_BASE } from "@insuretrack/api-client";
import { getCustomerToken } from "@insuretrack/api-client";

type Me = {
  customer_id: string;
  email: string;
  full_name: string;
  active_policy_count: number;
  total_sum_assured: string;
  open_claim_count: number;
  open_inquiry_count: number;
};

const formatIDR = (n: string | number) => {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);
};

export default function PortalDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/customer/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setMe(await r.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal load");
      }
    })();
  }, []);

  return (
    <PortalShell>
      <p className="uppercase-label" style={{ color: "var(--matcha-600)", marginBottom: 8 }}>
        ✦ Selamat Datang
      </p>
      <h1 className="page-title">{me?.full_name ?? "..."}</h1>
      <p className="page-subtitle">Ringkasan polis, klaim, dan pertanyaan Anda.</p>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}
      {!me && !error && <p>Memuat...</p>}

      {me && (
        <>
          <div className="clay-grid cols-2" style={{ marginTop: 24, marginBottom: 32 }}>
            <Card label="Polis Aktif" value={me.active_policy_count} color="var(--matcha-600)" />
            <Card
              label="Total UP Aktif"
              value={formatIDR(me.total_sum_assured)}
              color="var(--matcha-600)"
            />
            <Card label="Klaim Terbuka" value={me.open_claim_count} color="var(--lemon-700)" />
            <Card label="Pertanyaan Terbuka" value={me.open_inquiry_count} color="var(--ube-800)" />
          </div>

          <h2 className="section-heading" style={{ fontSize: "1.5rem", marginBottom: 16 }}>
            Aksi Cepat
          </h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/portal/policies" className="clay-button solid-ube">
              Lihat Polis →
            </Link>
            <Link href="/portal/claims/new" className="clay-button solid-slushie">
              Ajukan Klaim →
            </Link>
            <Link href="/portal/inquiries" className="clay-button ghost">
              Buat Pertanyaan
            </Link>
          </div>
        </>
      )}
    </PortalShell>
  );
}

function Card({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="clay-card feature" style={{ borderLeft: `6px solid ${color}`, padding: 24 }}>
      <p className="caption" style={{ color: "var(--warm-charcoal)", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "1.75rem", fontWeight: 600, color }}>
        {value}
      </p>
    </div>
  );
}
