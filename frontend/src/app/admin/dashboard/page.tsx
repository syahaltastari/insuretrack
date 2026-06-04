"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { API_BASE, ApiError } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

type Stats = {
  total_registrations: number;
  total_invoices: number;
  total_paid_invoices: number;
  total_unpaid_invoices: number;
  total_policies: number;
  total_premium_collected: string;
};

const formatIDR = (n: string | number) => {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);
};

const SWATCHES: Array<{ key: keyof typeof METRIC_LABEL; color: string }> = [
  { key: "total_registrations", color: "var(--ube-800)" },
  { key: "total_invoices", color: "var(--blueberry-800)" },
  { key: "total_paid_invoices", color: "var(--matcha-600)" },
  { key: "total_unpaid_invoices", color: "var(--lemon-700)" },
  { key: "total_policies", color: "var(--matcha-600)" },
  { key: "total_premium_collected", color: "var(--pomegranate-400)" },
];

const METRIC_LABEL = {
  total_registrations: "Total Registrasi",
  total_invoices: "Total Invoice",
  total_paid_invoices: "Invoice Paid",
  total_unpaid_invoices: "Invoice Unpaid",
  total_policies: "Total Polis",
  total_premium_collected: "Premi Terkumpul",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/admin/dashboard/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new ApiError(r.status, "ERR", "Gagal load stats");
        setStats(await r.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal load");
      }
    })();
  }, []);

  return (
    <AdminShell>
      <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 8 }}>
        ✦ Ringkasan Operasional
      </p>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Metrik agregat dari data store, real-time.</p>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}
      {!stats && !error && <p>Memuat...</p>}

      {stats && (
        <div className="clay-grid cols-3" style={{ marginTop: 24 }}>
          {SWATCHES.map(({ key, color }) => {
            const raw = (stats as Record<string, unknown>)[key];
            const value = key === "total_premium_collected" ? formatIDR(raw as string) : (raw as number);
            return (
              <div
                key={key}
                className="clay-card feature"
                style={{ borderLeft: `6px solid ${color}`, padding: 24 }}
              >
                <p className="caption" style={{ color: "var(--warm-charcoal)", marginBottom: 4 }}>
                  {METRIC_LABEL[key]}
                </p>
                <p style={{ margin: 0, fontSize: "2rem", fontWeight: 600, color }}>
                  {value}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
