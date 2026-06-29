// Coverage — side-by-side "Yang ditanggung" vs "Yang tidak ditanggung".
//
// Animasi:
//   - Section header slide up (Reveal)
//   - 2 cards slide-in dari arah berlawanan: "ditanggung" dari kiri,
//     "tidak ditanggung" dari kanan (delay 0.15s). Mirror entrance kasih
//     feel "balanced comparison".
//   - "Masa Tunggu" callout card slide up di bawahnya.
//
// Konvensi warna:
//   - Yang ditanggung: matcha-300 bg, matcha-600 border, Check icon —
//     "positive, aman".
//   - Yang tidak ditanggung: pure-white bg, oat border, XCircle icon
//     pomegranate — "peringatan, baca baik-baik".
//   - Masa tunggu: warm-cream dengan dashed border — "info tambahan".

import { Icon, type IconName } from "@insuretrack/ui";
import { Reveal } from "../../../_motion/reveal";
import { type ProductDetail } from "@/lib/product-details";

export function ProductCoverage({ product }: { product: ProductDetail }) {
  return (
    <section className="clay-section" style={{ paddingTop: 0 }}>
      <div className="clay-container">
        <Reveal>
          <div className="mb-12 md:mb-14" style={{ maxWidth: 640 }}>
            <div className="inline-flex items-center gap-2 mb-4">
              <Icon
                name="FileText"
                size="xs"
                style={{ color: "var(--matcha-600)" }}
              />
              <span
                className="uppercase-label m-0"
                style={{ color: "var(--matcha-600)" }}
              >
                Cakupan Polis
              </span>
            </div>
            <h2 className="section-heading">
              Apa yang dijamin — dan tidak
            </h2>
            <p
              className="body mb-0"
              style={{ color: "var(--charcoal)", marginTop: 12 }}
            >
              Baca baik-baik: yang ditanggung adalah hak Anda, pengecualian
              adalah batasan. Tidak ada kejutan di belakang hari.
            </p>
          </div>
        </Reveal>

        <div className="coverage-grid">
          <Reveal from="left" className="mb-5">
            <CoverageCard
              tone="covered"
              title="Yang ditanggung"
              iconName="Check"
              items={product.covered}
            />
          </Reveal>
          <Reveal from="right" delay={0.15}>
            <CoverageCard
              tone="excluded"
              title="Yang tidak ditanggung"
              iconName="XCircle"
              items={product.excluded}
            />
          </Reveal>
        </div>

        <Reveal from="up" className="mt-6">
          <div
            className="clay-card dashed flex items-start gap-3 p-5"
            style={{ background: "var(--warm-cream)" }}
          >
            <Icon
              name="AlertCircle"
              size="md"
              style={{ color: "var(--matcha-600)", flexShrink: 0, marginTop: 2 }}
            />
            <div>
              <p
                className="caption mb-1"
                style={{
                  color: "var(--charcoal)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  margin: 0,
                }}
              >
                Masa Tunggu
              </p>
              <p className="body mb-0" style={{ color: "var(--ink)" }}>
                {product.waitingPeriod}
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// CoverageCard — kartu satu sisi (covered | excluded). Tone determines
// warna background, border, dan icon. Items adalah list string dengan
// icon check/x-circle inline.
type CoverageTone = "covered" | "excluded";

function CoverageCard({
  tone,
  title,
  iconName,
  items,
}: {
  tone: CoverageTone;
  title: string;
  iconName: IconName;
  items: string[];
}) {
  // Tone → CSS variables. JANGAN hardcode color di sini — pakai
  // design tokens supaya konsisten dengan design system.
  const styles =
    tone === "covered"
      ? {
          bg: "var(--matcha-300)",
          border: "1px solid var(--matcha-600)",
          iconBg: "var(--matcha-600)",
          itemIconColor: "var(--matcha-800)",
          itemIcon: "CheckCircle2" as IconName,
        }
      : {
          bg: "var(--pure-white)",
          border: "1px solid var(--oat-border)",
          iconBg: "var(--pomegranate-400)",
          itemIconColor: "var(--pomegranate-400)",
          itemIcon: "XCircle" as IconName,
        };

  return (
    <div
      className="clay-card feature h-full p-7"
      style={{ background: styles.bg, border: styles.border }}
    >
      <div
        className="inline-grid place-items-center w-10 h-10 rounded-[10px] mb-4"
        style={{ background: styles.iconBg, color: "var(--pure-white)" }}
      >
        <Icon name={iconName} size="md" />
      </div>
      <h3
        className="card-heading"
        style={{ fontSize: "1.25rem", marginBottom: 16 }}
      >
        {title}
      </h3>
      <ul className="grid gap-2.5 p-0 m-0" style={{ listStyle: "none" }}>
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2.5"
            style={{ color: "var(--ink)" }}
          >
            <Icon
              name={styles.itemIcon}
              size="sm"
              style={{
                color: styles.itemIconColor,
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <span className="body m-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
