// JSON-LD structured data generators untuk landing page.
//
// Schema.org types yang di-generate:
//   - Organization: info perusahaan (logo, contact, social)
//   - WebSite: dengan potentialAction SearchAction (untuk sitelinks search)
//   - FAQPage: 6 FAQ items → rich result di Google
//   - BreadcrumbList: nav hierarchy
//
// JSON-LD di-inject via <script type="application/ld+json"> di page.
// Google, Bing, dan search engine lain crawl script ini untuk rich
// snippets (FAQ dropdown di search result).

import { COPY } from "../_data/copy";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://insuretrack.example";
const SITE_NAME = "InsureTrack";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      "Platform asuransi digital end-to-end. Daftar, bayar, dan e-policy terbit dalam hitungan menit.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      email: "contact@insuretrack.com",
      telephone: "+62-21-555-0100",
      areaServed: "ID",
      availableLanguage: ["Indonesian", "English"],
    },
    sameAs: [
      "https://instagram.com/insuretrack",
      "https://facebook.com/insuretrack",
      "https://linkedin.com/company/insuretrack",
      "https://x.com/insuretrack",
    ],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    inLanguage: "id-ID",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export function faqPageSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: COPY.faq.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

export function breadcrumbSchema(items: Array<{ name: string; href: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.href}`,
    })),
  };
}

// Helper: gabungkan semua schema jadi satu array. Render sebagai
// multiple <script> tag atau satu tag dengan @graph (lebih rapi).
export function allLandingSchemas() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationSchema(),
      websiteSchema(),
      faqPageSchema(),
      breadcrumbSchema([
        { name: "Beranda", href: "/" },
        { name: "Produk", href: "/#products" },
        { name: "Cara Kerja", href: "/#how" },
        { name: "FAQ", href: "/#faq" },
      ]),
    ],
  };
}