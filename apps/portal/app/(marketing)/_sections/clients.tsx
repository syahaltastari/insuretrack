// Clients — logo strip statis (no scroll, no carousel). Conditional render
// dari page.tsx: hanya muncul kalau `clients.length > 0` (di-handle di page).
//
// Logo: grayscale default → warna saat hover (CSS class `client-logo` di
// globals.css handle ini). Center-aligned grid, wrap ke baris berikutnya
// kalau overflow.

import { SafeImage } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { COPY } from "../_data/copy";
import { type Client } from "../_lib/api";

export function Clients({ clients }: { clients: Client[] }) {
  return (
    <section className="clay-section pt-0 pb-20">
      <div className="clay-container">
        <Reveal>
          <div className="text-center mb-8">
            <span
              className="uppercase-label inline-flex items-center gap-2"
              style={{ color: "var(--ube-800)" }}
            >
              <SparklesInline />
              {COPY.clients.eyebrow}
            </span>
            <h2 className="section-heading mt-4">{COPY.clients.title}</h2>
          </div>
        </Reveal>

        <div
          role="list"
          aria-label="Logo klien korporat"
          className="flex flex-wrap justify-center items-center gap-8 max-w-5xl mx-auto"
        >
          {clients.map((c) => (
            <a
              key={c.id}
              href={c.website ?? "#"}
              target={c.website ? "_blank" : undefined}
              rel="noopener noreferrer"
              role="listitem"
              className="client-logo inline-flex items-center justify-center no-underline text-inherit"
            >
              <SafeImage
                src={c.logo_url}
                alt={c.name}
                initials={c.name}
                size={88}
                rounded={false}
                style={{
                  height: "72px",
                  width: "auto",
                  maxWidth: "160px",
                  objectFit: "contain",
                }}
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function SparklesInline() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
    </svg>
  );
}
