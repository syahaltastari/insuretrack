// id="cara-klaim" di-link dari Hero CTA "Cara Klaim" (anchor scroll).

import { Icon } from "@insuretrack/ui";
import { Reveal } from "../../../_motion/reveal";
import { StaggerGroup } from "../../../_motion/stagger-group";
import { type ProductDetail } from "@/lib/product-details";

export function ProductHowToClaim({ product }: { product: ProductDetail }) {
  return (
    <section id="cara-klaim" className="clay-section" style={{ paddingTop: 0 }}>
      <div className="clay-container">
        <Reveal>
          <div className="mb-12 md:mb-14" style={{ maxWidth: 640 }}>
            <div className="inline-flex items-center gap-2 mb-4">
              <Icon
                name="ScrollText"
                size="xs"
                style={{ color: "var(--honey-700)" }}
              />
              <span
                className="uppercase-label m-0"
                style={{ color: "var(--honey-700)" }}
              >
                Proses Klaim
              </span>
            </div>
            <h2 className="section-heading">
              Cara klaim, langkah demi langkah
            </h2>
          </div>
        </Reveal>

        <StaggerGroup className="clay-grid cols-3" step={0.1} baseDelay={0.05}>
          {product.howToClaim.map((step, i) => (
            <div
              key={step.title}
              className="clay-card feature h-full p-7 relative
                         transition-transform duration-200 ease-out
                         hover:-translate-y-1"
              style={{
                // onHover translateY dikontrol via class Tailwind di atas;
                // tidak perlu MotionCard untuk step cards (kurang interaktif,
                // bukan link).
                boxShadow: "var(--shadow-clay)",
              }}
            >
              <p
                className="mono mb-3 m-0"
                style={{
                  color: `var(--${product.iconTone})`,
                  fontSize: "0.95rem",
                  fontWeight: 600,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3
                className="card-heading"
                style={{ fontSize: "1.15rem", marginBottom: 8 }}
              >
                {step.title}
              </h3>
              <p
                className="body m-0"
                style={{ color: "var(--charcoal)" }}
              >
                {step.desc}
              </p>
            </div>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
