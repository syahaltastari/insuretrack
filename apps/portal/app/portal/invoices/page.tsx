"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@insuretrack/ui";
import { API_BASE, formatProductPlan, apiFetch } from "@insuretrack/api-client";
import { Reveal, StaggerGroup } from "@/components/Reveal";

type Invoice = {
  id: string;
  invoice_no: string;
  registration_no: string;
  premium_amount: string;
  due_date: string;
  status: string;
  paid_at: string | null;
  pdf_path: string | null;
  created_at: string;
  /** "INDIVIDU" | "INSTANSI" — lihat 0013_group_registration.sql. */
  applicant_type: "INDIVIDU" | "INSTANSI";
  /** 1 untuk INDIVIDU, N untuk INSTANSI (di-compute di SQL). */
  participant_count: number;
  /** Kode produk — lihat registrations.product + migration 0018. */
  product: string;
  /** Composite plan code (mis. `"LIFE_BASIC"`) — nullable untuk rows lama. */
  plan_code: string | null;
};

type StatusFilter = "ALL" | "UNPAID" | "PAID" | "EXPIRED" | "CANCELLED";

const formatIDR = (n: number | string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(typeof n === "string" ? Number(n) : n);

export default function PortalInvoicesPage() {
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data?: Invoice[] }>("/customer/invoices?page=1&page_size=50")
      .then((j) => setData(j.data ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Hitung summary cards dari data — derived state, tidak fetch tambahan.
  const summary = useMemo(() => {
    const totalUnpaid = data
      .filter((i) => i.status === "UNPAID")
      .reduce((sum, i) => sum + Number(i.premium_amount), 0);
    const totalPaid = data
      .filter((i) => i.status === "PAID")
      .reduce((sum, i) => sum + Number(i.premium_amount), 0);
    const countUnpaid = data.filter((i) => i.status === "UNPAID").length;
    const countPaid = data.filter((i) => i.status === "PAID").length;
    return { totalUnpaid, totalPaid, countUnpaid, countPaid };
  }, [data]);

  // Filtered list — status filter chip di atas table.
  const visible = useMemo(() => {
    if (filter === "ALL") return data;
    return data.filter((i) => i.status === filter);
  }, [data, filter]);

  // Helper untuk bedain overdue (UNPAID & lewat due date) — kasih border
  // merah tipis di row (subtle, bukan full alert).
  const isOverdue = (inv: Invoice): boolean => {
    if (inv.status !== "UNPAID") return false;
    return new Date(inv.due_date) < new Date(new Date().toDateString());
  };

  const downloadFile = async (
    url: string,
    filename: string,
    setLoading: (id: string | null) => void,
    id: string,
  ) => {
    setLoading(id);
    try {
      // Pakai fetch langsung (bukan apiFetch) karena kita perlu raw
      // Response untuk blob. Cookie session di-attach otomatis via
      // `credentials: "include"`. URL sudah FULL (termasuk API_BASE).
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
      toast.success(`${filename} terdownload`);
    } catch {
      toast.error("Gagal download PDF");
    } finally {
      setLoading(null);
    }
  };

  const downloadPdf = (inv: Invoice) =>
    downloadFile(
      `${API_BASE}/customer/invoices/${inv.id}/pdf`,
      `${inv.invoice_no}.pdf`,
      setDownloadingId,
      inv.id,
    );

  const downloadReceipt = (inv: Invoice) =>
    downloadFile(
      `${API_BASE}/customer/invoices/${inv.id}/receipt`,
      `receipt-${inv.invoice_no}.pdf`,
      setDownloadingReceiptId,
      inv.id,
    );

  return (
    <>
      {/* Page header */}
      <Reveal>
        <p className="uppercase-label" style={{ color: "var(--honey-700)", marginBottom: 8 }}>
          ✦ Invoice Saya
        </p>
        <h1 className="page-title">Daftar Invoice</h1>
        <p className="page-subtitle">
          Lihat tagihan premi, jatuh tempo, dan download invoice PDF.
        </p>
      </Reveal>

      {/* Summary cards */}
      <StaggerGroup
        step={80}
        baseDelay={120}
        className="summary-grid"
      >
        <SummaryCard
          label="Total Tagihan (UNPAID)"
          value={formatIDR(summary.totalUnpaid)}
          accent="var(--lemon-700)"
        />
        <SummaryCard
          label="Total Terbayar (PAID)"
          value={formatIDR(summary.totalPaid)}
          accent="var(--matcha-600)"
        />
        <SummaryCard
          label="Invoice Belum Dibayar"
          value={`${summary.countUnpaid} invoice`}
          accent="var(--lemon-700)"
        />
        <SummaryCard
          label="Invoice Lunas"
          value={`${summary.countPaid} invoice`}
          accent="var(--matcha-600)"
        />
      </StaggerGroup>

      {/* Status filter chips */}
      <Reveal delay={520}>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {(["ALL", "UNPAID", "PAID", "EXPIRED", "CANCELLED"] as StatusFilter[]).map((f) => {
            const count = f === "ALL" ? data.length : data.filter((i) => i.status === f).length;
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={active ? "clay-button solid-honey size-small" : "clay-button ghost size-small"}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {f === "ALL" ? "Semua" : f}
                <span
                  style={{
                    padding: "1px 8px",
                    borderRadius: 999,
                    background: active ? "rgba(26,23,21,0.18)" : "var(--oat-light)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Reveal>

      {error && (
        <div
          className="clay-card"
          style={{
            borderColor: "var(--pomegranate-400)",
            background: "#fff5f5",
          }}
        >
          ⚠ {error}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {!loading && data.length === 0 && (
        <Reveal delay={150}>
          <div
            className="clay-card feature dashed"
            style={{ textAlign: "center", padding: 48 }}
          >
            <p
              className="body-large"
              style={{ color: "var(--warm-charcoal)", margin: 0, marginBottom: 8 }}
            >
              Anda belum memiliki invoice.
            </p>
            <p
              className="caption"
              style={{ color: "var(--warm-silver)", margin: 0 }}
            >
              Invoice akan muncul di sini setelah Anda submit pendaftaran asuransi.
            </p>
          </div>
        </Reveal>
      )}

      {!loading && visible.length === 0 && data.length > 0 && (
        <Reveal delay={150}>
          <div
            className="clay-card feature dashed"
            style={{ textAlign: "center", padding: 32 }}
          >
            <p
              className="body"
              style={{ color: "var(--warm-charcoal)", margin: 0 }}
            >
              Tidak ada invoice dengan status <strong>{filter}</strong>.
            </p>
          </div>
        </Reveal>
      )}

      {!loading && visible.length > 0 && (
        <Reveal delay={600}>
          <div className="clay-table-wrap">
            <table className="clay-table">
              <thead>
                <tr>
                  <th>No. Invoice</th>
                  <th>No. Reg</th>
                  <th>Produk</th>
                  <th>Tipe</th>
                  <th style={{ textAlign: "right" }}>Peserta</th>
                  <th style={{ textAlign: "right" }}>Premi</th>
                  <th>Jatuh Tempo</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right", minWidth: 160 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((inv) => (
                  <tr
                    key={inv.id}
                    style={
                      isOverdue(inv)
                        ? { background: "rgba(244, 165, 130, 0.08)" }
                        : undefined
                    }
                  >
                    <td className="mono">{inv.invoice_no}</td>
                    <td className="mono" style={{ color: "var(--warm-silver)" }}>
                      {inv.registration_no}
                    </td>
                    <td style={{ color: "var(--warm-charcoal)", fontSize: "0.85rem" }}>
                      {formatProductPlan(inv.product, inv.plan_code)}
                    </td>
                    <td>
                      <span
                        className={`clay-badge ${
                          inv.applicant_type === "INSTANSI" ? "blueberry" : "ube"
                        }`}
                      >
                        {inv.applicant_type === "INSTANSI" ? "Instansi" : "Individu"}
                      </span>
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {inv.participant_count}
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatIDR(inv.premium_amount)}
                    </td>
                    <td>
                      {inv.due_date}
                      {isOverdue(inv) && (
                        <span
                          className="clay-badge pomegranate"
                          style={{ marginLeft: 8, fontSize: "0.65rem" }}
                        >
                          Overdue
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {inv.pdf_path ? (
                          <button
                            onClick={() => downloadPdf(inv)}
                            disabled={downloadingId === inv.id}
                            className="clay-button ghost size-small"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                            title="Download invoice PDF"
                          >
                            {downloadingId === inv.id ? "Mengunduh..." : "📄 Invoice"}
                          </button>
                        ) : null}
                        {inv.status === "PAID" ? (
                          <button
                            onClick={() => downloadReceipt(inv)}
                            disabled={downloadingReceiptId === inv.id}
                            className="clay-button ghost size-small"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                            title="Download bukti pembayaran PDF"
                          >
                            {downloadingReceiptId === inv.id ? "Mengunduh..." : "🧾 Bukti Bayar"}
                          </button>
                        ) : null}
                        {!inv.pdf_path && inv.status !== "PAID" && (
                          <span className="caption" style={{ color: "var(--warm-silver)" }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="clay-card clay-card-hoverable"
      style={{
        padding: 20,
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <p
        className="caption"
        style={{
          color: "var(--warm-silver)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: 0,
          marginBottom: 4,
          fontSize: "0.7rem",
        }}
      >
        {label}
      </p>
      <p
        className="display-secondary"
        style={{
          color: "var(--ink)",
          margin: 0,
          fontSize: "1.5rem",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      className="clay-card"
      style={{
        height: 56,
        background: "var(--warm-cream)",
        animation: "skeleton-pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}
