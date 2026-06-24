// Final CTA — penutup visual sebelum Footer. Background `swatch-matcha-deep`
// (matcha gelap kontras dengan section di atas/bawah yang cream/ube).
// Tujuan: konversi maksimum. Headline emotional, sub reassurance, button high-contrast.

import Link from "next/link";
import { Icon } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { COPY } from "../_data/copy";

export function CallToAction() {
  return (
    <section className="swatch-matcha-deep clay-section" style={{ borderRadius: 0 }}>
      <div className="clay-container text-center">
        <Reveal>
          <h2
            className="section-heading mb-4"
            style={{ color: "var(--pure-white)" }}
          >
            {COPY.cta.title}
          </h2>
          <p
            className="body-large mb-8"
            style={{ color: "var(--matcha-300)" }}
          >
            {COPY.cta.subtitle}
          </p>
          <Link
            href="/portal/register"
            className="clay-button solid-white size-large pill inline-flex items-center gap-2
                       transition-transform duration-300 ease-out
                       hover:scale-[1.03] active:scale-[0.98]"
          >
            {COPY.cta.button}
            <Icon name="ArrowRight" size="sm" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
