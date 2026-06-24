"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  API_BASE,
  apiFetch,
  ApiError,
  type ApplicantType,
  type ProductCatalogData,
  type ProductCatalogResponse,
  type ProductCode,
  type ProductPlan,
} from "@insuretrack/api-client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@insuretrack/ui";
import { Reveal } from "@/components/Reveal";
import { PlanPicker } from "@/components/PlanPicker";
import { ApplicantTypePicker } from "@/components/registration/ApplicantTypePicker";
import { InstansiForm } from "./InstansiForm";
import { Form, FormField } from "@insuretrack/forms";
import { ResultDialog } from "@/components/registration/ResultDialog";
import { IDLE, mapSubmitError, type ResultState } from "@/lib/submit-error";
import {
  emailSchema,
  nikSchema,
  phoneSchema,
  dateNotFutureSchema,
  beneficiaryNameSchema,
} from "@insuretrack/forms";

const GENDERS = ["MALE", "FEMALE"] as const;

/** Field yang termasuk masing-masing tab. Dipakai untuk:
 *   1. Render checkmark "✓" di tab trigger kalau semua field tab tsb valid.
 *   2. (Opsional) Per-tab Next-gate validation.
 *  Tidak gate perpindahan tab — user bebas klik tab manapun. Submit tetap
 *  validasi full schema via RHF + zodResolver. */
const TAB_FIELDS = {
  personal: [
    "nik",
    "full_name",
    "birth_place",
    "birth_date",
    "gender",
    "address",
    "rt_rw",
    "village",
    "district",
    "city",
    "province",
    "postal_code",
    "beneficiary_name",
  ],
  contact: ["email", "mobile_number"],
  insurance: ["plan_code", "coverage_term"],
  ktp: ["ktp"],
} as const;

type TabKey = keyof typeof TAB_FIELDS;

// Urutan tetap untuk "klik submit, cari tab invalid pertama". Tidak
// pakai insertion order object karena TypeScript bisa reorder.
const TAB_ORDER: readonly TabKey[] = ["personal", "contact", "insurance", "ktp"];

// Label human-readable untuk tab. Dipakai di ResultDialog error supaya
// user tahu tab mana yang harus dilihat (bukan internal key "personal").
const TAB_LABELS: Record<TabKey, string> = {
  personal: "Data Pribadi",
  contact: "Kontak",
  insurance: "Informasi Asuransi",
  ktp: "Upload KTP",
};

// `plan_code` adalah composite id (mis. "LIFE_BASIC") yang dikirim ke
// backend. Validasi shape regex di sini — backend akan lookup & reject
// unknown codes via find_plan().
const registerSchema = z.object({
  nik: nikSchema,
  full_name: z.string().trim().min(1, "Nama lengkap wajib diisi").max(120),
  birth_place: z.string().trim().min(1, "Tempat lahir wajib diisi").max(80),
  birth_date: dateNotFutureSchema,
  gender: z.enum(GENDERS),
  address: z.string().trim().min(1, "Alamat wajib diisi").max(500),
  rt_rw: z
    .string()
    .trim()
    .regex(/^\d{1,3}\/\d{1,3}$/, "Format RT/RW: 001/002"),
  village: z.string().trim().min(1, "Kelurahan wajib diisi").max(80),
  district: z.string().trim().min(1, "Kecamatan wajib diisi").max(80),
  city: z.string().trim().min(1, "Kota wajib diisi").max(80),
  province: z.string().trim().min(1, "Provinsi wajib diisi").max(80),
  postal_code: z.string().trim().regex(/^\d{5}$/, "Kode pos 5 digit"),
  // Nama ahli waris / penerima manfaat. Backend enforce wajib untuk
  // produk LIFE; PA/HEALTH menerima null/empty. Di client, validation
  // longgar (max length only) — server yang enforce per-product.
  beneficiary_name: beneficiaryNameSchema,
  email: emailSchema.refine((s) => s.length > 0, { message: "Email wajib diisi" }),
  mobile_number: phoneSchema,
  plan_code: z
    .string()
    .min(1, "Pilih plan terlebih dahulu")
    .regex(
      /^[A-Z_]+_(BASIC|STANDARD|PREMIUM)$/,
      "Plan tidak valid",
    ),
  coverage_term: z.coerce
    .number({ invalid_type_error: "Masa pertanggungan harus angka" })
    .int()
    .positive()
    .max(50, "Maksimal 50 tahun"),
  ktp: z.any(),
});
type RegisterValues = z.infer<typeof registerSchema>;

