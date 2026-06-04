"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, ApiError } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { Reveal } from "@/components/Reveal";

const initialForm = {
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
  sum_assured: "100000000",
  coverage_term: "10",
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [ktp, setKtp] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    registration_no: string;
    invoice_no: string;
  } | null>(null);

  const update =
    (key: keyof typeof initialForm) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [key]: e.target.value });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setKtp(f);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!ktp) {
      setError("KTP file wajib diupload (JPG/PNG/PDF, max 5 MB).");
      return;
    }
    if (ktp.size > 5 * 1024 * 1024) {
      setError("Ukuran KTP melebihi 5 MB.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append(
        "data",
        JSON.stringify({
          ...form,
          sum_assured: Number(form.sum_assured),
          coverage_term: Number(form.coverage_term),
        }),
      );
      fd.append("id_card", ktp);

      const r = await fetch(`${API_BASE}/public/registrations`, {
        method: "POST",
        body: fd,
      });
      const json = await r.json();
      if (!r.ok) {
        throw new ApiError(
          r.status,
          json?.error?.code ?? "ERR",
          json?.error?.message ?? "Gagal submit registrasi.",
        );
      }
      setResult({ registration_no: json.registration_no, invoice_no: json.invoice_no });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <>
        <Navbar />
        <main className="clay-section" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
          <div className="clay-container" style={{ maxWidth: 640 }}>
            <Reveal>
              <div className="clay-card feature swatch-matcha">
                <h1 className="display-secondary" style={{ color: "var(--pure-white)", marginBottom: 16, fontSize: "2rem" }}>
                  ✓ Pendaftaran Berhasil
                </h1>
                <p className="body-large" style={{ color: "var(--matcha-300)" }}>
                  Invoice Anda telah dibuat. Cek email untuk instruksi pembayaran.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="clay-card feature" style={{ marginTop: 24 }}>
                <Field label="Nomor Registrasi" mono>{result.registration_no}</Field>
                <Field label="Nomor Invoice" mono>{result.invoice_no}</Field>
                <p className="caption" style={{ color: "var(--warm-charcoal)", marginTop: 16 }}>
                  Mode development: trigger webhook via curl untuk aktivasi polis (lihat README).
                </p>
                <button onClick={() => router.push("/")} className="clay-button solid-ube" style={{ marginTop: 16 }}>
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
            <p className="page-subtitle">Isi data dengan benar. KTP wajib diupload (JPG/PNG/PDF, max 5 MB).</p>
          </Reveal>

          {error && (
            <Reveal>
              <div
                className="clay-card"
                style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5", marginBottom: 24 }}
              >
                ⚠ {error}
              </div>
            </Reveal>
          )}

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 32 }}>
            <Reveal delay={80}>
              <Section title="Data Pribadi">
                <Grid>
                  <Field label="NIK (16 digit)">
                    <input className="clay-input" required pattern="[0-9]{16}" value={form.nik} onChange={update("nik")} />
                  </Field>
                  <Field label="Nama Lengkap">
                    <input className="clay-input" required value={form.full_name} onChange={update("full_name")} />
                  </Field>
                  <Field label="Tempat Lahir">
                    <input className="clay-input" required value={form.birth_place} onChange={update("birth_place")} />
                  </Field>
                  <Field label="Tanggal Lahir">
                    <input className="clay-input" type="date" required value={form.birth_date} onChange={update("birth_date")} />
                  </Field>
                  <Field label="Jenis Kelamin">
                    <select className="clay-select" value={form.gender} onChange={update("gender")}>
                      <option value="MALE">Laki-laki</option>
                      <option value="FEMALE">Perempuan</option>
                    </select>
                  </Field>
                  <Field label="RT/RW">
                    <input className="clay-input" required value={form.rt_rw} onChange={update("rt_rw")} placeholder="001/002" />
                  </Field>
                  <Field label="Alamat" full>
                    <input className="clay-input" required value={form.address} onChange={update("address")} />
                  </Field>
                  <Field label="Kelurahan / Desa">
                    <input className="clay-input" required value={form.village} onChange={update("village")} />
                  </Field>
                  <Field label="Kecamatan">
                    <input className="clay-input" required value={form.district} onChange={update("district")} />
                  </Field>
                  <Field label="Kota / Kabupaten">
                    <input className="clay-input" required value={form.city} onChange={update("city")} />
                  </Field>
                  <Field label="Provinsi">
                    <input className="clay-input" required value={form.province} onChange={update("province")} />
                  </Field>
                  <Field label="Kode Pos">
                    <input className="clay-input" required value={form.postal_code} onChange={update("postal_code")} />
                  </Field>
                </Grid>
              </Section>
            </Reveal>

            <Reveal delay={120}>
              <Section title="Kontak">
                <Grid>
                  <Field label="Email">
                    <input className="clay-input" type="email" required value={form.email} onChange={update("email")} />
                  </Field>
                  <Field label="Nomor HP (10-15 digit)">
                    <input className="clay-input" required pattern="[0-9]{10,15}" value={form.mobile_number} onChange={update("mobile_number")} />
                  </Field>
                </Grid>
              </Section>
            </Reveal>

            <Reveal delay={180}>
              <Section title="Informasi Asuransi">
                <Grid>
                  <Field label="Produk">
                    <select className="clay-select" value={form.product} onChange={update("product")}>
                      <option value="LIFE">Life Insurance</option>
                      <option value="PERSONAL_ACCIDENT">Personal Accident</option>
                      <option value="HEALTH">Health Insurance</option>
                    </select>
                  </Field>
                  <Field label="Uang Pertanggungan (Rp)">
                    <input className="clay-input" type="number" min="1" required value={form.sum_assured} onChange={update("sum_assured")} />
                  </Field>
                  <Field label="Masa Pertanggungan (tahun)">
                    <input className="clay-input" type="number" min="1" required value={form.coverage_term} onChange={update("coverage_term")} />
                  </Field>
                </Grid>
              </Section>
            </Reveal>

            <Reveal delay={240}>
              <Section title="Upload KTP">
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={onFile}
                  required
                  className="clay-input"
                  style={{ padding: 12 }}
                />
                {ktp && (
                  <p className="caption" style={{ color: "var(--warm-charcoal)", marginTop: 8 }}>
                    File: <span className="mono">{ktp.name}</span> ({(ktp.size / 1024).toFixed(1)} KB)
                  </p>
                )}
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
          </form>
        </div>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="clay-card feature">
      <h2 className="feature-title" style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px dashed var(--oat-border)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  full,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  mono?: boolean;
}) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <label className="clay-label">{label}</label>
      {mono ? <p className="mono" style={{ margin: 0, fontSize: "1.1rem" }}>{children}</p> : children}
    </div>
  );
}
