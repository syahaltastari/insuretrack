"use client";

// PolicyPicker — list polis compact untuk klaim baru.
//
// Design rationale: per-row 2-line layout (≈64-72px) menggantikan kartu
// multi-baris lama (≈150-180px). Untuk akun Instansi yang punya 20+ polis
// kolektif, layout lama membuat scroll-list melelahkan. Compact list + search
// memungkinkan user scan banyak opsi dengan cepat.
//
// Pattern: clay-radio-card (lihat packages/ui/src/styles/globals.css).
// Hidden <input type="radio"> di dalam <label> untuk a11y native.
// Search input di atas memfilter list client-side by policy_no / product
// label. Empty state: "Tidak ada polis yang cocok dengan pencarian".
//
// Warna dot produk: LIFE → matcha, HEALTH → slushie, PA → ube. Mapping
// disinkronkan dengan swatch palette produk di lib/product-details.ts.

import { useMemo, useState } from "react";
import { formatIdr } from "@insuretrack/api-client";
import { StatusBadge } from "@insuretrack/ui";
import { Check, Search } from "lucide-react";

const PRODUCT_LABEL: Record<string, string> = {
  LIFE: "Asuransi Jiwa",
  HEALTH: "Asuransi Kesehatan",
  PERSONAL_ACCIDENT: "Asuransi Kecelakaan Diri",
};

// Warna dot indikator produk. Pakai token CSS (bukan literal hex) supaya
// tetap konsisten kalau palette berubah.
const PRODUCT_DOT_COLOR: Record<string, string> = {
  LIFE: "var(--matcha-600)",
  HEALTH: "var(--slushie-500)",
  PERSONAL_ACCIDENT: "var(--ube-300)",
};

export type PolicyPickerItem = {
  id: string;
  policy_no: string;
  product: string;
  sum_assured: string;
  effective_date: string;
  expiry_date: string;
  status: string;
};

interface PolicyPickerProps {
  policies: PolicyPickerItem[];
  name: string;
  selectedPolicyId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  // iso YYYY-MM-DD → "10 Jun 2026"
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1] ?? "?"} ${parts[0]}`;
}

export function PolicyPicker({
  policies,
  name,
  selectedPolicyId,
  onChange,
  disabled,
}: PolicyPickerProps) {
  const [search, setSearch] = useState("");

  // Filter by policy_no / product label. NIK owner tidak ada di list ini
  // (polis customer JWT punya 1 owner), jadi tidak perlu.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return policies;
    return policies.filter((p) => {
      const label = PRODUCT_LABEL[p.product] ?? p.product;
      return (
        p.policy_no.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q)
      );
    });
  }, [policies, search]);

  if (policies.length === 0) {
    // Caller harus handle empty-list sendiri (lihat portal/claims/new).
    // Return null supaya tidak double-render empty state.
    return null;
  }

  return (
    <div>
      {/* Search input — tampil hanya kalau list > 3 supaya tidak memenuhi
          form untuk user dengan sedikit polis. */}
      {policies.length > 3 && (
        <label
          className="clay-form-field"
          style={{ marginBottom: 8, position: "relative" }}
        >
          <span className="clay-label" style={{ position: "absolute", left: -9999 }}>
            Cari polis
          </span>
          <span style={{ position: "relative", display: "block" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--warm-silver)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor polis atau produk..."
              className="clay-input"
              style={{ paddingLeft: 40 }}
              aria-label="Cari polis"
            />
          </span>
        </label>
      )}

      <div
        role="radiogroup"
        aria-label="Pilih polis untuk klaim"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          // maxHeight 360 → ~5-6 item compact terlihat per viewport,
          // supaya user bisa scan banyak opsi tanpa scroll berlebihan.
          maxHeight: 360,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {filtered.length === 0 ? (
          <div
            className="clay-card feature dashed"
            style={{ padding: 24, textAlign: "center" }}
          >
            <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
              Tidak ada polis yang cocok dengan pencarian.
            </p>
          </div>
        ) : (
          filtered.map((p) => {
            const isSelected = p.id === selectedPolicyId;
            const productName = PRODUCT_LABEL[p.product] ?? p.product;
            const dotColor = PRODUCT_DOT_COLOR[p.product] ?? "var(--warm-silver)";
            return (
              <label
                key={p.id}
                className={`clay-card feature clay-radio-card${isSelected ? " selected" : ""}`}
                style={{
                  display: "block",
                  padding: "12px 16px",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                <input
                  type="radio"
                  name={name}
                  value={p.id}
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => onChange(p.id)}
                  className="clay-radio-card-input"
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {/* Product color dot — sinyal visual cepat untuk scan
                      banyak polis (terutama akun Instansi dgn 20+ polis). */}
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: dotColor,
                      flexShrink: 0,
                      boxShadow: "0 0 0 2px var(--warm-cream)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Baris 1: nama produk (kiri) + status badge (kanan). */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span
                        className="body"
                        style={{
                          margin: 0,
                          fontWeight: 600,
                          color: "var(--clay-black)",
                          // Truncate kalau nama panjang — line-clamp 1.
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {productName}
                      </span>
                      <StatusBadge status={p.status} />
                    </div>
                    {/* Baris 2: meta — policy no (mono) · UP · date range. */}
                    <div
                      className="caption"
                      style={{
                        marginTop: 2,
                        color: "var(--warm-charcoal)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        className="mono"
                        style={{ color: "var(--clay-black)" }}
                      >
                        {p.policy_no}
                      </span>
                      <span aria-hidden="true" style={{ color: "var(--oat-border)" }}>·</span>
                      <span style={{ color: "var(--warm-charcoal)" }}>
                        {formatIdr(Number(p.sum_assured))}
                      </span>
                      <span aria-hidden="true" style={{ color: "var(--oat-border)" }}>·</span>
                      <span style={{ color: "var(--warm-silver)" }}>
                        {formatDateShort(p.effective_date)} → {formatDateShort(p.expiry_date)}
                      </span>
                    </div>
                  </div>
                  {/* Check icon — tampil hanya saat selected. Memberi
                      feedback visual yang lebih jelas dari outline saja. */}
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        background: "var(--matcha-600)",
                        color: "var(--pure-white)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
