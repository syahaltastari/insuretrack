"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiFetch, checkSession } from "@insuretrack/api-client";
import { Navbar } from "@/components/Navbar";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { emailSchema } from "@insuretrack/forms";

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
  // Kalau user sudah punya session valid, skip form dan redirect ke
  // dashboard. `ready=false` sampai check selesai — mencegah flash
  // form ke user yang sudah login. Probe pakai `checkSession("customer")`
  // (async, cookie auto-attach).
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkSession("customer").then((authed) => {
      if (cancelled) return;
      if (authed) {
        router.replace(next);
      } else {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  const methods = useForm<LoginValues>({
    resolver: zodResolver(loginSchema) as never,
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      // Login endpoint di CSRF skip-list backend. Backend set 2 cookie
      // di response — browser auto-attach ke request berikutnya.
      await apiFetch("/customer/login", {
        method: "POST",
        body: JSON.stringify({ username: values.email.trim(), password: values.password }),
      });
      router.replace(next);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setSubmitting(false);
    }
  };

  // Sambil session check running, render placeholder supaya tidak ada
  // flash form. Setelah ready=true → render form normal.
  if (!ready) {
    return (
      <main
        className="clay-section"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "var(--warm-cream)",
        }}
      >
        <p style={{ color: "var(--warm-silver)" }}>Memuat...</p>
      </main>
    );
  }

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

            <p
              className="caption"
              style={{ textAlign: "center", marginTop: 12, color: "var(--warm-charcoal)" }}
            >
              <Link
                href="/portal/reset"
                style={{ color: "var(--matcha-600)", textDecoration: "underline" }}
              >
                Lupa password?
              </Link>
            </p>

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
              href="/portal/register"
              className="clay-button ghost"
              style={{ width: "100%", justifyContent: "center" }}
            >
              ✦ Daftar Akun Portal
            </Link>

            <p
              className="caption"
              style={{ textAlign: "center", marginTop: 16, color: "var(--warm-silver)" }}
            >
              Aktivasi akun via link di email. Setelah aktif, baru bisa apply
              asuransi dari portal.
            </p>
          </Form>

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
