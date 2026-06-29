// Halaman detail produk (/products/[slug]).
//
// Server component tipis: lookup product by slug, render 7 sections
// berurutan. Semua section logic + animation hidup di
// `./_sections/product-*.tsx`.
//
// Skip static prerender — sama dengan marketing page lain, ada
// Next.js 15.0.3 + React 19 RC incompatibility untuk static-generate
// marketing pages. SSR per-request acceptable untuk MVP.

import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/product-details";
import { ProductHero } from "./_sections/product-hero";
import { ProductBenefits } from "./_sections/product-benefits";
import { ProductCoverage } from "./_sections/product-coverage";
import { ProductHowToClaim } from "./_sections/product-how-to-claim";
import { ProductFaq } from "./_sections/product-faq";
import { ProductOtherProducts } from "./_sections/product-other-products";
import { ProductCta } from "./_sections/product-cta";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  return (
    <>
      <ProductHero product={product} />
      <ProductBenefits product={product} />
      <ProductCoverage product={product} />
      <ProductHowToClaim product={product} />
      <ProductFaq product={product} />
      <ProductOtherProducts product={product} />
      <ProductCta product={product} />
    </>
  );
}
