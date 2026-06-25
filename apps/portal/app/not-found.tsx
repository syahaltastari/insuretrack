import Link from "next/link";
import { Icon } from "@insuretrack/ui";

// v2: force-dynamic untuk skip static prerender yang trigger Next.js
// 15.0.3 bug ("<Html> should not be imported outside of pages/_document")
// di /404 fallback. Halaman ini tetap SSR di-request (sesuai semantics
// not-found), bukan statically generated.
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main
      className="clay-container flex flex-col items-center justify-center text-center"
      style={{
        paddingTop: 120,
        paddingBottom: 120,
        minHeight: "70vh",
      }}
    >
      {/* Ilustrasi icon besar — SearchX di circle honey-400 bg. Tone
          friendly, bukan "error" yang intimidating. */}
      <div
        className="inline-flex items-center justify-center w-24 h-24 rounded-full mb-8"
        style={{
          background: "var(--honey-100)",
          border: "2px solid var(--honey-300)",
        }}
        aria-hidden="true"
      >
        <Icon
          name="Search"
          size="xl"
          style={{ color: "var(--honey-700)" }}
        />
      </div>

      {/* 404 number besar — display style, honey-400 sebagai accent */}
      <p
        className="uppercase-label mb-3"
        style={{ color: "var(--honey-700)" }}
      >
        ✦ 404
      </p>

      <h1
        className="display-secondary mb-5"
        style={{ color: "var(--ink)" }}
      >
        Halaman tidak ditemukan
      </h1>

      <p
        className="body-large mb-10 max-w-md mx-auto"
        style={{ color: "var(--charcoal)" }}
      >
        Tautan yang Anda buka tidak tersedia atau sudah dipindahkan. Cek
        kembali URL, atau kembali ke beranda untuk mulai ulang.
      </p>

      <div className="flex flex-wrap gap-3 justify-center">
        <Link
          href="/"
          className="clay-button solid-honey size-large pill inline-flex items-center gap-2"
        >
          <Icon name="ArrowRight" size="sm" style={{ transform: "rotate(180deg)" }} />
          Kembali ke Beranda
        </Link>
        <a
          href="mailto:contact@insuretrack.com"
          className="clay-button outline-honey size-large pill"
        >
          Hubungi CS
        </a>
      </div>
    </main>
  );
}
