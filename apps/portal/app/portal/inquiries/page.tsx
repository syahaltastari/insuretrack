"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Confirm, StatusBadge } from "@insuretrack/ui";
import { toast } from "sonner";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { API_BASE, apiFetch } from "@insuretrack/api-client";
import { Reveal } from "@/components/Reveal";

// ---- Types ---------------------------------------------------------------

type SenderType = "CUSTOMER" | "ADMIN";

type Message = {
  id: string;
  sender_type: SenderType;
  sender_id: string | null;
  sender_name: string;
  message: string;
  created_at: string;
};

type Inquiry = {
  id: string;
  inquiry_no: string;
  policy_no: string | null;
  subject: string;
  /** Pesan customer pertama (legacy) — dipertahankan untuk backward-compat. */
  message: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  response: string | null;
  created_at: string;
  responded_at: string | null;
  last_message_at: string | null;
  last_sender_type: SenderType | null;
  closed_at: string | null;
  /** Subquery dari backend — snippet pesan terakhir di thread. */
  last_message_preview: string | null;
};

type InquiryDetail = Inquiry & { messages: Message[] };

// ---- Helpers -------------------------------------------------------------

/** Format timestamp `id-ID` (WIB) untuk konsistensi. */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Truncate message preview untuk list card. */
function snippet(text: string | null | undefined, max = 80): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

// ---- Schemas -------------------------------------------------------------

