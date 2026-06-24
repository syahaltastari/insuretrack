"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { apiFetch } from "@insuretrack/api-client";

const loginSchema = z.object({
  username: z.string().trim().min(3, "Username minimal 3 karakter").max(64),
  password: z.string().min(1, "Password wajib diisi"),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const methods = useForm<LoginValues>({
    resolver: zodResolver(loginSchema) as never,
    defaultValues: { username: "admin", password: "" },
    mode: "onSubmit",
  });

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      // Login endpoint ada di CSRF skip-list backend — tidak perlu
      // X-CSRF-Token header. Backend set 2 cookie di response (session
      // HttpOnly + csrf non-HttpOnly) yang akan di-attach otomatis oleh
      // browser ke request berikutnya.
      await apiFetch("/admin/login", {
        method: "POST",
        body: JSON.stringify({ username: values.username.trim(), password: values.password }),
      });
      router.replace("/admin/dashboard");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setSubmitting(false);
    }
  };

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
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p className="uppercase-label" style={{ color: "var(--ube-800)" }}>
            InsureTrack
          </p>
          <h1 className="display-secondary" style={{ fontSize: "2.5rem", marginTop: 8 }}>
            Admin Portal
          </h1>
        </div>

        <Form methods={methods} onSubmit={onSubmit} className="clay-card feature">
          <FormError message={formError} />

          <FormField label="Username" name="username" required>
            <input
              id="username"
              className="clay-input"
              autoComplete="username"
              {...methods.register("username")}
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
            className="clay-button solid-ube"
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
              Customer?
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--oat-border)" }} />
          </div>

          <Link
            href="/portal/login"
            className="clay-button ghost"
            style={{ width: "100%", justifyContent: "center" }}
          >
            ✦ Ke Customer Portal
          </Link>

          <p
            className="caption"
            style={{ textAlign: "center", marginTop: 16, color: "var(--warm-silver)" }}
          >
            Default: <span className="mono">admin</span> / <span className="mono">admin123</span>{" "}
            (dev only)
          </p>
        </Form>
      </div>
    </main>
  );
}
