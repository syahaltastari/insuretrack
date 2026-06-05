"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { PortalShell } from "@/components/PortalShell";
import { StatusBadge } from "@/components/StatusBadge";
import { API_BASE } from "@/lib/api";
import { getCustomerToken } from "@/lib/auth";

type Policy = {
  id: string;
  policy_no: string;
  product: string;
  sum_assured: string;
  premium: string;
  effective_date: string;
  expiry_date: string;
  status: string;
  pdf_path: string | null;
};

export default function PortalPoliciesPage() {
  const [data, setData] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/customer/policies?page=1&page_size=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => setData(j.data ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const downloadPdf = async (id: string) => {
    const token = getCustomerToken();
    if (!token) return;
    const r = await fetch(`${API_BASE}/customer/policies/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return alert("Gagal download");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `policy-${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PortalShell>
      <p className="uppercase-label" style={{ color: "var(--matcha-600)", marginBottom: 8 }}>
        ✦ Polis Saya
      </p>
      <h1 className="page-title">Daftar Polis</h1>
      <p className="page-subtitle">Lihat detail dan download e-policy PDF.</p>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}
      {loading && <p>Memuat...</p>}
      {!loading && data.length === 0 && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Anda belum memiliki polis.
          </p>
        </div>
      )}
      {!loading && data.length > 0 && (
        <div style={{ overflow: "auto", borderRadius: "var(--radius-card)" }}>
          <table className="clay-table">
            <thead>
              <tr>
                <th>No. Polis</th>
                <th>Produk</th>
                <th>UP</th>
                <th>Premi</th>
                <th>Efektif</th>
                <th>Berakhir</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.policy_no}</td>
                  <td>{p.product}</td>
                  <td>{new Intl.NumberFormat("id-ID").format(Number(p.sum_assured))}</td>
                  <td>{new Intl.NumberFormat("id-ID").format(Number(p.premium))}</td>
                  <td>{p.effective_date}</td>
                  <td>{p.expiry_date}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    {p.pdf_path && (
                      <button onClick={() => downloadPdf(p.id)} className="clay-button ghost size-small">
                        📄 PDF
                      </button>
                    )}
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
