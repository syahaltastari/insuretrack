"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE, apiFetch } from "@insuretrack/api-client";
import { Reveal, StaggerGroup } from "@/components/Reveal";
import { PolicyCard, type PolicyCardItem } from "@/components/PolicyCard";

export default function PortalPoliciesPage() {
  const [data, setData] = useState<PolicyCardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data?: PolicyCardItem[] }>("/customer/policies?page=1&page_size=50")
      .then((j) => setData(j.data ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const downloadPdf = async (id: string) => {
    // Cookie auth + credentials:include — browser attach session otomatis.
    const r = await fetch(`${API_BASE}/customer/policies/${id}/pdf`, {
      credentials: "include",
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
      <Reveal>
        <p className="uppercase-label" style={{ color: "var(--honey-700)", marginBottom: 8 }}>
          ✦ Polis Saya
        </p>
        <h1 className="page-title">Daftar Polis</h1>
        <p className="page-subtitle">Lihat detail dan download e-policy PDF.</p>
      </Reveal>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}
      {loading && <p>Memuat...</p>}
      {!loading && data.length === 0 && (
        <Reveal delay={150}>
          <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
            <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
              Anda belum memiliki polis.
            </p>
          </div>
        </Reveal>
      )}
      {!loading && data.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            marginTop: 16,
          }}
        >
          <StaggerGroup>
            {data.map((p) => (
              <PolicyCard key={p.id} policy={p} onDownloadPdf={downloadPdf} />
            ))}
          </StaggerGroup>
        </div>
      )}
    </>
  );
}
