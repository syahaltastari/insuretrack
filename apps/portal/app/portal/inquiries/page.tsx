"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { StatusBadge } from "@insuretrack/ui";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { API_BASE } from "@insuretrack/api-client";
import { getCustomerToken } from "@insuretrack/api-client";

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

const inquirySchema = z.object({
  subject: z
    .string()
    .trim()
    .min(5, "Subject minimal 5 karakter")
    .max(200, "Subject maksimal 200 karakter"),
  message: z
    .string()
    .trim()
    .min(10, "Pesan minimal 10 karakter")
    .max(5000, "Pesan maksimal 5000 karakter"),
});
type InquiryFormValues = z.infer<typeof inquirySchema>;

export default function PortalInquiriesPage() {
  const [data, setData] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const methods = useForm<InquiryFormValues>({
    resolver: zodResolver(inquirySchema) as never,
    defaultValues: { subject: "", message: "" },
    mode: "onSubmit",
  });

  const load = () => {
    const token = getCustomerToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/customer/inquiries?page=1&page_size=50`, {
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

  const onSubmit = async (values: InquiryFormValues) => {
    const token = getCustomerToken();
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/customer/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: values.subject.trim(), message: values.message.trim() }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.error?.message ?? "Gagal kirim inquiry");
      methods.reset({ subject: "", message: "" });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      methods.setError("root", { message: err instanceof Error ? err.message : "Gagal" });
    } finally {
      setSubmitting(false);
    }
  };

  const rootErr = methods.formState.errors.root?.message;

  return (
    <>
      <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 8 }}>
        ✦ Pertanyaan
      </p>
      <h1 className="page-title">Hubungi Admin</h1>
      <p className="page-subtitle">Tanya jawab tentang polis Anda. Admin akan merespon via email.</p>

      <Form
        methods={methods}
        onSubmit={onSubmit}
        className="clay-card feature"
        // Styling handled inline below
      >
        <h2 className="feature-title" style={{ marginBottom: 16 }}>
          Buat Pertanyaan Baru
        </h2>
        <FormError message={rootErr ?? null} />

        <FormField label="Subject" name="subject" required>
          <input
            id="subject"
            className="clay-input"
            autoComplete="off"
            {...methods.register("subject")}
          />
        </FormField>

        <FormField label="Pesan" name="message" required>
          <textarea
            id="message"
            className="clay-textarea"
            rows={4}
            {...methods.register("message")}
          />
        </FormField>

        <button
          type="submit"
          disabled={submitting}
          className="clay-button solid-ube"
          style={{ marginTop: 8 }}
        >
          {submitting ? "Mengirim..." : "Kirim →"}
        </button>
      </Form>

      <h2 className="section-heading" style={{ fontSize: "1.5rem", marginBottom: 16, marginTop: 32 }}>
        Riwayat
      </h2>
      {loading && <p>Memuat...</p>}
      {error && (
        <div
          className="clay-card"
          style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}
        >
          ⚠ {error}
        </div>
      )}
      {!loading && data.length === 0 && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 32 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada pertanyaan.
          </p>
        </div>
      )}
      {!loading &&
        data.map((inq) => (
          <div key={inq.id} className="clay-card" style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
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
                  style={{
                    color: "var(--matcha-600)",
                    fontWeight: 600,
                    margin: 0,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Jawaban Admin
                </p>
                <p style={{ margin: "6px 0 0 0", whiteSpace: "pre-wrap" }}>{inq.response}</p>
              </div>
            )}
          </div>
        ))}
    </>
  );
}
