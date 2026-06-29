// Pakai native `<details>` (bukan Radix Accordion) — browser handle semua
// a11y, instant open/close, tanpa dep JS.
import { Icon } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { COPY } from "../_data/copy";

export function FAQ() {
  return (
    <section
      id="faq"
      className="landing-section"
      style={{ background: "var(--canvas)" }}
    >
      <div className="clay-container">
        <Reveal>
          <div className="text-center mb-12 md:mb-16 max-w-2xl mx-auto">
            <span
              className="uppercase-label inline-flex items-center gap-2"
              style={{ color: "var(--honey-700)" }}
            >
              <Icon name="MessageCircle" size="xs" />
              {COPY.faq.eyebrow}
            </span>
            <h2 className="section-heading mt-4">{COPY.faq.title}</h2>
          </div>
        </Reveal>

        <Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto">
            {COPY.faq.items.map((item) => (
              <details key={item.q} className="faq-item">
                <summary className="faq-summary">
                  <span>{item.q}</span>
                  <span className="faq-chevron" aria-hidden="true">
                    <Icon name="ChevronDown" size="sm" />
                  </span>
                </summary>
                <div className="faq-answer">
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
