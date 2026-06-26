"use client";

// PolicyCard — kartu display polis untuk halaman /portal/policies.
//
// Design rationale: ganti table dengan kartu breathable. Customer individu
// biasanya punya 1–2 polis → table terasa penuh/kaku. Kartu ini expose
// data inti (produk, status, UP sebagai anchor visual, premi, periode,
// tombol PDF) by default; detail tambahan (NIK peserta) tersembunyi di
// balik tombol "Lihat detail" sampai user butuh.
//
// Tone mapping (LIFE → matcha, HEALTH → ube, PA → slushie) disinkronkan
// dengan PolicyPicker.tsx dan lib/product-details.ts — lihat comment di
// masing-masing file untuk konsistensi palette.

import { useId, useState } from "react";
import { formatIdr } from "@insuretrack/api-client";
import { Icon, StatusBadge, type IconName } from "@insuretrack/ui";
import { getProductDetail } from "@/lib/product-details";

export type PolicyCardItem = {
  id: string;
  policy_no: string;
  product: string;
  sum_assured: string;
  premium: string;
  effective_date: string;
  expiry_date: string;
  status: string;
  pdf_path: string | null;
  /** Untuk policy Instansi: info peserta. NULL untuk Individu. */
  participant: { full_name: string; nik: string } | null;
};

// Warna icon-chip per produk. `bg` mengikuti `iconTone` di
// product-details.ts; `fg` adalah variant -800 dari family yang sama
// untuk kontras yang cukup di atas light bg.
const PRODUCT_CHIP: Record<string, { bg: string; fg: string }> = {
  LIFE: { bg: "var(--matcha-300)", fg: "var(--matcha-800)" },
  HEALTH: { bg: "var(--ube-300)", fg: "var(--ube-800)" },
  PERSONAL_ACCIDENT: { bg: "var(--slushie-500)", fg: "var(--slushie-800)" },
};

interface PolicyCardProps {
  policy: PolicyCardItem;
  onDownloadPdf: (id: string) => void;
}

export function PolicyCard({ policy, onDownloadPdf }: PolicyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const detail = getProductDetail(policy.product);
  const chip = PRODUCT_CHIP[policy.product] ?? { bg: "var(--oat-light)", fg: "var(--warm-charcoal)" };

  return (
    <article className="clay-card feature">
      {/* Header: identitas polis */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          aria-hidden
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: chip.bg,
            color: chip.fg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {detail && <Icon name={detail.icon as IconName} size="md" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>
            {detail?.name ?? policy.product}
          </div>
          <div
            className="mono"
            style={{ fontSize: "0.8rem", color: "var(--warm-silver)", marginTop: 2 }}
          >
            {policy.policy_no}
          </div>
        </div>
        <StatusBadge status={policy.status} />
      </div>

      {/* Pemisah dashed — konsisten dengan landing page hero */}
      <div
        aria-hidden
        style={{
          borderTop: "1px dashed var(--oat-border)",
          margin: "20px 0",
        }}
      />

      {/* Body: nilai polis sebagai anchor visual */}
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <div className="uppercase-label" style={{ color: "var(--warm-silver)", marginBottom: 4 }}>
            Uang Pertanggungan
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 600, lineHeight: 1.1 }}>
            {formatIdr(Number(policy.sum_assured))}
          </div>
        </div>
        <div>
          <div className="uppercase-label" style={{ color: "var(--warm-silver)", marginBottom: 4 }}>
            Premi
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 500 }}>
            {formatIdr(Number(policy.premium))}
          </div>
        </div>
      </div>

      {/* Periode */}
      <div style={{ marginTop: 16, color: "var(--warm-charcoal)" }}>
        <span className="mono">{policy.effective_date}</span>
        <span style={{ margin: "0 8px", color: "var(--warm-silver)" }}>→</span>
        <span className="mono">{policy.expiry_date}</span>
      </div>

      {/* Footer: aksi primer + expand toggle */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 24,
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        {policy.pdf_path ? (
          <button
            type="button"
            onClick={() => onDownloadPdf(policy.id)}
            className="clay-button solid-matcha size-small"
          >
            <Icon name="FileDown" size="sm" /> Download E-Policy
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={detailId}
          className="clay-button ghost size-small"
        >
          {expanded ? "Sembunyikan detail" : "Lihat detail"}
          <Icon name={expanded ? "ChevronUp" : "ChevronDown"} size="sm" />
        </button>
      </div>

      {/* Expand section: detail peserta, tersembunyi by default */}
      {expanded && (
        <div
          id={detailId}
          style={{
            marginTop: 20,
            paddingTop: 20,
            borderTop: "1px solid var(--oat-light)",
          }}
        >
          <div className="uppercase-label" style={{ color: "var(--warm-silver)", marginBottom: 8 }}>
            Peserta
          </div>
          {policy.participant ? (
            <>
              <div style={{ fontWeight: 500 }}>{policy.participant.full_name}</div>
              <div
                className="mono"
                style={{ fontSize: "0.85rem", color: "var(--warm-silver)", marginTop: 2 }}
              >
                {policy.participant.nik}
              </div>
            </>
          ) : (
            <div style={{ color: "var(--warm-charcoal)" }}>Tertanggung: diri sendiri</div>
          )}
        </div>
      )}
    </article>
  );
}