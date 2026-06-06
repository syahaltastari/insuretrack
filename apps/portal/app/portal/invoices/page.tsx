"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@insuretrack/ui";
import { API_BASE } from "@insuretrack/api-client";
import { getCustomerToken } from "@insuretrack/api-client";

type Invoice = {
  id: string;
  invoice_no: string;
  registration_no: string;
  premium_amount: string;
  due_date: string;
  status: string;
  paid_at: string | null;
  pdf_path: string | null;
  created_at: string;
};

const formatIDR = (s: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(s));

export default function PortalInvoicesPage() {
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/customer/invoices?page=1&page_size=50`, {
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
    const r = await fetch(`${API_BASE}/customer/invoices/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return toast.error("Gagal download PDF");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <p className="uppercase-label" style={{ color: "var(--matcha-600)", marginBottom: 8 }}>
        ✦ Invoice Saya
      </p>
      <h1 className="page-title">Daftar Invoice</h1>
      <p className="page-subtitle">
        Lihat tagihan premi, jatuh tempo, dan download invoice PDF.
      </p>

      {error && (
        <div
          className="clay-card"
          style={{
            borderColor: "var(--pomegranate-400)",
            background: "#fff5f5",
          }}
        >
          ⚠ {error}
        </div>
      )}
      {loading && <p>Memuat...</p>}
      {!loading && data.length === 0 && (
        <div
          className="clay-card feature dashed"
          style={{ textAlign: "center", padding: 48 }}
        >
          <p
            className="body"
            style={{ color: "var(--warm-charcoal)", margin: 0 }}
          >
            Anda belum memiliki invoice.
          </p>
        </div>
      )}
      {!loading && data.length > 0 && (
        <div
          style={{ overflow: "auto", borderRadius: "var(--radius-card)" }}
        >
          <table className="clay-table">
            <thead>
              <tr>
                <th>No. Invoice</th>
                <th>No. Reg</th>
                <th>Premi</th>
                <th>Jatuh Tempo</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.map((inv) => (
                <tr key={inv.id}>
                  <td className="mono">{inv.invoice_no}</td>
                  <td className="mono">{inv.registration_no}</td>
                  <td>{formatIDR(inv.premium_amount)}</td>
                  <td>{inv.due_date}</td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                  <td>
                    {inv.pdf_path ? (
                      <button
                        onClick={() => downloadPdf(inv.id)}
                        className="clay-button ghost size-small"
                      >
                        📄 PDF
                      </button>
                    ) : (
                      <span
                        className="caption"
                        style={{ color: "var(--warm-silver)" }}
                      >
                        —
                      </span>
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
