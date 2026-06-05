"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * App Router error boundary (catches errors in server components + nested
 * client components). Required for production builds; without it Next.js
 * 15.0.3 fails the build with a `/500` page-render error.
 */
export default function GlobalAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("App error:", error);
  }, [error]);

  return (
    <main
      className="clay-section"
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        background: "var(--warm-cream)",
      }}
    >
      <div className="clay-container" style={{ maxWidth: 560, textAlign: "center" }}>
        <p className="uppercase-label" style={{ color: "var(--pomegranate-400)" }}>
          ✦ 500
        </p>
        <h1 className="display-secondary" style={{ marginTop: 8, fontSize: "2.25rem" }}>
          Terjadi Kesalahan
        </h1>
        <p
          className="body-large"
          style={{ color: "var(--warm-charcoal)", marginTop: 12, marginBottom: 24 }}
        >
          Maaf, halaman tidak dapat dimuat. Tim kami sudah menerima laporan otomatis.
        </p>
        {error.digest && (
          <p className="caption mono" style={{ color: "var(--warm-silver)", marginBottom: 24 }}>
            ID: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={reset} className="clay-button solid-ube">
            Coba Lagi
          </button>
          <Link href="/" className="clay-button ghost">
            Ke Beranda
          </Link>
        </div>
      </div>
    </main>
  );
}
