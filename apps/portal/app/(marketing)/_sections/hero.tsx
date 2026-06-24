// Hero — first viewport section. Sequencing entrance:
// 1. Eyebrow badge (fade)
// 2. Headline (slide-up, delay 80ms)
// 3. Subtitle (slide-up, delay 180ms)
// 4. CTAs (slide-up, delay 280ms)
//
// Visual: `clay-section` base + ample padding (py-28/36) untuk breathing
// room premium. Text center-aligned. CTAs side-by-side, wrap di mobile.

import Link from "next/link";
import { Icon } from "@insuretrack/ui";
import { Reveal } from "../_motion/reveal";
import { COPY } from "../_data/copy";

export function Hero() {
  return (
    <section className="clay-section py-28 md:py-36">
      <div className="clay-container">
        <Reveal from="fade">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
            style={{ background: "var(--matcha-300)", color: "var(--matcha-600)" }}
          >
            <Icon name="ShieldCheck" size="sm" />
            <span className="uppercase-label m-0">{COPY.hero.eyebrow}</span>
          </div>
        </Reveal>

        <Reveal from="up" delay={0.08}>
          <h1
            className="display-hero text-center mb-6"
            style={{ color: "var(--clay-black)" }}
          >
            {COPY.hero.titleLead}
            <br />
            <span style={{ color: "var(--ube-800)" }}>{COPY.hero.titleAccent}</span>
          </h1>
        </Reveal>

        <Reveal from="up" delay={0.18}>
          <p
            className="body-large text-center max-w-2xl mx-auto mb-10"
            style={{ color: "var(--warm-charcoal)" }}
          >
            {COPY.hero.subtitle}
          </p>
        </Reveal>

        <Reveal from="up" delay={0.28}>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/portal/register"
              className="clay-button solid-ube size-large pill inline-flex items-center gap-2"
            >
              {COPY.hero.primaryCta}
              <Icon name="ArrowRight" size="sm" />
            </Link>
            <a href="#products" className="clay-button ghost size-large pill">
              {COPY.hero.secondaryCta}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
