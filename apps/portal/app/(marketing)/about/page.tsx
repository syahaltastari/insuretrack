import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@insuretrack/ui";

export const metadata: Metadata = {
  title: "Tentang Kami — InsureTrack",
  description:
    "Misi, visi, dan cerita di balik InsureTrack — platform asuransi digital yang membawa transparansi & kecepatan untuk semua.",
};

/**
 * About page — tiga blok: Misi, Visi, Nilai + tim placeholder.
 * Tone: human, bukan korporat. Copy singkat, visual banyak.
 */

const VALUES: Array<{ icon: IconName; title: string; desc: string }> = [
  {
    icon: "Zap",
    title: "Kecepatan",
    desc: "Polis terbit dalam hitungan menit, bukan minggu. Tanpa antrian, tanpa bolak-balik dokumen.",
  },
  {
    icon: "Lock",
    title: "Transparansi",
    desc: "Tidak ada klausul tersembunyi, tidak ada underwriting misterius. Apa yang Anda lihat adalah apa yang Anda dapat.",
  },
  {
    icon: "ShieldCheck",
    title: "Kepercayaan",
    desc: "Audit trail untuk setiap aksi. Regulasi OJK dipatuhi. Data Anda dienkripsi end-to-end.",
  },
  {
    icon: "HeartPulse",
    title: "Aksesibilitas",
    desc: "Asuransi untuk semua, bukan hanya yang punya akses ke agen. 100% online, 100% inklusif.",
  },
];

const STATS: Array<{ value: string; label: string }> = [
  { value: "5 menit", label: "Pendaftaran" },
  { value: "< 2 menit", label: "Polis terbit setelah bayar" },
  { value: "7 hari kerja", label: "SLA review klaim" },
  { value: "24/7", label: "Portal customer" },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="clay-section" style={{ paddingTop: 80, paddingBottom: 24 }}>
        <div className="clay-container" style={{ maxWidth: 880 }}>
          <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 12 }}>
            ✦ Tentang Kami
          </p>
          <h1 className="display-secondary" style={{ marginBottom: 20 }}>
            Asuransi seharusnya tidak serumit ini.
          </h1>
          <p
            className="body-large"
            style={{ color: "var(--warm-charcoal)", maxWidth: 640, lineHeight: 1.6 }}
          >
            InsureTrack lahir dari satu pengamatan: industri asuransi di Indonesia
            masih terjebak proses manual yang bikin calon customer frustasi.
            Padahal, polis itu sendiri — produknya — seharusnya bisa diterbitkan
            dalam hitungan menit.
          </p>
        </div>
      </section>

      {/* Misi & Visi */}
      <section className="clay-section" style={{ paddingTop: 24, paddingBottom: 24 }}>
        <div className="clay-container" style={{ maxWidth: 880 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 24,
            }}
          >
            <article
              className="clay-card feature"
              style={{ background: "var(--matcha-300)" }}
            >
              <p
                className="uppercase-label"
                style={{ color: "var(--matcha-800)", marginBottom: 8 }}
              >
                Misi
              </p>
              <h2
                className="card-heading"
                style={{ color: "var(--matcha-800)", marginBottom: 12 }}
              >
                Demokratisasi asuransi.
              </h2>
              <p
                className="body"
                style={{ color: "var(--matcha-800)", margin: 0 }}
              >
                Membawa perlindungan asuransi ke sebanyak mungkin orang Indonesia
                lewat proses yang sederhana, harga yang transparan, dan teknologi
                yang meng-handle semua overhead.
              </p>
            </article>
            <article
              className="clay-card feature"
              style={{ background: "var(--ube-900)" }}
            >
              <p
                className="uppercase-label"
                style={{ color: "var(--ube-300)", marginBottom: 8 }}
              >
                Visi
              </p>
              <h2
                className="card-heading"
                style={{ color: "var(--pure-white)", marginBottom: 12 }}
              >
                Polis = 5 menit.
              </h2>
              <p
                className="body"
                style={{ color: "var(--ube-300)", margin: 0 }}
              >
                Menjadi standar industri: setiap polis di Indonesia bisa dibeli,
                dibayar, dan di-claim tanpa kertas, tanpa cabang, tanpa agen — dengan
                customer memegang kontrol penuh lewat portal.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section
        className="clay-section"
        style={{ paddingTop: 40, paddingBottom: 40, background: "var(--warm-cream)" }}
      >
        <div className="clay-container" style={{ maxWidth: 880 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 24,
            }}
          >
            {STATS.map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <p
                  className="display-secondary"
                  style={{
                    color: "var(--ube-800)",
                    margin: 0,
                    fontSize: "2.5rem",
                  }}
                >
                  {s.value}
                </p>
                <p
                  className="caption"
                  style={{
                    color: "var(--warm-charcoal)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    margin: "8px 0 0 0",
                  }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Nilai */}
      <section className="clay-section" style={{ paddingTop: 60, paddingBottom: 40 }}>
        <div className="clay-container" style={{ maxWidth: 880 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 className="section-heading">Nilai yang Kami Pegang</h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {VALUES.map((v) => (
              <div key={v.title} className="clay-card dashed" style={{ padding: 24 }}>
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
                  <Icon name={v.icon} size="md" />
                </div>
                <h3 className="feature-title" style={{ marginBottom: 6 }}>
                  {v.title}
                </h3>
                <p
                  className="caption"
                  style={{ color: "var(--warm-charcoal)", margin: 0, lineHeight: 1.6 }}
                >
                  {v.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cerita singkat */}
      <section className="clay-section" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <div className="clay-container" style={{ maxWidth: 720 }}>
          <h2 className="section-heading" style={{ marginBottom: 20 }}>
            Cerita di balik layar
          </h2>
          <div
            className="body"
            style={{ color: "var(--warm-charcoal)", lineHeight: 1.7 }}
          >
            <p>
              InsureTrack dibangun di Indonesia, untuk Indonesia. Tim kami terdiri
              dari engineer, underwriter, dan customer success yang pernah
              frustasi sendiri dengan proses klaim yang lambat dan polis yang
              penuh klausul.
            </p>
            <p>
              Platform ini lahir dari tesis sederhana: kalau e-commerce bisa
              one-click, kenapa polis asuransi masih butuh tanda tangan di atas
              materai?
            </p>
            <p>
              Hasilnya: pendaftaran 5 menit, e-policy otomatis, klaim real-time.
              Semua tanpa memotong regulasi — kami patuh pada OJK dan UU
              Perasuransian, hanya saja menggunakan teknologi untuk mengeksekusi
              lebih cepat.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="clay-section" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <div className="clay-container" style={{ maxWidth: 720 }}>
          <div
            className="clay-card section"
            style={{ background: "var(--warm-cream)", textAlign: "center" }}
          >
            <h2 className="section-heading" style={{ marginBottom: 12 }}>
              Mau coba sendiri?
            </h2>
            <p
              className="body-large"
              style={{ color: "var(--warm-charcoal)", marginBottom: 24 }}
            >
              Daftarkan diri Anda — gratis, tanpa komitmen, dan bisa batalkan
              kapan saja dalam 14 hari pertama.
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Link href="/portal/register" className="clay-button solid-ube size-large">
                Daftar Sekarang
              </Link>
              <Link href="/#products" className="clay-button ghost size-large">
                Lihat Produk
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
