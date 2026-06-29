// Pakai native `<details>` untuk a11y gratis (keyboard, screen reader).
// Open/close di-handle browser — tidak perlu motion library.

import { Icon } from "@insuretrack/ui";
import { Reveal } from "../../../_motion/reveal";
import { StaggerGroup } from "../../../_motion/stagger-group";
import { type ProductDetail } from "@/lib/product-details";

export function ProductFaq({ product }: { product: ProductDetail }) {
  return (
    <section className="clay-section" style={{ paddingTop: 0 }}>
      <div className="clay-container">
        <Reveal>
          <div className="mb-12 md:mb-14" style={{ maxWidth: 640 }}>
            <div className="inline-flex items-center gap-2 mb-4">
              <Icon
                name="MessageCircle"
                size="xs"
                style={{ color: "var(--slushie-800)" }}
              />
              <span
                className="uppercase-label m-0"
                style={{ color: "var(--slushie-800)" }}
              >
                Pertanyaan Umum
              </span>
            </div>
            <h2 className="section-heading">
              Pertanyaan yang sering ditanyakan
            </h2>
          </div>
        </Reveal>

        <StaggerGroup className="grid gap-3" step={0.08}>
          {product.faqs.map((faq) => (
            <details
              key={faq.q}
              className="faq-item"
              style={{ maxWidth: 800 }}
            >
              <summary className="faq-summary">
                <h3
                  className="card-heading flex-1 m-0"
                  style={{ fontSize: "1.05rem" }}
                >
                  {faq.q}
                </h3>
                <span className="faq-chevron" aria-hidden="true">
                  <Icon name="ChevronDown" size="sm" />
                </span>
              </summary>
              <div className="faq-answer">
                <p>{faq.a}</p>
              </div>
            </details>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
