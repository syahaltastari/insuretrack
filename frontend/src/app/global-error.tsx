"use client";

/**
 * Root error boundary. Required for production builds — without it Next.js
 * 15.0.3 fails the build with the `<Html>`-outside-`pages/_document` error
 * because the framework's internal 500 page tries to render with the
 * pages-router Document, which doesn't exist in pure App-Router apps.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#faf9f7",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#000",
        }}
      >
        <div style={{ maxWidth: 520, padding: 24, textAlign: "center" }}>
          <p
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#fc7981",
              margin: 0,
            }}
          >
            ✦ Application Error
          </p>
          <h1 style={{ fontSize: "1.75rem", margin: "8px 0 12px" }}>
            Halaman tidak dapat dimuat
          </h1>
          <p style={{ color: "#55534e", marginBottom: 24 }}>
            Silakan muat ulang halaman. Kalau masalah berlanjut, hubungi admin.
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", color: "#9f9b93", marginBottom: 24, fontFamily: "monospace" }}>
              ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              background: "#000",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
