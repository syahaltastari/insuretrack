"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { API_BASE, apiFetch, formatIdr } from "@insuretrack/api-client";
import { Reveal } from "@/components/Reveal";
import { SkeletonCard, StatusBadge } from "@insuretrack/ui";

type ClaimDocument = {
  id: string;
  file_name: string;
  file_path: string;
  uploaded_at: string;
};

type ClaimDetail = {
  id: string;
  claim_no: string;
  policy_id: string;
  policy_no: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  claim_type: string;
  incident_date: string;
  claimed_amount: string;
  description: string;
  status: string;
  decision_note: string | null;
  payment_proof_path: string | null;
  submitted_at: string;
  updated_at: string;
};

type ClaimDetailResponse = ClaimDetail & {
  documents: ClaimDocument[];
};

const CLAIM_TYPE_LABELS: Record<string, string> = {
  DEATH: "Klaim Meninggal Dunia",
  ACCIDENT: "Klaim Kecelakaan",
  HOSPITALIZATION: "Klaim Rawat Inap",
  MATURITY: "Klaim Jatuh Tempo",
  SURRENDER: "Klaim Penebusan",
};

const CLAIM_TYPE_COLORS: Record<string, "matcha" | "lemon" | "pomegranate" | "ube" | "muted"> = {
  DEATH: "pomegranate",
  ACCIDENT: "lemon",
  HOSPITALIZATION: "matcha",
  MATURITY: "ube",
  SURRENDER: "muted",
};

// Status state machine dari spec §10:
// SUBMITTED → UNDER_REVIEW → APPROVED → PAID
// SUBMITTED | UNDER_REVIEW → REJECTED
// Pakai lookup ini untuk render <select> opsi di form, supaya admin
// tidak bisa input illegal transition manual.
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "SUBMITTED", label: "Submitted (baru masuk)" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "PAID", label: "Paid (sudah dibayar)" },
];

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = dateOnlyMatch ? new Date(iso + "T00:00:00") : new Date(iso);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p
        className="caption"
        style={{
          color: "var(--warm-silver)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: 0,
          marginBottom: 4,
          fontSize: "0.7rem",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontWeight: 500,
          fontFamily: mono ? "var(--font-space-mono), monospace" : undefined,
          wordBreak: "break-word",
        }}
      >
        {children}
      </p>
    </div>
  );
}

