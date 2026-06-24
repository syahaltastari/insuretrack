// Contact — info card sederhana. Tone konservatif, kasih closing touch
// sebelum Footer. `clay-card section` (40px radius, generous padding)
// untuk emphasize "kontak resmi".

import { Reveal } from "../_motion/reveal";
import { COPY } from "../_data/copy";

export function Contact() {
  return (
    <section id="contact" className="clay-section pt-20 pb-10">
      <div className="clay-container">
        <Reveal>
          <div
            className="clay-card section"
            style={{ background: "var(--warm-cream)" }}
          >
            <h2 className="section-heading mb-4">{COPY.contact.title}</h2>
            <p
              className="body mb-2"
              style={{ color: "var(--warm-charcoal)" }}
            >
              Email: <span className="mono">{COPY.contact.email}</span> · Telepon:{" "}
              <span className="mono">{COPY.contact.phone}</span>
            </p>
            <p
              className="caption m-0"
              style={{ color: "var(--warm-silver)" }}
            >
              {COPY.contact.location}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
