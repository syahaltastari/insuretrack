// Halaman detail produk (/products/[slug]).
//
// Server component. Konten diambil dari lib/product-details.ts (static data
// yang sinkron dengan backend Product struct di dto/mod.rs). Tidak ada
// fetch API di sini — content marketing material, bukan data transaksional.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, type IconName } from "@insuretrack/ui";
import { Reveal } from "@/components/Reveal";
import {
  formatIdr,
  formatIdrShort,
  getProductBySlug,
  PRODUCT_DETAILS,
  ALL_PRODUCT_CODES,
} from "@/lib/product-details";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility. Sama
// dengan insurance/new/page.tsx, render di-request time.
export const dynamic = "force-dynamic";

// ---- Page -------------------------------------------------------------------

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const coverageRows: Array<{ label: string; value: string }> = [
    {
      label: "Uang Pertanggungan",
      value: `${formatIdrShort(product.coverage.minSumAssured)} – ${formatIdrShort(product.coverage.maxSumAssured)}`,
    },
    {
      label:
        product.coverage.minTermYears === product.coverage.maxTermYears
          ? "Masa Pertanggungan"
          : "Masa Pertanggungan",
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
    {
      label: "Tarif Premi",
      value: product.premiumRateLabel,
    },
  ];

  return (
    <>
      {/* ===== HERO ===== */}
      <section className={`${product.swatch} clay-section`} style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="clay-container">
          <Reveal>
            <Link
              href="/#products"
              className="caption"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "var(--ink)",
                textDecoration: "none",
                marginBottom: 24,
              }}
            >
              <Icon name="ChevronLeft" size="xs" />
              Kembali ke semua produk
            </Link>
          </Reveal>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 360px)",
              gap: 48,
              alignItems: "center",
            }}
            className="hero-grid"
          >
            <Reveal from="up">
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 72,
                  height: 72,
                  borderRadius: 20,
                  background: "var(--pure-white)",
                  color: "var(--ink)",
                  marginBottom: 24,
                  boxShadow: "var(--shadow-clay)",
                }}
              >
                <Icon name={product.icon} size="xl" />
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "var(--pure-white)",
                  color: "var(--ink)",
                  marginBottom: 16,
                  marginLeft:10,
                }}
              >
                <Icon name="Sparkles" size="xs" />
                <span className="uppercase-label" style={{ margin:0}}>
                  Produk InsureTrack
                </span>
              </div>
              <h1 className="display-secondary" style={{ marginBottom: 16 }}>
                {product.name}
              </h1>
              <p
                className="body-large"
                style={{ color: "var(--ink)", marginBottom: 32, maxWidth: 560 }}
              >
                {product.tagline}
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link
                  href={`/portal/insurance/new?product=${product.code}`}
                  className="clay-button solid-white size-large pill"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
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

            <Reveal from="up" delay={150}>
              <div
                className="clay-card feature"
                style={{
                  background: "var(--pure-white)",
                  // Eksplisit reset color — hero section pakai swatch yang
                  // set color di parent (e.g. var(--pure-white) untuk
                  // swatch-matcha). Tanpa reset, text di dalam white
                  // card inherit white → invisible ("Mulai dari" bug di
                  // LIFE/HEALTH).
                  color: "var(--ink)",
                  padding: 28,
                }}
              >
                <p className="uppercase-label" style={{ marginBottom: 8 }}>
                  Mulai dari
                </p>
                <p
                  className="display-secondary"
                  style={{ marginBottom: 4, fontSize: "2.5rem", lineHeight: 1.1 }}
                >
                  {formatIdr(product.basePremium)}
                </p>
                <p
                  className="caption"
                  style={{ color: "var(--charcoal)", marginBottom: 24 }}
                >
                  per tahun — untuk UP {formatIdrShort(100_000_000)}, term 1 tahun
                </p>
                <div
                  style={{
                    borderTop: "1px dashed var(--oat-border)",
                    paddingTop: 16,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  {coverageRows.map((row) => (
                    <div
                      key={row.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 12,
                      }}
                    >
                      <span className="caption" style={{ color: "var(--charcoal)" }}>
                        {row.label}
                      </span>
                      <span
                        className="mono"
                        style={{ fontSize: "0.85rem", textAlign: "right" }}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===== BENEFITS ===== */}
      <section className="clay-section">
        <div className="clay-container">
          <Reveal>
            <div style={{ marginBottom: 48, maxWidth: 640 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <Icon name="Sparkles" size="xs" style={{ color: `var(--${product.iconTone})` }} />
                <span
                  className="uppercase-label"
                  style={{ margin: 0, color: "var(--charcoal)" }}
                >
                  Keunggulan
                </span>
              </div>
              <h2 className="section-heading">Apa yang Anda dapatkan</h2>
            </div>
          </Reveal>
          <div className="clay-grid cols-3">
            {product.benefits.map((b, i) => (
              <Reveal key={b.title} delay={i * 100} from="up">
                <article className="clay-card feature" style={{ height: "100%" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: `var(--${product.iconTone})`,
                      marginBottom: 16,
                    }}
                  >
                    <Icon name={b.icon as IconName} size="md" />
                  </div>
                  <h3 className="card-heading" style={{ fontSize: "1.25rem", marginBottom: 8 }}>
                    {b.title}
                  </h3>
                  <p className="body" style={{ color: "var(--charcoal)", margin: 0 }}>
                    {b.desc}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== COVERAGE: DITANGGUNG vs TIDAK ===== */}
      <section className="clay-section" style={{ paddingTop: 0 }}>
        <div className="clay-container">
          <Reveal>
            <div style={{ marginBottom: 48, maxWidth: 640 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <Icon name="FileText" size="xs" style={{ color: "var(--matcha-600)" }} />
                <span
                  className="uppercase-label"
                  style={{ margin: 0, color: "var(--matcha-600)" }}
                >
                  Cakupan Polis
                </span>
              </div>
              <h2 className="section-heading">Apa yang dijamin — dan tidak</h2>
              <p
                className="body"
                style={{ color: "var(--charcoal)", marginTop: 12, marginBottom: 0 }}
              >
                Baca baik-baik: yang ditanggung adalah hak Anda, pengecualian adalah
                batasan. Tidak ada kejutan di belakang hari.
              </p>
            </div>
          </Reveal>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
            }}
            className="coverage-grid"
          >
            <Reveal from="up">
              <div
                className="clay-card feature"
                style={{
                  background: "var(--matcha-300)",
                  height: "100%",
                  border: "1px solid var(--matcha-600)",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "var(--matcha-600)",
                    color: "var(--pure-white)",
                    marginBottom: 16,
                  }}
                >
                  <Icon name="Check" size="md" />
                </div>
                <h3 className="card-heading" style={{ fontSize: "1.25rem", marginBottom: 16 }}>
                  Yang ditanggung
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                  {product.covered.map((item) => (
                    <li
                      key={item}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        color: "var(--ink)",
                      }}
                    >
                      <Icon
                        name="CheckCircle2"
                        size="sm"
                        style={{ color: "var(--matcha-800)", flexShrink: 0, marginTop: 2 }}
                      />
                      <span className="body" style={{ margin: 0 }}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal from="up" delay={120}>
              <div
                className="clay-card feature"
                style={{
                  background: "var(--pure-white)",
                  height: "100%",
                  border: "1px solid var(--oat-border)",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "var(--pomegranate-400)",
                    color: "var(--pure-white)",
                    marginBottom: 16,
                  }}
                >
                  <Icon name="XCircle" size="md" />
                </div>
                <h3 className="card-heading" style={{ fontSize: "1.25rem", marginBottom: 16 }}>
                  Yang tidak ditanggung
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                  {product.excluded.map((item) => (
                    <li
                      key={item}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        color: "var(--ink)",
                      }}
                    >
                      <Icon
                        name="XCircle"
                        size="sm"
                        style={{ color: "var(--pomegranate-400)", flexShrink: 0, marginTop: 2 }}
                      />
                      <span className="body" style={{ margin: 0 }}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <div
              className="clay-card dashed"
              style={{
                marginTop: 24,
                padding: 20,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                background: "var(--warm-cream)",
              }}
            >
              <Icon
                name="AlertCircle"
                size="md"
                style={{ color: "var(--matcha-600)", flexShrink: 0, marginTop: 2 }}
              />
              <div>
                <p
                  className="caption"
                  style={{
                    color: "var(--charcoal)",
                    margin: 0,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Masa Tunggu
                </p>
                <p className="body" style={{ color: "var(--ink)", margin: 0 }}>
                  {product.waitingPeriod}
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== CARA KLAIM ===== */}
      <section id="cara-klaim" className="clay-section" style={{ paddingTop: 0 }}>
        <div className="clay-container">
          <Reveal>
            <div style={{ marginBottom: 48, maxWidth: 640 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <Icon name="ScrollText" size="xs" style={{ color: "var(--honey-700)" }} />
                <span
                  className="uppercase-label"
                  style={{ margin: 0, color: "var(--honey-700)" }}
                >
                  Proses Klaim
                </span>
              </div>
              <h2 className="section-heading">Cara klaim, langkah demi langkah</h2>
            </div>
          </Reveal>
          <div className="clay-grid cols-3">
            {product.howToClaim.map((step, i) => (
              <Reveal key={step.title} delay={i * 120} from="up">
                <div
                  className="clay-card feature"
                  style={{ height: "100%", position: "relative" }}
                >
                  <p
                    className="mono"
                    style={{
                      color: `var(--${product.iconTone})`,
                      fontSize: "0.95rem",
                      margin: "0 0 12px 0",
                      fontWeight: 600,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <h3
                    className="card-heading"
                    style={{ fontSize: "1.15rem", marginBottom: 8 }}
                  >
                    {step.title}
                  </h3>
                  <p className="body" style={{ color: "var(--charcoal)", margin: 0 }}>
                    {step.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="clay-section" style={{ paddingTop: 0 }}>
        <div className="clay-container">
          <Reveal>
            <div style={{ marginBottom: 48, maxWidth: 640 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <Icon name="MessageCircle" size="xs" style={{ color: "var(--slushie-800)" }} />
                <span
                  className="uppercase-label"
                  style={{ margin: 0, color: "var(--slushie-800)" }}
                >
                  Pertanyaan Umum
                </span>
              </div>
              <h2 className="section-heading">Pertanyaan yang sering ditanyakan</h2>
            </div>
          </Reveal>
          <div style={{ display: "grid", gap: 12, maxWidth: 800 }}>
            {product.faqs.map((faq, i) => (
              <Reveal key={faq.q} delay={i * 80} from="up">
                <details
                  className="clay-card dashed"
                  style={{
                    padding: 0,
                    background: "var(--pure-white)",
                    overflow: "hidden",
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      padding: 20,
                      listStyle: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <h3
                      className="card-heading"
                      style={{ fontSize: "1.05rem", margin: 0, flex: 1 }}
                    >
                      {faq.q}
                    </h3>
                    <Icon
                      name="Plus"
                      size="md"
                      style={{ color: "var(--charcoal)", flexShrink: 0 }}
                    />
                  </summary>
                  <div
                    style={{
                      padding: "0 20px 20px 20px",
                      borderTop: "1px dashed var(--oat-border)",
                      paddingTop: 16,
                    }}
                  >
                    <p
                      className="body"
                      style={{ color: "var(--charcoal)", margin: 0 }}
                    >
                      {faq.a}
                    </p>
                  </div>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== LAINNYA ===== */}
      <section className="clay-section" style={{ paddingTop: 0 }}>
        <div className="clay-container">
          <Reveal>
            <div style={{ marginBottom: 32, textAlign: "center" }}>
              <h2 className="section-heading">Atau bandingkan dengan produk lain</h2>
            </div>
          </Reveal>
          <div className="clay-grid cols-3">
            {ALL_PRODUCT_CODES.filter((c) => c !== product.code).map((otherCode) => {
              const other = PRODUCT_DETAILS[otherCode];
              return (
                <Reveal key={otherCode} from="up">
                  <Link
                    href={`/products/${other.slug}`}
                    className="clay-card feature"
                    style={{
                      height: "100%",
                      display: "block",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: `var(--${other.iconTone})`,
                        marginBottom: 16,
                      }}
                    >
                      <Icon name={other.icon} size="md" />
                    </div>
                    <h3 className="card-heading" style={{ fontSize: "1.25rem", marginBottom: 8 }}>
                      {other.name}
                    </h3>
                    <p className="body" style={{ color: "var(--charcoal)", margin: 0 }}>
                      {other.description}
                    </p>
                    <div
                      style={{
                        marginTop: 16,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        color: "var(--ink)",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                      }}
                    >
                      Lihat detail <Icon name="ArrowRight" size="xs" />
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className={`${product.swatchDeep} clay-section`} style={{ borderRadius: 0 }}>
        <div className="clay-container" style={{ textAlign: "center" }}>
          <Reveal>
            <h2
              className="section-heading"
              style={{ color: "var(--pure-white)", marginBottom: 16 }}
            >
              Siap ambil {product.name}?
            </h2>
            <p
              className="body-large"
              style={{ color: "var(--pure-white)", marginBottom: 24, opacity: 0.85 }}
            >
              Pendaftaran memakan waktu kurang dari 5 menit. Polis terbit otomatis
              setelah pembayaran.
            </p>
            <Link
              href={`/portal/insurance/new?product=${product.code}`}
              className="clay-button solid-white size-large pill"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              Beli {product.name}
              <Icon name="ArrowRight" size="sm" />
            </Link>
            <p
              className="caption"
              style={{
                color: "var(--pure-white)",
                opacity: 0.7,
                marginTop: 16,
                marginBottom: 0,
              }}
            >
              {product.ctaNote}
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
