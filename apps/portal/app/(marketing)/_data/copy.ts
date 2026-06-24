// Bahasa Indonesia copy untuk landing page sections. Single source of truth
// supaya perubahan wording cukup edit satu file. `as const` untuk type
// narrowing di section components.

export const COPY = {
  hero: {
    eyebrow: "Digital Insurance Platform",
    titleLead: "Asuransi digital,",
    titleAccent: "polis langsung terbit.",
    subtitle:
      "Tanpa kunjungan cabang. Tanpa dokumen fisik. Daftar, bayar, dan e-policy Anda terbit dalam hitungan menit.",
    primaryCta: "Beli Polis Sekarang",
    secondaryCta: "Lihat Produk",
  },
  products: {
    eyebrow: "Tiga produk, satu platform",
    title: "Pilih perlindungan yang tepat",
    empty: "Tidak bisa memuat produk (backend belum hidup?).",
  },
  howItWorks: {
    eyebrow: "Bagaimana Caranya",
    title: "Dari formulir ke polis, dalam 3 langkah.",
  },
  benefits: {
    eyebrow: "Kenapa InsureTrack",
    title: "Dibangun untuk kesederhanaan",
  },
  clients: {
    eyebrow: "Dipercaya Oleh",
    title: "Klien korporat kami",
  },
  testimonials: {
    eyebrow: "Apa Kata Mereka",
    title: "Testimoni customer",
  },
  cta: {
    title: "Siap melindungi yang Anda cintai?",
    subtitle: "Pendaftaran memakan waktu kurang dari 5 menit.",
    button: "Mulai Sekarang",
  },
  contact: {
    title: "Hubungi Kami",
    email: "cs@insuretrack.example",
    phone: "(021) 555-0100",
    location: "Bogor, Indonesia",
  },
} as const;