export default function AdminClaimDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<ClaimDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Patch form state — controlled, init dari data fetch.
  const [newStatus, setNewStatus] = useState<string>("");
  const [decisionNote, setDecisionNote] = useState<string>("");
  const [patchSubmitting, setPatchSubmitting] = useState(false);

  // Payment proof upload — muncul saat status = APPROVED (siap dibayar)
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);

  const fetchClaim = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ClaimDetailResponse>(`/admin/claims/${id}`);
      setData(res);
      setNewStatus(res.status);
      setDecisionNote(res.decision_note ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat detail klaim");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const submitPatch = async () => {
    if (!data) return;
    setPatchSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/admin/claims/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: newStatus,
          decision_note: decisionNote.trim() || null,
        }),
      });
      toast.success("Status klaim diperbarui");
      await fetchClaim();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memperbarui status");
    } finally {
      setPatchSubmitting(false);
    }
  };

  const uploadProof = async () => {
    if (!proofFile) return;
    setProofUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", proofFile);
      await apiFetch(`/admin/claims/${id}/payment-proof`, {
        method: "POST",
        body: fd,
      });
      toast.success("Bukti pembayaran diupload");
      setProofFile(null);
      setProofOpen(false);
      await fetchClaim();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal upload bukti pembayaran");
    } finally {
      setProofUploading(false);
    }
  };

  return (
    <>
      <Reveal>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <Link href="/admin/claims" className="clay-button ghost size-small">
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
                  <p className="caption" style={{ color: "var(--warm-silver)", margin: 0 }}>
                    Nomor Klaim
                  </p>
                  <h1 className="card-heading" style={{ marginTop: 4, fontFamily: "var(--font-space-mono), monospace" }}>
                    {data.claim_no}
                  </h1>
                </div>
                <StatusBadge status={data.status} />
              </div>
              <p className="body" style={{ marginTop: 12, marginBottom: 0 }}>
                <strong style={{ fontSize: "1.5rem", color: "var(--ink)" }}>
                  {formatIdr(Number(data.claimed_amount))}
                </strong>{" "}
                <span style={{ color: "var(--warm-charcoal)" }}>· Klaim</span>
              </p>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="clay-card feature" style={{ marginBottom: 16 }}>
              <h2 className="section-heading" style={{ fontSize: "1.15rem", marginBottom: 16 }}>
                Detail Klaim
              </h2>
              <div className="clay-grid cols-2" style={{ gap: 20 }}>
                <Field label="Tipe Klaim">
                  <span className={`clay-badge ${CLAIM_TYPE_COLORS[data.claim_type] ?? "muted"}`}>
                    {CLAIM_TYPE_LABELS[data.claim_type] ?? data.claim_type}
                  </span>
                </Field>
                <Field label="Tanggal Insiden">{formatDate(data.incident_date)}</Field>
                <Field label="No. Polis" mono>
                  <Link
                    href={`/admin/policies/${data.policy_id}`}
                    style={{ color: "var(--ink)", textDecoration: "underline" }}
                  >
                    {data.policy_no}
                  </Link>
                </Field>
                <Field label="Tanggal Submit">{formatDateTime(data.submitted_at)}</Field>
                <Field label="Update Terakhir">{formatDateTime(data.updated_at)}</Field>
              </div>
              <div style={{ marginTop: 20 }}>
                <p
                  className="caption"
                  style={{
                    color: "var(--warm-silver)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    margin: 0,
                    marginBottom: 4,
                    fontSize: "0.7rem",
                  }}
                >
                  Kronologi (oleh Customer)
                </p>
                <p
                  className="body"
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    color: "var(--ink)",
                  }}
                >
                  {data.description}
                </p>
              </div>
            </div>
          </Reveal>

          {data.documents.length > 0 && (
            <Reveal delay={220}>
              <div className="clay-card feature" style={{ marginBottom: 16 }}>
                <h2 className="section-heading" style={{ fontSize: "1.15rem", marginBottom: 16 }}>
                  Dokumen Pendukung ({data.documents.length})
                </h2>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.documents.map((doc) => (
                    <li
                      key={doc.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: "var(--radius-sharp)",
                        background: "var(--honey-tint)",
                        border: "1px solid var(--oat-refined)",
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: 500, fontFamily: "var(--font-space-mono), monospace" }}>
                          {doc.file_name}
                        </p>
                        <p
                          className="caption"
                          style={{ margin: 0, color: "var(--warm-silver)" }}
                        >
                          Upload {formatDateTime(doc.uploaded_at)}
                        </p>
                      </div>
                      <a
                        href={`${API_BASE}/public/uploads/${doc.file_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="clay-button ghost size-small"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <ExternalLink size={12} /> Buka
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )}

          <Reveal delay={280}>
            <div className="clay-card feature" style={{ marginBottom: 16 }}>
              <h2 className="section-heading" style={{ fontSize: "1.15rem", marginBottom: 16 }}>
                Customer
              </h2>
              <div className="clay-grid cols-2" style={{ gap: 20 }}>
                <Field label="Nama">{data.customer_name}</Field>
                <Field label="Email">{data.customer_email ?? "—"}</Field>
              </div>
            </div>
          </Reveal>

          <Reveal delay={340}>
            <div className="clay-card feature" style={{ marginBottom: 16 }}>
              <h2 className="section-heading" style={{ fontSize: "1.15rem", marginBottom: 16 }}>
                Update Status
              </h2>
              <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
                <label>
                  <span
                    className="caption"
                    style={{
                      display: "block",
                      color: "var(--warm-silver)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontSize: "0.7rem",
                      marginBottom: 4,
                    }}
                  >
                    Status Klaim
                  </span>
                  <select
                    className="clay-select"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    disabled={patchSubmitting}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span
                    className="caption"
                    style={{
                      display: "block",
                      color: "var(--warm-silver)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontSize: "0.7rem",
                      marginBottom: 4,
                    }}
                  >
                    Catatan Keputusan
                  </span>
                  <textarea
                    className="clay-textarea"
                    rows={3}
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="cth: Disetujui sesuai polis. Pembayaran diproses."
                    disabled={patchSubmitting}
                  />
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="clay-button solid-honey"
                    onClick={submitPatch}
                    disabled={patchSubmitting || newStatus === data.status}
                  >
                    {patchSubmitting ? "Menyimpan..." : "Simpan Status"}
                  </button>
                  {data.status === "APPROVED" && (
                    <button
                      type="button"
                      className="clay-button outline-honey"
                      onClick={() => setProofOpen(true)}
                    >
                      <Upload size={14} /> Upload Bukti Bayar
                    </button>
                  )}
                  {data.status === "PAID" && data.payment_proof_path && (
                    <a
                      href={`${API_BASE}/public/uploads/${data.payment_proof_path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="clay-button ghost size-small"
                    >
                      <ExternalLink size={14} /> Lihat Bukti Pembayaran
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Reveal>

          {/* Custom modal untuk upload bukti bayar — `Confirm` component
              dari @insuretrack/ui punya body fixed (title + description
              saja) tanpa slot untuk file input, jadi render modal manual
              dengan input file di sini. Backdrop click tutup modal
              (kecuali sedang uploading). */}
          {proofOpen && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 50,
                display: "grid",
                placeItems: "center",
                background: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(2px)",
                padding: 16,
              }}
              onClick={() => !proofUploading && setProofOpen(false)}
            >
              <div
                className="clay-card feature"
                style={{ maxWidth: 480, width: "100%" }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="card-heading" style={{ fontSize: "1.25rem", marginBottom: 12 }}>
                  Upload Bukti Pembayaran
                </h3>
                <p className="caption" style={{ color: "var(--warm-charcoal)", marginBottom: 16 }}>
                  Pilih file PDF / JPG bukti transfer.
                </p>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  disabled={proofUploading}
                  style={{ width: "100%", marginBottom: 16 }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="clay-button ghost size-small"
                    onClick={() => setProofOpen(false)}
                    disabled={proofUploading}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    className="clay-button solid-honey size-small"
                    onClick={uploadProof}
                    disabled={!proofFile || proofUploading}
                  >
                    {proofUploading ? "Mengupload..." : "Upload"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}