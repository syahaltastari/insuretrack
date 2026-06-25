import Link from "next/link";
import { Icon } from "@insuretrack/ui";

/**
 * Footer publik — dipakai di semua halaman marketing (landing, FAQ, dll.)
 * di bawah `app/(marketing)/layout.tsx`. Server component, no client state.
 *
 * Struktur 5 kolom (mobile: stack):
 *   1. Brand + tagline + social media icons
 *   2. Produk (link ke anchor di landing)
 *   3. Perusahaan (Tentang, FAQ, Kontak)
 *   4. Legal (Privacy, Terms)
 *   5. Kontak (email, jam, lokasi) — di-merge dari section Contact
 *      yang dulu ada di landing (sekarang digabung supaya tidak duplikat)
 *
 * v2 update: brand mark pakai honey-400 square (accent kuning konsisten
 * dengan tema landing). Link hover pakai honey-300 (subtle, warm).
 * Honey gradient divider di atas footer untuk transisi visual halus
 * dari section honey-400 (CTA) di atasnya.
 *
 * Social media di-link ke username "insuretrack" di tiap platform. Override
 * per-link ada di array `socials` di bawah — ganti URL kalau akun resmi
 * sudah ada.
 */

type SocialLink = {
  name: string;
  href: string;
  /** Nama icon di @insuretrack/ui (lihat IconName). `null` = pakai inline SVG. */
  iconName:
    | "Instagram"
    | "Facebook"
    | "Twitter"
    | "Linkedin"
    | "Youtube"
    | "Github"
    | null;
  /** Inline SVG path untuk icon yang tidak ada di lucide (TikTok, X, WhatsApp). */
  inlineSvg?: React.ReactNode;
  /** Hover color (brand color). Default = warm silver. */
  hoverColor: string;
};

const SOCIALS: SocialLink[] = [
  {
    name: "Instagram",
    href: "https://instagram.com/insuretrack",
    iconName: "Instagram",
    hoverColor: "#E1306C",
  },
  {
    name: "Facebook",
    href: "https://facebook.com/insuretrack",
    iconName: "Facebook",
    hoverColor: "#1877F2",
  },
  {
    name: "X (Twitter)",
    href: "https://x.com/insuretrack",
    iconName: "Twitter",
    hoverColor: "#000000",
  },
  {
    name: "LinkedIn",
    href: "https://linkedin.com/company/insuretrack",
    iconName: "Linkedin",
    hoverColor: "#0A66C2",
  },
  {
    name: "YouTube",
    href: "https://youtube.com/@insuretrack",
    iconName: "Youtube",
    hoverColor: "#FF0000",
  },
  {
    name: "TikTok",
    href: "https://tiktok.com/@insuretrack",
    iconName: null,
    // Path simple TikTok logo (catatan musik + circle). Pakai generic path
    // karena tidak ada official lucide icon — bisa di-replace dengan
    // official TikTok brand asset kalau perlu.
    inlineSvg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.93a8.16 8.16 0 0 0 4.77 1.52V7a4.85 4.85 0 0 1-1.84-.31Z" />
      </svg>
    ),
    hoverColor: "#000000",
  },
];

function SocialIconLink({ social }: { social: SocialLink }) {
  return (
    <a
      href={social.href}
      aria-label={social.name}
      title={social.name}
      target="_blank"
      rel="noopener noreferrer"
      className="app-footer-social-link footer-link-honey"
      style={{ ["--hover-color" as string]: social.hoverColor }}
    >
      {social.iconName ? (
        <Icon name={social.iconName} size="md" />
      ) : (
        <span className="app-footer-social-svg">{social.inlineSvg}</span>
      )}
    </a>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="app-footer relative">
      {/* Honey gradient divider — transisi visual dari section CTA
          (honey-400) di atas ke footer (ink dark). Tipis, tidak夺眼. */}
      <div
        aria-hidden="true"
        className="footer-divider-honey absolute top-0 left-0 right-0"
      />

      <div className="app-footer-inner">
        <div className="app-footer-grid">
          {/* Brand + social */}
          <div className="app-footer-brand">
            <Link href="/" className="app-footer-brand-mark">
              {/* Honey-400 square mark — konsisten dengan tema landing.
                  Beda dari navbar (ink bg) supaya ada variasi visual. */}
              <span className="footer-brand-accent" aria-hidden="true">
                ◆
              </span>
              <span>InsureTrack</span>
            </Link>
            <p className="app-footer-tagline">
              Asuransi digital, prosesnya cepat, polis langsung terbit.
            </p>
            <div className="app-footer-social" aria-label="Ikuti kami di media sosial">
              {SOCIALS.map((s) => (
                <SocialIconLink key={s.name} social={s} />
              ))}
            </div>
          </div>

          {/* Produk */}
          <div className="app-footer-col">
            <h4>Produk</h4>
            <ul>
              <li>
                <Link href="/#products" className="footer-link-honey">
                  Asuransi Jiwa
                </Link>
              </li>
              <li>
                <Link href="/#products" className="footer-link-honey">
                  Asuransi Kecelakaan Diri
                </Link>
              </li>
              <li>
                <Link href="/#products" className="footer-link-honey">
                  Asuransi Kesehatan
                </Link>
              </li>
              <li>
                <Link href="/#how" className="footer-link-honey">
                  Cara Kerja
                </Link>
              </li>
            </ul>
          </div>

          {/* Perusahaan */}
          <div className="app-footer-col">
            <h4>Perusahaan</h4>
            <ul>
              <li>
                <Link href="/about" className="footer-link-honey">
                  Tentang Kami
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="footer-link-honey">
                  FAQ
                </Link>
              </li>
              <li>
                <a href="mailto:contact@insuretrack.com" className="footer-link-honey">
                  Kontak
                </a>
              </li>
              <li>
                <Link href="/portal/register" className="footer-link-honey">
                  Daftar Akun
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="app-footer-col">
            <h4>Legal</h4>
            <ul>
              <li>
                <Link href="/privacy" className="footer-link-honey">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="footer-link-honey">
                  Terms &amp; Conditions
                </Link>
              </li>
            </ul>
          </div>

          {/* Kontak — di-merge dari section Contact (sebelumnya section
              terpisah di landing). Sekarang inline di footer untuk
              konsolidasi — tidak duplikat info. */}
          <div className="app-footer-col">
            <h4>Kontak</h4>
            <ul>
              <li>
                <a
                  href="mailto:contact@insuretrack.com"
                  className="footer-link-honey"
                >
                  contact@insuretrack.com
                </a>
              </li>
              <li>Senin–Jumat</li>
              <li>09:00–18:00 WIB</li>
              <li>Bogor, Indonesia</li>
            </ul>
          </div>
        </div>

        <div className="app-footer-bottom">
          <p>© {year} InsureTrack. Hak cipta dilindungi.</p>
          <p className="app-footer-bottom-meta">
            Platform asuransi digital
          </p>
        </div>
      </div>
    </footer>
  );
}
