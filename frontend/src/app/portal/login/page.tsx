"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { API_BASE } from "@/lib/api";
import { setCustomerToken } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";
import { Form, FormField, FormError } from "@/lib/forms";
import { emailSchema } from "@/lib/schemas/common";

const loginSchema = z.object({
  email: emailSchema.refine((s) => s.length > 0, { message: "Email wajib diisi" }),
  password: z.string().min(1, "Password wajib diisi"),
});
type LoginValues = z.infer<typeof loginSchema>;

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/portal/dashboard";
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const methods = useForm<LoginValues>({
    resolver: zodResolver(loginSchema) as never,
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const r = await fetch(`${API_BASE}/customer/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: values.email.trim(), password: values.password }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.error?.message ?? "Login gagal");
      setCustomerToken(json.token);
      router.replace(next);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main
        className="clay-section"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "var(--warm-cream)",
          paddingTop: 48,
        }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <p className="uppercase-label" style={{ color: "var(--matcha-600)" }}>
              InsureTrack
            </p>
            <h1 className="display-secondary" style={{ fontSize: "2.5rem", marginTop: 8 }}>
              Customer Portal
            </h1>
          </div>

          <Form methods={methods} onSubmit={onSubmit} className="clay-card feature">
            <FormError message={formError} />

            <FormField label="Email" name="email" required>
              <input
                id="email"
                className="clay-input"
                type="email"
                autoComplete="email"
                {...methods.register("email")}
              />
            </FormField>

            <FormField label="Password" name="password" required>
              <input
                id="password"
                className="clay-input"
                type="password"
                autoComplete="current-password"
                {...methods.register("password")}
              />
            </FormField>

            <button
              type="submit"
              disabled={submitting}
              className="clay-button solid-matcha"
              style={{ width: "100%", marginTop: 12 }}
            >
              {submitting ? "Login..." : "Login →"}
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
                Belum Punya Akun?
              </span>
              <div style={{ flex: 1, height: 1, background: "var(--oat-border)" }} />
            </div>

            <Link
              href="/register"
              className="clay-button ghost"
              style={{ width: "100%", justifyContent: "center" }}
            >
              ✦ Daftar Sebagai Customer Baru
            </Link>

            <p
              className="caption"
              style={{ textAlign: "center", marginTop: 16, color: "var(--warm-silver)" }}
            >
              Aktivasi akun via link di email setelah polis terbit.
            </p>
          </Form>

          <p
            className="caption"
            style={{ textAlign: "center", marginTop: 16, color: "var(--warm-charcoal)" }}
          >
            Anda admin?{" "}
            <Link
              href="/admin/login"
              style={{ color: "var(--ube-800)", textDecoration: "underline" }}
            >
              Login di sini
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem" }}>Memuat...</p>}>
      <LoginInner />
    </Suspense>
  );
}
