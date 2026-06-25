// Stats — 3 angka besar dengan count-up animation. Dipakai untuk
// konversi "value prop" (Benefits) menjadi "social proof with
// numbers". Tone factual, hard data — bukan marketing fluff.
//
// Background: paper (slightly deeper dari canvas) — kasih subtle
// contrast dengan section Benefits (canvas) di atasnya.
//
// Setiap stat punya:
//   - Icon container (honey-100 bg + honey-700 icon) — visual anchor
//   - Animated count-up number (CountUp component)
//   - Label + sub-text
//
// CountUp: angka animate dari 0 → target saat 50% masuk viewport
// (sekali saja). Pakai tabular-nums untuk konsistensi visual saat
// angka berubah (no "jiggle"). Format IDR pakai Intl.NumberFormat
// locale "id-ID" (separator titik).

import { Icon } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { StaggerGroup } from "../_motion/stagger-group";
import { CountUp } from "../_motion/count-up";
import { COPY } from "../_data/copy";

export function Stats() {
  return (
    <section
      className="landing-section"
      style={{ background: "var(--paper)" }}
    >
      <div className="clay-container">
        <Reveal>
          <div className="text-center mb-12 md:mb-16">
            <span
              className="uppercase-label"
              style={{ color: "var(--honey-700)" }}
            >
              {COPY.stats.eyebrow}
            </span>
            <h2 className="section-heading mt-4">{COPY.stats.title}</h2>
          </div>
        </Reveal>

        <StaggerGroup
          className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 max-w-4xl mx-auto"
          step={0.12}
        >
          {COPY.stats.items.map((item) => (
            <div
              key={item.label}
              className="text-center"
            >
              {/* Icon container — visual anchor, honey-100 bg + honey-700 */}
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-5
                           transition-transform duration-300 ease-out
                           hover:rotate-[8deg]"
                style={{
                  background: "var(--honey-100)",
                  color: "var(--honey-700)",
                }}
                aria-hidden="true"
              >
                <Icon name={item.icon} size="md" />
              </div>

              <CountUp
                target={item.target}
                prefix={"prefix" in item ? item.prefix : ""}
                suffix={item.suffix}
                decimals={"decimals" in item ? item.decimals : 0}
                className="stats-number"
              />
              <p className="stats-label">{item.label}</p>
              <p className="stats-sub">{item.sub}</p>
            </div>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
