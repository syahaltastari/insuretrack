// Testimonials — Carousel berbasis Embla (sudah ada di apps/portal/components/Carousel.tsx).
// Conditional render dari page.tsx: hanya muncul kalau `testimonials.length > 0`.
// Background `swatch-ube` (ubin gelap), card `clay-card feature` dengan bg `var(--ube-900)`.
//
// Entrance: headline section di-Reveal, carousel item di-Embla (autoplay).
// Stars: ★ Unicode chars (sesuai kode lama) — tidak pakai lucide Star
// untuk hemat icon bundle (1 glyph vs 1 icon tree-shake group).

import { Icon } from "@insuretrack/ui";
import { Carousel } from "@/components/Carousel";
import { Reveal } from "../_motion/reveal";
import { COPY } from "../_data/copy";
import { type Testimonial } from "../_lib/api";

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span
      aria-label={`Rating ${rating} dari 5`}
      style={{ display: "inline-flex", gap: 2 }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{
            fontSize: size,
            color: i <= rating ? "var(--lemon-700)" : "var(--oat-light)",
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function Testimonials({ testimonials }: { testimonials: Testimonial[] }) {
  return (
    <section
      id="testimonials"
      className="swatch-ube clay-section"
      style={{ borderRadius: 0, margin: "80px 0", padding: "80px 0" }}
    >
      <div className="clay-container mb-8">
        <Reveal>
          <span
            className="uppercase-label inline-flex items-center gap-2"
            style={{ color: "var(--ube-300)" }}
          >
            <Icon name="Quote" size="xs" />
            {COPY.testimonials.eyebrow}
          </span>
          <h2
            className="section-heading"
            style={{ color: "var(--pure-white)" }}
          >
            {COPY.testimonials.title}
          </h2>
        </Reveal>
      </div>

      <Carousel
        itemsPerSlideDesktop={3}
        itemsPerSlideTablet={2}
        ariaLabel="Testimoni customer"
        showControls={false}
        continuous
        items={testimonials.map((t) => (
          <div
            key={t.id}
            className="clay-card feature h-full"
            style={{ background: "var(--ube-900)" }}
          >
            <Icon
              name="Quote"
              size="lg"
              style={{ color: "var(--ube-300)", marginBottom: 12 }}
            />
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                style={{
                  background: "var(--ube-800)",
                  border: "2px solid var(--ube-300)",
                }}
              >
                {t.photo_url ? (
                  <img
                    src={t.photo_url}
                    alt={t.customer_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span
                    className="text-lg font-semibold"
                    style={{ color: "var(--ube-300)" }}
                  >
                    {t.customer_name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <h3
                  className="feature-title mb-0.5"
                  style={{ color: "var(--pure-white)" }}
                >
                  {t.customer_name}
                </h3>
                <p
                  className="caption m-0"
                  style={{ color: "var(--ube-300)" }}
                >
                  {t.role ?? "Customer"}
                  {t.company ? ` · ${t.company}` : ""}
                </p>
              </div>
            </div>
            <Stars rating={t.rating} size={16} />
            <p
              className="body mt-3 mb-0 italic"
              style={{ color: "var(--ube-300)" }}
            >
              &ldquo;{t.review}&rdquo;
            </p>
            {t.is_featured && (
              <span
                className="clay-badge lemon mt-3 text-[0.7rem] inline-block"
              >
                Featured
              </span>
            )}
          </div>
        ))}
      />
    </section>
  );
}
