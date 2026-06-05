"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Form, FormField, FormError } from "@/lib/forms";
import { emailSchema, passwordSchema } from "@/lib/schemas/common";
import { API_BASE } from "@/lib/api";
import { setCustomerToken } from "@/lib/auth";

const requestSchema = z.object({
  email: emailSchema.refine((s) => s.length > 0, { message: "Email wajib diisi" }),
});
type RequestValues = z.infer<typeof requestSchema>;

const consumeSchema = z
  .object({
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirm_password"],
  });
type ConsumeValues = z.infer<typeof consumeSchema>;

function ResetInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [consumeError, setConsumeError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);

  // ----- Mode 1: no token → email form -----
  const requestMethods = useForm<RequestValues>({
    resolver: zodResolver(requestSchema) as never,
    defaultValues: { email: "" },
    mode: "onSubmit",
  });
  const onRequestSubmit = async (values: RequestValues) => {
    setSubmitting(true);
    setRequestError(null);
    try {
      const r = await fetch(`${API_BASE}/customer/password/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email.trim() }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      // Backend returns the token + reset_url (dev convenience). In prod
      // the email would be sent instead; the customer wouldn't see the
      // token. For the dev build we just acknowledge.
      setRequestSent(true);
      toast.success("Link reset password sudah dikirim ke email Anda");
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : "Gagal mengirim request");
    } finally {
      setSubmitting(false);
    }
  };

  // ----- Mode 2: with token → new password form -----
  const consumeMethods = useForm<ConsumeValues>({
    resolver: zodResolver(consumeSchema) as never,
    defaultValues: { new_password: "", confirm_password: "" },
    mode: "onSubmit",
  });
  const onConsumeSubmit = async (values: ConsumeValues) => {
    setSubmitting(true);
    setConsumeError(null);
    try {
      const r = await fetch(`${API_BASE}/customer/password/reset/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          new_password: values.new_password,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      const j = await r.json();
      if (j?.token) {
        setCustomerToken(j.token);
        toast.success("Password berhasil diubah. Mengarahkan ke portal...");
        setTimeout(() => router.replace("/portal/dashboard"), 800);
      } else {
        toast.success("Password berhasil diubah");
        setTimeout(() => router.replace("/portal/login"), 800);
      }
    } catch (e) {
      setConsumeError(e instanceof Error ? e.message : "Gagal ubah password");
    } finally {
      setSubmitting(false);
    }
  };

  const requestRootErr = requestMethods.formState.errors.root?.message;

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
            <p className="uppercase-label" style={{ color: "var(--ube-800)" }}>
              InsureTrack
            </p>
            <h1 className="display-secondary" style={{ fontSize: "2.25rem", marginTop: 8 }}>
              {token ? "Password Baru" : "Reset Password"}
            </h1>
            {!token && (
              <p
                className="body"
                style={{ color: "var(--warm-charcoal)", marginTop: 12 }}
              >
                Masukkan email Anda. Kami akan mengirim link untuk mengatur ulang
                password.
              </p>
            )}
          </div>

          {/* --- Mode 1: no token --- */}
          {!token && !requestSent && (
            <Form
              methods={requestMethods}
              onSubmit={onRequestSubmit}
              className="clay-card feature"
            >
              <FormError message={requestError ?? requestRootErr ?? null} />
              <FormField label="Email" name="email" required>
                <input
                  id="email"
                  className="clay-input"
                  type="email"
                  autoComplete="email"
                  {...requestMethods.register("email")}
                />
              </FormField>
              <button
                type="submit"
                disabled={submitting}
                className="clay-button solid-ube"
                style={{ width: "100%", marginTop: 12 }}
              >
                {submitting ? "Mengirim..." : "Kirim Link Reset →"}
              </button>
            </Form>
          )}

          {/* --- Mode 1: after success --- */}
          {!token && requestSent && (
            <div
              className="clay-card feature swatch-matcha"
              style={{ textAlign: "center", padding: 24 }}
            >
              <h2
                className="card-heading"
                style={{ color: "var(--pure-white)", marginBottom: 12 }}
              >
                ✓ Email Terkirim
              </h2>
              <p style={{ color: "var(--matcha-300)", margin: 0 }}>
                Cek inbox Anda. Link reset password berlaku 30 menit.
              </p>
            </div>
          )}

          {/* --- Mode 2: with token --- */}
          {token && (
            <Form
              methods={consumeMethods}
              onSubmit={onConsumeSubmit}
              className="clay-card feature"
            >
              <FormError message={consumeError ?? null} />
              <FormField
                label="Password Baru"
                name="new_password"
                required
                hint="Min 8 karakter, 1 huruf besar, 1 angka"
              >
                <input
                  id="new_password"
                  className="clay-input"
                  type="password"
                  autoComplete="new-password"
                  {...consumeMethods.register("new_password")}
                />
              </FormField>
              <FormField
                label="Konfirmasi Password"
                name="confirm_password"
                required
              >
                <input
                  id="confirm_password"
                  className="clay-input"
                  type="password"
                  autoComplete="new-password"
                  {...consumeMethods.register("confirm_password")}
                />
              </FormField>
              <button
                type="submit"
                disabled={submitting}
                className="clay-button solid-matcha"
                style={{ width: "100%", marginTop: 12 }}
              >
                {submitting ? "Menyimpan..." : "Ubah Password & Login →"}
              </button>
            </Form>
          )}
        </div>
      </main>
    </>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem" }}>Memuat...</p>}>
      <ResetInner />
    </Suspense>
  );
}
