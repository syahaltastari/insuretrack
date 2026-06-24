// Products — 3-column grid (1 col mobile). Cards di-stagger 120ms.
// Tone/icon per product dari `_data/product-visuals` (index-based mapping).
// Hover: lift -4px (MotionCard) + Tailwind `hover:-translate-y-1` di link.
//
// Fallback: `products.length === 0` → render pesan dari COPY.products.empty.

import Link from "next/link";
import { Icon } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { StaggerGroup } from "../_motion/stagger-group";
import { MotionCard } from "../_motion/motion-card";
import { COPY } from "../_data/copy";
import { PRODUCT_VISUALS } from "../_data/product-visuals";
import { type Product } from "../_lib/api";

export function Products({ products }: { products: Product[] }) {
  return (
    <section id="products" className="clay-section py-28 md:py-36">
      <div className="clay-container">
        <Reveal>
          <div className="text-center mb-12 md:mb-16">
            <span
              className="uppercase-label inline-flex items-center gap-2"
              style={{ color: "var(--matcha-600)" }}
            >
              <Icon name="Sparkles" size="xs" />
              {COPY.products.eyebrow}
            </span>
            <h2 className="section-heading mt-4">{COPY.products.title}</h2>
          </div>
        </Reveal>

        {products.length === 0 ? (
          <p
            className="text-center body"
            style={{ color: "var(--warm-charcoal)" }}
          >
            {COPY.products.empty}
          </p>
        ) : (
          <StaggerGroup className="clay-grid cols-3">
            {products.map((p, i) => {
              const visual = PRODUCT_VISUALS[i] ?? PRODUCT_VISUALS[0];
              return (
                <MotionCard key={p.code}>
                  <Link
                    href={`/products/${p.code.toLowerCase()}`}
                    className="clay-card feature block h-full no-underline text-inherit
                               transition-all duration-300 ease-out
                               hover:-translate-y-1
                               focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-[var(--ube-800)]"
                    style={{ color: "var(--clay-black)" }}
                  >
                    <div
                      className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4
                                 transition-transform duration-300 ease-out"
                      style={{ background: `var(--${visual.tone})` }}
                    >
                      <Icon name={visual.icon} size="md" />
                    </div>
                    <h3 className="card-heading text-2xl">{p.name}</h3>
                    <p
                      className="body m-0"
                      style={{ color: "var(--warm-charcoal)" }}
                    >
                      {p.description}
                    </p>
                    <div
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
                      style={{ color: "var(--clay-black)" }}
                    >
                      Lihat detail <Icon name="ArrowRight" size="xs" />
                    </div>
                  </Link>
                </MotionCard>
              );
            })}
          </StaggerGroup>
        )}
      </div>
    </section>
  );
}
