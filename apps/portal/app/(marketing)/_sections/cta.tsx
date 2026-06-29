import Link from "next/link";
import { Icon } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { COPY } from "../_data/copy";

export function CallToAction() {
  return (
    <section
      className="relative overflow-hidden pt-24 pb-16 md:pt-32 md:pb-20"
      style={{ background: "var(--honey-400)" }}
    >
      {/* Decorative blob — depth + warmth. Honey-500 lebih dalam dari
          bg honey-400, blur besar supaya subtle. */}
      <div
        aria-hidden="true"
        className="hero-blob"
        style={{
          background: "var(--honey-500)",
          width: "600px",
          height: "600px",
          top: "-200px",
          right: "-150px",
          opacity: 0.4,
        }}
      />
      <div
        aria-hidden="true"
        className="hero-blob"
        style={{
          background: "var(--honey-300)",
          width: "400px",
          height: "400px",
          bottom: "-150px",
          left: "-100px",
          opacity: 0.5,
        }}
      />

      <div
        className="clay-container text-center relative z-10"
        style={{ color: "var(--ink)" }}
      >
        <Reveal>
          <h2
            className="section-heading mb-5"
            style={{ color: "var(--ink)" }}
          >
            {COPY.cta.title}
          </h2>
          <p
            className="body-large mb-10 max-w-xl mx-auto"
            style={{ color: "var(--ink)" }}
          >
            {COPY.cta.subtitle}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/portal/register"
              className="clay-button size-large pill inline-flex items-center gap-2"
              style={{
                background: "var(--ink)",
                color: "var(--honey-400)",
                boxShadow: "var(--shadow-cta)",
              }}
            >
              {COPY.cta.button}
              <Icon name="ArrowRight" size="sm" />
            </Link>
            <a
              href="mailto:contact@insuretrack.com"
              className="clay-button size-large pill"
              style={{
                background: "transparent",
                color: "var(--ink)",
                border: "1px solid var(--ink)",
              }}
            >
              {COPY.cta.secondaryButton}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
