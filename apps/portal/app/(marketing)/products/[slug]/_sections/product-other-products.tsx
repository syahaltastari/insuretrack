import Link from "next/link";
import { Icon } from "@insuretrack/ui";
import { Reveal } from "../../../_motion/reveal";
import { MotionCard } from "../../../_motion/motion-card";
import {
  ALL_PRODUCT_CODES,
  PRODUCT_DETAILS,
  type ProductDetail,
} from "@/lib/product-details";

export function ProductOtherProducts({ product }: { product: ProductDetail }) {
  const others = ALL_PRODUCT_CODES.filter((c) => c !== product.code);

  return (
    <section className="clay-section" style={{ paddingTop: 0 }}>
      <div className="clay-container">
        <Reveal>
          <div
            className="mb-8 text-center"
            style={{ maxWidth: 640, margin: "0 auto 32px" }}
          >
            <h2 className="section-heading m-0">
              Atau bandingkan dengan produk lain
            </h2>
          </div>
        </Reveal>

        <div className="clay-grid cols-3">
          {others.map((otherCode) => {
            const other = PRODUCT_DETAILS[otherCode];
            return (
              <Reveal key={otherCode}>
                <MotionCard>
                  <Link
                    href={`/products/${other.slug}`}
                    className="group block h-full no-underline text-inherit"
                    style={{ color: "var(--ink)" }}
                  >
                    <div
                      className="clay-card feature h-full p-7
                                 transition-shadow duration-200 ease-out
                                 group-hover:shadow-[var(--shadow-clay-hover)]"
                    >
                      <div
                        className="inline-grid place-items-center w-12 h-12 rounded-xl mb-4"
                        style={{ background: `var(--${other.iconTone})` }}
                      >
                        <Icon name={other.icon} size="md" />
                      </div>
                      <h3
                        className="card-heading"
                        style={{ fontSize: "1.25rem", marginBottom: 8 }}
                      >
                        {other.name}
                      </h3>
                      <p
                        className="body m-0"
                        style={{ color: "var(--charcoal)" }}
                      >
                        {other.description}
                      </p>
                      <div
                        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold
                                   transition-transform duration-200 ease-out
                                   group-hover:translate-x-1"
                        style={{ color: "var(--ink)" }}
                      >
                        Lihat detail
                        <Icon name="ArrowRight" size="xs" />
                      </div>
                    </div>
                  </Link>
                </MotionCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
