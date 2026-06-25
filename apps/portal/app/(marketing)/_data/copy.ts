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
  trustStrip: {
    // Dipakai di section tipis antara Hero & Produk. Tidak ada heading
    // besar — copy sebaris + logo marquee. Tone tenang, factual.
    tagline: "Dipercaya 12.000+ keluarga Indonesia · Terdaftar & diawasi OJK",
  },
  stats: {
    eyebrow: "Bukti Nyata",
    title: "Angka yang bicara, bukan jargon.",
    // Setiap item punya target numerik yang di-animate count-up saat
    // masuk viewport. `prefix`/`suffix` untuk format display (Rp, +, /5).
    // `decimals` untuk angka pecahan (4.8, 4.9). `icon` adalah IconName
    // valid dari @insuretrack/ui — di-render di atas angka sebagai
    // visual anchor supaya mata tidak "loncat" antar stats.
    items: [
      {
        target: 12000,
        suffix: "+",
        label: "Nasabah aktif",
        sub: "Seluruh Indonesia",
        icon: "Users",
      },
      {
        target: 4.8,
        prefix: "Rp ",
        suffix: "M",
        decimals: 1,
        label: "Klaim dibayar",
        sub: "Per Q1 2026",
        icon: "Receipt",
      },
      {
        target: 4.9,
        suffix: "/5",
        decimals: 1,
        label: "Rating pengguna",
        sub: "Google Reviews",
        icon: "Sparkles",
      },
    ] as const,
  },
  testimonials: {
    eyebrow: "Apa Kata Mereka",
    title: "Testimoni customer",
  },
  faq: {
    eyebrow: "Pertanyaan",
    title: "Yang sering ditanyakan",
    items: [
      {
        q: "Apakah polis saya aman?",
        a: "Setiap polis diterbitkan oleh perusahaan asuransi resmi yang terdaftar dan diawasi Otoritas Jasa Keuangan (OJK). Kami memfasilitasi penerbitan dan distribusi polis; klaim diproses sesuai polis yang Anda beli dari penerbit.",
      },
      {
        q: "Berapa lama proses dari daftar sampai polis terbit?",
        a: "Rata-rata 5–10 menit. Setelah pembayaran Anda dikonfirmasi via webhook payment gateway, sistem otomatis menerbitkan e-policy PDF dan mengirimkannya ke email Anda dalam hitungan detik.",
      },
      {
        q: "Metode pembayaran apa saja yang didukung?",
        a: "Virtual account bank (BCA, BNI, BRI, Mandiri, CIMB), e-wallet (OVO, DANA, GoPay, ShopeePay), dan QRIS. Semua melalui payment gateway bersertifikat PCI-DSS.",
      },
      {
        q: "Bagaimana cara mengajukan klaim?",
        a: "Login ke portal customer, pilih polis terkait, klik 'Ajukan Klaim', isi formulir serta upload dokumen pendukung. Tim kami akan review dalam 3–5 hari kerja.",
      },
      {
        q: "Apakah data pribadi saya aman?",
        a: "Data dienkripsi at-rest (AES-256) dan in-transit (TLS 1.3). Kami tidak pernah menjual data Anda. Akses dibatasi berbasis peran dan diaudit lengkap.",
      },
      {
        q: "Bisakah saya membatalkan polis?",
        a: "Ya. Polis yang masih dalam masa free-look (14 hari sejak penerbitan) bisa dibatalkan dengan pengembalian premi penuh. Setelahnya, nilai tunai berlaku sesuai polis.",
      },
    ] as const,
  },
  cta: {
    title: "Siap melindungi yang Anda cintai?",
    subtitle: "Pendaftaran memakan waktu kurang dari 5 menit.",
    button: "Mulai Sekarang",
    secondaryButton: "Hubungi Kami",
  },
} as const;
