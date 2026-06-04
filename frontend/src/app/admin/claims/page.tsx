"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { StatusBadge } from "@/components/StatusBadge";
import { API_BASE } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

type Claim = {
  id: string;
  claim_no: string;
  policy_no: string;
  customer_name: string;
  claim_type: string;
  incident_date: string;
  claimed_amount: string;
  status: string;
  decision_note: string | null;
  submitted_at: string;
};

const NEXT: Record<string, string> = {
  SUBMITTED: "UNDER_REVIEW",
  UNDER_REVIEW: "APPROVED",
  UNDER_REVIEW_REJECT: "REJECTED",
  APPROVED: "PAID",
};

export default function AdminClaimsPage() {
  const [data, setData] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const load = () => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/claims?page=1&page_size=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => setData(j.data ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const update = async (id: string, status: string) => {
    const token = getAdminToken();
    if (!token) return;
    setUpdating(id);
    try {
      const r = await fetch(`${API_BASE}/admin/claims/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, decision_note: decisionNote || null }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      setDecisionNote("");
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <AdminShell>
      <p className="uppercase-label" style={{ color: "var(--pomegranate-400)", marginBottom: 8 }}>
        ✦ Review Klaim
      </p>
      <h1 className="page-title">Klaim Customer</h1>
      <p className="page-subtitle">Tinjau klaim dan ubah status. Transisi yang valid sesuai state machine (spec §10.4).</p>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}
      {loading && <p>Memuat...</p>}

      {!loading && data.length === 0 && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada klaim masuk.
          </p>
        </div>
      )}

      {!loading && data.map((c) => (
        <div key={c.id} className="clay-card feature" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            <div>
              <p className="mono" style={{ fontSize: "0.85rem", color: "var(--warm-silver)", margin: 0 }}>{c.claim_no}</p>
              <h3 className="feature-title" style={{ marginTop: 4, marginBottom: 4 }}>
                {c.customer_name} · {c.claim_type}
              </h3>
              <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
                Polis <span className="mono">{c.policy_no}</span> · Insiden {c.incident_date} · Klaim{" "}
                {new Intl.NumberFormat("id-ID").format(Number(c.claimed_amount))}
              </p>
            </div>
            <StatusBadge status={c.status} />
          </div>

          <input
            type="text"
            placeholder="Catatan keputusan (opsional, akan di-email ke customer)"
            value={updating === c.id ? decisionNote : ""}
            onChange={(e) => setDecisionNote(e.target.value)}
            className="clay-input"
            style={{ marginBottom: 12 }}
            disabled={updating === c.id}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {c.status === "SUBMITTED" && (
              <button
                className="clay-button solid-ube size-small"
                onClick={() => update(c.id, "UNDER_REVIEW")}
                disabled={updating === c.id}
              >
                → Under Review
              </button>
            )}
            {c.status === "UNDER_REVIEW" && (
              <>
                <button
                  className="clay-button solid-matcha size-small"
                  onClick={() => update(c.id, "APPROVED")}
                  disabled={updating === c.id}
                >
                  ✓ Approve
                </button>
                <button
                  className="clay-button solid-pomegranate size-small"
                  onClick={() => update(c.id, "REJECTED")}
                  disabled={updating === c.id}
                >
                  ✗ Reject
                </button>
              </>
            )}
            {c.status === "APPROVED" && (
              <button
                className="clay-button solid-slushie size-small"
                onClick={() => update(c.id, "PAID")}
                disabled={updating === c.id}
              >
                Mark as Paid
              </button>
            )}
            {c.status === "REJECTED" || c.status === "PAID" ? (
              <span className="caption" style={{ color: "var(--warm-silver)" }}>Status final.</span>
            ) : null}
          </div>
        </div>
      ))}
    </AdminShell>
  );
}
