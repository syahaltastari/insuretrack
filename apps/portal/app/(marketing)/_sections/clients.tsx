// Trust Strip — thin band antara Hero dan Produk. Tone tenang, factual.
// Tujuan: turunkan friction user dengan social proof (logos) + factual
// reassurance (OJK tagline) SEBELUM mereka scroll ke product detail.
//
// Layout: 1 baris tagline di tengah, di bawahnya logo klien korporat
// (dari backend). Untuk 4+ logos, pakai infinite marquee — feel "alive"
// tanpa distracting. Untuk < 4 logos, fallback ke static centered grid
// supaya tidak terasa kosong (marquee dengan 2 logo + gap besar = jelek).
//
// Conditional render dari page.tsx: hanya muncul kalau `clients.length > 0`.

import { Icon, SafeImage } from "@insuretrack/ui";
import { Fragment } from "react";
import { Reveal } from "../_motion/reveal";
import { COPY } from "../_data/copy";
import { type Client } from "../_lib/api";

const MARQUEE_THRESHOLD = 4;

export function Clients({ clients }: { clients: Client[] }) {
  return (
    <section
      className="landing-section"
      style={{ background: "var(--paper)" }}
    >
      <div className="clay-container">
        <Reveal>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-10 text-center">
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
              style={{
                background: "var(--pure-white)",
                color: "var(--ink)",
                border: "1px solid var(--oat-refined)",
              }}
            >
              <Icon
                name="ShieldCheck"
                size="sm"
                style={{ color: "var(--matcha-600)" }}
              />
              Terdaftar &amp; diawasi OJK
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: "var(--charcoal)" }}
            >
              {COPY.trustStrip.tagline}
            </span>
          </div>
        </Reveal>

        {clients.length >= MARQUEE_THRESHOLD ? (
          <LogoMarquee clients={clients} />
        ) : (
          <LogoGrid clients={clients} />
        )}
      </div>
    </section>
  );
}

/** Infinite marquee untuk 4+ logo. Duplicate list 2x supaya loop seamless. */
function LogoMarquee({ clients }: { clients: Client[] }) {
  return (
    <div
      className="logo-marquee"
      role="list"
      aria-label="Logo klien korporat"
    >
      <div className="logo-marquee-track">
        {/* Render 2x untuk seamless loop. Fragment + key duplicate. */}
        {[0, 1].map((dup) => (
          <Fragment key={dup}>
            {clients.map((c) => (
              <LogoItem key={`${dup}-${c.id}`} client={c} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** Static grid untuk < 4 logo — center-aligned, wrap ke baris berikutnya. */
function LogoGrid({ clients }: { clients: Client[] }) {
  return (
    <div
      role="list"
      aria-label="Logo klien korporat"
      className="flex flex-wrap justify-center items-center gap-8 md:gap-12 max-w-5xl mx-auto"
    >
      {clients.map((c) => (
        <LogoItem key={c.id} client={c} />
      ))}
    </div>
  );
}

/** Single logo — shared by marquee & grid. Grayscale default, color on hover. */
function LogoItem({ client: c }: { client: Client }) {
  return (
    <a
      href={c.website ?? "#"}
      target={c.website ? "_blank" : undefined}
      rel="noopener noreferrer"
      role="listitem"
      className="client-logo inline-flex items-center justify-center no-underline text-inherit flex-shrink-0"
      aria-label={c.name}
    >
      <SafeImage
        src={c.logo_url}
        alt={c.name}
        initials={c.name}
        size={88}
        rounded={false}
        style={{
          height: "56px",
          width: "auto",
          maxWidth: "140px",
          objectFit: "contain",
        }}
      />
    </a>
  );
}
