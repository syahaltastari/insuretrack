// Benefits — 4 value-prop cards (icon + title + desc).
//
// Animasi: section header fade-up, lalu 4 cards scale-in dengan stagger
// 0.08s (snappy, tidak lambat). Setiap card wrapped dengan MotionCard
// untuk hover lift -4px — kasih cue "interaktif" saat hover.
//
// Tone warna icon pakai `product.iconTone` (matcha/slushie/ube) supaya
// kartu harmonis dengan hero swatch section di atasnya.

import { Icon, type IconName } from "@insuretrack/ui";
import { Reveal } from "../../../_motion/reveal";
import { StaggerGroup } from "../../../_motion/stagger-group";
import { MotionCard } from "../../../_motion/motion-card";
import { type ProductDetail } from "@/lib/product-details";

export function ProductBenefits({ product }: { product: ProductDetail }) {
  return (
    <section className="clay-section">
      <div className="clay-container">
        <Reveal>
          <div className="mb-12 md:mb-14" style={{ maxWidth: 640 }}>
            <div className="inline-flex items-center gap-2 mb-4">
              <Icon
                name="Sparkles"
                size="xs"
                style={{ color: `var(--${product.iconTone})` }}
              />
              <span
                className="uppercase-label m-0"
                style={{ color: "var(--charcoal)" }}
              >
                Keunggulan
              </span>
            </div>
            <h2 className="section-heading">Apa yang Anda dapatkan</h2>
          </div>
        </Reveal>

        <StaggerGroup className="clay-grid cols-3" step={0.08}>
          {product.benefits.map((b) => (
            <MotionCard key={b.title}>
              <article
                className="clay-card feature h-full p-7
                           transition-shadow duration-200 ease-out
                           hover:shadow-[var(--shadow-clay-hover)]"
              >
                <div
                  className="inline-grid place-items-center w-12 h-12 rounded-xl mb-4"
                  style={{ background: `var(--${product.iconTone})` }}
                >
                  <Icon name={b.icon as IconName} size="md" />
                </div>
                <h3
                  className="card-heading"
                  style={{ fontSize: "1.25rem", marginBottom: 8 }}
                >
                  {b.title}
                </h3>
                <p
                  className="body m-0"
                  style={{ color: "var(--charcoal)" }}
                >
                  {b.desc}
                </p>
              </article>
            </MotionCard>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
