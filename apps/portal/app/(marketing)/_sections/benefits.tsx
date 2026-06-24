// Benefits — 6 items, 3-col grid, `clay-card dashed` (decorative).
// Stagger ringan (100ms per row) supaya 6 card reveal terasa rhythmic.
//
// Tidak dibungkus MotionCard — benefit card di sini purely informational,
// tidak clickable. Hover tidak perlu lift (akan misleading kalau hover
// tapi gak clickable). Micro-interaction subtle via border-color saja.

import { Icon } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { StaggerGroup } from "../_motion/stagger-group";
import { COPY } from "../_data/copy";
import { BENEFITS } from "../_data/benefits";

export function Benefits() {
  return (
    <section id="why" className="clay-section py-28 md:py-36">
      <div className="clay-container">
        <Reveal>
          <div className="text-center mb-12 md:mb-16">
            <span
              className="uppercase-label inline-flex items-center gap-2"
              style={{ color: "var(--ube-800)" }}
            >
              <SparklesInline />
              {COPY.benefits.eyebrow}
            </span>
            <h2 className="section-heading mt-4">{COPY.benefits.title}</h2>
          </div>
        </Reveal>

        <StaggerGroup className="clay-grid cols-3" step={0.1} baseDelay={0.05}>
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="clay-card dashed h-full p-6
                         transition-colors duration-200 ease-out
                         hover:bg-[var(--oat-light)]"
            >
              <div
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3"
                style={{ background: "var(--matcha-300)", color: "var(--matcha-600)" }}
              >
                <Icon name={b.icon} size="md" />
              </div>
              <h3 className="feature-title mb-2">{b.title}</h3>
              <p
                className="caption m-0"
                style={{ color: "var(--warm-charcoal)" }}
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
