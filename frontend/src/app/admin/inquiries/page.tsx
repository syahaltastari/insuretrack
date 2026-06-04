"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { StatusBadge } from "@/components/StatusBadge";
import { API_BASE } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

type Inquiry = {
  id: string;
  inquiry_no: string;
  customer_name: string;
  customer_email: string;
  policy_no: string | null;
  subject: string;
  message: string;
  status: string;
  response: string | null;
  created_at: string;
  responded_at: string | null;
};

export default function AdminInquiriesPage() {
  const [data, setData] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = () => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/inquiries?page=1&page_size=50`, {
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

  const respond = async (id: string, close: boolean) => {
    const token = getAdminToken();
    if (!token) return;
    const response = (reply[id] ?? "").trim();
    if (!response) {
      alert("Tulis jawaban terlebih dahulu.");
      return;
    }
    setSubmitting(id);
    try {
      const r = await fetch(`${API_BASE}/admin/inquiries/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ response, close }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      setReply((s) => ({ ...s, [id]: "" }));
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <AdminShell>
      <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 8 }}>
        ✦ Review Inquiry
      </p>
      <h1 className="page-title">Pertanyaan Customer</h1>
      <p className="page-subtitle">Balas pertanyaan customer. Transisi sesuai state machine (spec §10.5).</p>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}
      {loading && <p>Memuat...</p>}

      {!loading && data.length === 0 && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada pertanyaan masuk.
          </p>
        </div>
      )}

      {!loading && data.map((inq) => (
        <div key={inq.id} className="clay-card feature" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            <div>
              <p className="mono" style={{ fontSize: "0.85rem", color: "var(--warm-silver)", margin: 0 }}>{inq.inquiry_no}</p>
              <h3 className="feature-title" style={{ marginTop: 4, marginBottom: 4 }}>{inq.subject}</h3>
              <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
                Dari <strong>{inq.customer_name}</strong> ({inq.customer_email})
                {inq.policy_no && (
                  <>
                    {" "}· Polis <span className="mono">{inq.policy_no}</span>
                  </>
                )}
                {" "}· {new Date(inq.created_at).toLocaleString("id-ID")}
              </p>
            </div>
            <StatusBadge status={inq.status} />
          </div>

          <p style={{ whiteSpace: "pre-wrap", margin: "12px 0" }}>{inq.message}</p>

          {inq.response && (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                background: "var(--warm-cream)",
                borderLeft: "3px solid var(--matcha-600)",
                borderRadius: 8,
              }}
            >
              <p className="caption" style={{ color: "var(--matcha-600)", fontWeight: 600, margin: 0, textTransform: "uppercase" }}>
                Jawaban Anda
              </p>
              <p style={{ margin: "6px 0 0 0", whiteSpace: "pre-wrap" }}>{inq.response}</p>
            </div>
          )}

          {inq.status !== "CLOSED" && (
            <>
              <textarea
                placeholder="Tulis jawaban..."
                value={reply[inq.id] ?? ""}
                onChange={(e) => setReply((s) => ({ ...s, [inq.id]: e.target.value }))}
                className="clay-textarea"
                style={{ marginBottom: 12 }}
                disabled={submitting === inq.id}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="clay-button solid-ube size-small"
                  onClick={() => respond(inq.id, false)}
                  disabled={submitting === inq.id}
                >
                  Jawab (ANSWERED)
                </button>
                <button
                  className="clay-button ghost size-small"
                  onClick={() => respond(inq.id, true)}
                  disabled={submitting === inq.id}
                >
                  Jawab & Tutup (CLOSED)
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </AdminShell>
  );
}
