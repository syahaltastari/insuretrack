import Link from "next/link";
import { Icon } from "@insuretrack/ui";
import { Reveal } from "../../../_motion/reveal";
import { type ProductDetail } from "@/lib/product-details";

export function ProductCta({ product }: { product: ProductDetail }) {
  return (
    <section
      className={`${product.swatchDeep} clay-section`}
      style={{ borderRadius: 0 }}
    >
      <div
        className="clay-container text-center"
        style={{ color: "var(--pure-white)" }}
      >
        <Reveal>
          <h2
            className="section-heading mb-4"
            style={{ color: "var(--pure-white)" }}
          >
            Siap ambil {product.name}?
          </h2>
          <p
            className="body-large mb-6 mx-auto"
            style={{ color: "var(--pure-white)", opacity: 0.85, maxWidth: 560 }}
          >
            Pendaftaran memakan waktu kurang dari 5 menit. Polis terbit
            otomatis setelah pembayaran.
          </p>

          <Link
            href={`/portal/insurance/new?product=${product.code}`}
            className="clay-button solid-white size-large pill inline-flex items-center gap-2
                       transition-transform duration-200 ease-out
                       hover:-translate-y-0.5"
          >
            Beli {product.name}
            <Icon name="ArrowRight" size="sm" />
          </Link>

          <p
            className="caption mt-4 mb-0"
            style={{ color: "var(--pure-white)", opacity: 0.7 }}
          >
            {product.ctaNote}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
