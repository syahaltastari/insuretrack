"use client";

import { useEffect, useState, FormEvent } from "react";
import { PortalShell } from "@/components/PortalShell";
import { StatusBadge } from "@/components/StatusBadge";
import { API_BASE } from "@/lib/api";
import { getCustomerToken } from "@/lib/auth";

type Inquiry = {
  id: string;
  inquiry_no: string;
  policy_no: string | null;
  subject: string;
  message: string;
  status: string;
  response: string | null;
  created_at: string;
  responded_at: string | null;
};

export default function PortalInquiriesPage() {
  const [data, setData] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    const token = getCustomerToken();
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/customer/inquiries?page=1&page_size=50`, {
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!subject.trim() || !message.trim()) {
      setError("Subject dan pesan wajib diisi.");
      return;
    }
    setSubmitting(true);
    try {
      const token = getCustomerToken();
      const r = await fetch(`${API_BASE}/customer/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject, message }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error?.message ?? "Gagal kirim inquiry");
      setSubject("");
      setMessage("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalShell>
      <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 8 }}>
        ✦ Pertanyaan
      </p>
      <h1 className="page-title">Hubungi Admin</h1>
      <p className="page-subtitle">Tanya jawab tentang polis Anda. Admin akan merespon via email.</p>

      <form
        onSubmit={onSubmit}
        className="clay-card feature"
        style={{ marginBottom: 32, maxWidth: 640 }}
      >
        <h2 className="feature-title" style={{ marginBottom: 16 }}>Buat Pertanyaan Baru</h2>
        {error && (
          <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5", marginBottom: 12 }}>
            ⚠ {error}
          </div>
        )}
        <input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="clay-input"
          style={{ marginBottom: 12 }}
        />
        <textarea
          placeholder="Pesan Anda..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="clay-textarea"
          style={{ marginBottom: 12 }}
        />
        <button
          type="submit"
          disabled={submitting}
          className="clay-button solid-ube"
        >
          {submitting ? "Mengirim..." : "Kirim →"}
        </button>
      </form>

      <h2 className="section-heading" style={{ fontSize: "1.5rem", marginBottom: 16 }}>Riwayat</h2>
      {loading && <p>Memuat...</p>}
      {!loading && data.length === 0 && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 32 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada pertanyaan.
          </p>
        </div>
      )}
      {!loading &&
        data.map((inq) => (
          <div
            key={inq.id}
            className="clay-card"
            style={{ marginBottom: 12 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <strong style={{ fontSize: "1.05rem" }}>{inq.subject}</strong>
              <StatusBadge status={inq.status} />
            </div>
            <p className="caption" style={{ color: "var(--warm-silver)", marginTop: 4 }}>
              <span className="mono">{inq.inquiry_no}</span> ·{" "}
              {new Date(inq.created_at).toLocaleString("id-ID")}
              {inq.policy_no && (
                <>
                  {" "}· Polis <span className="mono">{inq.policy_no}</span>
                </>
              )}
            </p>
            <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{inq.message}</p>
            {inq.response && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: "var(--warm-cream)",
                  borderLeft: "3px solid var(--matcha-600)",
                  borderRadius: 8,
                }}
              >
                <p
                  className="caption"
                  style={{ color: "var(--matcha-600)", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}
                >
                  Jawaban Admin
                </p>
                <p style={{ margin: "6px 0 0 0", whiteSpace: "pre-wrap" }}>{inq.response}</p>
              </div>
            )}
          </div>
        ))}
    </PortalShell>
  );
}
