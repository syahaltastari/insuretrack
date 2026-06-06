import Link from "next/link";

export default function NotFound() {
  return (
    <main className="clay-container clay-section" style={{ textAlign: "center", paddingTop: 96, paddingBottom: 96 }}>
      <p className="uppercase-label" style={{ color: "var(--pomegranate-400)", marginBottom: 24 }}>
        ✦ 404
      </p>
      <h1 className="display-secondary" style={{ marginBottom: 16 }}>
        Halaman tidak ditemukan
      </h1>
      <p className="body-large" style={{ color: "var(--warm-charcoal)", marginBottom: 32 }}>
        Tautan yang Anda buka tidak tersedia atau sudah dipindahkan.
      </p>
      <Link href="/" className="clay-button solid-ube pill">
        Kembali ke Beranda
      </Link>
    </main>
  );
}
