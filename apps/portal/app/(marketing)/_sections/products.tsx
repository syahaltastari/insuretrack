// Produk — 3-column grid (1 col mobile). Cards stagger 80ms.
//
// Hover micro-interaction (MotionCard wrapping):
//   1. Card lift -4px + shadow grow (MotionCard via Framer Motion)
//   2. Icon container rotate 8deg + shift ke honey-600 (group-hover)
//   3. Border color shift ke honey-300 (subtle, "active card" cue)
//
// Tone/icon per product dari `_data/product-visuals.ts` (index-based).
// Harga "Mulai dari Rp Xrb/bln" sementara hardcoded sesuai spec produk
// (Life/PA/Health) — ketika backend expose pricing, ganti ke field API.

import Link from "next/link";
import { Icon } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { StaggerGroup } from "../_motion/stagger-group";
import { MotionCard } from "../_motion/motion-card";
import { COPY } from "../_data/copy";
import { PRODUCT_VISUALS } from "../_data/product-visuals";
import { type Product } from "../_lib/api";

// Hardcoded starting price per product. Index-aligned dengan
// PRODUCT_VISUALS ([Life, Personal Accident, Health]). Nanti pindah
// ke field API `starting_premium` ketika backend expose.
const STARTING_PRICE = ["Rp 150rb/bln", "Rp 50rb/bln", "Rp 200rb/bln"] as const;

export function Products({ products }: { products: Product[] }) {
  return (
    <section
      id="products"
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
              <Icon name="Sparkles" size="xs" />
              {COPY.products.eyebrow}
            </span>
            <h2 className="section-heading mt-4">{COPY.products.title}</h2>
          </div>
        </Reveal>

        {products.length === 0 ? (
          <p
            className="text-center body"
            style={{ color: "var(--charcoal)" }}
          >
            {COPY.products.empty}
          </p>
        ) : (
          <StaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {products.map((p, i) => {
              const visual = PRODUCT_VISUALS[i] ?? PRODUCT_VISUALS[0];
              const price = STARTING_PRICE[i] ?? STARTING_PRICE[0];
              return (
                <MotionCard key={p.code}>
                  <Link
                    href={`/products/${p.code.toLowerCase()}`}
                    className="group block h-full no-underline text-inherit
                               rounded-[var(--radius-feature)] p-8
                               bg-white border border-[var(--oat-refined)]
                               transition-all duration-300 ease-out
                               hover:border-[var(--honey-300)]
                               focus-visible:outline-none
                               focus-visible:ring-[3px]
                               focus-visible:ring-[var(--honey-400)]
                               focus-visible:ring-offset-2"
                    style={{ color: "var(--ink)" }}
                  >
                    {/* Icon container — group-hover rotate + color shift */}
                    <div
                      className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5
                                 transition-all duration-300 ease-out
                                 group-hover:rotate-[8deg]"
                      style={{ background: `var(--${visual.tone})` }}
                    >
                      <Icon
                        name={visual.icon}
                        size="lg"
                        style={{ color: "var(--ink)" }}
                      />
                    </div>

                    <h3 className="card-heading text-2xl mb-3">{p.name}</h3>
                    <p
                      className="body mb-6"
                      style={{ color: "var(--charcoal)" }}
                    >
                      {p.description}
                    </p>

                    {/* Starting price — anchor value, low commitment */}
                    <div
                      className="pt-5 mb-5"
                      style={{ borderTop: "1px solid var(--oat-refined)" }}
                    >
                      <p
                        className="caption m-0 uppercase tracking-wider"
                        style={{ color: "var(--stone)" }}
                      >
                        Mulai dari
                      </p>
                      <p
                        className="m-0 mt-1 text-lg font-semibold"
                        style={{ color: "var(--ink)" }}
                      >
                        {price}
                      </p>
                    </div>

                    <div
                      className="inline-flex items-center gap-1.5 text-sm font-semibold
                                 transition-transform duration-200 ease-out
                                 group-hover:translate-x-1"
                      style={{ color: "var(--honey-700)" }}
                    >
                      Lihat detail
                      <Icon name="ArrowRight" size="xs" />
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
