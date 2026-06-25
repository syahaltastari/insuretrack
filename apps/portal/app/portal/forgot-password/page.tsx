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
import { Form, FormField, FormError } from "@insuretrack/forms";
import { emailSchema, passwordSchema } from "@insuretrack/forms";
import { apiFetch, checkSession } from "@insuretrack/api-client";

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
  // Kalau user sudah login, reset password tidak relevan (asumsi
  // user tahu passwordnya). Redirect ke dashboard. Probe pakai
  // `checkSession("customer")` — cookie auto-attach.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkSession("customer").then((authed) => {
      if (cancelled) return;
      if (authed) {
        router.replace("/portal/dashboard");
      } else {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

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
      // /customer/password/reset di CSRF skip-list backend (anti-enumeration,
      // selalu return 200). Anti-enumeration tetap berlaku — response
      // tidak bocorin "email tidak ada" vs "email ada".
      await apiFetch("/customer/password/reset", {
        method: "POST",
        body: JSON.stringify({ email: values.email.trim().toLowerCase() }),
      });
      setRequestSent(true);
      toast.success("Link reset password sudah dikirim ke email Anda");
    } catch (e) {
      const msg = e instanceof TypeError
        ? "Tidak dapat terhubung ke server. Periksa koneksi Anda dan coba lagi."
        : e instanceof Error
          ? e.message
          : "Gagal mengirim request";
      setRequestError(msg);
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
      // /customer/password/reset/consume di CSRF skip-list backend
      // (pakai purpose="password_reset" JWT di body, bukan session cookie).
      // Backend set session + csrf cookie di response kalau sukses —
      // user otomatis login.
      await apiFetch("/customer/password/reset/consume", {
        method: "POST",
        body: JSON.stringify({
          token,
          new_password: values.new_password,
        }),
      });
      toast.success("Password berhasil diubah. Mengarahkan ke portal...");
      setTimeout(() => router.replace("/portal/dashboard"), 800);
    } catch (e) {
      setConsumeError(e instanceof Error ? e.message : "Gagal ubah password");
    } finally {
      setSubmitting(false);
    }
  };

  const requestRootErr = requestMethods.formState.errors.root?.message;

  // Sambil session check running, render placeholder supaya tidak ada
  // flash form. Setelah ready=true → render form normal.
  if (!ready) {
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
          <p style={{ color: "var(--warm-silver)" }}>Memuat...</p>
        </main>
      </>
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
