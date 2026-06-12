"use client";

// PlanPicker: 3-card radio group untuk pilih tier (Basic/Standard/Premium).
// UP & premi tampil otomatis per plan. Aksesibel via native `<input type=radio>`
// di dalam `<label>` — klik/tab/arrow keys semua handled native, tanpa JS.
//
// Props:
//   - plans: daftar plan untuk 1 produk (biasanya 3 tier).
//   - name: nama form field — di-bind ke RHF `register("plan_code")`.
//   - selectedPlanCode: plan yang sedang dipilih (controlled).
//   - onChange: dipanggil saat user pilih plan baru.
//   - recommendedTier: tier yang ditampilkan dengan badge "Direkomendasikan"
//     (default "STANDARD").
//   - disabled: disable semua card.

import { formatIdr } from "@insuretrack/api-client";
import type { ProductPlan, TierCode } from "@insuretrack/api-client";

interface PlanPickerProps {
  plans: ProductPlan[];
  name: string;
  selectedPlanCode: string;
  onChange: (planCode: string) => void;
  recommendedTier?: TierCode;
  disabled?: boolean;
}

export function PlanPicker({
  plans,
  name,
  selectedPlanCode,
  onChange,
  recommendedTier = "STANDARD",
  disabled = false,
}: PlanPickerProps) {
  return (
    <div
      className="clay-form-grid cols-3"
      role="radiogroup"
      aria-label="Pilih plan asuransi"
    >
      {plans.map((plan) => {
        const isSelected = plan.code === selectedPlanCode;
        const isRecommended = plan.tier === recommendedTier;
        return (
          <label
            key={plan.code}
            className={`clay-card feature clay-radio-card${isSelected ? " selected" : ""}`}
            style={{ display: "block", padding: 24, cursor: disabled ? "not-allowed" : "pointer" }}
          >
            <input
              type="radio"
              name={name}
              value={plan.code}
              checked={isSelected}
              disabled={disabled}
              onChange={() => onChange(plan.code)}
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
                marginBottom: 12,
              }}
            >
              <span className="card-heading" style={{ margin: 0 }}>
                {plan.name}
              </span>
              {isRecommended && (
                <span className="clay-badge matcha" aria-label="Plan direkomendasikan">
                  Direkomendasikan
                </span>
              )}
            </div>
            <div
              className="display-secondary"
              style={{ marginBottom: 4, color: "var(--clay-black)" }}
            >
              {formatIdr(plan.sum_assured)}
            </div>
            <div
              className="caption"
              style={{ color: "var(--warm-silver)", marginBottom: 16 }}
            >
              Uang pertanggungan
            </div>
            <div
              className="body"
              style={{ marginBottom: 4, color: "var(--warm-charcoal)" }}
            >
              <strong>{formatIdr(plan.monthly_premium)}</strong>
              <span style={{ color: "var(--warm-silver)" }}> / bulan</span>
            </div>
            <div
              className="caption"
              style={{ color: "var(--warm-silver)", marginBottom: 12 }}
            >
              Premi (untuk masa pertanggungan yang dipilih)
            </div>
            <p
              className="small"
              style={{ color: "var(--warm-charcoal)", margin: 0 }}
            >
              {plan.description}
            </p>
          </label>
        );
      })}
    </div>
  );
}
