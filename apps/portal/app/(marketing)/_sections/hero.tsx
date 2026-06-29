// Floating e-policy card di kanan adalah signature moment — visual cue
// "ini yang akan Anda dapatkan" tanpa klaim spesifik yang tidak bisa
// di-backup.

import Link from "next/link";
import { Icon } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { COPY } from "../_data/copy";

export function Hero() {
  return (
    <section
      className="clay-section py-20 md:py-28 relative overflow-hidden"
      style={{ background: "var(--canvas)" }}
    >
      {/* Decorative honey blobs — soft glow di belakang hero content.
          Pointer-events none, absolute, blur besar. Tidak block interaksi. */}
      <div aria-hidden="true" className="hero-blob hero-blob-primary" />
      <div aria-hidden="true" className="hero-blob hero-blob-secondary" />

      <div className="clay-container relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* Left column: text content — center on mobile, left on desktop */}
          <div className="text-center md:text-left">
            <Reveal aboveFold>
              <div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 border
                           md:flex"
                style={{
                  background: "var(--honey-100)",
                  color: "var(--honey-700)",
                  borderColor: "var(--honey-300)",
                }}
              >
                <Icon name="ShieldCheck" size="sm" />
                <span className="uppercase-label m-0">{COPY.hero.eyebrow}</span>
              </div>
            </Reveal>

            <Reveal aboveFold delay={0.15}>
              <h1
                className="display-hero mb-6"
                style={{ color: "var(--ink)" }}
              >
                {COPY.hero.titleLead}
                <br />
                <span style={{ color: "var(--honey-700)" }}>
                  {COPY.hero.titleAccent}
                </span>
              </h1>
            </Reveal>

            <Reveal aboveFold delay={0.3}>
              <p
                className="body-large mb-10 max-w-xl mx-auto md:mx-0"
                style={{ color: "var(--charcoal)" }}
              >
                {COPY.hero.subtitle}
              </p>
            </Reveal>

            <Reveal aboveFold delay={0.45}>
              <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                <Link
                  href="/portal/register"
                  className="clay-button solid-honey size-large pill inline-flex items-center gap-2"
                >
                  {COPY.hero.primaryCta}
                  <Icon name="ArrowRight" size="sm" />
                </Link>
                <a
                  href="#products"
                  className="clay-button outline-honey size-large pill"
                >
                  {COPY.hero.secondaryCta}
                </a>
              </div>
            </Reveal>
          </div>

          {/* Right column: floating e-policy card (desktop only).
              Stagger terakhir (0.65s) supaya muncul setelah CTA settle,
              kasih "puncak visual" di akhir cascade. */}
          <Reveal aboveFold delay={0.65} className="hidden md:block">
            <HeroCardMockup />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// E-policy mockup — visual signature. Mock data generik (masked policy
// number, "Contoh" prefix) supaya tidak klaim spesifik yang tidak bisa
// di-backup. Tone: "beginilah polis Anda ketika terbit".
function HeroCardMockup() {
  return (
    <div className="hero-card" aria-label="Contoh e-policy">
      {/* Header — logo + status pill */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span
            className="inline-grid place-items-center w-8 h-8 rounded-lg"
            style={{ background: "var(--ink)", color: "var(--honey-400)" }}
            aria-hidden="true"
          >
            ◆
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--ink)" }}
          >
            InsureTrack
          </span>
        </div>
        <span className="status-pill status-pill-active">
          <span className="status-pill-dot" aria-hidden="true" />
          Aktif
        </span>
      </div>

      {/* Policy number — masked, generic */}
      <p
        className="mono text-xs uppercase tracking-wider mb-2"
        style={{ color: "var(--stone)" }}
      >
        No. Polis
      </p>
      <p
        className="mono text-base font-semibold mb-5"
        style={{ color: "var(--ink)" }}
      >
        POL-202606-000123
      </p>

      {/* Plan + coverage */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <p
            className="text-xs uppercase tracking-wider mb-1"
            style={{ color: "var(--stone)" }}
          >
            Produk
          </p>
          <p
            className="text-sm font-medium m-0"
            style={{ color: "var(--ink)" }}
          >
            Jiwa Premium
          </p>
        </div>
        <div>
          <p
            className="text-xs uppercase tracking-wider mb-1"
            style={{ color: "var(--stone)" }}
          >
            Masa Perlindungan
          </p>
          <p
            className="text-sm font-medium m-0"
            style={{ color: "var(--ink)" }}
          >
            1 tahun
          </p>
        </div>
      </div>

      {/* Coverage amount — big number, hero of the card */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: "var(--honey-tint)" }}
      >
        <p
          className="text-xs uppercase tracking-wider mb-1"
          style={{ color: "var(--honey-700)" }}
        >
          Nilai Pertanggungan
        </p>
        <p
          className="text-2xl font-bold m-0"
          style={{ color: "var(--ink)" }}
        >
          Rp 500.000.000
        </p>
      </div>

      {/* Footer — issued date */}
      <div
        className="pt-4 flex items-center justify-between"
        style={{ borderTop: "1px dashed var(--oat-refined)" }}
      >
        <div>
          <p
            className="text-xs m-0"
            style={{ color: "var(--stone)" }}
          >
            Diterbitkan
          </p>
          <p
            className="text-sm font-medium m-0"
            style={{ color: "var(--ink)" }}
          >
            24 Juni 2026
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: "var(--honey-700)" }}
        >
          <Icon name="ShieldCheck" size="xs" />
          <span>Verified</span>
        </div>
      </div>
    </div>
  );
}
