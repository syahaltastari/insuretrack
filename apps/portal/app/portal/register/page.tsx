"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { emailSchema, passwordSchema } from "@insuretrack/forms";
import { API_BASE } from "@insuretrack/api-client";

// Setelah registration flow split, halaman ini hanya untuk account
// creation (email + password + nama + mobile). Insurance application
// ada di /portal/insurance/new (setelah login, requires auth).
const registerSchema = z.object({
  full_name: z.string().trim().min(3, "Nama minimal 3 karakter").max(120),
  email: emailSchema,
  password: passwordSchema,
  mobile_number: z
    .string()
    .trim()
    .min(10, "Nomor HP minimal 10 digit")
    .max(20, "Nomor HP maksimal 20 karakter")
    .regex(/^[0-9+\-\s()]+$/, "Nomor HP hanya boleh angka dan + - ( ) spasi"),
});
type RegisterValues = z.infer<typeof registerSchema>;

export default function PortalRegisterPage() {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const methods = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema) as never,
    defaultValues: { full_name: "", email: "", password: "", mobile_number: "" },
    mode: "onSubmit",
  });

  const onSubmit = async (values: RegisterValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const r = await fetch(`${API_BASE}/public/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email.trim(),
          password: values.password,
          full_name: values.full_name.trim(),
          mobile_number: values.mobile_number.trim(),
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.error?.message ?? "Registrasi gagal");
      setSuccess(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Registrasi gagal");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <main
        style={{
          height: "100vh",
          width: "100vw",
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          background: "var(--warm-cream)",
          padding: 24,
        }}
      >
        <div style={{ width: "100%", maxWidth: 460, textAlign: "center" }}>
          <p className="uppercase-label" style={{ color: "var(--matcha-600)" }}>
            InsureTrack
          </p>
          <h1 className="display-secondary" style={{ fontSize: "2rem", marginTop: 8, marginBottom: 16 }}>
            Akun portal kamu sudah dibuat
          </h1>
          <p className="body-large" style={{ color: "var(--warm-charcoal)", marginBottom: 24 }}>
            Kami mengirim link aktivasi ke email kamu. Klik link di email untuk
            set password dan mengaktifkan akun. Cek inbox (atau folder spam)
            dalam beberapa menit.
          </p>
          <Link
            href="/portal/login"
            className="clay-button solid-matcha"
            style={{ display: "inline-block", marginTop: 8 }}
          >
            Ke Halaman Login →
          </Link>
          <p
            className="caption"
            style={{ color: "var(--warm-silver)", marginTop: 24 }}
          >
            Setelah aktivasi, kamu bisa langsung apply asuransi, lihat invoice,
            dan track status polis dari portal.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        // 100dvh = dynamic viewport height (handle mobile browser chrome);
        // fallback 100vh untuk browser lama. height + overflow: hidden
        // mengunci halaman agar tidak bisa di-scroll.
        height: "100dvh",
        minHeight: "100vh",
        width: "100vw",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        background: "var(--warm-cream)",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          // Kalau viewport sangat pendek, form di-clip (overflow: hidden
          // di parent), BUKAN di-scroll. User tidak akan lihat scrollbar.
          maxHeight: "calc(100dvh - 48px)",
          overflow: "hidden",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p className="uppercase-label" style={{ color: "var(--matcha-600)" }}>
            InsureTrack
          </p>
          <h1 className="display-secondary" style={{ fontSize: "2.5rem", marginTop: 8 }}>
            Daftar Akun Portal
          </h1>
          <p
            className="caption"
            style={{ color: "var(--warm-charcoal)", marginTop: 8 }}
          >
            Buat akun untuk akses polis, ajukan klaim, dan track status.
          </p>
        </div>

        <Form methods={methods} onSubmit={onSubmit} className="clay-card feature">
          <FormError message={formError} />

          <FormField label="Nama Lengkap" name="full_name" required>
            <input
              id="full_name"
              className="clay-input"
              autoComplete="name"
              {...methods.register("full_name")}
            />
          </FormField>

          <FormField label="Email" name="email" required>
            <input
              id="email"
              className="clay-input"
              type="email"
              autoComplete="email"
              {...methods.register("email")}
            />
          </FormField>

          <FormField
            label="Password"
            name="password"
            required
            hint="Minimal 8 karakter"
          >
            <input
              id="password"
              className="clay-input"
              type="password"
              autoComplete="new-password"
              {...methods.register("password")}
            />
          </FormField>

          <FormField label="Nomor HP" name="mobile_number" required hint="10-15 digit, contoh: 081234567890">
            <input
              id="mobile_number"
              className="clay-input"
              type="tel"
              autoComplete="tel"
              {...methods.register("mobile_number")}
            />
          </FormField>

          <button
            type="submit"
            disabled={submitting}
            className="clay-button solid-matcha"
            style={{ width: "100%", marginTop: 12 }}
          >
            {submitting ? "Membuat akun..." : "Daftar →"}
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "20px 0",
              color: "var(--warm-silver)",
              fontSize: "0.8rem",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--oat-border)" }} />
            <span className="uppercase-label" style={{ color: "var(--warm-silver)" }}>
              Sudah punya akun?
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--oat-border)" }} />
          </div>

          <Link
            href="/portal/login"
            className="clay-button ghost"
            style={{ width: "100%", justifyContent: "center" }}
          >
            Login di sini
          </Link>
        </Form>
      </div>
    </main>
  );
}
