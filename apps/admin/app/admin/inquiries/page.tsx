"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Confirm,
  SkeletonCard,
  StatusBadge,
  DateRangePicker,
  type DateRangeValue,
  FilterChipBar,
  type FilterChip,
  FilterSelect,
} from "@insuretrack/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { apiFetch } from "@insuretrack/api-client";

type InquiryStatus = "OPEN" | "ANSWERED" | "CLOSED";
const STATUSES: InquiryStatus[] = ["OPEN", "ANSWERED", "CLOSED"];

type SenderType = "CUSTOMER" | "ADMIN";

type Message = {
  id: string;
  sender_type: SenderType;
  sender_id: string | null;
  sender_name: string;
  message: string;
  created_at: string;
};

type AdminInquiry = {
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
};

type AdminInquiryDetail = AdminInquiry & { messages: Message[] };

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function snippet(text: string | null | undefined, max = 80): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShortDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const mIdx = parseInt(parts[1], 10) - 1;
  return `${parseInt(parts[2], 10)} ${months[mIdx] ?? "?"} ${parts[0]}`;
}

const replySchema = z.object({
  message: z
    .string()
    .trim()
    .min(5, "Jawaban minimal 5 karakter")
    .max(5000, "Maksimal 5000 karakter"),
});
type ReplyValues = z.infer<typeof replySchema>;

