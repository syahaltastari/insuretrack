// Rich product detail content untuk halaman /products/[code].
//
// Catatan: data ini statis di frontend. Backend (/api/public/products) saat
// ini hanya return 3 field (code, name, description). Kalau ke depan backend
// manage konten dinamis, migrasi: ubah sumber data jadi fetch dari API.

import type { IconName } from "@insuretrack/ui";

export type ProductTone = "matcha" | "slushie" | "ube";

export type ProductBenefit = {
  icon: IconName;
  title: string;
  desc: string;
};

export type ProductClaimStep = {
  title: string;
  desc: string;
};

export type ProductFaq = {
  q: string;
  a: string;
};

export type ProductDetail = {
  code: string;
  /** URL slug (kebab-case) untuk halaman detail. Mis. "personal-accident"
   *  untuk `PERSONAL_ACCIDENT`. Selalu lowercase. */
  slug: "life" | "personal-accident" | "health";
  name: string;
  tagline: string;
  description: string;
  icon: IconName;
  tone: ProductTone;
  /** Section background util (lihat packages/ui globals.css). */
  swatch: `swatch-${ProductTone}` | `swatch-${ProductTone}-light`;
  /** Section background util untuk CTA dark variant. */
  swatchDeep: `swatch-${ProductTone}-deep`;
  /** Light tone untuk icon chip. */
  iconTone: "matcha-300" | "slushie-500" | "ube-300";
  /** Decimal premium rate (0.01 = 1%/tahun). Align dengan `calculate_premium` di backend. */
  premiumRate: number;
  premiumRateLabel: string;
  /** "Mulai dari" IDR — dihitung untuk sum_assured Rp 100jt, term 1 tahun. */
  basePremium: number;
  coverage: {
    minSumAssured: number;
    maxSumAssured: number;
    minTermYears: number;
    maxTermYears: number;
    minAge: number;
    maxAge: number;
  };
  benefits: ProductBenefit[];
  /** Yang ditanggung polis (positif). */
  covered: string[];
  /** Yang tidak ditanggung / pengecualian. */
  excluded: string[];
  /** Plain-text masa tunggu (display-friendly). */
  waitingPeriod: string;
  howToClaim: ProductClaimStep[];
  faqs: ProductFaq[];
  /** Catatan kecil di bawah CTA (mis. "Premi dihitung otomatis saat pendaftaran"). */
  ctaNote: string;
};

// ---- IDR formatting ---------------------------------------------------------

const IDR_FMT = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export const formatIdr = (n: number): string => `Rp ${IDR_FMT.format(n)}`;

/** "Rp 1,5 juta" / "Rp 500 ribu" — label ringkas untuk CTA "mulai dari". */
export const formatIdrShort = (n: number): string => {
  if (n >= 1_000_000_000) {
    const v = n / 1_000_000_000;
    return `Rp ${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} miliar`;
  }
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `Rp ${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} juta`;
  }
  if (n >= 1_000) {
    return `Rp ${Math.round(n / 1_000)} ribu`;
  }
  return `Rp ${n}`;
};

// ---- Catalog ----------------------------------------------------------------
// Rate & formula harus sinkron dengan `apps/backend/src/routes/public.rs`
// ::calculate_premium(): premium = sum_assured × rate × years.

const LIFE_BASE_PREMIUM = 100_000_000 * 0.01 * 1; // 1.000.000
const PA_BASE_PREMIUM = 100_000_000 * 0.005 * 1; //   500.000
const HEALTH_BASE_PREMIUM = 100_000_000 * 0.015 * 1; // 1.500.000

