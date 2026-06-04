"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { setCustomerToken } from "@/lib/auth";

function ActivateInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <main className="clay-section" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div className="clay-card feature" style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 className="card-heading">Token Aktivasi Tidak Ditemukan</h1>
          <p className="body" style={{ color: "var(--warm-charcoal)" }}>
            Pastikan Anda membuka link aktivasi dari email dengan lengkap.
          </p>
        </div>
      </main>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/customer/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error?.message ?? "Aktivasi gagal");
      setCustomerToken(json.token);
      router.replace("/portal/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktivasi gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="clay-section" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--warm-cream)" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p className="uppercase-label" style={{ color: "var(--matcha-600)" }}>InsureTrack</p>
          <h1 className="display-secondary" style={{ fontSize: "2.5rem", marginTop: 8 }}>Aktivasi Akun</h1>
        </div>

        <form onSubmit={onSubmit} className="clay-card feature">
          {error && (
            <div
              style={{
                background: "#fff5f5",
                border: "1px solid var(--pomegranate-400)",
                padding: "10px 14px",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: "0.9rem",
              }}
            >
              ⚠ {error}
            </div>
          )}

          <label className="clay-label">Password Baru (min 8 karakter)</label>
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="clay-input"
            style={{ marginBottom: 16 }}
          />

          <label className="clay-label">Konfirmasi Password</label>
          <input
            required
            type="password"
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="clay-input"
            style={{ marginBottom: 24 }}
          />

          <button
            type="submit"
            disabled={submitting}
            className="clay-button solid-matcha"
            style={{ width: "100%" }}
          >
            {submitting ? "Mengaktifkan..." : "Aktifkan & Login →"}
          </button>
        </form>
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