function ThreadView({
  messages,
  customerName,
}: {
  messages: Message[];
  customerName: string;
}) {
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
        const isAdmin = m.sender_type === "ADMIN";
        return (
          <div
            key={m.id}
            style={{
              alignSelf: isAdmin ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "10px 14px",
              borderRadius: 12,
              background: isAdmin ? "var(--ube-300)" : "var(--warm-cream)",
              borderLeft: isAdmin
                ? "3px solid var(--ube-800)"
                : "3px solid var(--matcha-600)",
              border: isAdmin ? "1px solid var(--ube-800)" : undefined,
            }}
          >
            <p
              className="caption"
              style={{
                margin: 0,
                color: isAdmin ? "var(--ube-900)" : "var(--matcha-600)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {isAdmin ? "Anda (admin)" : m.sender_name || customerName} ·{" "}
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
  );
}

type InquiryCardProps = {
  inquiry: AdminInquiry;
  expanded: boolean;
  onToggle: () => void;
  onUpdated: () => void;
};

function InquiryCard({ inquiry, expanded, onToggle, onUpdated }: InquiryCardProps) {
  const [detail, setDetail] = useState<AdminInquiryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const methods = useForm<ReplyValues>({
    resolver: zodResolver(replySchema) as never,
    defaultValues: { message: "" },
    mode: "onSubmit",
  });
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  // Fetch detail saat expanded pertama kali
  useEffect(() => {
    if (!expanded || detail) return;
    setDetailLoading(true);
    setDetailError(null);
    apiFetch<AdminInquiryDetail>(`/admin/inquiries/${inquiry.id}`)
      .then((j) => setDetail(j))
      .catch((e) =>
        setDetailError(e instanceof Error ? e.message : "Gagal load detail"),
      )
      .finally(() => setDetailLoading(false));
  }, [expanded, detail, inquiry.id]);

  const isClosed = inquiry.status === "CLOSED";
  const anySubmitting = replySubmitting || closeSubmitting;

  const sendReply = async (values: ReplyValues) => {
    setReplySubmitting(true);
    setReplyError(null);
    try {
      await apiFetch(`/admin/inquiries/${inquiry.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: values.message.trim() }),
      });
      methods.reset({ message: "" });
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
      const note = methods.getValues("message").trim();
      await apiFetch(`/admin/inquiries/${inquiry.id}/close`, {
        method: "POST",
        body: JSON.stringify(note ? { note } : {}),
      });
      methods.reset({ message: "" });
      setCloseOpen(false);
      toast.success(`Tiket ${inquiry.inquiry_no} berhasil ditutup`);
      onUpdated();
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : "Gagal menutup tiket");
    } finally {
      setCloseSubmitting(false);
    }
  };

  const onReply = sendReply;

  return (
    <div
      className="clay-card feature"
      style={{
        marginBottom: 16,
        borderColor: expanded ? "var(--ube-800)" : undefined,
      }}
    >
      {/* Header — clickable to expand */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          all: "unset",
          display: "block",
          width: "100%",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: expanded ? 16 : 0,
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
              {" "}· {formatDateTime(inquiry.created_at)}
            </p>
            {inquiry.last_message_preview && !expanded && (
              <p
                style={{
                  margin: "6px 0 0 0",
                  color: "var(--warm-charcoal)",
                  fontSize: "0.9rem",
                }}
              >
                <span style={{ color: "var(--warm-silver)" }}>
                  {inquiry.last_sender_type === "ADMIN" ? "Anda: " : `${inquiry.customer_name}: `}
                </span>
                {snippet(inquiry.last_message_preview)}
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusBadge status={inquiry.status} />
            {/* Dedicated detail page (read-only view) — handy kalau admin
                mau share link tiket ke kolega via URL, atau lihat inquiry
                di tab terpisah tanpa reply. */}
            <Link
              href={`/admin/inquiries/${inquiry.id}`}
              className="clay-button ghost size-small"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              title="Buka di halaman dedicated"
            >
              Detail →
            </Link>
            <span
              style={{
                fontSize: "1.2rem",
                color: "var(--warm-silver)",
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
              }}
            >
              ›
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <>
          {detailLoading && <p>Memuat thread...</p>}
          {detailError && (
            <div
              className="clay-card"
              style={{
                borderColor: "var(--pomegranate-400)",
                background: "#fff5f5",
                marginBottom: 12,
              }}
            >
              ⚠ {detailError}
            </div>
          )}
          {detail && !detailLoading && (
            <>
              <ThreadView
                messages={detail.messages}
                customerName={detail.customer_name}
              />

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
                </div>
              )}

              {!isClosed && (
                <Form
                  methods={methods}
                  onSubmit={onReply}
                  style={{ marginTop: 16 }}
                >
                  <FormError message={replyError ?? closeError} />
                  <FormField
                    label="Balasan"
                    name="message"
                    required
                  >
                    <textarea
                      className="clay-textarea"
                      rows={3}
                      placeholder="Tulis jawaban untuk customer…"
                      disabled={anySubmitting}
                      {...methods.register("message")}
                    />
                  </FormField>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="submit"
                      className="clay-button solid-ube size-small"
                      disabled={anySubmitting}
                    >
                      {replySubmitting ? "Mengirim..." : "Kirim Balasan"}
                    </button>
                    <button
                      type="button"
                      className="clay-button ghost size-small"
                      onClick={() => setCloseOpen(true)}
                      disabled={anySubmitting}
                      title="Tutup tiket — customer tidak bisa menambah balasan lagi"
                    >
                      {closeSubmitting ? "Menutup..." : "Tutup Tiket"}
                    </button>
                  </div>
                </Form>
              )}

              <Confirm
                open={closeOpen}
                onOpenChange={(o) => !closeSubmitting && setCloseOpen(o)}
                title={`Tutup tiket ${inquiry.inquiry_no}?`}
                description="Customer tidak bisa menambah balasan lagi setelah tiket ditutup."
                confirmLabel={closeSubmitting ? "Menutup..." : "Tutup Tiket"}
                cancelLabel="Batal"
                onConfirm={handleClose}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

const INQUIRY_DATE_FIELDS = [
  { value: "created_at", label: "Tanggal dibuat" },
  { value: "responded_at", label: "Tanggal dijawab" },
  { value: "last_message_at", label: "Pesan terakhir" },
  { value: "closed_at", label: "Tanggal ditutup" },
];

const INQUIRY_SORT_OPTIONS = [
  { value: "created_at", label: "Tanggal dibuat" },
  { value: "last_message_at", label: "Pesan terakhir" },
  { value: "customer_name", label: "Nama customer" },
];

export default function AdminInquiriesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<AdminInquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // URL-driven filter state — `q` di-debounce 300ms supaya tidak spam
  // fetch tiap keystroke. `status` dan field lain langsung dari URL
  // (instant).
  const qFromUrl = searchParams.get("q") ?? "";
  const statusFromUrl = searchParams.get("status") ?? "";
  const dateFromUrl = searchParams.get("date_from") ?? "";
  const dateToUrl = searchParams.get("date_to") ?? "";
  const dateFieldFromUrl = searchParams.get("date_field") ?? "created_at";
  const sortByFromUrl = searchParams.get("sort_by") ?? "";
  const sortDirFromUrl = searchParams.get("sort_dir") ?? "desc";

  const [qInput, setQInput] = useState(qFromUrl);
  const [activeDateField, setActiveDateField] = useState(dateFieldFromUrl || "created_at");
  const [sortBy, setSortBy] = useState(sortByFromUrl);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    sortDirFromUrl === "asc" ? "asc" : "desc"
  );

  const dateRange = useMemo<DateRangeValue | undefined>(() => {
    if (!dateFromUrl) return undefined;
    return {
      from: new Date(dateFromUrl + "T00:00:00"),
      to: dateToUrl ? new Date(dateToUrl + "T00:00:00") : undefined,
    };
  }, [dateFromUrl, dateToUrl]);

  const dateFieldOptionsMap = useMemo(
    () => Object.fromEntries(INQUIRY_DATE_FIELDS.map((o) => [o.value, o.label])),
    []
  );

  const setFilterParams = useCallback(
    (next: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v && v.length > 0) params.set(k, v);
        else params.delete(k);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  // Debounce search input → URL. 300ms adalah sweet-spot: cukup
  // responsive tapi tidak spam fetch pada rapid typing.
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== qFromUrl) setFilterParams({ q: qInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // Sync local state kalau URL berubah dari luar (back/forward, link).
  useEffect(() => {
    setQInput(qFromUrl);
    setActiveDateField(dateFieldFromUrl || "created_at");
    setSortBy(sortByFromUrl);
    setSortDir(sortDirFromUrl === "asc" ? "asc" : "desc");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qFromUrl, dateFieldFromUrl, dateFromUrl, dateToUrl, sortByFromUrl, sortDirFromUrl]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: "1", page_size: "50" });
    if (qFromUrl) params.set("q", qFromUrl);
    if (statusFromUrl) params.set("status", statusFromUrl);
    if (dateFromUrl) params.set("date_from", dateFromUrl);
    if (dateToUrl) params.set("date_to", dateToUrl);
    if (activeDateField) params.set("date_field", activeDateField);
    if (sortBy) params.set("sort_by", sortBy);
    if (sortBy) params.set("sort_dir", sortDir);

    apiFetch<{ data: AdminInquiry[] }>(
      `/admin/inquiries?${params.toString()}`,
    )
      .then((j) => setData(j.data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, qFromUrl, statusFromUrl, dateFromUrl, dateToUrl, activeDateField, sortBy, sortDir]);

  const onDateRangeChange = (range: DateRangeValue | undefined) => {
    setFilterParams({
      date_from: range?.from ? toIsoDate(range.from) : undefined,
      date_to: range?.to ? toIsoDate(range.to) : undefined,
    });
  };

  const resetAll = () => {
    setQInput("");
    setActiveDateField("created_at");
    setSortBy("");
    setSortDir("desc");
    router.replace(pathname);
  };

  const onSortByHeader = (col: string) => {
    let nextDir: "asc" | "desc" = "desc";
    if (sortBy === col) nextDir = sortDir === "desc" ? "asc" : "desc";
    setSortBy(col);
    setSortDir(nextDir);
    setFilterParams({ sort_by: col, sort_dir: nextDir });
  };

  // Active filter chips
  const chips: FilterChip[] = [];
  if (qFromUrl) {
    chips.push({
      key: "q",
      label: `Cari: "${qFromUrl}"`,
      onRemove: () => setFilterParams({ q: undefined }),
    });
  }
  if (statusFromUrl) {
    chips.push({
      key: "status",
      label: `Status: ${statusFromUrl}`,
      onRemove: () => setFilterParams({ status: undefined }),
    });
  }
  if (dateFromUrl || dateToUrl) {
    const dfLabel = dateFromUrl ? formatShortDate(dateFromUrl) : "…";
    const dtLabel = dateToUrl ? formatShortDate(dateToUrl) : "…";
    const dfName = activeDateField ? dateFieldOptionsMap[activeDateField] ?? activeDateField : "";
    chips.push({
      key: "date",
      label: `Tanggal${dfName ? ` (${dfName})` : ""}: ${dfLabel} – ${dtLabel}`,
      onRemove: () => setFilterParams({ date_from: undefined, date_to: undefined }),
    });
  }
  if (sortBy) {
    chips.push({
      key: "sort",
      label: `Sort: ${sortBy} ${sortDir}`,
      onRemove: () => setFilterParams({ sort_by: undefined, sort_dir: undefined }),
    });
  }

  return (
    <>
      <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 8 }}>
        ✦ Review Inquiry
      </p>
      <h1 className="page-title">Pertanyaan Customer</h1>
      <p className="page-subtitle">
        Balas thread pertanyaan customer. Setiap balasan akan dikirim lewat email ke
        customer, dan customer bisa reply sampai tiket ditutup.
      </p>

      {/* Filter bar — search input + status pill buttons + date range + sort. URL-driven. */}
      <div
        className="clay-card"
        style={{
          padding: 16,
          marginTop: 24,
          marginBottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <label className="inline-flex flex-col gap-1" style={{ flex: 1, minWidth: 220 }}>
            <span className="text-xs uppercase tracking-wider text-warm-silver font-semibold">
              Cari
            </span>
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Cari inquiry / subject / nama customer…"
              className="clay-input"
              aria-label="Cari inquiry"
            />
          </label>

          <DateRangePicker
            value={dateRange}
            onChange={onDateRangeChange}
            ariaLabel="Pilih rentang tanggal filter"
          />

          <FilterSelect
            label="Kolom tanggal"
            value={activeDateField}
            onChange={(v) => {
              setActiveDateField(v);
              setFilterParams({ date_field: v });
            }}
            options={INQUIRY_DATE_FIELDS}
            ariaLabel="Kolom tanggal"
            width={160}
          />

          <FilterSelect
            label="Sort by"
            value={sortBy}
            onChange={(v) => {
              if (!v) {
                setSortBy("");
                setFilterParams({ sort_by: undefined, sort_dir: undefined });
              } else {
                onSortByHeader(v);
              }
            }}
            options={[
              { value: "", label: "Default" },
              ...INQUIRY_SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
            ariaLabel="Urutkan"
            width={170}
          />
        </div>

        <div
          role="tablist"
          aria-label="Filter status inquiry"
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
        >
          {(["", ...STATUSES] as const).map((s) => {
            const isActive = statusFromUrl === s;
            const label = s === "" ? "Semua" : s;
            return (
              <button
                key={s || "all"}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilterParams({ status: s })}
                className={`clay-button ${isActive ? "solid-ube" : "ghost"} size-small`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <FilterChipBar chips={chips} onResetAll={resetAll} />
      </div>

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

      {!loading && data.length === 0 && chips.length === 0 && statusFromUrl === "" && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada pertanyaan masuk.
          </p>
        </div>
      )}

      {!loading && data.length === 0 && (chips.length > 0 || statusFromUrl !== "") && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 32 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0, marginBottom: 12 }}>
            Tidak ada inquiry yang cocok dengan filter.
          </p>
          <button
            type="button"
            className="clay-button solid-ube size-small"
            onClick={resetAll}
          >
            Reset filter
          </button>
        </div>
      )}

      {!loading &&
        data.map((inq) => (
          <InquiryCard
            key={inq.id}
            inquiry={inq}
            expanded={expandedId === inq.id}
            onToggle={() =>
              setExpandedId(expandedId === inq.id ? null : inq.id)
            }
            onUpdated={() => setRefreshKey((k) => k + 1)}
          />
        ))}
    </>
  );
}
