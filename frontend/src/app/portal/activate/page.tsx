"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { API_BASE } from "@/lib/api";
import { setCustomerToken } from "@/lib/auth";
import { Form, FormField, FormError } from "@/lib/forms";
import { passwordSchema } from "@/lib/schemas/common";

const activateSchema = z
  .object({
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirm_password"],
  });
type ActivateValues = z.infer<typeof activateSchema>;

function ActivateInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const methods = useForm<ActivateValues>({
    resolver: zodResolver(activateSchema) as never,
    defaultValues: { password: "", confirm_password: "" },
    mode: "onSubmit",
  });

  if (!token) {
    return (
      <main
        className="clay-section"
        style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
      >
        <div className="clay-card feature" style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 className="card-heading">Token Aktivasi Tidak Ditemukan</h1>
          <p className="body" style={{ color: "var(--warm-charcoal)" }}>
            Pastikan Anda membuka link aktivasi dari email dengan lengkap.
          </p>
        </div>
      </main>
    );
  }

  const onSubmit = async (values: ActivateValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const r = await fetch(`${API_BASE}/customer/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: values.password }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.error?.message ?? "Aktivasi gagal");
      setCustomerToken(json.token);
      router.replace("/portal/dashboard");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Aktivasi gagal");
    } finally {
      setSubmitting(false);
    }
  };

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
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p className="uppercase-label" style={{ color: "var(--matcha-600)" }}>
            InsureTrack
          </p>
          <h1 className="display-secondary" style={{ fontSize: "2.5rem", marginTop: 8 }}>
            Aktivasi Akun
          </h1>
        </div>

        <Form methods={methods} onSubmit={onSubmit} className="clay-card feature">
          <FormError message={formError} />

          <FormField
            label="Password Baru"
            name="password"
            required
            hint="Minimal 8 karakter, 1 huruf besar, 1 angka"
          >
            <input
              id="password"
              className="clay-input"
              type="password"
              autoComplete="new-password"
              {...methods.register("password")}
            />
          </FormField>

          <FormField label="Konfirmasi Password" name="confirm_password" required>
            <input
              id="confirm_password"
              className="clay-input"
              type="password"
              autoComplete="new-password"
              {...methods.register("confirm_password")}
            />
          </FormField>

          <button
            type="submit"
            disabled={submitting}
            className="clay-button solid-matcha"
            style={{ width: "100%", marginTop: 12 }}
          >
            {submitting ? "Mengaktifkan..." : "Aktifkan & Login →"}
          </button>
        </Form>
      </div>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem" }}>Memuat...</p>}>
      <ActivateInner />
    </Suspense>
  );
}
