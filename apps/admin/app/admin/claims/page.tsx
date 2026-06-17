"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Icon,
  SkeletonCard,
  StatusBadge,
  DateRangePicker,
  type DateRangeValue,
  FilterChipBar,
  type FilterChip,
  FilterSelect,
} from "@insuretrack/ui";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { API_BASE } from "@insuretrack/api-client";
import { getAdminToken } from "@insuretrack/api-client";

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
  payment_proof_path: string | null;
  submitted_at: string;
};

const decisionNoteSchema = z.object({
  decision_note: z
    .string()
    .max(2000, "Catatan maksimal 2000 karakter")
    .optional()
    .or(z.literal("")),
});
type DecisionNoteValues = z.infer<typeof decisionNoteSchema>;

// Batas sinkron dengan backend (services/storage.rs::MAX_PAYMENT_PROOF_BYTES
// = 5 MB). Hard-coded di sini juga agar user lihat pesan valid sebelum request.
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_MIMES = ["image/jpeg", "image/png", "application/pdf"] as const;
type AllowedProofMime = (typeof ALLOWED_PROOF_MIMES)[number];

function ClaimCard({ claim, onUpdated }: { claim: Claim; onUpdated: () => void }) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const methods = useForm<DecisionNoteValues>({
    resolver: zodResolver(decisionNoteSchema) as never,
    defaultValues: { decision_note: "" },
    mode: "onSubmit",
  });

  // Validate file selection di client (mirror backend rules). Return null
  // kalau valid; error string kalau tidak. Dipakai sebelum fetch.
  const validateProof = (file: File | null): string | null => {
    if (!file) return "File bukti pembayaran belum dipilih";
    if (file.size === 0) return "File kosong";
    if (file.size > MAX_PROOF_BYTES) {
      return `Ukuran file ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 5 MB`;
    }
    if (!ALLOWED_PROOF_MIMES.includes(file.type as AllowedProofMime)) {
      return `Tipe file ${file.type || "tidak dikenal"} tidak didukung (JPG, PNG, PDF)`;
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProofError(null);
    const f = e.target.files?.[0] ?? null;
    if (f) {
      const err = validateProof(f);
      if (err) {
        setProofError(err);
        setProofFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }
    setProofFile(f);
  };

  const clearProofSelection = () => {
    setProofFile(null);
    setProofError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Upload proof ke endpoint dedicated. Dipanggil sebelum PATCH status
  // kalau file dipilih. Throw kalau gagal agar caller abort.
  const uploadProof = async (): Promise<boolean> => {
    if (!proofFile) return true; // no-op kalau tidak ada file
    const token = getAdminToken();
    if (!token) return false;
    setUploadingProof(true);
    try {
      const fd = new FormData();
      fd.append("proof", proofFile);
      const r = await fetch(`${API_BASE}/admin/claims/${claim.id}/payment-proof`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      return true;
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal upload bukti");
      return false;
    } finally {
      setUploadingProof(false);
    }
  };

  const update = async (values: DecisionNoteValues, status: string) => {
    const token = getAdminToken();
    if (!token) return;
    setSubmitting(status);
    setFormError(null);

    // Validasi upload requirement: WAJIB untuk transisi → PAID.
    if (status === "PAID" && !proofFile && !claim.payment_proof_path) {
      setFormError("Bukti pembayaran wajib di-upload untuk menandai klaim sebagai PAID");
      setSubmitting(null);
      return;
    }

    try {
      // 1. Upload proof dulu (kalau ada file baru). Kalau gagal, abort.
      if (proofFile) {
        const ok = await uploadProof();
        if (!ok) {
          setSubmitting(null);
          return;
        }
      }
      // 2. PATCH status (seperti sebelumnya).
      const r = await fetch(`${API_BASE}/admin/claims/${claim.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          status,
          decision_note: values.decision_note?.trim() || null,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      methods.reset({ decision_note: "" });
      clearProofSelection();
      onUpdated();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setSubmitting(null);
    }
  };

  // Tombol status-transition punya handler masing-masing (pakai handleSubmit
  // wrapped). Form-level onSubmit cuma jalan kalau user tekan Enter di field
  // → default ke "APPROVED" (aksi yang paling umum di state UNDER_REVIEW).
  const onSubmit = (status: string) => methods.handleSubmit((v) => update(v, status));

  const busy = submitting !== null || uploadingProof;
  const proofRequired = claim.status === "APPROVED"; // saat ini hanya PAID transition
  const hasProof = !!claim.payment_proof_path;
  const proofFileName = claim.payment_proof_path?.split("/").pop() ?? null;

  return (
    <Form
      methods={methods}
      onSubmit={(v) => update(v, "APPROVED")}
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
            {claim.claim_no}
          </p>
          <h3 className="feature-title" style={{ marginTop: 4, marginBottom: 4 }}>
            {claim.customer_name} · {claim.claim_type}
          </h3>
          <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Polis <span className="mono">{claim.policy_no}</span> · Insiden {claim.incident_date} ·
            Klaim {new Intl.NumberFormat("id-ID").format(Number(claim.claimed_amount))}
          </p>
        </div>
        <StatusBadge status={claim.status} />
      </div>

      <FormField
        label="Catatan keputusan (opsional)"
        name="decision_note"
        hint="Akan di-email ke customer"
      >
        <input
          className="clay-input"
          autoComplete="off"
          disabled={busy}
          {...methods.register("decision_note")}
        />
      </FormField>

      {/* ===== Bukti pembayaran section ===== */}
      <div style={{ marginTop: 16, marginBottom: 12 }}>
        <label
          className="clay-label"
          htmlFor={`proof-${claim.id}`}
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
        >
          <Icon name="Receipt" size="xs" style={{ color: "var(--matcha-600)" }} />
          <span>
            Bukti pembayaran {proofRequired && <span style={{ color: "var(--pomegranate-400)" }}>*</span>}
          </span>
        </label>
        <p
          className="caption"
          style={{ color: "var(--warm-silver)", margin: 0, marginBottom: 8 }}
        >
          JPG / PNG / PDF, maks 5 MB. {proofRequired ? "Wajib di-upload untuk Mark as Paid." : "Opsional — bisa di-attach di tiap transisi status."}
        </p>

        {hasProof && !proofFile && (
          <div
            className="clay-card dashed"
            style={{
              padding: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "var(--matcha-300)",
              border: "1px solid var(--matcha-600)",
            }}
          >
            <Icon name="CheckCircle2" size="md" style={{ color: "var(--matcha-800)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="body" style={{ margin: 0, fontWeight: 600, color: "var(--clay-black)" }}>
                Bukti pembayaran ter-attach
              </p>
              <p
                className="caption mono"
                style={{
                  margin: 0,
                  color: "var(--matcha-800)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {proofFileName}
              </p>
            </div>
            <a
              href={`${API_BASE}/public/uploads/${claim.payment_proof_path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="clay-button ghost size-small"
              style={{ textDecoration: "none" }}
            >
              Lihat
            </a>
          </div>
        )}

        {!hasProof || proofFile ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "stretch",
              flexWrap: "wrap",
            }}
          >
            <label
              className="clay-button ghost size-small"
              htmlFor={`proof-${claim.id}`}
              style={{
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.5 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                margin: 0,
              }}
            >
              <Icon name="Plus" size="xs" />
              {proofFile ? "Ganti file" : hasProof ? "Ganti bukti" : "Pilih file…"}
            </label>
            <input
              ref={fileInputRef}
              id={`proof-${claim.id}`}
              type="file"
              accept={ALLOWED_PROOF_MIMES.join(",")}
              onChange={handleFileChange}
              disabled={busy}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0,0,0,0)",
                whiteSpace: "nowrap",
                border: 0,
              }}
            />
            {proofFile && (
              <div
                style={{
                  flex: 1,
                  minWidth: 200,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  background: "var(--warm-cream)",
                  border: "1px solid var(--oat-border)",
                  borderRadius: "var(--radius-card)",
                }}
              >
                <Icon name="FileText" size="sm" style={{ color: "var(--matcha-600)", flexShrink: 0 }} />
                <span
                  className="caption"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--clay-black)",
                  }}
                >
                  {proofFile.name}
                </span>
                <span className="caption" style={{ color: "var(--warm-silver)", flexShrink: 0 }}>
                  {(proofFile.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={clearProofSelection}
                  disabled={busy}
                  aria-label="Hapus pilihan file"
                  style={{
                    background: "transparent",
                    border: 0,
                    cursor: busy ? "not-allowed" : "pointer",
                    padding: 2,
                    color: "var(--pomegranate-400)",
                    display: "inline-flex",
                  }}
                >
                  <Icon name="X" size="sm" />
                </button>
              </div>
            )}
          </div>
        ) : null}

        {proofError && (
          <p
            className="caption"
            style={{ color: "var(--pomegranate-400)", margin: "6px 0 0 0", fontWeight: 600 }}
          >
            ⚠ {proofError}
          </p>
        )}
      </div>

      <FormError message={formError} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {claim.status === "SUBMITTED" && (
          <button
            type="button"
            className="clay-button solid-ube size-small"
            onClick={onSubmit("UNDER_REVIEW")}
            disabled={busy}
          >
            {submitting === "UNDER_REVIEW" ? "Memproses..." : "→ Under Review"}
          </button>
        )}
        {claim.status === "UNDER_REVIEW" && (
          <>
            <button
              type="button"
              className="clay-button solid-matcha size-small"
              onClick={onSubmit("APPROVED")}
              disabled={busy}
            >
              {submitting === "APPROVED" ? "Memproses..." : "✓ Approve"}
            </button>
            <button
              type="button"
              className="clay-button solid-pomegranate size-small"
              onClick={onSubmit("REJECTED")}
              disabled={busy}
            >
              {submitting === "REJECTED" ? "Memproses..." : "✗ Reject"}
            </button>
          </>
        )}
        {claim.status === "APPROVED" && (
          <button
            type="button"
            className="clay-button solid-slushie size-small"
            onClick={onSubmit("PAID")}
            disabled={busy}
          >
            {submitting === "PAID"
              ? "Memproses..."
              : uploadingProof
                ? "Uploading…"
                : "Mark as Paid"}
          </button>
        )}
        {claim.status === "REJECTED" || claim.status === "PAID" ? (
          <span className="caption" style={{ color: "var(--warm-silver)" }}>
            Status final.
          </span>
        ) : null}
      </div>
    </Form>
  );
}

