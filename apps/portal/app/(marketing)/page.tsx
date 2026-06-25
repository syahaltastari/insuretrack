// Landing page (FS-01) — entry async Server Component.
//
// Pipeline:
//   1. Fetch products, clients, testimonials paralel dari backend.
//   2. Compose 9 section components (semua RSC kecuali Reveal/StaggerGroup
//      child islands yang handle animation).
//   3. Section "Clients" & "Testimonials" conditional — hanya render
//      kalau data ada (graceful degradation saat backend down).
//
// Section ordering (9 total, per design plan):
//   1. Hero         — first impression, brand + CTA
//   2. TrustStrip   — OJK badge + client logos (social proof thin band)
//   3. Produk       — 3 product cards with MotionCard hover lift
//   4. HowItWorks   — 3-step timeline with dashed connector
//   5. Benefits     — 6 value-prop items, dashed border (informational)
//   6. Stats        — 3 big numbers with count-up animation
//   7. Testimoni    — Embla carousel, white cards on paper
//   8. FAQ          — 6-item accordion 2-col, native <details>
//   9. CTA          — full-width honey-400 signature banner
// (10. Footer       — dari MarketingLayout, contact info merged in)
//
// Section implementations: `./_sections/*.tsx`. Animasi entrance
// di-handle child components via motion/react primitives (`./_motion/*`).
// Copy Bahasa Indonesia: `./_data/copy.ts`. Fetch helpers: `./_lib/api.ts`.

import { Hero } from "./_sections/hero";
import { Clients } from "./_sections/clients";
import { Products } from "./_sections/products";
import { HowItWorks } from "./_sections/how-it-works";
import { Benefits } from "./_sections/benefits";
import { Stats } from "./_sections/stats";
import { Testimonials } from "./_sections/testimonials";
import { FAQ } from "./_sections/faq";
import { CallToAction } from "./_sections/cta";
import { BackToTop } from "./_motion/back-to-top";
import { fetchProducts, fetchClients, fetchTestimonials } from "./_lib/api";
import { allLandingSchemas } from "./_lib/structured-data";

export default async function HomePage() {
  const [products, clients, testimonials] = await Promise.all([
    fetchProducts(),
    fetchClients(),
    fetchTestimonials(),
  ]);

  return (
    <>
      {/* JSON-LD structured data untuk SEO. Schema.org Organization,
          WebSite, FAQPage, dan BreadcrumbList di-bundle dalam satu
          <script type="application/ld+json"> pakai @graph. Google baca
          ini untuk rich snippet (FAQ dropdown di search result). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(allLandingSchemas()),
        }}
      />

      <Hero />
      <Clients clients={clients} />
      <Products products={products} />
      <HowItWorks />
      <Benefits />
      <Stats />
      {testimonials.length > 0 && <Testimonials testimonials={testimonials} />}
      <FAQ />
      <CallToAction />
      <BackToTop />
    </>
  );
}
