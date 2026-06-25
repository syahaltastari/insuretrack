"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Send, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@insuretrack/api-client";
import { Reveal } from "@/components/Reveal";
import { SkeletonCard, StatusBadge } from "@insuretrack/ui";

type SenderType = "CUSTOMER" | "ADMIN";

type Message = {
  id: string;
  sender_type: SenderType;
  sender_id: string | null;
  sender_name: string;
  message: string;
  created_at: string;
};

type InquiryDetail = {
  id: string;
  inquiry_no: string;
  customer_name: string;
  customer_email: string;
  policy_no: string | null;
  subject: string;
  message: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  response: string | null;
  created_at: string;
  responded_at: string | null;
  last_message_at: string | null;
  last_sender_type: SenderType | null;
  closed_at: string | null;
  last_message_preview: string | null;
  messages: Message[];
};

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function AdminInquiryDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<InquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);

  // Close state
  const [closeSubmitting, setCloseSubmitting] = useState(false);

  const fetchInquiry = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<InquiryDetail>(`/admin/inquiries/${id}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat inquiry");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sendReply = async () => {
    const trimmed = replyText.trim();
    if (trimmed.length < 5) {
      setError("Balasan minimal 5 karakter");
      return;
    }
    setReplySubmitting(true);
    setError(null);
    try {
      await apiFetch(`/admin/inquiries/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: trimmed }),
      });
      setReplyText("");
      toast.success("Balasan terkirim");
      await fetchInquiry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal kirim balasan");
    } finally {
      setReplySubmitting(false);
    }
  };

  const closeTicket = async () => {
    setCloseSubmitting(true);
    setError(null);
    try {
      const note = replyText.trim();
      await apiFetch(`/admin/inquiries/${id}/close`, {
        method: "POST",
        body: JSON.stringify(note ? { note } : {}),
      });
      setReplyText("");
      toast.success("Inquiry ditutup");
      await fetchInquiry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menutup inquiry");
    } finally {
      setCloseSubmitting(false);
    }
  };

  return (
    <>
      <Reveal>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <Link href="/admin/inquiries" className="clay-button ghost size-small">
            <ArrowLeft size={14} /> Kembali ke daftar
          </Link>
        </div>
      </Reveal>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}

      {loading && <SkeletonCard rows={6} style={{ minHeight: 320 }} />}

      {data && (
        <>
          <Reveal delay={80}>
            <div className="clay-card feature" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <p className="caption" style={{ color: "var(--warm-silver)", margin: 0, fontFamily: "var(--font-space-mono), monospace" }}>
                    {data.inquiry_no}
                  </p>
                  <h1 className="card-heading" style={{ marginTop: 4 }}>
                    {data.subject}
                  </h1>
                  <p className="caption" style={{ color: "var(--warm-charcoal)", marginTop: 4 }}>
                    Dari {data.customer_name} · {formatDateTime(data.created_at)}
                    {data.policy_no && (
                      <>
                        {" "}· Polis <span className="mono">{data.policy_no}</span>
                      </>
                    )}
                  </p>
                </div>
                <StatusBadge status={data.status} />
              </div>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="clay-card feature" style={{ marginBottom: 16 }}>
              <h2 className="section-heading" style={{ fontSize: "1.15rem", marginBottom: 16 }}>
                Thread Percakapan
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {data.messages.map((m) => {
                  const isCustomer = m.sender_type === "CUSTOMER";
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: isCustomer ? "flex-start" : "flex-end",
                        maxWidth: "85%",
                        padding: "10px 14px",
                        borderRadius: 12,
                        background: isCustomer ? "var(--honey-tint)" : "var(--honey-100)",
                        borderLeft: isCustomer
                          ? "3px solid var(--honey-400)"
                          : "3px solid var(--honey-700)",
                      }}
                    >
                      <p
                        className="caption"
                        style={{
                          margin: 0,
                          color: "var(--ink)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {isCustomer ? m.sender_name : `Admin · ${m.sender_name}`} ·{" "}
                        {formatDateTime(m.created_at)}
                      </p>
                      <p
                        style={{
                          margin: "6px 0 0 0",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {m.message}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </Reveal>

          {data.status === "CLOSED" ? (
            <Reveal delay={240}>
              <div className="clay-card dashed" style={{ padding: 16, marginBottom: 16 }}>
                <p style={{ margin: 0, color: "var(--ink)" }}>
                  🔒 Inquiry ditutup
                  {data.closed_at && ` pada ${formatDateTime(data.closed_at)}`}.
                  Inquiry tidak bisa dibalas lagi.
                </p>
              </div>
            </Reveal>
          ) : (
            <Reveal delay={240}>
              <div className="clay-card feature">
                <h2 className="section-heading" style={{ fontSize: "1.15rem", marginBottom: 16 }}>
                  Balas / Tutup
                </h2>
                <textarea
                  className="clay-textarea"
                  rows={4}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Tulis balasan untuk customer…"
                  disabled={replySubmitting || closeSubmitting}
                  style={{ marginBottom: 12 }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="clay-button solid-honey"
                    onClick={sendReply}
                    disabled={replySubmitting || closeSubmitting || replyText.trim().length < 5}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <Send size={14} />
                    {replySubmitting ? "Mengirim..." : "Kirim Balasan"}
                  </button>
                  <button
                    type="button"
                    className="clay-button ghost"
                    onClick={closeTicket}
                    disabled={replySubmitting || closeSubmitting}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    title="Tutup inquiry — tidak bisa menambah balasan lagi"
                  >
                    <X size={14} />
                    {closeSubmitting ? "Menutup..." : "Tutup Inquiry"}
                  </button>
                </div>
              </div>
            </Reveal>
          )}
        </>
      )}
    </>
  );
}