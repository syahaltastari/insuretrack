// HowItWorks — section dengan background `swatch-ube` (ubin gelap).
// 3 langkah: 01 Daftar Online, 02 Bayar Premi, 03 Polis Terbit.
// Cards stagger 150ms (slightly slower dari products — emphasis step).
//
// Background full-width (`borderRadius: 0, margin: 80px 0`) — section
// ini jadi visual break di antara section cream-colored di atas/bawah.

import { Reveal } from "../_motion/reveal";
import { StaggerGroup } from "../_motion/stagger-group";
import { COPY } from "../_data/copy";
import { STEPS } from "../_data/steps";

export function HowItWorks() {
  return (
    <section
      id="how"
      className="swatch-ube clay-section"
      style={{ borderRadius: 0, margin: "80px 0" }}
    >
      <div className="clay-container">
        <Reveal>
          <span
            className="uppercase-label inline-flex items-center gap-2 mb-2"
            style={{ color: "var(--ube-300)" }}
          >
            <IconWrapper />
            {COPY.howItWorks.eyebrow}
          </span>
          <h2
            className="section-heading mb-12"
            style={{ color: "var(--pure-white)" }}
          >
            {COPY.howItWorks.title}
          </h2>
        </Reveal>

        <StaggerGroup className="clay-grid cols-3" step={0.15}>
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="clay-card feature"
              style={{ background: "var(--ube-900)" }}
            >
              <p
                className="mono text-sm m-0 mb-2"
                style={{ color: "var(--ube-300)" }}
              >
                {s.n}
              </p>
              <h3
                className="feature-title"
                style={{ color: "var(--pure-white)" }}
              >
                {s.t}
              </h3>
              <p className="body m-0" style={{ color: "var(--ube-300)" }}>
                {s.d}
              </p>
            </div>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}

// Inline helper untuk icon di eyebrow — di sini (bukan di data module)
// karena Icon component butuh Client boundary; section ini RSC.
// Sparkles di-render via Lucide inline untuk hemat boundary trip.
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
