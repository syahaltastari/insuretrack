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
 *   5. Kontak (email, jam, lokasi)
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
      className="app-footer-social-link"
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
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div className="app-footer-grid">
          {/* Brand + social */}
          <div className="app-footer-brand">
            <Link href="/" className="app-footer-brand-mark">
              <Icon name="ShieldCheck" size="md" style={{ color: "var(--matcha-300)" }} />
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
                <Link href="/#products">Asuransi Jiwa</Link>
              </li>
              <li>
                <Link href="/#products">Asuransi Kecelakaan Diri</Link>
              </li>
              <li>
                <Link href="/#products">Asuransi Kesehatan</Link>
              </li>
              <li>
                <Link href="/#how">Cara Kerja</Link>
              </li>
            </ul>
          </div>

          {/* Perusahaan */}
          <div className="app-footer-col">
            <h4>Perusahaan</h4>
            <ul>
              <li>
                <Link href="/about">Tentang Kami</Link>
              </li>
              <li>
                <Link href="/faq">FAQ</Link>
              </li>
              <li>
                <Link href="/#contact">Kontak</Link>
              </li>
              <li>
                <Link href="/portal/register">Daftar Akun</Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="app-footer-col">
            <h4>Legal</h4>
            <ul>
              <li>
                <Link href="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms">Terms &amp; Conditions</Link>
              </li>
            </ul>
          </div>

          {/* Kontak */}
          <div className="app-footer-col">
            <h4>Kontak</h4>
            <ul>
              <li>
                <a href="mailto:contact@insuretrack.com">contact@insuretrack.com</a>
              </li>
              <li>Senin–Jumat</li>
              <li>09:00–18:00 WIB</li>
              <li>Jakarta, Indonesia</li>
            </ul>
          </div>
        </div>

        <div className="app-footer-bottom">
          <p>© {year} InsureTrack. Hak cipta dilindungi.</p>
          <p className="app-footer-bottom-meta">
            Platform asuransi digital · Versi 0.1.0
          </p>
        </div>
      </div>
    </footer>
  );
}
