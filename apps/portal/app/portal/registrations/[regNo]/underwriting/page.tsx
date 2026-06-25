"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Icon, Button } from "@insuretrack/ui";
import { apiFetch } from "@insuretrack/api-client";

type UnderwritingConfig = {
  product_code: string;
  enabled: boolean;
  age_min: number;
  age_max: number;
  require_bmi: boolean;
  bmi_min: number | null;
  bmi_max: number | null;
  require_smoker: boolean;
  require_preexisting: boolean;
};

type Registration = {
  registration_no: string;
  product: string;
  status: string;
  underwriting_status: string;
};

type Assessment = {
  risk_tier: string;
  premium_multiplier: number;
  decision: string;
  decision_reason: string;
  bmi: number | null;
  assessment_id: string;
};

const TIER_INFO: Record<string, { label: string; color: string; bg: string }> = {
  standard: { label: "Standar", color: "matcha", bg: "bg-matcha-100" },
  loaded: { label: "Loaded", color: "lemon", bg: "bg-lemon-100" },
  heavily_loaded: { label: "Risiko Tinggi", color: "pomegranate", bg: "bg-pomegranate-100" },
  declined: { label: "Ditolak", color: "ube", bg: "bg-ube-100" },
};

export default function UnderwritingQuestionnairePage() {
  const params = useParams();
  const router = useRouter();
  const regNo = params.regNo as string;

  const [reg, setReg] = useState<Registration | null>(null);
  const [config, setConfig] = useState<UnderwritingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state.
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [isSmoker, setIsSmoker] = useState<boolean | null>(null);
  const [hasPreexisting, setHasPreexisting] = useState<boolean | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 1. Get registration to find product.
        const regData = await apiFetch<{ data: Registration }>(
          `/public/registrations/${regNo}`,
        );
        setReg(regData.data);

        // 2. Get underwriting config for the product.
        try {
          const cfgData = await apiFetch<{ data: UnderwritingConfig }>(
            `/public/underwriting/${regData.data.product}/config`,
          );
          setConfig(cfgData.data);
        } catch {
          setError(
            `Produk ${regData.data.product} tidak memerlukan underwriting.`,
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat data");
      } finally {
        setLoading(false);
      }
    })();
  }, [regNo]);

  function computedBmi(): number | null {
    const h = parseFloat(heightCm);
    const w = parseFloat(weightKg);
    if (!h || !w) return null;
    return Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
  }

  function validateForm(): string | null {
    if (!config) return "Konfigurasi underwriting belum dimuat";
    const ageNum = parseInt(age, 10);
    if (!ageNum || ageNum < config.age_min || ageNum > config.age_max) {
      return `Usia harus ${config.age_min}–${config.age_max} tahun`;
    }
    if (config.require_bmi) {
      const h = parseFloat(heightCm);
      const w = parseFloat(weightKg);
      if (!h || h < 100 || h > 250) return "Tinggi badan 100–250 cm";
      if (!w || w < 30 || w > 300) return "Berat badan 30–300 kg";
    }
    if (config.require_smoker && isSmoker === null) {
      return "Mohon konfirmasi status perokok";
    }
    if (config.require_preexisting && hasPreexisting === null) {
      return "Mohon konfirmasi kondisi pra-eksisting";
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: Assessment }>(
        `/public/underwriting/${regNo}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            age: parseInt(age, 10),
            height_cm: heightCm ? parseFloat(heightCm) : undefined,
            weight_kg: weightKg ? parseFloat(weightKg) : undefined,
            is_smoker: isSmoker ?? undefined,
            has_preexisting: hasPreexisting ?? undefined,
          }),
        },
      );
      setAssessment(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim kuesioner");
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

  if (error && !reg) {
    return (
      <div className="clay-card p-6">
        <h1 className="card-heading text-pomegranate-700">Error</h1>
        <p className="mt-2 caption">{error}</p>
        <Link href="/portal/insurance/new" className="mt-4 inline-block text-sm text-honey-700 underline">
          ← Kembali
        </Link>
      </div>
    );
  }

  if (!reg || !config) return null;

  // === ASSESSMENT RESULT VIEW ===
  if (assessment) {
    const tier = TIER_INFO[assessment.risk_tier] ?? TIER_INFO.standard;
    const isDeclined = assessment.decision === "auto_declined";
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="display-secondary">Hasil Penilaian Risiko</h1>
          <p className="caption mt-2 text-stone-500">
            Berdasarkan informasi yang Anda berikan, sistem kami menentukan
            kategori risiko sebagai berikut.
          </p>
        </header>

        <article className={`clay-card p-6 ${tier.bg}`}>
          <div className="flex items-baseline justify-between">
            <h2 className="feature-title">Kategori: {tier.label}</h2>
            <span className="mono text-2xl font-bold">
              ×{assessment.premium_multiplier.toFixed(2)}
            </span>
          </div>
          <p className="mt-2 text-sm text-charcoal">
            {assessment.decision_reason}
          </p>
          {assessment.bmi !== null && (
            <p className="mt-2 caption text-stone-500">
              BMI Anda: {assessment.bmi.toFixed(1)}
            </p>
          )}
        </article>

        {isDeclined ? (
          <div className="clay-card section p-8 text-center">
            <Icon name="ShieldX" className="mx-auto h-12 w-12 text-ube-700" />
            <h2 className="card-heading mt-4">
              Mohon maaf, kami tidak dapat memproses pendaftaran ini
            </h2>
            <p className="caption mt-2 text-stone-500">
              Berdasarkan profil risiko Anda, polis ini tidak dapat
              diterbitkan. Hubungi customer service untuk konsultasi produk
              alternatif.
            </p>
            <Link
              href="/portal/insurance/new"
              className="mt-6 inline-block text-sm text-honey-700 underline"
            >
              ← Kembali ke pendaftaran
            </Link>
          </div>
        ) : (
          <div className="clay-card p-6 text-center">
            <p className="caption text-stone-500">
              Lanjut ke pembayaran invoice untuk mengaktifkan polis.
            </p>
            <Link
              href={`/portal/invoices`}
              className="mt-4 inline-block"
            >
              <Button className="solid-honey">
                Lanjut ke Pembayaran →
              </Button>
            </Link>
          </div>
        )}
      </div>
    );
  }

  // === FORM VIEW ===
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="display-secondary">Kuesioner Underwriting</h1>
        <p className="caption mt-2 text-stone-500">
          Mohon isi informasi berikut untuk penilaian risiko. Data Anda
          aman dan hanya digunakan untuk menentukan premi yang sesuai.
        </p>
        <p className="caption mt-1 text-stone-400">
          Registration <code className="mono">{regNo}</code> · Product{" "}
          <code className="mono">{reg.product}</code>
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="clay-card space-y-5 p-6"
      >
        <div>
          <label htmlFor="uw-age" className="clay-label">
            Usia (tahun) <span className="text-pomegranate-600">*</span>
          </label>
          <input
            id="uw-age"
            type="number"
            min={config.age_min}
            max={config.age_max}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="clay-input"
            placeholder={`${config.age_min}–${config.age_max}`}
            required
          />
        </div>

        {config.require_bmi && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="uw-height" className="clay-label">
                Tinggi (cm) <span className="text-pomegranate-600">*</span>
              </label>
              <input
                id="uw-height"
                type="number"
                min={100}
                max={250}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="clay-input"
                placeholder="contoh: 170"
                required
              />
            </div>
            <div>
              <label htmlFor="uw-weight" className="clay-label">
                Berat (kg) <span className="text-pomegranate-600">*</span>
              </label>
              <input
                id="uw-weight"
                type="number"
                min={30}
                max={300}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="clay-input"
                placeholder="contoh: 70"
                required
              />
            </div>
            {computedBmi() !== null && (
              <div className="col-span-2 caption text-stone-500">
                BMI otomatis: <strong>{computedBmi()?.toFixed(1)}</strong>
              </div>
            )}
          </div>
        )}

        {config.require_smoker && (
          <div>
            <span className="clay-label">
              Apakah Anda perokok? <span className="text-pomegranate-600">*</span>
            </span>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setIsSmoker(false)}
                className={`clay-button size-small ${
                  isSmoker === false ? "solid-honey" : "outline-honey"
                }`}
              >
                Tidak
              </button>
              <button
                type="button"
                onClick={() => setIsSmoker(true)}
                className={`clay-button size-small ${
                  isSmoker === true ? "solid-honey" : "outline-honey"
                }`}
              >
                Ya
              </button>
            </div>
          </div>
        )}

        {config.require_preexisting && (
          <div>
            <span className="clay-label">
              Apakah Anda memiliki kondisi kesehatan pra-eksisting?{" "}
              <span className="text-pomegranate-600">*</span>
            </span>
            <p className="caption mt-1 text-stone-500">
              Misal: diabetes, hipertensi, penyakit jantung, asma kronis, dll.
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setHasPreexisting(false)}
                className={`clay-button size-small ${
                  hasPreexisting === false ? "solid-honey" : "outline-honey"
                }`}
              >
                Tidak
              </button>
              <button
                type="button"
                onClick={() => setHasPreexisting(true)}
                className={`clay-button size-small ${
                  hasPreexisting === true ? "solid-honey" : "outline-honey"
                }`}
              >
                Ya
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-pomegranate-300 bg-pomegranate-50 p-3 caption text-pomegranate-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-oat-refined pt-4">
          <Link
            href="/portal/insurance/new"
            className="caption text-stone-500 underline"
          >
            ← Batal
          </Link>
          <Button
            type="submit"
            disabled={submitting}
            className="solid-honey"
          >
            {submitting ? "Mengirim…" : "Kirim & Lihat Hasil →"}
          </Button>
        </div>
      </form>

      <p className="caption text-stone-400">
        <Icon name="Info" size="xs" className="mr-1 inline" />
        Informasi Anda dienkripsi dan hanya dilihat oleh sistem otomatis
        untuk penentuan premi.
      </p>
    </div>
  );
}