// ----- Filter bar + URL sync -----

const CLAIM_DATE_FIELDS = [
  { value: "submitted_at", label: "Tanggal submit" },
  { value: "incident_date", label: "Tanggal insiden" },
  { value: "updated_at", label: "Tanggal update" },
];

const CLAIM_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PAID"];
const CLAIM_TYPES = ["DEATH", "ACCIDENT", "HOSPITALIZATION", "MATURITY", "SURRENDER"];
const CLAIM_PRODUCTS = ["LIFE", "PERSONAL_ACCIDENT", "HEALTH"];

const CLAIM_SORT_OPTIONS = [
  { value: "submitted_at", label: "Tanggal submit" },
  { value: "incident_date", label: "Tanggal insiden" },
  { value: "claimed_amount", label: "Nominal klaim" },
  { value: "customer_name", label: "Nama customer" },
];

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

export default function AdminClaimsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // URL-driven filter state
  const qFromUrl = searchParams.get("q") ?? "";
  const statusFromUrl = searchParams.get("status") ?? "";
  const dateFromUrl = searchParams.get("date_from") ?? "";
  const dateToUrl = searchParams.get("date_to") ?? "";
  const dateFieldFromUrl = searchParams.get("date_field") ?? "submitted_at";
  const productFromUrl = searchParams.get("product") ?? "";
  const claimTypeFromUrl = searchParams.get("claim_type") ?? "";
  const sortByFromUrl = searchParams.get("sort_by") ?? "";
  const sortDirFromUrl = searchParams.get("sort_dir") ?? "desc";

  const [qInput, setQInput] = useState(qFromUrl);
  const [status, setStatus] = useState(statusFromUrl);
  const [activeDateField, setActiveDateField] = useState(dateFieldFromUrl || "submitted_at");
  const [product, setProduct] = useState(productFromUrl);
  const [claimType, setClaimType] = useState(claimTypeFromUrl);
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
    () => Object.fromEntries(CLAIM_DATE_FIELDS.map((o) => [o.value, o.label])),
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

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== qFromUrl) setFilterParams({ q: qInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // Sync from URL
  useEffect(() => {
    setQInput(qFromUrl);
    setStatus(statusFromUrl);
    setActiveDateField(dateFieldFromUrl || "submitted_at");
    setProduct(productFromUrl);
    setClaimType(claimTypeFromUrl);
    setSortBy(sortByFromUrl);
    setSortDir(sortDirFromUrl === "asc" ? "asc" : "desc");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qFromUrl, statusFromUrl, dateFieldFromUrl, dateFromUrl, dateToUrl, productFromUrl, claimTypeFromUrl, sortByFromUrl, sortDirFromUrl]);

  const load = useCallback(async () => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: "1", page_size: "50" });
      if (qFromUrl) params.set("q", qFromUrl);
      if (statusFromUrl) params.set("status", statusFromUrl);
      if (dateFromUrl) params.set("date_from", dateFromUrl);
      if (dateToUrl) params.set("date_to", dateToUrl);
      if (activeDateField) params.set("date_field", activeDateField);
      if (product) params.set("product", product);
      if (claimType) params.set("claim_type", claimType);
      if (sortBy) params.set("sort_by", sortBy);
      if (sortBy) params.set("sort_dir", sortDir);

      const r = await fetch(`${API_BASE}/admin/claims?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    refreshKey,
    qFromUrl,
    statusFromUrl,
    dateFromUrl,
    dateToUrl,
    activeDateField,
    product,
    claimType,
    sortBy,
    sortDir,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const onDateRangeChange = (range: DateRangeValue | undefined) => {
    setFilterParams({
      date_from: range?.from ? toIsoDate(range.from) : undefined,
      date_to: range?.to ? toIsoDate(range.to) : undefined,
    });
  };

  const resetAll = () => {
    setQInput("");
    setStatus("");
    setActiveDateField("submitted_at");
    setProduct("");
    setClaimType("");
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
  if (product) {
    chips.push({
      key: "product",
      label: `Produk: ${product}`,
      onRemove: () => setFilterParams({ product: undefined }),
    });
  }
  if (claimType) {
    chips.push({
      key: "claim_type",
      label: `Tipe klaim: ${claimType}`,
      onRemove: () => setFilterParams({ claim_type: undefined }),
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
      <p className="uppercase-label" style={{ color: "var(--pomegranate-400)", marginBottom: 8 }}>
        ✦ Review Klaim
      </p>
      <h1 className="page-title">Klaim Customer</h1>
      <p className="page-subtitle">
        Tinjau klaim dan ubah status. Transisi yang valid sesuai state machine (spec §10.4).
      </p>

      {/* Filter bar */}
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
          <label className="inline-flex flex-col gap-1" style={{ flex: 1, minWidth: 200 }}>
            <span className="text-xs uppercase tracking-wider text-warm-silver font-semibold">
              Cari
            </span>
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Cari no. klaim / nama customer…"
              className="clay-input"
              aria-label="Cari klaim"
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
            options={CLAIM_DATE_FIELDS}
            ariaLabel="Kolom tanggal"
            width={160}
          />

          <FilterSelect
            label="Status klaim"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setFilterParams({ status: v });
            }}
            options={[
              { value: "", label: "Semua" },
              ...CLAIM_STATUSES.map((s) => ({ value: s, label: s })),
            ]}
            ariaLabel="Status klaim"
            width={150}
          />

          <FilterSelect
            label="Tipe klaim"
            value={claimType}
            onChange={(v) => {
              setClaimType(v);
              setFilterParams({ claim_type: v });
            }}
            options={[
              { value: "", label: "Semua" },
              ...CLAIM_TYPES.map((c) => ({ value: c, label: c })),
            ]}
            ariaLabel="Tipe klaim"
            width={150}
          />

          <FilterSelect
            label="Produk"
            value={product}
            onChange={(v) => {
              setProduct(v);
              setFilterParams({ product: v });
            }}
            options={[
              { value: "", label: "Semua" },
              ...CLAIM_PRODUCTS.map((p) => ({ value: p, label: p })),
            ]}
            ariaLabel="Produk"
            width={150}
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
              ...CLAIM_SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
            ariaLabel="Urutkan"
            width={170}
          />
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

      {!loading && data.length === 0 && chips.length === 0 && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada klaim masuk.
          </p>
        </div>
      )}

      {!loading && data.length === 0 && chips.length > 0 && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 32 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0, marginBottom: 12 }}>
            Tidak ada klaim yang cocok dengan filter.
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

      {!loading && data.map((c) => <ClaimCard key={c.id} claim={c} onUpdated={() => setRefreshKey((k) => k + 1)} />)}
    </>
  );
}
