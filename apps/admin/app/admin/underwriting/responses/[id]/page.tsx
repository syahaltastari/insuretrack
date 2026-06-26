"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Icon, Button } from "@insuretrack/ui";
import { apiFetch } from "@insuretrack/api-client";

type ResponseDetail = {
  id: string;
  registration_no: string;
  customer_name: string | null;
  product: string;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  is_smoker: boolean | null;
  has_preexisting: boolean | null;
  risk_tier: string;
  premium_multiplier: number;
  decision: string;
  decision_reason: string;
  overridden_by: string | null;
  overridden_at: string | null;
  override_tier: string | null;
  override_multiplier: number | null;
  override_notes: string | null;
  created_at: string;
};

const TIER_OPTIONS = [
  { code: "standard", label: "Approve Standard (1.0×)" },
  { code: "loaded", label: "Approve Loaded (1.25-1.30×)" },
  { code: "heavily_loaded", label: "Approve Heavy Load (1.50-1.75×)" },
  { code: "declined", label: "Decline Application" },
];

const TIER_COLORS: Record<string, "matcha" | "lemon" | "pomegranate" | "ube" | "muted"> = {
  standard: "matcha",
  loaded: "lemon",
  heavily_loaded: "pomegranate",
  declined: "ube",
};

export default function UnderwritingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<ResponseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overrideTier, setOverrideTier] = useState("standard");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<ResponseDetail>(
          `/admin/underwriting/responses/${id}`,
        );
        setData(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat detail");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function submitOverride() {
    if (!overrideNotes.trim()) {
      setError("Catatan override wajib diisi (audit trail).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/admin/underwriting/responses/${id}/override`, {
        method: "POST",
        body: JSON.stringify({
          override_tier: overrideTier,
          override_notes: overrideNotes,
        }),
      });
      // Refresh data.
      const res = await apiFetch<ResponseDetail>(
        `/admin/underwriting/responses/${id}`,
      );
      setData(res);
      setOverrideNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal submit override");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-500">
        <Icon name="Loader2" className="animate-spin" /> Memuat…
      </div>
    );
  }
  if (error && !data) {
    return <div className="text-pomegranate-700">Error: {error}</div>;
  }
  if (!data) return null;

  const effectiveTier = data.override_tier ?? data.risk_tier;
  const effectiveMult = data.override_multiplier ?? data.premium_multiplier;
  const wasOverridden = !!data.override_tier;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="card-heading">Detail Underwriting</h1>
          <p className="caption mt-1 text-stone-500">
            Registration <code className="mono">{data.registration_no}</code>
            {" · "} Customer{" "}
            <strong>{data.customer_name ?? "(tidak tersedia)"}</strong>
            {" · "} Product <code className="mono">{data.product}</code>
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/admin/underwriting/responses")}
          className="text-sm text-honey-700 underline underline-offset-4"
        >
          ← Kembali ke daftar
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Customer profile */}
        <section className="clay-card p-6">
          <h2 className="feature-title mb-4">Profil Customer</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Pair label="Usia" value={data.age ? `${data.age} tahun` : "—"} />
            <Pair label="Tinggi" value={data.height_cm ? `${data.height_cm} cm` : "—"} />
            <Pair label="Berat" value={data.weight_kg ? `${data.weight_kg} kg` : "—"} />
            <Pair
              label="BMI"
              value={data.bmi ? data.bmi.toFixed(1) : "—"}
            />
            <Pair
              label="Perokok"
              value={data.is_smoker === null ? "—" : data.is_smoker ? "Ya" : "Tidak"}
            />
            <Pair
              label="Pra-eksisting"
              value={data.has_preexisting === null ? "—" : data.has_preexisting ? "Ya" : "Tidak"}
            />
          </dl>
        </section>

        {/* Auto decision */}
        <section className="clay-card p-6">
          <h2 className="feature-title mb-4">Auto-Decision</h2>
          <div className="space-y-3">
            <div>
              <span className="caption uppercase text-stone-500">Risk Tier</span>
              <div className="mt-1">
                <span className={`clay-badge ${TIER_COLORS[data.risk_tier]}`}>
                  {data.risk_tier} · ×{data.premium_multiplier.toFixed(2)}
                </span>
              </div>
            </div>
            <div>
              <span className="caption uppercase text-stone-500">Decision</span>
              <p className="mt-1 font-semibold">
                {data.decision === "auto_approved" ? "Auto-Approved" : "Auto-Declined"}
              </p>
            </div>
            <div>
              <span className="caption uppercase text-stone-500">Alasan</span>
              <p className="mt-1 text-sm text-charcoal">{data.decision_reason}</p>
            </div>
            <div>
              <span className="caption uppercase text-stone-500">Submitted at</span>
              <p className="mt-1 caption text-stone-500">
                {new Date(data.created_at).toLocaleString("id-ID")}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Effective (post-override) */}
      <section className="clay-card p-6">
        <h2 className="feature-title mb-2">Keputusan Efektif</h2>
        <p className="caption mb-4 text-stone-500">
          Effective tier & multiplier yang dipakai sistem (override jika
          admin pernah override).
        </p>
        <div className="flex items-center gap-3">
          <span className={`clay-badge ${TIER_COLORS[effectiveTier]}`}>
            {effectiveTier} · ×{effectiveMult.toFixed(2)}
          </span>
          {wasOverridden && (
            <span className="caption text-honey-700">
              (overridden pada{" "}
              {new Date(data.overridden_at!).toLocaleString("id-ID")} oleh{" "}
              {data.overridden_by})
            </span>
          )}
        </div>
        {data.override_notes && (
          <div className="mt-4 rounded-md border border-oat-refined bg-paper p-3">
            <span className="caption uppercase text-stone-500">
              Catatan override
            </span>
            <p className="mt-1 text-sm">{data.override_notes}</p>
          </div>
        )}
      </section>

      {/* Override form */}
      <section className="clay-card p-6">
        <h2 className="feature-title mb-2">Override (jika perlu)</h2>
        <p className="caption mb-4 text-stone-500">
          Admin dapat mengubah keputusan sistem untuk aplikasi ini. Pilih
          tier preset — tidak bisa input multiplier custom. Catatan wajib
          diisi untuk audit trail.
        </p>
        <div className="space-y-4">
          <div>
            <label className="clay-label" htmlFor="override-tier">
              Tier
            </label>
            <select
              id="override-tier"
              value={overrideTier}
              onChange={(e) => setOverrideTier(e.target.value)}
              className="clay-select w-full"
              disabled={submitting}
            >
              {TIER_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="clay-label" htmlFor="override-notes">
              Catatan <span className="text-pomegranate-600">*</span>
            </label>
            <textarea
              id="override-notes"
              value={overrideNotes}
              onChange={(e) => setOverrideNotes(e.target.value)}
              className="clay-textarea w-full"
              rows={3}
              placeholder="Alasan override (wajib untuk audit)"
              disabled={submitting}
            />
          </div>
          {error && (
            <div className="caption text-pomegranate-700">{error}</div>
          )}
          <div className="flex justify-end gap-3">
            <Button
              onClick={submitOverride}
              disabled={submitting || !overrideNotes.trim()}
              className="solid-honey size-small"
            >
              {submitting ? "Menyimpan…" : "Apply Override"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="caption text-stone-500">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}