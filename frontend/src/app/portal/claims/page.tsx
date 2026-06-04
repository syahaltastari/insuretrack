"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PortalShell } from "@/components/PortalShell";
import { StatusBadge } from "@/components/StatusBadge";
import { API_BASE } from "@/lib/api";
import { getCustomerToken } from "@/lib/auth";

type Claim = {
  id: string;
  claim_no: string;
  policy_no: string;
  claim_type: string;
  incident_date: string;
  claimed_amount: string;
  description: string;
  status: string;
  decision_note: string | null;
  submitted_at: string;
};

export default function PortalClaimsPage() {
  const [data, setData] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/customer/claims?page=1&page_size=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => setData(j.data ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalShell>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <p className="uppercase-label" style={{ color: "var(--pomegranate-400)", marginBottom: 8 }}>
            ✦ Klaim Saya
          </p>
          <h1 className="page-title">Klaim & Status</h1>
          <p className="page-subtitle">Lacak klaim Anda hingga keputusan final.</p>
        </div>
        <Link href="/portal/claims/new" className="clay-button solid-pomegranate">
          + Ajukan Klaim
        </Link>
      </div>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}
      {loading && <p>Memuat...</p>}
      {!loading && data.length === 0 && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada klaim.
          </p>
        </div>
      )}
      {!loading && data.length > 0 && (
        <div style={{ overflow: "auto", borderRadius: "var(--radius-card)" }}>
          <table className="clay-table">
            <thead>
              <tr>
                <th>No. Klaim</th>
                <th>Polis</th>
                <th>Tipe</th>
                <th>Tgl Insiden</th>
                <th>Jumlah</th>
                <th>Status</th>
                <th>Catatan Admin</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.claim_no}</td>
                  <td className="mono">{c.policy_no}</td>
                  <td>{c.claim_type}</td>
                  <td>{c.incident_date}</td>
                  <td>{new Intl.NumberFormat("id-ID").format(Number(c.claimed_amount))}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td style={{ color: c.decision_note ? "var(--clay-black)" : "var(--warm-silver)" }}>
                    {c.decision_note ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalShell>
  );
}
