// Benefits — 6 value-prop items, 3-col grid. Tone concise, bahasa awam.
// Pakai `border-dashed` (clay-card.dashed di globals.css) untuk kasih
// "informational, non-clickable" cue — beda dari produk card yang solid.
//
// Stagger 100ms per row — 6 cards reveal terasa rhythmic.
// Tidak dibungkus MotionCard — hover micro-interaction cukup border
// color shift + bg wash (no lift), supaya user tidak salah以为 clickable.

import { Icon } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { StaggerGroup } from "../_motion/stagger-group";
import { COPY } from "../_data/copy";
import { BENEFITS } from "../_data/benefits";

export function Benefits() {
  return (
    <section
      id="why"
      className="landing-section"
      style={{ background: "var(--canvas)" }}
    >
      <div className="clay-container">
        <Reveal>
          <div className="text-center mb-12 md:mb-20">
            <span
              className="uppercase-label inline-flex items-center gap-2"
              style={{ color: "var(--honey-700)" }}
            >
              <SparklesInline />
              {COPY.benefits.eyebrow}
            </span>
            <h2 className="section-heading mt-4">{COPY.benefits.title}</h2>
          </div>
        </Reveal>

        <StaggerGroup
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          step={0.1}
          baseDelay={0.05}
        >
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="clay-card dashed h-full p-7
                         transition-all duration-200 ease-out
                         hover:border-solid hover:border-[var(--honey-300)]
                         hover:bg-[var(--honey-tint)]"
            >
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                style={{
                  background: "var(--honey-100)",
                  color: "var(--honey-700)",
                }}
              >
                <Icon name={b.icon} size="md" />
              </div>
              <h3 className="feature-title mb-2">{b.title}</h3>
              <p
                className="caption m-0"
                style={{
                  color: "var(--charcoal)",
                  fontSize: "0.95rem",
                  lineHeight: 1.6,
                }}
              >
                {b.desc}
              </p>
            </div>
          ))}
        </StaggerGroup>
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
