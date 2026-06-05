"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { API_BASE, ApiError } from "@insuretrack/api-client";
import { Navbar } from "@/components/Navbar";
import { Reveal } from "@/components/Reveal";
import { Form, FormField, FormError } from "@insuretrack/forms";
import {
  emailSchema,
  nikSchema,
  phoneSchema,
  dateNotFutureSchema,
} from "@insuretrack/forms";

const PRODUCTS = ["LIFE", "PERSONAL_ACCIDENT", "HEALTH"] as const;
const GENDERS = ["MALE", "FEMALE"] as const;

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
  email: emailSchema.refine((s) => s.length > 0, { message: "Email wajib diisi" }),
  mobile_number: phoneSchema,
  product: z.enum(PRODUCTS),
  sum_assured: z.coerce
    .number({ invalid_type_error: "Uang pertanggungan harus angka" })
    .positive("Harus lebih dari 0")
    .int("Harus bilangan bulat"),
  coverage_term: z.coerce
    .number({ invalid_type_error: "Masa pertanggungan harus angka" })
    .int()
    .positive()
    .max(50, "Maksimal 50 tahun"),
  ktp: z.any(),
});
type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ktpName, setKtpName] = useState<string | null>(null);
  const [result, setResult] = useState<{
    registration_no: string;
    invoice_no: string;
  } | null>(null);

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
      email: "",
      mobile_number: "",
      product: "LIFE",
      sum_assured: 100000000,
      coverage_term: 10,
    },
    mode: "onBlur",
  });

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
    setFormError(null);
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
          email: values.email.trim(),
          mobile_number: values.mobile_number,
          product: values.product,
          sum_assured: Number(values.sum_assured),
          coverage_term: Number(values.coverage_term),
        }),
      );
      fd.append("id_card", ktp);
      const r = await fetch(`${API_BASE}/public/registrations`, {
        method: "POST",
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
      setFormError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <>
        <Navbar />
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
                  Mode development: trigger webhook via curl untuk aktivasi polis (lihat README).
                </p>
                <button
                  onClick={() => router.push("/")}
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
      <Navbar />
      <main className="clay-section" style={{ minHeight: "100vh", paddingTop: 48 }}>
        <div className="clay-container" style={{ maxWidth: 720 }}>
          <Reveal>
            <a href="/" className="clay-button ghost size-small" style={{ marginBottom: 24 }}>
              ← Beranda
            </a>
            <h1 className="page-title">Form Pendaftaran</h1>
            <p className="page-subtitle">
              Isi data dengan benar. KTP wajib diupload (JPG/PNG/PDF, max 5 MB).
            </p>
          </Reveal>

          <Form methods={methods} onSubmit={onSubmit} style={{ display: "grid", gap: 32 }}>
            <FormError message={formError} />

            <Reveal delay={80}>
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
                </Grid>
              </Section>
            </Reveal>

            <Reveal delay={120}>
              <Section title="Kontak">
                <Grid>
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
            </Reveal>

            <Reveal delay={180}>
              <Section title="Informasi Asuransi">
                <Grid>
                  <FormField label="Produk" name="product" required>
                    <select
                      id="product"
                      className="clay-select"
                      {...methods.register("product")}
                    >
                      <option value="LIFE">Life Insurance</option>
                      <option value="PERSONAL_ACCIDENT">Personal Accident</option>
                      <option value="HEALTH">Health Insurance</option>
                    </select>
                  </FormField>
                  <FormField
                    label="Uang Pertanggungan (Rp)"
                    name="sum_assured"
                    required
                    hint="Minimal Rp 1"
                  >
                    <input
                      id="sum_assured"
                      className="clay-input"
                      type="number"
                      min={1}
                      {...methods.register("sum_assured")}
                    />
                  </FormField>
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
                </Grid>
              </Section>
            </Reveal>

            <Reveal delay={240}>
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
            </Reveal>

            <Reveal delay={300}>
              <button
                type="submit"
                disabled={submitting}
                className="clay-button solid-ube size-large"
                style={{ width: "100%" }}
              >
                {submitting ? "Mengirim..." : "Daftar & Buat Invoice →"}
              </button>
            </Reveal>
          </Form>
        </div>
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

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      }}
    >
      {children}
    </div>
  );
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
