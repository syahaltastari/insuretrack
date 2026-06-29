import { Reveal } from "../_motion/reveal";
import { StaggerGroup } from "../_motion/stagger-group";
import { COPY } from "../_data/copy";
import { STEPS } from "../_data/steps";

export function HowItWorks() {
  return (
    <section
      id="how"
      className="landing-section"
      style={{ background: "var(--sand)" }}
    >
      <div className="clay-container">
        <Reveal>
          <div className="text-center mb-12 md:mb-20">
            <span
              className="uppercase-label inline-flex items-center gap-2"
              style={{ color: "var(--honey-700)" }}
            >
              <IconWrapper />
              {COPY.howItWorks.eyebrow}
            </span>
            <h2 className="section-heading mt-4">{COPY.howItWorks.title}</h2>
          </div>
        </Reveal>

        <StaggerGroup
          className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 relative"
          step={0.15}
        >
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative">
              {/* Connector line — horizontal di desktop, vertikal di mobile.
                  Absolute positioned, dashed honey-500 untuk "in progress" feel. */}
              {i < STEPS.length - 1 && (
                <div
                  aria-hidden="true"
                  className="hidden md:block absolute top-7 left-[calc(50%+32px)] right-[calc(-50%+32px)] h-px
                             border-t-2 border-dashed"
                  style={{ borderColor: "var(--honey-500)" }}
                />
              )}

              <div
                className="bg-white rounded-[var(--radius-feature)] p-7 h-full
                           border border-[var(--oat-refined)]
                           transition-all duration-300 ease-out
                           hover:border-[var(--honey-300)]
                           hover:-translate-y-1"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                {/* Number badge — honey-400 bg + ink text, "01/02/03" mono */}
                <div
                  className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5
                             mono text-xl font-bold"
                  style={{
                    background: "var(--honey-400)",
                    color: "var(--ink)",
                  }}
                >
                  {s.n}
                </div>
                <h3 className="feature-title mb-3">{s.t}</h3>
                <p
                  className="body m-0"
                  style={{ color: "var(--charcoal)" }}
                >
                  {s.d}
                </p>
              </div>
            </div>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}

// Inline helper untuk icon di eyebrow — Icon component butuh Client
// boundary; section ini RSC. Pakai Lucide inline untuk hemat boundary trip.
function IconWrapper() {
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