// `useSearchParams` di Next.js 15 harus di-wrap Suspense di komponen
// client yang memakainya. Bungkus dengan component `InsuranceNewPageInner`
// yang pakai hook, lalu default export hanya membungkus Suspense.
export default function InsuranceNewPage() {
  return (
    <Suspense fallback={null}>
      <InsuranceNewPageInner />
    </Suspense>
  );
}

function InsuranceNewPageInner() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [ktpName, setKtpName] = useState<string | null>(null);
  const [result, setResult] = useState<{
    registration_no: string;
    invoice_no: string;
  } | null>(null);
  const [resultDialog, setResultDialog] = useState<ResultState>(IDLE);
  const [portalStatus, setPortalStatus] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ProductCatalogData | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductCode>("LIFE");
  // Tab aktif — diinisialisasi ke "personal". Controlled mode Radix Tabs.
  const [activeTab, setActiveTab] = useState<TabKey>("personal");
  // Consent checkboxes. Plain useState (bukan RHF) karena:
  //   1. Tidak dikirim ke backend (tidak ada schema field).
  //   2. Cuma gate submit button + onInvalid handler.
  // Spec FS-15 tidak require audit trail untuk consent capture; cukup
  // client-side (lihat diskusi implementasi consent UX).
  const [consentDataAccuracy, setConsentDataAccuracy] = useState(false);
  const [consentTermsPrivacy, setConsentTermsPrivacy] = useState(false);
  const consentAllGiven = consentDataAccuracy && consentTermsPrivacy;
  // Tipe pendaftaran — Individu (default) atau Instansi. Mengontrol
  // form mana yang di-render di bawah. Selected by ApplicantTypePicker
  // di top of form.
  const [applicantType, setApplicantType] = useState<ApplicantType>("INDIVIDU");

  // Pre-select product dari query param `?product=LIFE|PERSONAL_ACCIDENT|HEALTH`
  // (link dari halaman /products/[code]). Validate agar tidak bisa di-spoof
  // ke value di luar enum.
  const searchParams = useSearchParams();
  const queryProduct = searchParams.get("product");
  useEffect(() => {
    if (
      queryProduct === "LIFE" ||
      queryProduct === "PERSONAL_ACCIDENT" ||
      queryProduct === "HEALTH"
    ) {
      setSelectedProduct(queryProduct);
    }
  }, [queryProduct]);

  // Fetch product & plan catalog dari backend (single source of truth).
  // Loading: tampilkan skeleton. Error: tampilkan pesan + retry-able.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/public/products`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as ProductCatalogResponse;
        if (!cancelled) setCatalog(json.data);
      })
      .catch((e) => {
        if (!cancelled) {
          setCatalogError(
            e instanceof Error
              ? `Gagal memuat katalog plan: ${e.message}`
              : "Gagal memuat katalog plan.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const methods = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema) as never,
    defaultValues: {
      nik: "",
      full_name: "",
      birth_place: "",
      birth_date: "",
      gender: "MALE",
      address: "",
      rt_rw: "",
      village: "",
      district: "",
      city: "",
      province: "",
      postal_code: "",
      beneficiary_name: "",
      email: "",
      mobile_number: "",
      plan_code: "",
      coverage_term: 10,
    },
    mode: "onBlur",
  });

  // Watch values per tab — untuk hitung state tiap tab (valid/invalid/empty).
  // Watch granular (per field) supaya re-render minimal saat satu field
  // berubah; compute `getTabState` untuk tiap tab on the fly.
  const watched = methods.watch();
  const errors = methods.formState.errors;

  /** State tab — dipakai untuk render icon di trigger (✓ / ⚠ / nothing)
   *  dan untuk logika submit-guard. 'invalid' > 'empty' > 'valid' untuk
   *  visual priority: kalau ada error, user perlu lihat itu dulu. */
  const getTabState = (key: TabKey): "valid" | "invalid" | "empty" => {
    // Untuk 'ktp', file presence = ktpName. Error pada field 'ktp'
    // tersimpan di RHF `errors.ktp` (kita set manual di submit handler).
    if (key === "ktp") {
      if (errors.ktp) return "invalid";
      return ktpName ? "valid" : "empty";
    }
    const hasError = TAB_FIELDS[key].some(
      (f) => errors[f as keyof typeof errors],
    );
    if (hasError) return "invalid";
    const allFilled = TAB_FIELDS[key].every((field) => {
      const v = watched[field as keyof RegisterValues];
      return typeof v === "string" ? v.trim().length > 0 : Boolean(v);
    });
    return allFilled ? "valid" : "empty";
  };

  /** Cari tab invalid pertama (urutan TAB_ORDER). Dipakai di onInvalid
   *  submit handler supaya user lihat error tanpa harus menebak tab mana
   *  yang harus dibuka. Return null kalau semua valid. */
  const findFirstInvalidTab = (): TabKey | null => {
    for (const t of TAB_ORDER) {
      if (getTabState(t) === "invalid") return t;
    }
    return null;
  };

  // Plan untuk produk yang sedang dipilih (filtered dari catalog).
  // useMemo agar tidak re-filter setiap render.
  const visiblePlans: ProductPlan[] = useMemo(() => {
    if (!catalog) return [];
    return catalog.plans
      .filter((p) => p.product_code === selectedProduct)
      .sort((a, b) => {
        const order = { BASIC: 0, STANDARD: 1, PREMIUM: 2 };
        return order[a.tier] - order[b.tier];
      });
  }, [catalog, selectedProduct]);

  // Set plan_code default ke plan BASIC (atau plan pertama) dari produk
  // yang dipilih. Trigger setiap kali catalog selesai load ATAU user
  // ganti produk. Tidak override kalau user sudah memilih plan lain
  // yang masih valid untuk produk saat ini.
  useEffect(() => {
    if (!catalog || visiblePlans.length === 0) return;
    const current = methods.getValues("plan_code");
    const stillValid = visiblePlans.some((p) => p.code === current);
    if (!stillValid) {
      methods.setValue("plan_code", visiblePlans[0].code, {
        shouldValidate: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, selectedProduct]);

  // Enter-key submit handler. `<Form>` (packages/forms) cuma terima
  // `onSubmit` (valid case), jadi submit via Enter akan diam-diam gagal
  // saat invalid. Subscribe ke `formState.submitCount` untuk reaktif:
  // setiap attempt submit yang gagal, switch ke tab invalid pertama dan
  // tampilkan ResultDialog. Trigger: `submitCount` increment (counter
  // RHF, naik tiap submit attempt — bukan tiap keystroke).
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

  // Auth guard: redirect to login kalau belum authenticated. Customer
  // insurance application requires customer cookie (backend enforces via
  // RequireCustomer middleware di POST /api/customer/registrations).
  useEffect(() => {
    // Prefill form dari profil customer: data akun (email/nama/HP) plus
    // data insurance sebelumnya (kalau pernah apply — nullable). Best-effort
    // — kalau fetch gagal (401 = belum login → redirect), user tetap
    // bisa isi manual.
    apiFetch<{
      full_name: string;
      email: string;
      mobile_number: string;
      portal_status: string;
      nik: string | null;
      birth_place: string | null;
      birth_date: string | null;
      gender: string | null;
      address: string | null;
      rt_rw: string | null;
      village: string | null;
      district: string | null;
      city: string | null;
      province: string | null;
      postal_code: string | null;
    } | null>("/customer/me")
      .then((p) => {
        if (!p) return;
        setPortalStatus(p.portal_status);
        methods.reset({
          ...methods.getValues(),
          full_name: p.full_name ?? "",
          email: p.email ?? "",
          mobile_number: p.mobile_number ?? "",
          nik: p.nik ?? "",
          birth_place: p.birth_place ?? "",
          birth_date: p.birth_date ?? "",
          gender: (p.gender as "MALE" | "FEMALE" | null) ?? "MALE",
          address: p.address ?? "",
          rt_rw: p.rt_rw ?? "",
          village: p.village ?? "",
          district: p.district ?? "",
          city: p.city ?? "",
          province: p.province ?? "",
          postal_code: p.postal_code ?? "",
        });
      })
      .catch((err) => {
        // 401 = belum login → bounce ke /login. Lainnya silent — user
        // bisa isi manual kalau prefill gagal.
        if (err && typeof err === "object" && "status" in err && err.status === 401) {
          router.replace("/portal/login?next=/portal/insurance/new");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onSubmit = async (values: RegisterValues) => {
    const ktp = values.ktp as File | undefined;
    if (!ktp) {
      methods.setError("ktp", { message: "KTP wajib diupload" });
      return;
    }
    if (ktp.size > 5 * 1024 * 1024) {
      methods.setError("ktp", { message: "Ukuran KTP melebihi 5 MB" });
      return;
    }
    if (!["image/jpeg", "image/png", "application/pdf"].includes(ktp.type)) {
      methods.setError("ktp", { message: "Format KTP harus JPG, PNG, atau PDF" });
      return;
    }
    setSubmitting(true);
    setResultDialog(IDLE);
    try {
      const fd = new FormData();
      fd.append(
        "data",
        JSON.stringify({
          nik: values.nik.trim(),
          full_name: values.full_name.trim(),
          birth_place: values.birth_place.trim(),
          birth_date: values.birth_date,
          gender: values.gender,
          address: values.address.trim(),
          rt_rw: values.rt_rw.trim(),
          village: values.village.trim(),
          district: values.district.trim(),
          city: values.city.trim(),
          province: values.province.trim(),
          postal_code: values.postal_code.trim(),
          // Optional — empty string di-coerce ke undefined di
          // beneficiaryNameSchema; backend enforce wajib untuk LIFE.
          beneficiary_name: values.beneficiary_name?.trim() || undefined,
          email: values.email.trim(),
          mobile_number: values.mobile_number,
          // plan_code adalah composite id (mis. "LIFE_BASIC") — backend
          // lookup via find_plan() untuk derive product & sum_assured.
          plan_code: values.plan_code,
          coverage_term: Number(values.coverage_term),
        }),
      );
      fd.append("id_card", ktp);
      // apiFetch handles multipart + CSRF auto-attach.
      const json = await apiFetch<{
        registration_no: string;
        invoice_no: string;
      }>("/customer/registrations", { method: "POST", body: fd });
      setResult({ registration_no: json.registration_no, invoice_no: json.invoice_no });
    } catch (err) {
      setResultDialog(mapSubmitError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <>
        <main
          className="clay-section"
          style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
        >
          <div className="clay-container" style={{ maxWidth: 640 }}>
            <Reveal>
              <div className="clay-card feature swatch-matcha">
                <h1
                  className="display-secondary"
                  style={{
                    color: "var(--pure-white)",
                    marginBottom: 16,
                    fontSize: "2rem",
                  }}
                >
                  ✓ Pendaftaran Berhasil
                </h1>
                <p className="body-large" style={{ color: "var(--matcha-300)" }}>
                  Invoice Anda telah dibuat. Cek email untuk instruksi pembayaran.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="clay-card feature" style={{ marginTop: 24 }}>
                <Field label="Nomor Registrasi" mono>
                  {result.registration_no}
                </Field>
                <Field label="Nomor Invoice" mono>
                  {result.invoice_no}
                </Field>
                <p
                  className="caption"
                  style={{ color: "var(--warm-charcoal)", marginTop: 16 }}
                >
                </p>
                <button
                  onClick={() => router.push("/portal/dashboard")}
                  className="clay-button solid-ube"
                  style={{ marginTop: 16 }}
                >
                  Kembali ke Beranda
                </button>
              </div>
            </Reveal>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="clay-section" style={{ minHeight: "100vh", paddingTop: 0 }}>
        <Reveal>
          <a href="/portal/dashboard" className="clay-button ghost size-small" style={{ marginBottom: 24 }}>
            ← Beranda
          </a>
          <h1 className="page-title">Form Pendaftaran</h1>
        </Reveal>

        {/* Banner aktivasi: kalau akun belum diaktivasi, backend akan
            reject submit dengan EMAIL_NOT_ACTIVATED. Tampilkan banner
            upfront + disable form biar user tidak isi data yang percuma. */}
        {portalStatus === "PENDING" && (
          <div
            className="clay-card feature"
            style={{
              marginTop: 24,
              marginBottom: 24,
              padding: 24,
              background: "var(--lemon-400)",
              borderLeft: "6px solid var(--lemon-700)",
              maxWidth: 720,
            }}
            role="alert"
          >
            <p
              className="uppercase-label"
              style={{ color: "var(--lemon-800)", marginBottom: 8 }}
            >
              ✦ Aktivasi Email Diperlukan
            </p>
            <p className="body" style={{ color: "var(--clay-black)", margin: 0 }}>
              Anda belum bisa mengajukan asuransi sebelum akun diaktivasi.
              Cek kotak masuk email Anda dan klik link aktivasi. Setelah
              aktif, kembali ke halaman ini.
            </p>
          </div>
        )}

        {/* Tipe Pendaftaran picker — Individuals (1 peserta) atau Instansi
            (N peserta kolektif). Selected value controls form mana yang
            di-render di bawah. */}
        <Reveal delay={40}>
          <h2
            className="card-heading"
            style={{ marginTop: 24, marginBottom: 12, fontSize: "1.15rem" }}
          >
            Pilih Tipe Pendaftaran
          </h2>
          <ApplicantTypePicker
            value={applicantType}
            onChange={setApplicantType}
          />
        </Reveal>

        {applicantType === "INDIVIDU" ? (
          <Form methods={methods} onSubmit={onSubmit} style={{ display: "grid", gap: 32 }}>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as TabKey)}
            >
              <TabsList aria-label="Bagian form pendaftaran">
                <TabsTrigger value="personal">
                  Data Pribadi
                  {getTabState("personal") === "valid" && (
                    <span className="clay-tabs-check" aria-label="Lengkap">✓</span>
                  )}
                  {getTabState("personal") === "invalid" && (
                    <span
                      className="clay-tabs-warn"
                      aria-label="Belum lengkap"
                      title="Tab ini belum lengkap"
                    >
                      ⚠
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="contact">
                  Kontak
                  {getTabState("contact") === "valid" && (
                    <span className="clay-tabs-check" aria-label="Lengkap">✓</span>
                  )}
                  {getTabState("contact") === "invalid" && (
                    <span
                      className="clay-tabs-warn"
                      aria-label="Belum lengkap"
                      title="Tab ini belum lengkap"
                    >
                      ⚠
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="insurance">
                  Informasi Asuransi
                  {getTabState("insurance") === "valid" && (
                    <span className="clay-tabs-check" aria-label="Lengkap">✓</span>
                  )}
                  {getTabState("insurance") === "invalid" && (
                    <span
                      className="clay-tabs-warn"
                      aria-label="Belum lengkap"
                      title="Tab ini belum lengkap"
                    >
                      ⚠
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="ktp">
                  Upload KTP
                  {getTabState("ktp") === "valid" && (
                    <span className="clay-tabs-check" aria-label="Lengkap">✓</span>
                  )}
                  {getTabState("ktp") === "invalid" && (
                    <span
                      className="clay-tabs-warn"
                      aria-label="Belum lengkap"
                      title="Tab ini belum lengkap"
                    >
                      ⚠
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="personal">
                <Section title="Data Pribadi">
                  <Grid>
                    <FormField label="NIK (16 digit)" name="nik" required>
                      <input
                        id="nik"
                        className="clay-input"
                        inputMode="numeric"
                        autoComplete="off"
                        {...methods.register("nik")}
                      />
                    </FormField>
                    <FormField label="Nama Lengkap" name="full_name" required>
                      <input
                        id="full_name"
                        className="clay-input"
                        autoComplete="name"
                        {...methods.register("full_name")}
                      />
                    </FormField>
                    <FormField label="Tempat Lahir" name="birth_place" required>
                      <input
                        id="birth_place"
                        className="clay-input"
                        autoComplete="off"
                        {...methods.register("birth_place")}
                      />
                    </FormField>
                    <FormField label="Tanggal Lahir" name="birth_date" required>
                      <input
                        id="birth_date"
                        type="date"
                        className="clay-input"
                        {...methods.register("birth_date")}
                      />
                    </FormField>
                    <FormField label="Jenis Kelamin" name="gender">
                      <select
                        id="gender"
                        className="clay-select"
                        {...methods.register("gender")}
                      >
                        <option value="MALE">Laki-laki</option>
                        <option value="FEMALE">Perempuan</option>
                      </select>
                    </FormField>
                    <FormField label="RT/RW" name="rt_rw" required hint="Format: 001/002">
                      <input
                        id="rt_rw"
                        className="clay-input"
                        autoComplete="off"
                        placeholder="001/002"
                        {...methods.register("rt_rw")}
                      />
                    </FormField>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <FormField label="Alamat" name="address" required>
                        <input
                          id="address"
                          className="clay-input"
                          autoComplete="street-address"
                          {...methods.register("address")}
                        />
                      </FormField>
                    </div>
                    <FormField label="Kelurahan / Desa" name="village" required>
                      <input
                        id="village"
                        className="clay-input"
                        autoComplete="off"
                        {...methods.register("village")}
                      />
                    </FormField>
                    <FormField label="Kecamatan" name="district" required>
                      <input
                        id="district"
                        className="clay-input"
                        autoComplete="off"
                        {...methods.register("district")}
                      />
                    </FormField>
                    <FormField label="Kota / Kabupaten" name="city" required>
                      <input
                        id="city"
                        className="clay-input"
                        autoComplete="address-level2"
                        {...methods.register("city")}
                      />
                    </FormField>
                    <FormField label="Provinsi" name="province" required>
                      <input
                        id="province"
                        className="clay-input"
                        autoComplete="address-level1"
                        {...methods.register("province")}
                      />
                    </FormField>
                    <FormField label="Kode Pos" name="postal_code" required hint="5 digit">
                      <input
                        id="postal_code"
                        className="clay-input"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        {...methods.register("postal_code")}
                      />
                    </FormField>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <FormField
                        label="Nama Ahli Waris (Beneficiary)"
                        name="beneficiary_name"
                        hint="Wajib untuk Asuransi Jiwa. Penerima manfaat polis."
                      >
                        <input
                          id="beneficiary_name"
                          className="clay-input"
                          autoComplete="off"
                          placeholder="cth: Nama Istri / Anak / Saudara"
                          {...methods.register("beneficiary_name")}
                        />
                      </FormField>
                    </div>
                  </Grid>
                </Section>
              </TabsContent>

              <TabsContent value="contact">
                <Section title="Kontak">
                  <Grid cols={2}>
                    <FormField label="Email" name="email" required>
                      <input
                        id="email"
                        className="clay-input"
                        type="email"
                        autoComplete="email"
                        {...methods.register("email")}
                      />
                    </FormField>
                    <FormField label="Nomor HP" name="mobile_number" required hint="10–15 digit">
                      <input
                        id="mobile_number"
                        className="clay-input"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        {...methods.register("mobile_number")}
                      />
                    </FormField>
                  </Grid>
                </Section>
              </TabsContent>

              <TabsContent value="insurance">
                <Section title="Informasi Asuransi">
                  {/* Product selector — segmented pill row, lebih visual
                      dari <select> untuk 3 opsi yang setara. Pilih produk
                      → filter plan cards di bawah. */}
                  <div
                    role="tablist"
                    aria-label="Pilih produk asuransi"
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: 24,
                    }}
                  >
                    {(catalog?.products ?? [
                      { code: "LIFE" as ProductCode, name: "Life Insurance", description: "" },
                      { code: "PERSONAL_ACCIDENT" as ProductCode, name: "Personal Accident Insurance", description: "" },
                      { code: "HEALTH" as ProductCode, name: "Health Insurance", description: "" },
                    ]).map((p) => {
                      const isActive = p.code === selectedProduct;
                      return (
                        <button
                          key={p.code}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setSelectedProduct(p.code)}
                          className={`clay-button ${isActive ? "solid-ube" : "ghost"} size-small`}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Plan picker — 3 plan cards (Basic/Standard/Premium)
                      untuk produk yang dipilih. UP & premi tampil otomatis
                      dari plan. UP & premi tidak user-input lagi. */}
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
                        style={{
                          padding: 16,
                          color: "var(--warm-silver)",
                          textAlign: "center",
                        }}
                      >
                        Memuat plan…
                      </div>
                    ) : (
                      <PlanPicker
                        plans={visiblePlans}
                        name="plan_code"
                        selectedPlanCode={methods.watch("plan_code") ?? ""}
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
                        id="coverage_term"
                        className="clay-input"
                        type="number"
                        min={1}
                        max={50}
                        {...methods.register("coverage_term")}
                      />
                    </FormField>
                  </div>
                </Section>
              </TabsContent>

              <TabsContent value="ktp">
                <Section title="Upload KTP">
                  <FormField label="File KTP" name="ktp" required hint="JPG/PNG/PDF, max 5 MB">
                    <input
                      id="ktp"
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        methods.setValue("ktp", f, { shouldValidate: true });
                        setKtpName(f?.name ?? null);
                      }}
                      className="clay-input"
                      style={{ padding: 12 }}
                    />
                    {ktpName && (
                      <p
                        className="caption"
                        style={{ color: "var(--warm-charcoal)", marginTop: 8 }}
                      >
                        File: <span className="mono">{ktpName}</span>
                      </p>
                    )}
                  </FormField>
                </Section>
              </TabsContent>
            </Tabs>

            <Reveal delay={300}>
              {/* Consent checkboxes — di atas tombol submit. Disabled state
                  pada tombol menjelaskan sendiri kenapa tidak bisa diklik
                  (sampai consent dicentang). Lihat /terms section 10 dan
                  /privacy section 6 untuk teks lengkap yang dirujuk. */}
              <div
                className="clay-card"
                style={{
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  background: "var(--warm-cream)",
                }}
              >
                <p
                  className="uppercase-label"
                  style={{ color: "var(--warm-silver)", margin: 0 }}
                >
                  ✦ Persetujuan
                </p>

                <label
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                    color: "var(--clay-black)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={consentDataAccuracy}
                    onChange={(e) => setConsentDataAccuracy(e.target.checked)}
                    className="clay-checkbox"
                    style={{ marginTop: 3, flexShrink: 0 }}
                    aria-required="true"
                  />
                  <span>
                    Saya menyatakan bahwa data yang saya isi adalah{" "}
                    <strong>benar dan dapat dipertanggungjawabkan</strong>,
                    serta bersedia memberikan dokumen pendukung asli bila
                    diminta.
                  </span>
                </label>

                <label
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                    color: "var(--clay-black)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={consentTermsPrivacy}
                    onChange={(e) => setConsentTermsPrivacy(e.target.checked)}
                    className="clay-checkbox"
                    style={{ marginTop: 3, flexShrink: 0 }}
                    aria-required="true"
                  />
                  <span>
                    Saya telah membaca dan menyetujui{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--ube-800)", textDecoration: "underline" }}
                    >
                      Syarat &amp; Ketentuan
                    </Link>{" "}
                    dan{" "}
                    <Link
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--ube-800)", textDecoration: "underline" }}
                    >
                      Kebijakan Privasi
                    </Link>{" "}
                    InsureTrack.
                  </span>
                </label>
              </div>

              <button
                type="button"
                // type="button" + manual handleSubmit(onValid, onInvalid)
                // supaya saat validasi zod gagal, kita bisa:
                //   1. Cari tab invalid pertama.
                //   2. setActiveTab(tabItu) — user langsung lihat error.
                //   3. Tampilkan ResultDialog error dengan instruksi.
                // Pendekatan ini menghindari "klik submit tidak bereaksi"
                // saat user sedang di tab yang bukan tab invalid.
                onClick={methods.handleSubmit(onSubmit, (errs) => {
                  // Consent gate — kalau user somehow submit (mis. via
                  // Enter key di input, bypass disabled visual), check
                  // ulang di sini. Tampilkan dialog spesifik supaya
                  // user tahu apa yang kurang.
                  if (!consentDataAccuracy || !consentTermsPrivacy) {
                    setResultDialog({
                      kind: "warning",
                      title: "Persetujuan belum lengkap",
                      description:
                        "Centang kedua kotak persetujuan di atas untuk melanjutkan.",
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
                    // Fallback: error ada tapi tidak ke-attribute ke tab
                    // manapun (mis. cross-field rule). Tampilkan generic.
                    setResultDialog({
                      kind: "warning",
                      title: "Form belum lengkap",
                      description: "Periksa kembali semua isian, lalu kirim ulang.",
                    });
                  }
                  // Suppress unused-var warning untuk errs.
                  void errs;
                })}
                disabled={
                  submitting || portalStatus === "PENDING" || !consentAllGiven
                }
                className="clay-button solid-ube size-large"
                style={{ width: "100%", marginTop: 16 }}
              >
                {portalStatus === "PENDING"
                  ? "Aktivasi email dulu untuk mendaftar"
                  : submitting
                  ? "Mengirim..."
                  : "Selesaikan Pendaftaran"}
              </button>
              {!consentAllGiven && portalStatus !== "PENDING" && (
                <p
                  className="caption"
                  style={{
                    color: "var(--warm-silver)",
                    textAlign: "center",
                    margin: "8px 0 0 0",
                  }}
                >
                  Centang kedua kotak persetujuan di atas untuk melanjutkan.
                </p>
              )}
            </Reveal>

            <ResultDialog
              open={resultDialog.kind !== "idle"}
              onOpenChange={(o) => !o && setResultDialog(IDLE)}
              variant={resultDialog.kind === "idle" ? "info" : resultDialog.kind}
              title={resultDialog.kind === "idle" ? "" : resultDialog.title}
              description={resultDialog.kind === "idle" ? undefined : resultDialog.description}
            />
          </Form>
        ) : (
          <InstansiForm
            catalog={catalog}
            catalogError={catalogError}
            selectedProduct={selectedProduct}
            onSelectProduct={setSelectedProduct}
            visiblePlans={visiblePlans}
            portalStatus={portalStatus}
          />
        )}
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="clay-card feature">
      <h2
        className="feature-title"
        style={{
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: "1px dashed var(--oat-border)",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  // Pakai global .clay-form-grid (responsive: 3→2 di tablet, 2/3→1 di mobile).
  // Lihat packages/ui/src/styles/globals.css untuk breakpoint.
  return <div className={cols === 2 ? "clay-form-grid cols-2" : "clay-form-grid cols-3"}>{children}</div>;
}

function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <label className="clay-label">{label}</label>
      {mono ? <p className="mono" style={{ margin: 0, fontSize: "1.1rem" }}>{children}</p> : children}
    </div>
  );
}
