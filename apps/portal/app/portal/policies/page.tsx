"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@insuretrack/ui";
import { API_BASE } from "@insuretrack/api-client";
import { getCustomerToken } from "@insuretrack/api-client";

type Participant = {
  id: string;
  nik: string;
  full_name: string;
  birth_date: string;
};

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
  /** Untuk policy Instansi: info peserta. NULL untuk Individu. */
  participant: Participant | null;
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
    if (!r.ok) return toast.error("Gagal download PDF");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `policy-${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
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
                <th>Peserta</th>
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
                  <td>
                    {p.participant ? (
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.participant.full_name}</div>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--warm-silver)",
                            fontFamily: "var(--font-space-mono), monospace",
                          }}
                        >
                          {p.participant.nik}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--warm-silver)", fontSize: "0.85rem" }}>
                        (diri sendiri)
                      </span>
                    )}
                  </td>
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
    </>
  );
}
