"use client";

/**
 * Root error boundary. Wajib ada untuk semua App Router routes.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="clay-container clay-section" style={{ textAlign: "center", paddingTop: 96, paddingBottom: 96 }}>
      <p className="uppercase-label" style={{ color: "var(--pomegranate-400)", marginBottom: 24 }}>
        ✦ Application Error
      </p>
      <h1 className="display-secondary" style={{ marginBottom: 16 }}>
        Halaman tidak dapat dimuat
      </h1>
      <p className="body-large" style={{ color: "var(--warm-charcoal)", marginBottom: 32 }}>
        Silakan muat ulang halaman. Kalau masalah berlanjut, hubungi admin.
      </p>
      {error.digest && (
        <p style={{ fontSize: "0.75rem", color: "var(--warm-silver)", marginBottom: 24, fontFamily: "var(--font-space-mono), monospace" }}>
          ID: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="clay-button solid-ube pill size-large"
      >
        Coba lagi
      </button>
    </main>
  );
}
