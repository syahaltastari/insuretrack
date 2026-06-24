// Landing page (FS-01) — entry async Server Component.
//
// Pipeline:
//  1. Fetch products, clients, testimonials paralel dari backend.
//  2. Compose 8 section components (semua RSC).
//  3. Section "Clients" & "Testimonials" conditional — hanya render
//     kalau data ada (graceful degradation saat backend down).
//
// Section implementations: lihat `./_sections/*.tsx`. Animasi entrance
// di-handle child components via framer-motion primitives (`./_motion/*`).
// Copy Bahasa Indonesia: `./_data/copy.ts`. Fetch helpers: `./_lib/api.ts`.

import { Hero } from "./_sections/hero";
import { Products } from "./_sections/products";
import { HowItWorks } from "./_sections/how-it-works";
import { Benefits } from "./_sections/benefits";
import { Clients } from "./_sections/clients";
import { Testimonials } from "./_sections/testimonials";
import { CallToAction } from "./_sections/cta";
import { Contact } from "./_sections/contact";
import { fetchProducts, fetchClients, fetchTestimonials } from "./_lib/api";

export default async function HomePage() {
  const [products, clients, testimonials] = await Promise.all([
    fetchProducts(),
    fetchClients(),
    fetchTestimonials(),
  ]);

  return (
    <>
      <Hero />
      <Products products={products} />
      <HowItWorks />
      <Benefits />
      {clients.length > 0 && <Clients clients={clients} />}
      {testimonials.length > 0 && <Testimonials testimonials={testimonials} />}
      <CallToAction />
      <Contact />
    </>
  );
}
