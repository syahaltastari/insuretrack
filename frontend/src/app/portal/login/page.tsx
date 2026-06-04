"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { setCustomerToken } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/portal/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/customer/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error?.message ?? "Login gagal");
      setCustomerToken(json.token);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main
        className="clay-section"
        style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--warm-cream)", paddingTop: 48 }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <p className="uppercase-label" style={{ color: "var(--matcha-600)" }}>InsureTrack</p>
            <h1 className="display-secondary" style={{ fontSize: "2.5rem", marginTop: 8 }}>Customer Portal</h1>
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

            <label className="clay-label">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="clay-input"
              style={{ marginBottom: 16 }}
            />

            <label className="clay-label">Password</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="clay-input"
              style={{ marginBottom: 24 }}
            />

            <button
              type="submit"
              disabled={submitting}
              className="clay-button solid-matcha"
              style={{ width: "100%" }}
            >
              {submitting ? "Login..." : "Login →"}
            </button>

            {/* Divider */}
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
              <span className="uppercase-label" style={{ color: "var(--warm-silver)" }}>Belum Punya Akun?</span>
              <div style={{ flex: 1, height: 1, background: "var(--oat-border)" }} />
            </div>

            <Link
              href="/register"
              className="clay-button ghost"
              style={{ width: "100%", justifyContent: "center" }}
            >
              ✦ Daftar Sebagai Customer Baru
            </Link>

            <p className="caption" style={{ textAlign: "center", marginTop: 16, color: "var(--warm-silver)" }}>
              Aktivasi akun via link di email setelah polis terbit.
            </p>
          </form>

          {/* Admin link */}
          <p className="caption" style={{ textAlign: "center", marginTop: 16, color: "var(--warm-charcoal)" }}>
            Anda admin?{" "}
            <Link href="/admin/login" style={{ color: "var(--ube-800)", textDecoration: "underline" }}>
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
