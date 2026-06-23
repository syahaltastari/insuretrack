"use client";

/**
 * Instansi form (group registration) — 4 tabs:
 *   1. Data Instansi    (company info)
 *   2. Informasi Asuransi (product/plan/term — shared by all peserta)
 *   3. Data Peserta     (editable table + import CSV/Excel)
 *   4. Konfirmasi       (review summary)
 *
 * State: own RHF instance for institution + plan fields, plus a
 * separate `participants` array (controlled, not in RHF) yang di-update
 * via ParticipantTable & ParticipantImport callbacks.
 *
 * Submit: POST /api/customer/registrations (multipart, same endpoint as
 * Individu — backend discriminates via `applicant_type` field).
 *
 * Error handling: pakai mapSubmitError + ResultDialog (modal alert) —
 * error network, server, dan validation ditampilkan via modal. Inline
 * FormError tidak dipakai (konsisten dengan pattern di Individu form).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  API_BASE,
  ApiError,
  formatIdr,
  getCustomerToken,
  type ApplicantType,
  type ParticipantData,
  type ProductCatalogData,
  type ProductCode,
  type ProductPlan,
} from "@insuretrack/api-client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@insuretrack/ui";
import { Form, FormField } from "@insuretrack/forms";
import { PlanPicker } from "@/components/PlanPicker";
import { ParticipantTable } from "@/components/registration/ParticipantTable";
import { ParticipantImport } from "@/components/registration/ParticipantImport";
import { ResultDialog } from "@/components/registration/ResultDialog";
import { IDLE, mapSubmitError, type ResultState } from "@/lib/submit-error";

type TabKey = "institution" | "plan" | "peserta" | "konfirmasi";

// Schema untuk field RHF: institution + plan + term.
// Peserta di-handle terpisah (controlled state di parent) karena
// array-nya dinamis dan RHF untuk array of objects lebih cocok
// pakai useFieldArray (overkill untuk MVP — pakai state biasa).
const instansiSchema = z.object({
  company_name: z.string().trim().min(1, "Nama instansi wajib diisi").max(200),
  company_npwp: z.string().trim().optional().or(z.literal("")),
  company_industry: z.string().trim().optional().or(z.literal("")),
  // Representative (yang submit) — fields minimal yang backend butuhkan
  // (NIK, nama, email, HP). Sisanya (alamat, dll.) di customers.* existing.
  rep_nik: z.string().trim().regex(/^\d{16}$/, "NIK harus 16 digit"),
  rep_full_name: z.string().trim().min(1, "Nama wajib diisi").max(120),
  rep_email: z.string().trim().email("Email tidak valid"),
  rep_mobile: z.string().trim().regex(/^\d{10,15}$/, "HP 10-15 digit"),
  // Plan info (shared by all peserta)
  plan_code: z.string().min(1, "Pilih plan terlebih dahulu"),
  coverage_term: z.coerce
    .number({ invalid_type_error: "Masa pertanggungan harus angka" })
    .int()
    .positive()
    .max(50, "Maksimal 50 tahun"),
});
type InstansiValues = z.infer<typeof instansiSchema>;

interface InstansiFormProps {
  catalog: ProductCatalogData | null;
  catalogError: string | null;
  selectedProduct: ProductCode;
  onSelectProduct: (p: ProductCode) => void;
  visiblePlans: ProductPlan[];
  portalStatus: string | null;
}

export function InstansiForm({
  catalog,
  catalogError,
  selectedProduct,
  onSelectProduct,
  visiblePlans,
  portalStatus,
}: InstansiFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("institution");
  const [participants, setParticipants] = useState<ParticipantData[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    { registration_no: string; invoice_no: string } | null
  >(null);
  const [resultDialog, setResultDialog] = useState<ResultState>(IDLE);

  const methods = useForm<InstansiValues>({
    resolver: zodResolver(instansiSchema) as never,
    defaultValues: {
      company_name: "",
      company_npwp: "",
      company_industry: "",
      rep_nik: "",
      rep_full_name: "",
      rep_email: "",
      rep_mobile: "",
      plan_code: "",
      coverage_term: 10,
    },
    mode: "onBlur",
  });

  // Auto-select plan pertama saat catalog/produk berubah (sama seperti Individu form).
  useEffect(() => {
    if (visiblePlans.length === 0) return;
    const current = methods.getValues("plan_code");
    const stillValid = visiblePlans.some((p) => p.code === current);
    if (!stillValid) {
      methods.setValue("plan_code", visiblePlans[0].code, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePlans]);

  // Per-tab state — 'valid' | 'invalid' | 'empty'. 'konfirmasi' adalah
  // review step, selalu 'empty' (tidak butuh checkmark). 'peserta'
  // pakai state lokal (bukan RHF) jadi cek participants.length manual.
  // Dipakai untuk render icon ✓/⚠ di tab trigger + submit-guard.
  const watched = methods.watch();
  const errors = methods.formState.errors;
  const getTabState = (key: TabKey): "valid" | "invalid" | "empty" => {
    if (key === "konfirmasi") return "empty";
    if (key === "peserta") {
      if (participants.length === 0) return "empty";
      return "valid";
    }
    if (key === "institution") {
      const hasError = Boolean(
        errors.company_name ||
          errors.rep_nik ||
          errors.rep_full_name ||
          errors.rep_email ||
          errors.rep_mobile,
      );
      if (hasError) return "invalid";
      const allFilled = Boolean(
        watched.company_name?.trim() &&
          watched.rep_nik?.trim() &&
          watched.rep_full_name?.trim() &&
          watched.rep_email?.trim() &&
          watched.rep_mobile?.trim(),
      );
      return allFilled ? "valid" : "empty";
    }
    // plan
    if (errors.plan_code || errors.coverage_term) return "invalid";
    return watched.plan_code && watched.coverage_term ? "valid" : "empty";
  };

  // Order tetap + label untuk findFirstInvalidTab + ResultDialog.
  const TAB_ORDER: readonly TabKey[] = ["institution", "plan", "peserta", "konfirmasi"];
  const TAB_LABELS: Record<TabKey, string> = {
    institution: "Data Instansi",
    plan: "Informasi Asuransi",
    peserta: "Data Peserta",
    konfirmasi: "Konfirmasi",
  };
  const findFirstInvalidTab = (): TabKey | null => {
    for (const t of TAB_ORDER) {
      if (getTabState(t) === "invalid") return t;
    }
    return null;
  };

  // Enter-key submit handler (sama dengan Individu form).
  useEffect(() => {
    const count = methods.formState.submitCount;
    if (count > 0 && !methods.formState.isValid) {
      const firstBad = findFirstInvalidTab();
      if (firstBad) {
        setActiveTab(firstBad);
        setResultDialog({
          kind: "warning",
          title: `Tab "${TAB_LABELS[firstBad]}" belum lengkap`,
          description: "Perbaiki field yang ditandai (ikon ⚠), lalu kirim ulang.",
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methods.formState.submitCount]);

  // Show beneficiary column only for LIFE
  const isLife = selectedProduct === "LIFE";
  const selectedPlan = visiblePlans.find((p) => p.code === watched.plan_code);
  const totalPerParticipant = selectedPlan ? selectedPlan.monthly_premium * 12 * (watched.coverage_term || 0) : 0;
  const totalPremium = totalPerParticipant * participants.length;

  const onSubmit = async (values: InstansiValues) => {
    if (participants.length === 0) {
      setResultDialog({
        kind: "warning",
        title: "Tambah peserta terlebih dahulu",
        description:
          "Pendaftaran Instansi membutuhkan minimal 1 peserta. Tambahkan peserta secara manual atau import dari CSV/Excel.",
      });
      setActiveTab("peserta");
      return;
    }
    setSubmitting(true);
    setResultDialog(IDLE);
    const token = getCustomerToken();
    if (!token) {
      router.replace("/portal/login?next=/portal/insurance/new");
      return;
    }
    try {
      const fd = new FormData();
      fd.append(
        "data",
        JSON.stringify({
          applicant_type: "INSTANSI" as ApplicantType,
          // Representative data (yang login & submit) — required fields
          // (NIK, nama, email, HP) dipakai backend untuk validasi.
          // Sisanya (alamat, dll) di customers.* existing, jadi tidak
          // perlu dikirim di request.
          nik: values.rep_nik,
          full_name: values.rep_full_name,
          birth_place: "",
          birth_date: "1970-01-01", // dummy — backend skip validate untuk INSTANSI
          gender: "MALE",
          address: "",
          rt_rw: "",
          village: "",
          district: "",
          city: "",
          province: "",
          postal_code: "",
          email: values.rep_email,
          mobile_number: values.rep_mobile,
          company_name: values.company_name,
          company_npwp: values.company_npwp || undefined,
          company_industry: values.company_industry || undefined,
          plan_code: values.plan_code,
          coverage_term: Number(values.coverage_term),
          participants,
        }),
      );
      // No id_card file untuk Instansi (KTP per peserta belum di-upload
      // di MVP — bisa ditambah di iterasi berikut).
      const r = await fetch(`${API_BASE}/customer/registrations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new ApiError(
          r.status,
          json?.error?.code ?? "ERR",
          json?.error?.message ?? "Gagal submit registrasi.",
        );
      }
      setResult({ registration_no: json.registration_no, invoice_no: json.invoice_no });
    } catch (err) {
      setResultDialog(mapSubmitError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <main
        className="clay-section"
        style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
      >
        <div className="clay-container" style={{ maxWidth: 640 }}>
          <div className="clay-card feature swatch-matcha">
            <h1
              className="display-secondary"
              style={{ color: "var(--pure-white)", marginBottom: 16, fontSize: "2rem" }}
            >
              ✓ Pendaftaran Berhasil
            </h1>
            <p className="body-large" style={{ color: "var(--matcha-300)" }}>
              Invoice untuk {participants.length} peserta telah dibuat. Cek email untuk
              instruksi pembayaran.
            </p>
          </div>
          <div className="clay-card feature" style={{ marginTop: 24 }}>
            <p className="caption" style={{ color: "var(--warm-charcoal)" }}>
              <strong>No. Registrasi:</strong>{" "}
              <span className="mono">{result.registration_no}</span>
            </p>
            <p className="caption" style={{ color: "var(--warm-charcoal)", marginTop: 8 }}>
              <strong>No. Invoice:</strong>{" "}
              <span className="mono">{result.invoice_no}</span>
            </p>
            <p
              className="caption"
              style={{ color: "var(--warm-charcoal)", marginTop: 16 }}
            >
              Mode development: trigger webhook via curl untuk aktivasi polis (lihat
              README).
            </p>
            <button
              onClick={() => router.push("/portal/dashboard")}
              className="clay-button solid-ube"
              style={{ marginTop: 16 }}
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <Form methods={methods} onSubmit={onSubmit} style={{ display: "grid", gap: 32 }}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabKey)}
      >
        <TabsList aria-label="Bagian form pendaftaran Instansi">
          <TabsTrigger value="institution">
            Data Instansi
            {getTabState("institution") === "valid" && (
              <span className="clay-tabs-check" aria-label="Lengkap">✓</span>
            )}
            {getTabState("institution") === "invalid" && (
              <span
                className="clay-tabs-warn"
                aria-label="Belum lengkap"
                title="Tab ini belum lengkap"
              >
                ⚠
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="plan">
            Informasi Asuransi
            {getTabState("plan") === "valid" && (
              <span className="clay-tabs-check" aria-label="Lengkap">✓</span>
            )}
            {getTabState("plan") === "invalid" && (
              <span
                className="clay-tabs-warn"
                aria-label="Belum lengkap"
                title="Tab ini belum lengkap"
              >
                ⚠
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="peserta">
            Data Peserta ({participants.length})
            {getTabState("peserta") === "valid" && (
              <span className="clay-tabs-check" aria-label="Lengkap">✓</span>
            )}
            {getTabState("peserta") === "invalid" && (
              <span
                className="clay-tabs-warn"
                aria-label="Belum lengkap"
                title="Tab ini belum lengkap"
              >
                ⚠
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="konfirmasi">Konfirmasi</TabsTrigger>
        </TabsList>

        {/* ===== TAB 1: Data Instansi ===== */}
        <TabsContent value="institution">
          <section className="clay-card feature">
            <h2
              className="feature-title"
              style={{
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: "1px dashed var(--oat-border)",
              }}
            >
              Data Instansi
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 24,
              }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <FormField label="Nama Instansi / Perusahaan" name="company_name" required>
                  <input
                    className="clay-input"
                    placeholder="cth: PT ABC Indonesia"
                    {...methods.register("company_name")}
                  />
                </FormField>
              </div>
              <FormField label="NPWP (opsional)" name="company_npwp" hint="15-16 digit">
                <input
                  className="clay-input"
                  placeholder="cth: 01.234.567.8-901.000"
                  {...methods.register("company_npwp")}
                />
              </FormField>
              <FormField label="Bidang Usaha (opsional)" name="company_industry">
                <input
                  className="clay-input"
                  placeholder="cth: Manufaktur, IT, Pendidikan"
                  {...methods.register("company_industry")}
                />
              </FormField>
            </div>

            <h3
              className="card-heading"
              style={{ marginBottom: 12, fontSize: "1.05rem" }}
            >
              Data Perwakilan (yang submit)
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <FormField label="NIK Perwakilan" name="rep_nik" required>
                <input
                  className="clay-input"
                  inputMode="numeric"
                  maxLength={16}
                  {...methods.register("rep_nik")}
                />
              </FormField>
              <FormField label="Nama Lengkap" name="rep_full_name" required>
                <input
                  className="clay-input"
                  {...methods.register("rep_full_name")}
                />
              </FormField>
              <FormField label="Email" name="rep_email" required>
                <input
                  className="clay-input"
                  type="email"
                  {...methods.register("rep_email")}
                />
              </FormField>
              <FormField label="Nomor HP" name="rep_mobile" required hint="10-15 digit">
                <input
                  className="clay-input"
                  type="tel"
                  inputMode="tel"
                  {...methods.register("rep_mobile")}
                />
              </FormField>
            </div>
          </section>
        </TabsContent>

        {/* ===== TAB 2: Informasi Asuransi (shared by all peserta) ===== */}
        <TabsContent value="plan">
          <section className="clay-card feature">
            <h2
              className="feature-title"
              style={{
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: "1px dashed var(--oat-border)",
              }}
            >
              Informasi Asuransi
            </h2>
            <p
              className="caption"
              style={{ color: "var(--warm-charcoal)", marginBottom: 16 }}
            >
              Produk, plan, dan masa pertanggungan berlaku untuk semua peserta
              dalam grup ini. Kalau peserta butuh plan berbeda, pisahkan jadi 2
              registrasi terpisah.
            </p>

            <div
              role="tablist"
              aria-label="Pilih produk asuransi"
              style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}
            >
              {(catalog?.products ?? [
                { code: "LIFE" as ProductCode, name: "Life Insurance", description: "" },
                {
                  code: "PERSONAL_ACCIDENT" as ProductCode,
                  name: "Personal Accident Insurance",
                  description: "",
                },
                { code: "HEALTH" as ProductCode, name: "Health Insurance", description: "" },
              ]).map((p) => {
                const isActive = p.code === selectedProduct;
                return (
                  <button
                    key={p.code}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      onSelectProduct(p.code);
                      methods.setValue("plan_code", "", { shouldValidate: true });
                    }}
                    className={`clay-button ${isActive ? "solid-ube" : "ghost"} size-small`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>

            <FormField label="Plan" name="plan_code" required>
              {catalogError ? (
                <div
                  className="clay-card"
                  style={{
                    padding: 16,
                    borderColor: "var(--pomegranate-400)",
                    background: "#fff5f5",
                    color: "var(--pomegranate-400)",
                  }}
                  role="alert"
                >
                  {catalogError}
                </div>
              ) : !catalog ? (
                <div
                  className="clay-card"
                  style={{ padding: 16, color: "var(--warm-silver)", textAlign: "center" }}
                >
                  Memuat plan…
                </div>
              ) : (
                <PlanPicker
                  plans={visiblePlans}
                  name="plan_code"
                  selectedPlanCode={watched.plan_code ?? ""}
                  onChange={(code) =>
                    methods.setValue("plan_code", code, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                />
              )}
            </FormField>

            <div style={{ marginTop: 16 }}>
              <FormField
                label="Masa Pertanggungan (tahun)"
                name="coverage_term"
                required
                hint="1–50 tahun"
              >
                <input
                  id="coverage_term_instansi"
                  className="clay-input"
                  type="number"
                  min={1}
                  max={50}
                  {...methods.register("coverage_term")}
                />
              </FormField>
            </div>
          </section>
        </TabsContent>

        {/* ===== TAB 3: Data Peserta ===== */}
        <TabsContent value="peserta">
          <section className="clay-card feature">
            <h2
              className="feature-title"
              style={{
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: "1px dashed var(--oat-border)",
              }}
            >
              Data Peserta
            </h2>
            <p
              className="caption"
              style={{ color: "var(--warm-charcoal)", marginBottom: 16 }}
            >
              Tambah peserta satu per satu via "+ Tambah Manual" atau bulk
              import via file (CSV/Excel). Kolom {isLife && <strong>Ahli Waris</strong>}
              {isLife && " wajib untuk produk Jiwa"}.
            </p>

            <div style={{ marginBottom: 16 }}>
              <ParticipantImport
                onImport={(rows) => {
                  setParticipants((prev) => [...prev, ...rows]);
                }}
              />
            </div>

            <ParticipantTable
              participants={participants}
              onChange={setParticipants}
              showBeneficiary={isLife}
            />
          </section>
        </TabsContent>

        {/* ===== TAB 4: Konfirmasi ===== */}
        <TabsContent value="konfirmasi">
          <section className="clay-card feature">
            <h2
              className="feature-title"
              style={{
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: "1px dashed var(--oat-border)",
              }}
            >
              Konfirmasi Pendaftaran
            </h2>

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <p className="uppercase-label" style={{ color: "var(--warm-silver)" }}>
                  Instansi
                </p>
                <p
                  className="body"
                  style={{ color: "var(--clay-black)", margin: 0, fontWeight: 600 }}
                >
                  {watched.company_name || "—"}
                </p>
                {watched.company_industry && (
                  <p
                    className="caption"
                    style={{ color: "var(--warm-charcoal)", margin: 0 }}
                  >
                    {watched.company_industry}
                  </p>
                )}
              </div>
              <div>
                <p className="uppercase-label" style={{ color: "var(--warm-silver)" }}>
                  Perwakilan
                </p>
                <p
                  className="body"
                  style={{ color: "var(--clay-black)", margin: 0 }}
                >
                  {watched.rep_full_name || "—"} ({watched.rep_email || "—"})
                </p>
              </div>
              <div>
                <p className="uppercase-label" style={{ color: "var(--warm-silver)" }}>
                  Produk
                </p>
                <p
                  className="body"
                  style={{ color: "var(--clay-black)", margin: 0 }}
                >
                  {selectedPlan
                    ? `${selectedProduct} — ${selectedPlan.name} (${
                        watched.coverage_term
                      } tahun)`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="uppercase-label" style={{ color: "var(--warm-silver)" }}>
                  Peserta
                </p>
                <p
                  className="body"
                  style={{ color: "var(--clay-black)", margin: 0, fontWeight: 600 }}
                >
                  {participants.length} orang
                </p>
              </div>
              <div
                style={{
                  borderTop: "1px dashed var(--oat-border)",
                  paddingTop: 16,
                  marginTop: 8,
                }}
              >
                <p className="uppercase-label" style={{ color: "var(--warm-silver)", marginBottom: 20 }}>
                  Estimasi Total Premi
                </p>
                <p
                  className="display-secondary"
                  style={{ color: "var(--clay-black)", margin: 0, marginBottom: 30 }}
                >
                  {formatIdr(totalPremium)}
                </p>
                <p
                  className="caption"
                  style={{ color: "var(--warm-charcoal)", margin: 0 }}
                >
                  {participants.length} × {formatIdr(totalPerParticipant)} (
                  {watched.coverage_term || 0} tahun)
                </p>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <button
        type="button"
        // type="button" + handleSubmit(onValid, onInvalid) — saat validasi
        // zod gagal, switch ke tab invalid pertama + tampilkan dialog.
        // Sama pattern dengan Individu form.
        onClick={methods.handleSubmit(onSubmit, (errs) => {
          // Peserta bukan field RHF, jadi error zod tidak cover
          // participants.length === 0. Cek manual di sini.
          if (participants.length === 0) {
            setActiveTab("peserta");
            setResultDialog({
              kind: "warning",
              title: "Tab \"Data Peserta\" belum lengkap",
              description: "Tambahkan minimal 1 peserta sebelum mengirim.",
            });
            return;
          }
          const firstBad = findFirstInvalidTab();
          if (firstBad) {
            setActiveTab(firstBad);
            setResultDialog({
              kind: "warning",
              title: `Tab "${TAB_LABELS[firstBad]}" belum lengkap`,
              description:
                "Perbaiki field yang ditandai (ikon ⚠), lalu kirim ulang.",
            });
          } else {
            setResultDialog({
              kind: "warning",
              title: "Form belum lengkap",
              description: "Periksa kembali semua isian, lalu kirim ulang.",
            });
          }
          void errs;
        })}
        disabled={submitting || portalStatus === "PENDING"}
        className="clay-button solid-ube size-large"
        style={{ width: "100%" }}
      >
        {portalStatus === "PENDING"
          ? "Aktivasi email dulu untuk mendaftar"
          : submitting
            ? "Mengirim..."
            : `Selesaikan Pendaftaran`}
      </button>

      <ResultDialog
        open={resultDialog.kind !== "idle"}
        onOpenChange={(o) => !o && setResultDialog(IDLE)}
        variant={resultDialog.kind === "idle" ? "info" : resultDialog.kind}
        title={resultDialog.kind === "idle" ? "" : resultDialog.title}
        description={resultDialog.kind === "idle" ? undefined : resultDialog.description}
      />
    </Form>
  );
}
