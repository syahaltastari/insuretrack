"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@insuretrack/ui";
import { API_BASE, apiFetch } from "@insuretrack/api-client";

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
  /** Bukti pembayaran yang di-upload admin saat transisi APPROVED → PAID. */
  payment_proof_path: string | null;
  submitted_at: string;
};

type PoliciesResponse = { data?: Array<unknown>; total?: number };

export default function PortalClaimsPage() {
  const [data, setData] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cek apakah customer punya polis aktif. Kalau 0, tombol "Ajukan Klaim"
  // di-disable + tampilkan alert. Endpoint dipanggil terpisah dari /claims
  // karena butuh total count (bukan list) — pakai page_size=1 supaya ringan.
  const [activePolicyCount, setActivePolicyCount] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    // Cookie auth: apiFetch attach session otomatis. Dua fetch paralel
    // untuk claims + active policy count.
    apiFetch<{ data?: Claim[] }>("/customer/claims?page=1&page_size=50")
      .then((j) => setData(j.data ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    // Best-effort — failure tidak block UI utama.
    apiFetch<{ total?: number }>("/customer/policies?status=ACTIVE&page=1&page_size=1")
      .then((j) => setActivePolicyCount(j.total ?? 0))
      .catch(() => setActivePolicyCount(0));
  }, []);

  const noActivePolicy = activePolicyCount === 0;

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <p className="uppercase-label" style={{ color: "var(--lemon-700)", marginBottom: 8 }}>
            ✦ Klaim Saya
          </p>
          <h1 className="page-title">Klaim & Status</h1>
          <p className="page-subtitle">Lacak klaim Anda hingga keputusan final.</p>
        </div>
        {noActivePolicy ? (
          <button
            type="button"
            className="clay-button ghost mb-2"
            disabled
            title="Anda belum memiliki polis aktif"
            style={{ opacity: 0.5, cursor: "not-allowed" }}
          >
            + Ajukan Klaim
          </button>
        ) : (
          <Link href="/portal/claims/new" className="clay-button solid-ube mb-2">
            + Ajukan Klaim
          </Link>
        )}
      </div>

      {noActivePolicy && activePolicyCount !== null && (
        <div
          className="clay-card"
          style={{
            // Tone informasi (bukan bahaya) — kuning lemon soft + border
            // oat. User butuh reminder, bukan alarm merah.
            borderColor: "var(--lemon-700)",
            background: "var(--lemon-400)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <span style={{ fontSize: "1.25rem", lineHeight: 1 }}>💡</span>
          <div>
            <p className="body" style={{ margin: 0, fontWeight: 600, color: "var(--clay-black)" }}>
              Anda belum memiliki polis aktif untuk diklaim.
            </p>
            <p className="caption" style={{ color: "var(--warm-charcoal)", marginTop: 4, marginBottom: 0 }}>
              Selesaikan pendaftaran asuransi dan lakukan pembayaran terlebih dahulu di{" "}
              <Link href="/portal/insurance/new" style={{ color: "var(--clay-black)", textDecoration: "underline", fontWeight: 600 }}>
                halaman pendaftaran
              </Link>
              . Setelah polis Anda aktif, menu ini dapat digunakan untuk mengajukan klaim.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}
      {loading && <p>Memuat...</p>}
      {!loading && data.length === 0 && !noActivePolicy && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada klaim.
          </p>
        </div>
      )}
      {!loading && data.length > 0 && (
        <div className="clay-table-wrap" style={{ borderRadius: "var(--radius-card)" }}>
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
                <th className="hide-mobile">Bukti Pembayaran</th>
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
                  <td className="hide-mobile">
                    {c.status === "PAID" && c.payment_proof_path ? (
                      <a
                        href={`${API_BASE}/public/uploads/${c.payment_proof_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--matcha-800)",
                          fontWeight: 600,
                          textDecoration: "underline",
                          textUnderlineOffset: 3,
                        }}
                      >
                        Lihat bukti →
                      </a>
                    ) : (
                      <span style={{ color: "var(--warm-silver)" }}>—</span>
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
