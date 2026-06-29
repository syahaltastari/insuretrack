// Reveal dipanggil dengan `aboveFold` karena hero pasti di viewport saat
// page load — `whileInView` bisa kena race condition dengan
// IntersectionObserver di sini.

import Link from "next/link";
import { Icon } from "@insuretrack/ui";
import { Reveal } from "../../../_motion/reveal";
import { formatIdr, formatIdrShort, type ProductDetail } from "@/lib/product-details";

export function ProductHero({ product }: { product: ProductDetail }) {
  // UP table ringkas disusun di client boleh: jumlah item kecil (4),
  // render di server, tidak ada runtime cost. Hitung di sini (bukan di
  // page.tsx) karena ini spesifik hero.
  const coverageRows: Array<{ label: string; value: string }> = [
    {
      label: "Uang Pertanggungan",
      value: `${formatIdrShort(product.coverage.minSumAssured)} – ${formatIdrShort(product.coverage.maxSumAssured)}`,
    },
    {
      label: "Masa Pertanggungan",
      value: `${product.coverage.minTermYears} tahun${
        product.coverage.minTermYears !== product.coverage.maxTermYears
          ? ` – ${product.coverage.maxTermYears} tahun`
          : ""
      }`,
    },
    {
      label: "Usia Masuk",
      value: `${product.coverage.minAge}–${product.coverage.maxAge} tahun`,
    },
    { label: "Tarif Premi", value: product.premiumRateLabel },
  ];

  return (
    <section
      className={`${product.swatch} clay-section`}
      style={{ paddingTop: 80, paddingBottom: 80 }}
    >
      <div className="clay-container">
        <Reveal aboveFold>
          <Link
            href="/#products"
            className="caption inline-flex items-center gap-2 mb-6"
            style={{
              color: "var(--ink)",
              textDecoration: "none",
            }}
          >
            <Icon name="ChevronLeft" size="xs" />
            Kembali ke semua produk
          </Link>
        </Reveal>

        <div className="hero-grid" style={{ alignItems: "center" }}>
          <Reveal aboveFold delay={0.15}>
            <div
              className="inline-grid place-items-center w-[72px] h-[72px] mb-6 shadow-clay mr-3"
              style={{
                borderRadius: 20,
                background: "var(--pure-white)",
                color: "var(--ink)",
              }}
            >
              <Icon name={product.icon} size="xl" />
            </div>

            <div
              className="inline-flex items-center gap-2 px-3.5 py-1.5 mb-4"
              style={{
                borderRadius: 999,
                background: "var(--pure-white)",
                color: "var(--ink)",
              }}
            >
              <Icon name="Sparkles" size="xs" />
              <span className="uppercase-label m-0">Produk InsureTrack</span>
            </div>

            <h1 className="display-secondary mb-4">{product.name}</h1>

            <p
              className="body-large mb-8"
              style={{ color: "var(--ink)", maxWidth: 560 }}
            >
              {product.tagline}
            </p>

            <Reveal aboveFold delay={0.4} className="mb-5">
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/portal/insurance/new?product=${product.code}`}
                  className="clay-button solid-white size-large pill inline-flex items-center gap-2"
                >
                  Beli {product.name}
                  <Icon name="ArrowRight" size="sm" />
                </Link>
                <a
                  href="#cara-klaim"
                  className="clay-button ghost size-large pill"
                  style={{ color: "var(--ink)", borderColor: "var(--ink)" }}
                >
                  Cara Klaim
                </a>
              </div>
            </Reveal>
          </Reveal>

          {/* Pricing card — slide in terakhir di cascade sebagai
              "puncak visual" setelah CTAs settle. Desktop only pada
              breakpoint md+. */}
          <Reveal aboveFold delay={0.55} className="hidden md:block">
            <PricingCard product={product} coverageRows={coverageRows} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// PricingCard — kartu "Mulai dari Rp X" yang float di kanan hero.
// Anggaran vs UP/term: hardcoded UP Rp 100jt, term 1 tahun — sama
// dengan konstanta basePremium di lib/product-details.ts.
function PricingCard({
  product,
  coverageRows,
}: {
  product: ProductDetail;
  coverageRows: Array<{ label: string; value: string }>;
}) {
  return (
    <div
      className="clay-card feature"
      style={{
        background: "var(--pure-white)",
        // Eksplisit reset color — hero section pakai swatch yang set
        // color di parent; tanpa reset, text di dalam white card inherit
        // parent color → invisible ("Mulai dari" bug).
        color: "var(--ink)",
        padding: 28,
      }}
    >
      <p className="uppercase-label mb-2">Mulai dari</p>
      <p
        className="display-secondary mb-1"
        style={{ fontSize: "2.5rem", lineHeight: 1.1 }}
      >
        {formatIdr(product.basePremium)}
      </p>
      <p
        className="caption mb-6"
        style={{ color: "var(--charcoal)" }}
      >
        per tahun — untuk UP {formatIdrShort(100_000_000)}, term 1 tahun
      </p>

      <div
        className="pt-4 grid gap-2.5"
        style={{ borderTop: "1px dashed var(--oat-border)" }}
      >
        {coverageRows.map((row) => (
          <div
            key={row.label}
            className="flex justify-between items-baseline gap-3"
          >
            <span className="caption" style={{ color: "var(--charcoal)" }}>
              {row.label}
            </span>
            <span
              className="mono text-right"
              style={{ fontSize: "0.85rem" }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
