// Landing page (FS-01) — Clay-inspired design
// Reference: DESIGN.md + globals.css design tokens

import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Reveal, StaggerGroup } from "@/components/Reveal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

type Product = { code: string; name: string; description: string };

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

const SWATCH_TONES = ["matcha-300", "slushie-500", "ube-300"] as const;

export default async function HomePage() {
  const products = await fetchProducts();

  return (
    <>
      <Navbar />

      <main>
        {/* ===== HERO ===== */}
        <section className="clay-section" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <div className="clay-container">
            <Reveal from="fade">
              <p className="uppercase-label" style={{ marginBottom: 24, color: "var(--matcha-600)" }}>
                ✦ Digital Insurance Platform
              </p>
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
                <Link href="/register" className="clay-button solid-ube size-large pill">
                  Beli Polis Sekarang →
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
              <h2 className="section-heading" style={{ textAlign: "center", marginBottom: 48 }}>
                Tiga produk, satu platform
              </h2>
            </Reveal>
            {products.length === 0 ? (
              <Reveal>
                <p style={{ textAlign: "center", color: "var(--warm-charcoal)" }}>
                  Tidak bisa memuat produk (backend belum hidup?).
                </p>
              </Reveal>
            ) : (
              <div className="clay-grid cols-3">
                {products.map((p, i) => (
                  <Reveal key={p.code} delay={i * 120} from="up">
                    <article className="clay-card feature clay-card-hoverable" style={{ height: "100%" }}>
                      <div
                        style={{
                          display: "inline-block",
                          width: 48,
                          height: 48,
                          borderRadius: 12,
                          background: `var(--${SWATCH_TONES[i] ?? "matcha-300"})`,
                          marginBottom: 16,
                          transition: "transform 240ms cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                      />
                      <h3 className="card-heading" style={{ fontSize: "1.5rem" }}>
                        {p.name}
                      </h3>
                      <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
                        {p.description}
                      </p>
                    </article>
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section id="how" className="swatch-ube clay-section" style={{ borderRadius: 0, margin: "80px 0" }}>
          <div className="clay-container">
            <Reveal>
              <p className="uppercase-label" style={{ marginBottom: 16, color: "var(--ube-300)" }}>
                ✦ Bagaimana Caranya
              </p>
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
              <h2 className="section-heading" style={{ textAlign: "center", marginBottom: 48 }}>
                Kenapa InsureTrack
              </h2>
            </Reveal>
            <div className="clay-grid cols-3">
              {[
                { i: "✓", t: "Tanpa Cabang", d: "100% online, dari formulir hingga polis terbit." },
                { i: "✓", t: "Auto-Accept", d: "Tidak ada underwriting manual. Polis terbit otomatis." },
                { i: "✓", t: "E-Policy PDF", d: "Polis elektronik dikirim ke email Anda." },
                { i: "✓", t: "Portal Customer", d: "Lihat polis, ajukan klaim, tanya jawab—semua di portal." },
                { i: "✓", t: "Pembayaran Aman", d: "Payment gateway tepercaya. Idempotent webhook." },
                { i: "✓", t: "Audit Trail", d: "Setiap aksi tercatat untuk transparansi penuh." },
              ].map((b, i) => (
                <Reveal key={b.t} delay={(i % 3) * 100} from="up">
                  <div className="clay-card dashed" style={{ padding: 24, height: "100%" }}>
                    <p className="mono" style={{ color: "var(--matcha-600)", fontSize: "1.5rem", margin: "0 0 8px 0" }}>
                      {b.i}
                    </p>
                    <h3 className="feature-title" style={{ marginBottom: 8 }}>
                      {b.t}
                    </h3>
                    <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
                      {b.d}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

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
              <Link href="/register" className="clay-button solid-white size-large pill">
                Mulai Sekarang →
              </Link>
            </Reveal>
          </div>
        </section>

        {/* ===== CONTACT + FOOTER ===== */}
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
                  Jakarta, Indonesia
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <footer
          className="clay-card section"
          style={{
            margin: "40px 24px 24px",
            padding: "32px 40px",
            textAlign: "center",
            borderRadius: "var(--radius-section)",
          }}
        >
          <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            © {new Date().getFullYear()} InsureTrack ·{" "}
            <a href="#">Privacy Policy</a> · <a href="#">Terms &amp; Conditions</a>
          </p>
        </footer>
      </main>
    </>
  );
}
