"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, Button } from "@insuretrack/ui";
import { API_BASE, apiFetch } from "@insuretrack/api-client";

type ProductConfig = {
  id: string;
  product_code: string;
  enabled: boolean;
  age_min: number;
  age_max: number;
  require_bmi: boolean;
  bmi_min: number | null;
  bmi_max: number | null;
  require_smoker: boolean;
  require_preexisting: boolean;
  created_at: string;
  updated_at: string;
};

type Tier = {
  id: string;
  product_code: string;
  tier_code: string;
  tier_name: string;
  premium_multiplier: number;
  criteria: unknown;
  display_order: number;
};

const PRODUCT_LABELS: Record<string, string> = {
  LIFE: "Life Insurance",
  PERSONAL_ACCIDENT: "Personal Accident",
  HEALTH: "Health Insurance",
};

export default function UnderwritingConfigPage() {
  const [configs, setConfigs] = useState<ProductConfig[]>([]);
  const [tiers, setTiers] = useState<Record<string, Tier[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ data: ProductConfig[] }>("/admin/underwriting/configs");
        setConfigs(data.data);
        // Load tiers for each product in parallel.
        const tierEntries = await Promise.all(
          data.data.map(async (cfg) => {
            const t = await apiFetch<{ data: Tier[] }>(
              `/admin/underwriting/tiers/${cfg.product_code}`,
            );
            return [cfg.product_code, t.data] as const;
          }),
        );
        setTiers(Object.fromEntries(tierEntries));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat konfigurasi");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleEnabled(cfg: ProductConfig) {
    try {
      const updated = await apiFetch<ProductConfig>(
        `/admin/underwriting/configs/${cfg.product_code}`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled: !cfg.enabled }),
        },
      );
      setConfigs((prev) =>
        prev.map((c) => (c.product_code === updated.product_code ? updated : c)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengupdate toggle");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-500">
        <Icon name="Loader2" className="animate-spin" /> Memuat konfigurasi…
      </div>
    );
  }
  if (error) {
    return <div className="text-pomegranate-700">Error: {error}</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="card-heading">Underwriting Configuration</h1>
          <p className="caption mt-1 text-stone-500">
            Atur per-product underwriting rules & loading tiers. Toggle untuk
            enable/disable questionnaire flow per produk.
          </p>
        </div>
        <Link
          href="/admin/underwriting/responses"
          className="text-sm text-honey-700 underline underline-offset-4"
        >
          Lihat Response Queue →
        </Link>
      </header>

      <div className="grid gap-4">
        {configs.map((cfg) => {
          const productTiers = tiers[cfg.product_code] ?? [];
          const labels = {
            ageRange: `${cfg.age_min}–${cfg.age_max} tahun`,
            bmiRange:
              cfg.require_bmi && cfg.bmi_min !== null && cfg.bmi_max !== null
                ? `${cfg.bmi_min}–${cfg.bmi_max}`
                : "—",
            smoker: cfg.require_smoker ? "Ya" : "Tidak",
            preexisting: cfg.require_preexisting ? "Ya" : "Tidak",
          };
          return (
            <article
              key={cfg.id}
              className="clay-card p-6"
              data-testid={`config-card-${cfg.product_code}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="feature-title">
                    {PRODUCT_LABELS[cfg.product_code] ?? cfg.product_code}
                  </h2>
                  <code className="caption text-stone-400">
                    {cfg.product_code}
                  </code>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="caption">
                    {cfg.enabled ? "Aktif" : "Non-aktif"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={cfg.enabled}
                    onClick={() => toggleEnabled(cfg)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      cfg.enabled ? "bg-honey-500" : "bg-stone-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        cfg.enabled ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </label>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 caption sm:grid-cols-4">
                <Stat label="Usia" value={labels.ageRange} />
                <Stat label="BMI" value={labels.bmiRange} />
                <Stat label="Status perokok" value={labels.smoker} />
                <Stat label="Pra-eksisting" value={labels.preexisting} />
              </dl>

              {productTiers.length > 0 && (
                <div className="mt-5 border-t border-oat-refined pt-4">
                  <h3 className="caption font-semibold uppercase text-stone-500">
                    Loading Tiers
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {productTiers.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="font-medium">{t.tier_name}</span>
                        <span className="mono text-stone-600">
                          ×{t.premium_multiplier.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="caption mt-4 text-stone-400">
                Last updated: {new Date(cfg.updated_at).toLocaleString("id-ID")}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}