"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, checkSession } from "@insuretrack/api-client";

function ActivateInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Kalau user sudah login, activation flow tidak relevan (akun
  // diasumsikan sudah ACTIVE). Redirect ke dashboard. Probe pakai
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

  // Activation flow disederhanakan: password SUDAH di-set saat register
  // (POST /api/public/customers). Halaman ini tinggal konfirmasi token
  // dan flip portal_status dari PENDING → ACTIVE. Tidak ada form password.

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

  // Sambil session check running, render placeholder supaya tidak ada
  // flash "token not found" → form ke user yang sudah login.
  if (!ready) {
    return (
      <main
        style={{
          height: "100dvh",
          minHeight: "100vh",
          width: "100vw",
          background: "var(--warm-cream)",
          padding: 24,
        }}
      >
        <p style={{ color: "var(--warm-silver)" }}>Memuat...</p>
      </main>
    );
  }

  const onActivate = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      // Activate endpoint di CSRF skip-list backend. Backend set session
      // cookie + csrf cookie di response.
      await apiFetch("/customer/activate", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      router.replace("/portal/dashboard");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Aktivasi gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
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
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p className="uppercase-label" style={{ color: "var(--matcha-600)" }}>
            InsureTrack
          </p>
          <h1 className="display-secondary" style={{ fontSize: "2.5rem", marginTop: 8 }}>
            Aktivasi Akun
          </h1>
          <p
            className="body"
            style={{ color: "var(--warm-charcoal)", marginTop: 12, marginBottom: 0 }}
          >
            Klik tombol di bawah untuk mengaktifkan akun portal Anda. Setelah
            aktif, Anda otomatis login dan langsung bisa apply asuransi,
            lihat invoice, dan track status polis dari portal.
          </p>
        </div>

        <div className="clay-card feature">
          {formError && (
            <div
              role="alert"
              style={{
                borderColor: "var(--pomegranate-400)",
                background: "var(--pomegranate-50)",
                padding: "10px 14px",
                borderRadius: "var(--radius-card)",
                marginBottom: 12,
              }}
            >
              ⚠ {formError}
            </div>
          )}
          <button
            type="button"
            onClick={onActivate}
            disabled={submitting}
            className="clay-button solid-matcha"
            style={{ width: "100%", marginTop: 4 }}
          >
            {submitting ? "Mengaktifkan..." : "Aktifkan Akun →"}
          </button>
        </div>

        <p
          className="caption"
          style={{ textAlign: "center", marginTop: 16, color: "var(--warm-silver)" }}
        >
          Link aktivasi ini single-use dan akan expire setelah dipakai.
        </p>
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