const createSchema = z.object({
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
type CreateValues = z.infer<typeof createSchema>;

const replySchema = z.object({
  message: z
    .string()
    .trim()
    .min(5, "Balasan minimal 5 karakter")
    .max(5000, "Maksimal 5000 karakter"),
});
type ReplyValues = z.infer<typeof replySchema>;

// ---- Thread view ---------------------------------------------------------

function ThreadView({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <p className="caption" style={{ color: "var(--warm-silver)", margin: 0 }}>
        Belum ada pesan di thread ini.
      </p>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {messages.map((m) => {
        const isCustomer = m.sender_type === "CUSTOMER";
        return (
          <div
            key={m.id}
            style={{
              alignSelf: isCustomer ? "flex-start" : "flex-end",
              maxWidth: "85%",
              padding: "10px 14px",
              borderRadius: 12,
              background: isCustomer
                ? "var(--honey-tint)"
                : "var(--honey-100)",
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
              {isCustomer ? "Anda" : m.sender_name} · {formatDateTime(m.created_at)}
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
  );
}

// ---- Detail card (expanded inquiry) --------------------------------------

type DetailCardProps = {
  detail: InquiryDetail;
  onUpdated: () => void;
};

function InquiryDetailCard({ detail, onUpdated }: DetailCardProps) {
  const isClosed = detail.status === "CLOSED";
  const replyMethods = useForm<ReplyValues>({
    resolver: zodResolver(replySchema) as never,
    defaultValues: { message: "" },
    mode: "onSubmit",
  });
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const sendReply = async (values: ReplyValues) => {
    setReplySubmitting(true);
    setReplyError(null);
    try {
      await apiFetch(`/customer/inquiries/${detail.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: values.message.trim() }),
      });
      replyMethods.reset({ message: "" });
      onUpdated();
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "Gagal kirim balasan");
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleClose = async () => {
    setCloseSubmitting(true);
    setCloseError(null);
    try {
      const note = replyMethods.getValues("message").trim();
      await apiFetch(`/customer/inquiries/${detail.id}/close`, {
        method: "POST",
        body: JSON.stringify(note ? { note } : {}),
      });
      replyMethods.reset({ message: "" });
      setCloseOpen(false);
      toast.success("Tiket berhasil ditutup");
      onUpdated();
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : "Gagal menutup tiket");
    } finally {
      setCloseSubmitting(false);
    }
  };

  const onReply = sendReply;
  const anySubmitting = replySubmitting || closeSubmitting;

  return (
    <div
      className="clay-card feature"
      style={{ marginBottom: 12, borderColor: "var(--honey-400)" }}
    >
      {/* Header inquiry */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <p
            className="mono"
            style={{ fontSize: "0.85rem", color: "var(--warm-silver)", margin: 0 }}
          >
            {detail.inquiry_no}
          </p>
          <h3 className="feature-title" style={{ marginTop: 4, marginBottom: 4 }}>
            {detail.subject}
          </h3>
          <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Dibuat {formatDateTime(detail.created_at)}
            {detail.policy_no && (
              <>
                {" "}· Polis <span className="mono">{detail.policy_no}</span>
              </>
            )}
          </p>
        </div>
        <StatusBadge status={detail.status} />
      </div>

      {/* Thread */}
      <ThreadView messages={detail.messages} />

      {/* Closed banner */}
      {isClosed && (
        <div
          className="clay-card dashed"
          style={{
            marginTop: 16,
            padding: 12,
            background: "var(--warm-cream)",
            fontSize: "0.9rem",
          }}
        >
          🔒 Tiket ditutup
          {detail.closed_at && ` pada ${formatDateTime(detail.closed_at)}`}.
          Balasan baru tidak dapat ditambahkan.
        </div>
      )}

      {/* Reply form (hidden kalau closed) */}
      {!isClosed && (
        <Form
          methods={replyMethods}
          onSubmit={onReply}
          style={{ marginTop: 16 }}
        >
          <FormError message={replyError ?? closeError} />
          <FormField label="Balasan" name="message" required>
            <textarea
              id="message"
              className="clay-textarea"
              rows={3}
              placeholder="Tulis balasan untuk admin…"
              disabled={anySubmitting}
              {...replyMethods.register("message")}
            />
          </FormField>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="submit"
              className="clay-button solid-honey size-small"
              disabled={anySubmitting}
            >
              {replySubmitting ? "Mengirim..." : "Kirim Balasan"}
            </button>
            <button
              type="button"
              className="clay-button ghost size-small"
              onClick={() => setCloseOpen(true)}
              disabled={anySubmitting}
              title="Tutup tiket — tidak bisa menambah balasan lagi"
            >
              {closeSubmitting ? "Menutup..." : "Tutup Tiket"}
            </button>
          </div>
        </Form>
      )}

      <Confirm
        open={closeOpen}
        onOpenChange={(o) => !closeSubmitting && setCloseOpen(o)}
        title="Tutup tiket ini?"
        description="Kamu tidak bisa menambah balasan lagi setelah tiket ditutup."
        confirmLabel={closeSubmitting ? "Menutup..." : "Tutup Tiket"}
        cancelLabel="Batal"
        onConfirm={handleClose}
      />
    </div>
  );
}

// ---- Main page -----------------------------------------------------------

export default function PortalInquiriesPage() {
  const [data, setData] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Detail yang sedang dibuka (single, bukan multi-expand). Null = list view.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InquiryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const createMethods = useForm<CreateValues>({
    resolver: zodResolver(createSchema) as never,
    defaultValues: { subject: "", message: "" },
    mode: "onSubmit",
  });

  // Load list
  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<{ data?: Inquiry[] }>("/customer/inquiries?page=1&page_size=50")
      .then((j) => setData(j.data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal load"))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Load detail kalau selectedId berubah
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    apiFetch<InquiryDetail>(`/customer/inquiries/${selectedId}`)
      .then((j) => setDetail(j))
      .catch((e) => setDetailError(e instanceof Error ? e.message : "Gagal load"))
      .finally(() => setDetailLoading(false));
  }, [selectedId, refreshKey]);

  // Create handler — refresh list + auto-select inquiry baru
  const onCreate = async (values: CreateValues) => {
    setSubmitting(true);
    try {
      const created = await apiFetch<{ id: string }>("/customer/inquiries", {
        method: "POST",
        body: JSON.stringify({
          subject: values.subject.trim(),
          message: values.message.trim(),
        }),
      });
      createMethods.reset({ subject: "", message: "" });
      setRefreshKey((k) => k + 1);
      if (created.id) setSelectedId(created.id);
    } catch (err) {
      createMethods.setError("root", {
        message: err instanceof Error ? err.message : "Gagal",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const refreshAll = () => {
    setRefreshKey((k) => k + 1);
    // Trigger detail refetch juga (effect re-runs karena refreshKey di deps).
  };

  const createRootErr = createMethods.formState.errors.root?.message;

  return (
    <>
      <Reveal>
        <p className="uppercase-label" style={{ color: "var(--honey-700)", marginBottom: 8 }}>
          ✦ Pertanyaan
        </p>
        <h1 className="page-title">Hubungi Admin</h1>
        <p className="page-subtitle">
          Buat tiket pertanyaan baru atau lanjutkan thread yang sudah ada. Admin akan
          merespon via email, dan setiap balasan baru akan dikirim juga lewat email.
        </p>
      </Reveal>

      {/* Form buat tiket baru */}
      <Reveal delay={150}>
        <Form
          methods={createMethods}
          onSubmit={onCreate}
          className="clay-card feature"
        >
          <h2 className="feature-title" style={{ marginBottom: 16 }}>
            Buat Pertanyaan Baru
          </h2>
          <FormError message={createRootErr ?? null} />

          <FormField label="Subject" name="subject" required>
            <input
              id="subject"
              className="clay-input"
              autoComplete="off"
              placeholder="cth: Cara klaim rawat inap"
              {...createMethods.register("subject")}
            />
          </FormField>

          <FormField label="Pesan" name="message" required>
            <textarea
              id="message"
              className="clay-textarea"
              rows={4}
              placeholder="Jelaskan pertanyaanmu sedetail mungkin…"
              {...createMethods.register("message")}
            />
          </FormField>

          <button
            type="submit"
            disabled={submitting}
            className="clay-button solid-honey"
            style={{ marginTop: 8 }}
          >
            {submitting ? "Mengirim..." : "Kirim →"}
          </button>
        </Form>
      </Reveal>

      {/* Daftar tiket */}
      <Reveal delay={300}>
        <h2
          className="section-heading"
          style={{ fontSize: "1.5rem", marginBottom: 16, marginTop: 32 }}
        >
          Riwayat Tiket
        </h2>
      </Reveal>

      {loading && <p>Memuat...</p>}
      {error && (
        <div
          className="clay-card"
          style={{ borderColor: "var(--pomegranate-400)", background: "var(--pomegranate-50)" }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Detail yang sedang dibuka (di atas list) */}
      {selectedId && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="clay-button ghost size-small"
            onClick={() => setSelectedId(null)}
            style={{ marginBottom: 12 }}
          >
            ← Kembali ke daftar tiket
          </button>
          {detailLoading && <p>Memuat thread...</p>}
          {detailError && (
            <div
              className="clay-card"
              style={{ borderColor: "var(--pomegranate-400)", background: "var(--pomegranate-50)" }}
            >
              ⚠ {detailError}
            </div>
          )}
          {detail && !detailLoading && (
            <InquiryDetailCard detail={detail} onUpdated={refreshAll} />
          )}
        </div>
      )}

      {!loading && data.length === 0 && (
        <Reveal delay={150}>
          <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 32 }}>
            <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
              Belum ada tiket pertanyaan. Buat tiket baru di atas.
            </p>
          </div>
        </Reveal>
      )}

      {!loading &&
        data.map((inq) => {
          const isOpen = inq.status !== "CLOSED";
          const lastSender = inq.last_sender_type;
          const lastTime = inq.last_message_at ?? inq.created_at;
          const preview = inq.last_message_preview ?? inq.message;
          const you = lastSender === "CUSTOMER" ? "Anda" : "Tim InsureTrack";
          return (
            <button
              key={inq.id}
              type="button"
              onClick={() => setSelectedId(inq.id)}
              className="clay-card"
              style={{
                marginBottom: 12,
                textAlign: "left",
                display: "block",
                width: "100%",
                cursor: "pointer",
                background: selectedId === inq.id ? "var(--honey-tint)" : undefined,
                borderColor: selectedId === inq.id ? "var(--honey-400)" : undefined,
              }}
            >
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
              <p
                className="caption"
                style={{ color: "var(--warm-silver)", marginTop: 4, marginBottom: 6 }}
              >
                <span className="mono">{inq.inquiry_no}</span> ·{" "}
                {formatDateTime(lastTime)}
                {inq.policy_no && (
                  <>
                    {" "}· Polis <span className="mono">{inq.policy_no}</span>
                  </>
                )}
              </p>
              <p
                style={{
                  margin: 0,
                  color: "var(--warm-charcoal)",
                  fontSize: "0.92rem",
                }}
              >
                {isOpen ? (
                  <>
                    <span style={{ color: "var(--warm-silver)" }}>{you}: </span>
                    {snippet(preview)}
                  </>
                ) : (
                  <span style={{ color: "var(--warm-silver)", fontStyle: "italic" }}>
                    Tiket ditutup
                    {inq.closed_at && ` · ${formatDateTime(inq.closed_at)}`}
                  </span>
                )}
              </p>
            </button>
          );
        })}
    </>
  );
}