export const PRODUCT_DETAILS: Record<string, ProductDetail> = {
  LIFE: {
    code: "LIFE",
    slug: "life",
    name: "Asuransi Jiwa",
    tagline:
      "Lindungi masa depan keluarga, sekalipun Anda tidak ada di samping mereka.",
    description:
      "Perlindungan jiwa dengan manfaat uang pertanggungan kepada ahli waris.",
    icon: "HeartPulse",
    tone: "matcha",
    // Light swatch: hero text dark di atas matcha-300 (konsisten dengan PA yang
    // juga light bg). Tanpa light variant, hero pakai swatch-matcha (matcha-600
    // + white text) yang bikin white card "Mulai dari" inherit color white.
    swatch: "swatch-matcha-light",
    swatchDeep: "swatch-matcha-deep",
    iconTone: "matcha-300",
    premiumRate: 0.01,
    premiumRateLabel: "1,0% per tahun",
    basePremium: LIFE_BASE_PREMIUM,
    coverage: {
      minSumAssured: 100_000_000,
      maxSumAssured: 5_000_000_000,
      minTermYears: 1,
      maxTermYears: 30,
      minAge: 18,
      maxAge: 65,
    },
    benefits: [
      {
        icon: "ShieldCheck",
        title: "Perlindungan Jangka Panjang",
        desc: "Pilih masa pertanggungan 1–30 tahun, premi tetap tidak naik.",
      },
      {
        icon: "FileText",
        title: "Tanpa Medical Check-Up",
        desc: "Auto-accept. Tidak ada underwriting, tidak ada tes medis.",
      },
      {
        icon: "User",
        title: "Ahli Waris Fleksibel",
        desc: "Tunjuk keluarga, saudara, atau pihak ketiga sebagai penerima.",
      },
      {
        icon: "ScrollText",
        title: "Klaim via Portal",
        desc: "Ajukan klaim dari portal customer. Status terpantau real-time.",
      },
    ],
    covered: [
      "Meninggal dunia akibat sakit (setelah masa tunggu)",
      "Meninggal dunia akibat kecelakaan",
      "Cacat tetap total akibat kecelakaan",
      "Meninggal dunia alami tanpa sebab jelas (sesuai polis)",
    ],
    excluded: [
      "Bunuh diri dalam 12 bulan pertama polis aktif",
      "Perang, huru-hara, tindakan terrorisme, kerusuhan sipil",
      "Tindak pidana / kriminal aktif dari pihak tertanggung",
      "Penyakit yang sudah ada sebelumnya dan tidak di-disclose",
      "Penyakit dalam masa tunggu 30 hari sejak polis terbit",
    ],
    waitingPeriod: "30 hari (kematian akibat sakit). Kecelakaan: langsung aktif.",
    howToClaim: [
      {
        title: "Ajukan klaim via portal",
        desc: "Login ke portal customer → menu Klaim → pilih polis terkait.",
      },
      {
        title: "Lengkapi dokumen",
        desc: "Akta kematian, surat keterangan dokter, identitas ahli waris, dokumen polis.",
      },
      {
        title: "Verifikasi & investigasi",
        desc: "Tim kami memverifikasi dokumen (5–14 hari kerja).",
      },
      {
        title: "Pencairan ke ahli waris",
        desc: "Dana ditransfer ke rekening ahli waris yang ditunjuk di polis.",
      },
    ],
    faqs: [
      {
        q: "Apakah premi bisa dicicil?",
        a: "Tidak di MVP. Premi dibayar penuh di muka pada saat pendaftaran. Akan datang: opsi cicilan via payment gateway.",
      },
      {
        q: "Apakah ada medical check-up?",
        a: "Tidak. InsureTrack menerapkan auto-accept — tidak ada underwriting manual, tidak ada tes medis, tidak ada medical declaration.",
      },
      {
        q: "Siapa yang bisa ditunjuk sebagai ahli waris?",
        a: "Siapa pun yang Anda tunjuk: keluarga, saudara, teman, atau pihak ketiga. Bisa lebih dari satu orang dengan pembagian persentase.",
      },
      {
        q: "Apakah premi naik setiap tahun?",
        a: "Tidak. Premi di-lock di awal polis dan tetap sama selama masa pertanggungan.",
      },
    ],
    ctaNote:
      "Premi aktual dihitung otomatis berdasarkan uang pertanggungan dan masa pertanggungan yang Anda pilih di langkah berikutnya.",
  },

  PERSONAL_ACCIDENT: {
    code: "PERSONAL_ACCIDENT",
    slug: "personal-accident",
    name: "Asuransi Kecelakaan Diri",
    tagline: "Santunan finansial saat tak terduga. Aktif hari ini, lindungi esok hari.",
    description:
      "Santunan akibat kecelakaan yang menyebabkan cacat atau meninggal.",
    icon: "BriefcaseMedical",
    tone: "slushie",
    swatch: "swatch-slushie",
    swatchDeep: "swatch-slushie-deep",
    iconTone: "slushie-500",
    premiumRate: 0.005,
    premiumRateLabel: "0,5% per tahun",
    basePremium: PA_BASE_PREMIUM,
    coverage: {
      minSumAssured: 50_000_000,
      maxSumAssured: 1_000_000_000,
      minTermYears: 1,
      maxTermYears: 1,
      minAge: 18,
      maxAge: 65,
    },
    benefits: [
      {
        icon: "Zap",
        title: "Aktif Instan",
        desc: "Tidak ada masa tunggu. Perlindungan langsung aktif sejak polis terbit.",
      },
      {
        icon: "Receipt",
        title: "Premi Paling Terjangkau",
        desc: "Mulai dari Rp 500 ribu/tahun untuk UP Rp 100 juta.",
      },
      {
        icon: "Building2",
        title: "Berlaku Global",
        desc: "Perlindungan berlaku di seluruh dunia, kecuali zona konflik bersenjata.",
      },
      {
        icon: "Clock",
        title: "Auto-Renewable",
        desc: "Polis 1 tahun yang bisa diperpanjang otomatis tiap periode.",
      },
    ],
    covered: [
      "Meninggal dunia akibat kecelakaan",
      "Cacat tetap sebagian akibat kecelakaan (sesuai tabel santunan)",
      "Cacat tetap total akibat kecelakaan (100% uang pertanggungan)",
      "Biaya pengobatan akibat kecelakaan (sesuai plan, maksimum limit)",
    ],
    excluded: [
      "Penyakit (bukan akibat kecelakaan)",
      "Bunuh diri / usaha bunuh diri / self-harm",
      "Olahraga profesional / ekstrem (base jumping, panjat tebing profesional, dll)",
      "Tindak pidana / kriminal aktif dari pihak tertanggung",
      "Kecelakaan di bawah pengaruh alkohol (>0,05% BAC) atau NAPZA",
      "Perang, huru-hara, tindakan terrorisme",
    ],
    waitingPeriod:
      "Tidak ada. Perlindungan langsung aktif sejak polis terbit dan pembayaran premi dikonfirmasi.",
    howToClaim: [
      {
        title: "Lapor dalam 30 hari",
        desc: "Lapor kecelakaan via portal customer atau customer service (cs@insuretrack.example).",
      },
      {
        title: "Lengkapi dokumen",
        desc: "Kronologi kecelakaan, visum et repertum / surat keterangan medis, kuitansi biaya pengobatan.",
      },
      {
        title: "Verifikasi klaim",
        desc: "Tim verifikasi memproses dokumen (3–7 hari kerja).",
      },
      {
        title: "Pencairan santunan",
        desc: "Dana ditransfer ke rekening tertanggung sesuai plan polis.",
      },
    ],
    faqs: [
      {
        q: "Apa saja yang dianggap 'kecelakaan'?",
        a: "Peristiwa tak terduga, tiba-tiba, tidak direncanakan, yang menyebabkan cedera fisik — seperti kecelakaan lalu lintas, jatuh, terbakar, tersengat listrik, gigitan hewan, keracunan accidental.",
      },
      {
        q: "Apakah saya tetap dilindungi saat traveling ke luar negeri?",
        a: "Ya, perlindungan berlaku di sebagian besar negara. Pengecualian: zona konflik bersenjata, area dengan travel advisory 'do not travel' dari Kemlu RI.",
      },
      {
        q: "Bagaimana dengan olahraga ekstrem seperti panjat tebing?",
        a: "Panjat tebing / hiking rekreasional tetap dijamin. Panjat tebing profesional / kompetisi / base jumping / olahraga profesional lainnya masuk pengecualian.",
      },
      {
        q: "Apakah polis auto-renew?",
        a: "Ya secara default. Anda bisa menonaktifkan auto-renew kapan saja dari portal customer sebelum periode berakhir.",
      },
    ],
    ctaNote:
      "Premi aktual dihitung otomatis. Polis berlaku 1 tahun dan dapat diperpanjang otomatis.",
  },

  HEALTH: {
    code: "HEALTH",
    slug: "health",
    name: "Asuransi Kesehatan",
    tagline: "Rawat inap & perawatan kesehatan tanpa beban biaya.",
    description:
      "Penggantian biaya rawat inap dan perawatan kesehatan.",
    icon: "Stethoscope",
    tone: "ube",
    // Light swatch: sama rationale dengan LIFE — light bg + dark text.
    swatch: "swatch-ube-light",
    swatchDeep: "swatch-ube-deep",
    iconTone: "ube-300",
    premiumRate: 0.015,
    premiumRateLabel: "1,5% per tahun",
    basePremium: HEALTH_BASE_PREMIUM,
    coverage: {
      minSumAssured: 50_000_000,
      maxSumAssured: 500_000_000,
      minTermYears: 1,
      maxTermYears: 1,
      minAge: 18,
      maxAge: 65,
    },
    benefits: [
      {
        icon: "Building2",
        title: "Cashless di RS Rekanan",
        desc: "Tunjukkan e-policy + KTP di rumah sakit rekanan. Tidak bayar di muka.",
      },
      {
        icon: "Receipt",
        title: "Reimbursement Fleksibel",
        desc: "Untuk RS non-rekanan: bayar dulu, kumpulkan kuitansi, klaim reimbursement.",
      },
      {
        icon: "HeartPulse",
        title: "Cakup Perawatan ICU",
        desc: "Ruang ICU, operasi, dan prosedur medis besar sesuai plan.",
      },
      {
        icon: "ShieldCheck",
        title: "Rawat Jalan Pascarawat Inap",
        desc: "Hingga 30 hari setelah keluar dari rawat inap, sesuai plan.",
      },
    ],
    covered: [
      "Rawat inap: kamar rumah sakit, visite dokter, tindakan medis",
      "Perawatan ICU (Intensive Care Unit)",
      "Tindakan operasi (bedah mayor & minor, sesuai plan)",
      "Rawat jalan pascarawat inap (maksimum 30 hari setelah keluar RS)",
      "Pemeriksaan penunjang: lab, radiologi, diagnostik imaging",
    ],
    excluded: [
      "Perawatan estetika / kosmetik / kecantikan",
      "Penyakit akibat alkohol atau NAPZA",
      "Perawatan di luar negeri (kecuali keadaan darurat medis)",
      "Kondisi yang sudah ada sebelumnya (selama 12 bulan pertama)",
      "HIV / AIDS dan penyakit menular seksual",
      "Perawatan gigi (kecuali akibat kecelakaan)",
    ],
    waitingPeriod:
      "30 hari untuk rawat inap. 12 bulan untuk kondisi kronis tertentu (jantung, kanker, gagal ginjal).",
    howToClaim: [
      {
        title: "Pilih metode klaim",
        desc: "Cashless di RS rekanan, atau reimbursement di RS non-rekanan.",
      },
      {
        title: "Untuk cashless",
        desc: "Tunjukkan e-policy + KTP di bagian admission RS rekanan. Tim kami akan konfirmasicoverage.",
      },
      {
        title: "Untuk reimbursement",
        desc: "Bayar biaya medis, kumpulkan kuitansi & resume medis, ajukan via portal customer.",
      },
      {
        title: "Pencairan reimbursement",
        desc: "Dana ditransfer ke rekening tertanggung (7–14 hari kerja setelah dokumen lengkap).",
      },
    ],
    faqs: [
      {
        q: "Di mana daftar rumah sakit rekanan?",
        a: "Setelah polis terbit, daftar lengkap tersedia di portal customer. Tersedia di lebih dari 100+ rumah sakit di Indonesia.",
      },
      {
        q: "Apakah polis menanggung biaya melahirkan?",
        a: "Tidak di MVP. Polis Kesehatan saat ini fokus pada rawat inap karena sakit atau kecelakaan, bukan persalinan. Rider melahirkan akan datang di versi berikutnya.",
      },
      {
        q: "Apakah ada manfaat rawat jalan tanpa rawat inap?",
        a: "Tidak secara langsung. Manfaat rawat jalan hanya berlaku pasca-rawat inap (maks. 30 hari setelah keluar RS).",
      },
      {
        q: "Bagaimana dengan kondisi yang sudah ada sebelumnya (pre-existing)?",
        a: "Kondisi pre-existing dikecualikan selama 12 bulan pertama polis. Setelahnya, kondisi tersebut dapat dijamin sesuai plan.",
      },
    ],
    ctaNote:
      "Daftar rumah sakit rekanan lengkap tersedia di portal setelah polis terbit. Polis berlaku 1 tahun dan dapat diperpanjang.",
  },
};

