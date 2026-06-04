"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { setAdminToken } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error?.message ?? "Login gagal");
      setAdminToken(json.token);
      router.replace("/admin/dashboard");
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
            <p className="uppercase-label" style={{ color: "var(--ube-800)" }}>InsureTrack</p>
            <h1 className="display-secondary" style={{ fontSize: "2.5rem", marginTop: 8 }}>Admin Portal</h1>
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

            <label className="clay-label">Username</label>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
              className="clay-button solid-ube"
              style={{ width: "100%" }}
            >
              {submitting ? "Login..." : "Login →"}
            </button>

            {/* Cross-link to customer side */}
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
              <span className="uppercase-label" style={{ color: "var(--warm-silver)" }}>Customer?</span>
              <div style={{ flex: 1, height: 1, background: "var(--oat-border)" }} />
            </div>

            <Link
              href="/portal/login"
              className="clay-button ghost"
              style={{ width: "100%", justifyContent: "center" }}
            >
              ✦ Ke Customer Portal
            </Link>

            <p className="caption" style={{ textAlign: "center", marginTop: 16, color: "var(--warm-silver)" }}>
              Default: <span className="mono">admin</span> / <span className="mono">admin123</span> (dev only)
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
