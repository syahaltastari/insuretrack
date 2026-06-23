"use client";

// PolicyPicker — kartu polis untuk klaim baru. Mirip PlanPicker tapi
// vertical-stack (bukan grid), dan menampilkan polis existing user
// (no, produk, UP, coverage period, status) bukan plan tiers.
//
// Pattern: clay-radio-card (lihat packages/ui/src/styles/globals.css).
// Hidden <input type="radio"> di dalam <label> untuk a11y native
// (klik/tab/arrow keys handled browser, tanpa JS).
//
// Search input di atas memfilter list client-side (instan, tanpa fetch
// ulang) by policy_no / product label. Empty state: "Tidak ada polis
// yang cocok dengan pencarian".

import { useMemo, useState } from "react";
import { formatIdr } from "@insuretrack/api-client";
import { StatusBadge } from "@insuretrack/ui";
import { Search } from "lucide-react";

const PRODUCT_LABEL: Record<string, string> = {
  LIFE: "Asuransi Jiwa",
  HEALTH: "Asuransi Kesehatan",
  PERSONAL_ACCIDENT: "Asuransi Kecelakaan Diri",
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
      {/* Search input — sticky di atas list supaya user tidak perlu scroll
          ke atas untuk mencari polis. Tampil hanya kalau list > 3. */}
      {policies.length > 3 && (
        <label
          className="clay-form-field"
          style={{ marginBottom: 12, position: "relative" }}
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
          gap: 12,
          maxHeight: 320,
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
            return (
              <label
                key={p.id}
                className={`clay-card feature clay-radio-card${isSelected ? " selected" : ""}`}
                style={{
                  display: "block",
                  padding: 20,
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
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className="body-large"
                    style={{ margin: 0, fontWeight: 600, color: "var(--clay-black)" }}
                  >
                    {productName}
                  </span>
                  <StatusBadge status={p.status} />
                </div>
                <div
                  className="mono"
                  style={{ fontSize: "0.95rem", color: "var(--warm-charcoal)", marginBottom: 8 }}
                >
                  {p.policy_no}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "4px 16px",
                    fontSize: "0.85rem",
                  }}
                >
                  <span style={{ color: "var(--warm-silver)" }}>Uang Pertanggungan</span>
                  <span style={{ color: "var(--clay-black)", fontWeight: 600, textAlign: "right" }}>
                    {formatIdr(Number(p.sum_assured))}
                  </span>
                  <span style={{ color: "var(--warm-silver)" }}>Mulai</span>
                  <span style={{ color: "var(--warm-charcoal)", textAlign: "right" }}>
                    {formatDateShort(p.effective_date)}
                  </span>
                  <span style={{ color: "var(--warm-silver)" }}>Berakhir</span>
                  <span style={{ color: "var(--warm-charcoal)", textAlign: "right" }}>
                    {formatDateShort(p.expiry_date)}
                  </span>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}