/**
 * Lookup product detail by code (case-insensitive).
 * Returns `null` for unknown codes — caller should render not-found.
 */
export function getProductDetail(code: string | undefined | null): ProductDetail | null {
  if (!code) return null;
  return PRODUCT_DETAILS[code.toUpperCase()] ?? null;
}

/**
 * Lookup product detail by URL slug (kebab-case). Slug sudah selalu
 * lowercase, jadi tidak perlu case-fold di sini. Return `null` untuk
 * slug tidak dikenal — caller render not-found.
 */
export function getProductBySlug(
  slug: string | undefined | null,
): ProductDetail | null {
  if (!slug) return null;
  const target = slug.toLowerCase();
  return (
    Object.values(PRODUCT_DETAILS).find((p) => p.slug === target) ?? null
  );
}

/**
 * Lookup URL slug by product code (case-insensitive). Pakai ini saat
 * build link produk dari data API — slug didefinisikan eksplisit di
 * PRODUCT_DETAILS, jadi jangan turunkan manual dengan lowercase/underscore
 * (akan salah untuk `PERSONAL_ACCIDENT` → slug `personal-accident`).
 * Return `null` untuk code tidak dikenal — caller harus skip render link.
 */
export function getProductSlug(code: string | undefined | null): string | null {
  return getProductDetail(code)?.slug ?? null;
}

/** All product codes, in stable display order. */
export const ALL_PRODUCT_CODES = ["LIFE", "PERSONAL_ACCIDENT", "HEALTH"] as const;