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
            color: i <= rating ? "var(--honey-700)" : "var(--oat-refined)",
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
      className="landing-section"
      style={{ background: "var(--paper)" }}
    >
      <div className="clay-container mb-10">
        <Reveal>
          <div className="text-center mb-2">
            <span
              className="uppercase-label inline-flex items-center gap-2"
              style={{ color: "var(--honey-700)" }}
            >
              <Icon name="Quote" size="xs" />
              {COPY.testimonials.eyebrow}
            </span>
            <h2 className="section-heading mt-4">{COPY.testimonials.title}</h2>
          </div>
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
            className="bg-white rounded-[var(--radius-feature)] p-7 h-full
                       border border-[var(--oat-refined)]"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <Icon
              name="Quote"
              size="lg"
              style={{ color: "var(--honey-400)", marginBottom: 12 }}
            />
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                style={{
                  background: "var(--honey-100)",
                  border: "2px solid var(--honey-300)",
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
                    style={{ color: "var(--honey-700)" }}
                  >
                    {t.customer_name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <h3
                  className="feature-title mb-0.5"
                  style={{ color: "var(--ink)" }}
                >
                  {t.customer_name}
                </h3>
                <p
                  className="caption m-0"
                  style={{ color: "var(--stone)" }}
                >
                  {t.role ?? "Customer"}
                  {t.company ? ` · ${t.company}` : ""}
                </p>
              </div>
            </div>
            <Stars rating={t.rating} size={16} />
            <p
              className="body mt-3 mb-0 italic"
              style={{ color: "var(--charcoal)" }}
            >
              &ldquo;{t.review}&rdquo;
            </p>
            {t.is_featured && (
              <span
                className="inline-block mt-4 px-3 py-1 rounded-full text-xs font-semibold"
                style={{
                  background: "var(--honey-100)",
                  color: "var(--honey-700)",
                }}
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
