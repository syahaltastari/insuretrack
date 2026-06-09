"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SkeletonCard, StatusBadge } from "@insuretrack/ui";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { API_BASE } from "@insuretrack/api-client";
import { getAdminToken } from "@insuretrack/api-client";

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

const replySchema = z.object({
  response: z
    .string()
    .trim()
    .min(5, "Jawaban minimal 5 karakter")
    .max(5000, "Maksimal 5000 karakter"),
});
type ReplyValues = z.infer<typeof replySchema>;

function InquiryCard({ inquiry, onUpdated }: { inquiry: Inquiry; onUpdated: () => void }) {
  const [submitting, setSubmitting] = useState<"answer" | "close" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const methods = useForm<ReplyValues>({
    resolver: zodResolver(replySchema) as never,
    defaultValues: { response: "" },
    mode: "onSubmit",
  });

  const respond = async (values: ReplyValues, close: boolean) => {
    const token = getAdminToken();
    if (!token) return;
    setSubmitting(close ? "close" : "answer");
    setFormError(null);
    try {
      const r = await fetch(`${API_BASE}/admin/inquiries/${inquiry.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ response: values.response.trim(), close }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      methods.reset({ response: "" });
      onUpdated();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setSubmitting(null);
    }
  };

  const onAnswer = methods.handleSubmit((v) => respond(v, false));
  const onClose = methods.handleSubmit((v) => respond(v, true));

  return (
    <Form
      methods={methods}
      onSubmit={(v) => respond(v, false)}
      className="clay-card feature"
      style={{ marginBottom: 16 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <p
            className="mono"
            style={{ fontSize: "0.85rem", color: "var(--warm-silver)", margin: 0 }}
          >
            {inquiry.inquiry_no}
          </p>
          <h3 className="feature-title" style={{ marginTop: 4, marginBottom: 4 }}>
            {inquiry.subject}
          </h3>
          <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Dari <strong>{inquiry.customer_name}</strong> ({inquiry.customer_email})
            {inquiry.policy_no && (
              <>
                {" "}· Polis <span className="mono">{inquiry.policy_no}</span>
              </>
            )}
            {" "}· {new Date(inquiry.created_at).toLocaleString("id-ID")}
          </p>
        </div>
        <StatusBadge status={inquiry.status} />
      </div>

      <p style={{ whiteSpace: "pre-wrap", margin: "12px 0" }}>{inquiry.message}</p>

      {inquiry.response && (
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
          <p
            className="caption"
            style={{
              color: "var(--matcha-600)",
              fontWeight: 600,
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Jawaban Anda
          </p>
          <p style={{ margin: "6px 0 0 0", whiteSpace: "pre-wrap" }}>{inquiry.response}</p>
        </div>
      )}

      {inquiry.status !== "CLOSED" && (
        <>
          <FormField label="Jawaban" name="response" required>
            <textarea
              className="clay-textarea"
              rows={3}
              disabled={submitting !== null}
              {...methods.register("response")}
            />
          </FormField>
          <FormError message={formError} />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="clay-button solid-ube size-small"
              onClick={onAnswer}
              disabled={submitting !== null}
            >
              {submitting === "answer" ? "Mengirim..." : "Jawab (ANSWERED)"}
            </button>
            <button
              type="button"
              className="clay-button ghost size-small"
              onClick={onClose}
              disabled={submitting !== null}
            >
              {submitting === "close" ? "Mengirim..." : "Jawab & Tutup (CLOSED)"}
            </button>
          </div>
        </>
      )}
    </Form>
  );
}

export default function AdminInquiriesPage() {
  const [data, setData] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = () => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/admin/inquiries?page=1&page_size=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => setData(j.data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <>
      <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 8 }}>
        ✦ Review Inquiry
      </p>
      <h1 className="page-title">Pertanyaan Customer</h1>
      <p className="page-subtitle">
        Balas pertanyaan customer. Transisi sesuai state machine (spec §10.5).
      </p>

      {error && (
        <div
          className="clay-card"
          style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}
        >
          ⚠ {error}
        </div>
      )}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
        </div>
      )}

      {!loading && data.length === 0 && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada pertanyaan masuk.
          </p>
        </div>
      )}

      {!loading &&
        data.map((inq) => (
          <InquiryCard key={inq.id} inquiry={inq} onUpdated={() => setRefreshKey((k) => k + 1)} />
        ))}
    </>
  );
}
