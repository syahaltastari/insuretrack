// Landing page (FS-01) — Clay-inspired design
// Reference: DESIGN.md + globals.css design tokens
//
// Catatan: dipindah dari app/page.tsx → app/(marketing)/page.tsx agar
// Navbar + Footer di-share via `app/(marketing)/layout.tsx`. URL tetap `/`.

import Link from "next/link";
import { Icon, SafeImage, type IconName } from "@insuretrack/ui";
import { API_BASE } from "@insuretrack/api-client";
import { Reveal } from "@/components/Reveal";
import { Carousel } from "@/components/Carousel";

const API = API_BASE;

type Product = { code: string; name: string; description: string };

type Client = {
  id: string;
  name: string;
  logo_url: string;
  industry: string | null;
  website: string | null;
};

type Testimonial = {
  id: string;
  customer_name: string;
  photo_url: string | null;
  rating: number;
  review: string;
  role: string | null;
  company: string | null;
  policy_type: string | null;
  is_featured: boolean;
};

async function fetchProducts(): Promise<Product[]> {
  try {
    const r = await fetch(`${API}/public/products`, { cache: "no-store" });
    if (!r.ok) return [];
    const json = (await r.json()) as { data: Product[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

async function fetchClients(): Promise<Client[]> {
  try {
    const r = await fetch(`${API}/public/clients`, { cache: "no-store" });
    if (!r.ok) return [];
    const json = (await r.json()) as { data: Client[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

async function fetchTestimonials(): Promise<Testimonial[]> {
  try {
    const r = await fetch(`${API}/public/testimonials`, { cache: "no-store" });
    if (!r.ok) return [];
    const json = (await r.json()) as { data: Testimonial[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

const PRODUCT_VISUALS: Array<{ icon: IconName; tone: string }> = [
  { icon: "HeartPulse", tone: "matcha-300" },
  { icon: "BriefcaseMedical", tone: "slushie-500" },
  { icon: "Stethoscope", tone: "ube-300" },
];

const BENEFITS: Array<{ icon: IconName; title: string; desc: string }> = [
  { icon: "ShieldCheck", title: "Tanpa Cabang", desc: "100% online, dari formulir hingga polis terbit." },
  { icon: "Zap", title: "Auto-Accept", desc: "Tidak ada underwriting manual. Polis terbit otomatis." },
  { icon: "FileText", title: "E-Policy PDF", desc: "Polis elektronik dikirim ke email Anda." },
  { icon: "LayoutDashboard", title: "Portal Customer", desc: "Lihat polis, ajukan klaim, tanya jawab—semua di portal." },
  { icon: "Lock", title: "Pembayaran Aman", desc: "Payment gateway tepercaya. Idempotent webhook." },
  { icon: "ScrollText", title: "Audit Trail", desc: "Setiap aksi tercatat untuk transparansi penuh." },
];

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span aria-label={`Rating ${rating} dari 5`} style={{ display: "inline-flex", gap: 2 }}>
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

function SectionLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
        color,
      }}
    >
      <Icon name="Sparkles" size="xs" />
      <span className="uppercase-label" style={{ margin: 0 }}>
        {children}
      </span>
    </div>
  );
}

export default async function HomePage() {
  const [products, clients, testimonials] = await Promise.all([
    fetchProducts(),
    fetchClients(),
    fetchTestimonials(),
  ]);

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="clay-section" style={{ paddingTop: 96, paddingBottom: 96 }}>
        <div className="clay-container">
          <Reveal from="fade">
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 999,
                background: "var(--matcha-300)",
                color: "var(--matcha-600)",
                marginBottom: 24,
              }}
            >
              <Icon name="ShieldCheck" size="sm" />
              <span className="uppercase-label" style={{ margin: 0 }}>
                Digital Insurance Platform
              </span>
            </div>
          </Reveal>
          <Reveal from="up" delay={80}>
            <h1 className="display-hero" style={{ marginBottom: 24, textAlign: "center" }}>
              Asuransi digital,<br />
              <span style={{ color: "var(--ube-800)" }}>polis langsung terbit.</span>
            </h1>
          </Reveal>
          <Reveal from="up" delay={180}>
            <p
              className="body-large"
              style={{ color: "var(--warm-charcoal)", marginBottom: 40, textAlign: "center", maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}
            >
              Tanpa kunjungan cabang. Tanpa dokumen fisik. Daftar, bayar, dan e-policy Anda terbit dalam hitungan menit.
            </p>
          </Reveal>
          <Reveal from="up" delay={280}>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/portal/register"
                className="clay-button solid-ube size-large pill"
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                Beli Polis Sekarang
                <Icon name="ArrowRight" size="sm" />
              </Link>
              <a href="#products" className="clay-button ghost size-large pill">
                Lihat Produk
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== PRODUCTS ===== */}
      <section id="products" className="clay-section" style={{ paddingTop: 0 }}>
        <div className="clay-container">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ display: "inline-flex" }}>
                <SectionLabel color="var(--matcha-600)">Tiga produk, satu platform</SectionLabel>
              </div>
              <h2 className="section-heading">Pilih perlindungan yang tepat</h2>
            </div>
          </Reveal>
          {products.length === 0 ? (
            <Reveal>
              <p style={{ textAlign: "center", color: "var(--warm-charcoal)" }}>
                Tidak bisa memuat produk (backend belum hidup?).
              </p>
            </Reveal>
          ) : (
            <div className="clay-grid cols-3">
              {products.map((p, i) => {
                const visual = PRODUCT_VISUALS[i] ?? PRODUCT_VISUALS[0];
                return (
                  <Reveal key={p.code} delay={i * 120} from="up">
                    <Link
                      href={`/products/${p.code}`}
                      className="clay-card feature clay-card-hoverable"
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
                          background: `var(--${visual.tone})`,
                          color: "var(--clay-black)",
                          marginBottom: 16,
                          transition: "transform 240ms cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                      >
                        <Icon name={visual.icon} size="md" />
                      </div>
                      <h3 className="card-heading" style={{ fontSize: "1.5rem" }}>
                        {p.name}
                      </h3>
                      <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
                        {p.description}
                      </p>
                      <div
                        style={{
                          marginTop: 16,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          color: "var(--clay-black)",
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
          )}
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" className="swatch-ube clay-section" style={{ borderRadius: 0, margin: "80px 0" }}>
        <div className="clay-container">
          <Reveal>
            <SectionLabel color="var(--ube-300)">Bagaimana Caranya</SectionLabel>
            <h2 className="section-heading" style={{ color: "var(--pure-white)", marginBottom: 48 }}>
              Dari formulir ke polis, dalam 3 langkah.
            </h2>
          </Reveal>
          <div className="clay-grid cols-3">
            {[
              { n: "01", t: "Daftar Online", d: "Isi formulir, upload KTP, dapat invoice dalam hitungan menit." },
              { n: "02", t: "Bayar Premi", d: "Selesaikan pembayaran via payment gateway. Status ter-update otomatis." },
              { n: "03", t: "Polis Terbit", d: "E-policy PDF langsung di email. Aktivasi portal customer." },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 150} from="up">
                <div className="clay-card feature" style={{ background: "var(--ube-900)" }}>
                  <p className="mono" style={{ color: "var(--ube-300)", fontSize: "0.9rem", margin: "0 0 8px 0" }}>
                    {s.n}
                  </p>
                  <h3 className="feature-title" style={{ color: "var(--pure-white)" }}>
                    {s.t}
                  </h3>
                  <p className="body" style={{ color: "var(--ube-300)", margin: 0 }}>
                    {s.d}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHY ===== */}
      <section id="why" className="clay-section" style={{ paddingTop: 0 }}>
        <div className="clay-container">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ display: "inline-flex" }}>
                <SectionLabel color="var(--ube-800)">Kenapa InsureTrack</SectionLabel>
              </div>
              <h2 className="section-heading">Dibangun untuk kesederhanaan</h2>
            </div>
          </Reveal>
          <div className="clay-grid cols-3">
            {BENEFITS.map((b, i) => (
              <Reveal key={b.title} delay={(i % 3) * 100} from="up">
                <div className="clay-card dashed" style={{ padding: 24, height: "100%" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "var(--matcha-300)",
                      color: "var(--matcha-600)",
                      marginBottom: 12,
                    }}
                  >
                    <Icon name={b.icon} size="md" />
                  </div>
                  <h3 className="feature-title" style={{ marginBottom: 8 }}>
                    {b.title}
                  </h3>
                  <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
                    {b.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CLIENTS (static grid) — full-width ===== */}
      {clients.length > 0 && (
        <section className="clay-section" style={{ paddingTop: 0, paddingBottom: 80 }}>
          <div className="clay-container">
            <Reveal>
              <div style={{ textAlign: "center", marginBottom: 32 }}>
                <div style={{ display: "inline-flex" }}>
                  <SectionLabel color="var(--ube-800)">Dipercaya Oleh</SectionLabel>
                </div>
                <h2 className="section-heading">Klien korporat kami</h2>
              </div>
            </Reveal>
            {/* Logo strip statis: tanpa scroll, tanpa container dashed per-logo,
                grayscale default → warna saat hover, center ketika item
                tidak penuh satu baris (flex-wrap + justify-content center). */}
            <div
              className="clients-strip"
              role="list"
              aria-label="Logo klien korporat"
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                gap: 32,
                maxWidth: 960,
                margin: "0 auto",
              }}
            >
              {clients.map((c) => (
                <a
                  key={c.id}
                  href={c.website ?? "#"}
                  target={c.website ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  role="listitem"
                  className="client-logo"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <SafeImage
                    src={c.logo_url}
                    alt={c.name}
                    initials={c.name}
                    size={88}
                    rounded={false}
                    style={{
                      width: "auto",
                      height: 72,
                      maxWidth: 160,
                      objectFit: "contain",
                    }}
                  />
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== TESTIMONIALS (carousel) — full-width ===== */}
      {testimonials.length > 0 && (
        <section id="testimonials" className="swatch-ube clay-section" style={{ borderRadius: 0, margin: "80px 0", padding: "80px 0" }}>
          <div className="clay-container" style={{ marginBottom: 32 }}>
            <Reveal>
              <SectionLabel color="var(--ube-300)">Apa Kata Mereka</SectionLabel>
              <h2 className="section-heading" style={{ color: "var(--pure-white)" }}>
                Testimoni customer
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
                className="clay-card feature"
                style={{ background: "var(--ube-900)", height: "100%" }}
              >
                <Icon
                  name="Quote"
                  size="lg"
                  style={{ color: "var(--ube-300)", marginBottom: 12 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      overflow: "hidden",
                      background: "var(--ube-800)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      border: "2px solid var(--ube-300)",
                    }}
                  >
                    {t.photo_url ? (
                      <img
                        src={t.photo_url}
                        alt={t.customer_name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ fontSize: 18, color: "var(--ube-300)", fontWeight: 600 }}>
                        {t.customer_name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="feature-title" style={{ color: "var(--pure-white)", marginBottom: 2 }}>
                      {t.customer_name}
                    </h3>
                    <p className="caption" style={{ color: "var(--ube-300)", margin: 0 }}>
                      {t.role ?? "Customer"}{t.company ? ` · ${t.company}` : ""}
                    </p>
                  </div>
                </div>
                <Stars rating={t.rating} size={16} />
                <p
                  className="body"
                  style={{
                    color: "var(--ube-300)",
                    margin: "12px 0 0 0",
                    fontStyle: "italic",
                  }}
                >
                  &ldquo;{t.review}&rdquo;
                </p>
                {t.is_featured && (
                  <span
                    className="clay-badge lemon"
                    style={{ marginTop: 12, fontSize: "0.7rem" }}
                  >
                    Featured
                  </span>
                )}
              </div>
            ))}
          />
        </section>
      )}

      {/* ===== CTA ===== */}
      <section className="swatch-matcha-deep clay-section" style={{ borderRadius: 0 }}>
        <div className="clay-container" style={{ textAlign: "center" }}>
          <Reveal>
            <h2 className="section-heading" style={{ color: "var(--pure-white)", marginBottom: 16 }}>
              Siap melindungi yang Anda cintai?
            </h2>
            <p className="body-large" style={{ color: "var(--matcha-300)", marginBottom: 32 }}>
              Pendaftaran memakan waktu kurang dari 5 menit.
            </p>
            <Link
              href="/portal/register"
              className="clay-button solid-white size-large pill"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              Mulai Sekarang
              <Icon name="ArrowRight" size="sm" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ===== CONTACT ===== */}
      <section id="contact" className="clay-section" style={{ paddingTop: 80, paddingBottom: 40 }}>
        <div className="clay-container">
          <Reveal>
            <div className="clay-card section" style={{ background: "var(--warm-cream)" }}>
              <h2 className="section-heading" style={{ marginBottom: 16 }}>
                Hubungi Kami
              </h2>
              <p className="body" style={{ color: "var(--warm-charcoal)", marginBottom: 8 }}>
                Email: <span className="mono">cs@insuretrack.example</span> · Telepon:{" "}
                <span className="mono">(021) 555-0100</span>
              </p>
              <p className="caption" style={{ color: "var(--warm-silver)" }}>
                Bogor, Indonesia
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
