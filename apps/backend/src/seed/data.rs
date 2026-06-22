//! Indonesian realistic data pool untuk seeder.
//!
//! Nama, kota, dll. — curated const arrays supaya demo ke klien
//! dapat identitas Indonesia yang konsisten (bukan faker-style acak
//! yang kadang muncul nama Turki/India).
//!
//! Total data di file ini ~3 KB — jauh lebih kecil dari dependency
//! faker, dan tidak menambah compile time.

use rand::Rng;

// =====================================================================
// Identitas
// =====================================================================

/// Nama depan umum Indonesia (campuran etnis Jawa, Sunda, Batak, Minang, dst.).
pub const FIRST_NAMES: &[&str] = &[
    "Adi", "Agus", "Andi", "Anton", "Ari", "Arief", "Bayu", "Budi", "Candra", "Citra", "Dedi",
    "Dewi", "Dian", "Eko", "Endang", "Fajar", "Fitri", "Galih", "Hadi", "Hana", "Hari", "Indah",
    "Indra", "Joko", "Juli", "Kartika", "Kiki", "Lestari", "Made", "Made", "Nia", "Nugroho",
    "Putri", "Rangga", "Ratna", "Rina", "Rudi", "Sari", "Sinta", "Sri", "Tantri", "Tono", "Wahyu",
    "Wati", "Yanto", "Yusuf", "Zara", "Bagus", "Cahya",
];

/// Nama keluarga umum Indonesia.
pub const LAST_NAMES: &[&str] = &[
    "Wijaya",
    "Pratama",
    "Saputra",
    "Lestari",
    "Rahmawati",
    "Setiawan",
    "Nugroho",
    "Anggraini",
    "Hidayat",
    "Kusuma",
    "Sukma",
    "Permadi",
    "Handayani",
    "Maulana",
    "Pranata",
    "Wibowo",
    "Hartono",
    "Susanto",
    "Surya",
    "Mahendra",
    "Pertiwi",
    "Cahyani",
    "Gunawan",
    "Suryanto",
    "Kusnadi",
    "Pangestu",
    "Adiputra",
    "Wulandari",
    "Sari",
    "Halim",
];

// =====================================================================
// Alamat
// =====================================================================

/// Nama jalan umum — umumnya "Jl. <nama>" template.
pub const STREETS: &[&str] = &[
    "Jl. Merdeka",
    "Jl. Sudirman",
    "Jl. Thamrin",
    "Jl. Diponegoro",
    "Jl. Hayam Wuruk",
    "Jl. Asia Afrika",
    "Jl. Pahlawan",
    "Jl. Veteran",
    "Jl. Gatot Subroto",
    "Jl. Ahmad Yani",
    "Jl. Imam Bonjol",
    "Jl. Cipto",
    "Jl. Wahid Hasyim",
    "Jl. Mangunsarkoro",
    "Jl. Pangeran Antasari",
];

/// Kota besar Indonesia (representasi kota tempat tinggal).
pub const CITIES: &[&str] = &[
    "Jakarta Selatan",
    "Jakarta Pusat",
    "Jakarta Barat",
    "Jakarta Timur",
    "Jakarta Utara",
    "Bandung",
    "Surabaya",
    "Medan",
    "Semarang",
    "Makassar",
    "Yogyakarta",
    "Denpasar",
    "Palembang",
    "Balikpapan",
    "Manado",
    "Pekanbaru",
    "Malang",
    "Bogor",
    "Depok",
    "Tangerang",
    "Bekasi",
    "Cirebon",
    "Solo",
    "Pontianak",
    "Banjarmasin",
    "Padang",
    "Jambi",
    "Ambon",
    "Jayapura",
    "Kupang",
    "Mataram",
    "Samarinda",
];

/// Provinsi — 1 per pulau besar representatif.
pub const PROVINCES: &[&str] = &[
    "DKI Jakarta",
    "Jawa Barat",
    "Jawa Timur",
    "Jawa Tengah",
    "DI Yogyakarta",
    "Banten",
    "Bali",
    "Sumatera Utara",
    "Sumatera Selatan",
    "Riau",
    "Kalimantan Timur",
    "Kalimantan Selatan",
    "Sulawesi Selatan",
    "Sulawesi Utara",
    "Nusa Tenggara Barat",
    "Papua",
];

// =====================================================================
// Prefiks NIK — 2 digit kode provinsi + 2 digit kode kota/kabupaten.
// Total ruang alamat: 34 provinsi × ~500 kota → ~17.000 kombinasi.
// (Tidak exhaustive — cukup untuk 30 customer demo, 600 untuk load.)
// =====================================================================

pub const NIK_PROVINSI: &[(&str, &str)] = &[
    ("DKI Jakarta", "31"),
    ("Jawa Barat", "32"),
    ("Jawa Tengah", "33"),
    ("DI Yogyakarta", "34"),
    ("Jawa Timur", "35"),
    ("Banten", "36"),
    ("Bali", "51"),
    ("Sumatera Utara", "12"),
    ("Sumatera Selatan", "16"),
    ("Riau", "14"),
    ("Kalimantan Timur", "64"),
    ("Sulawesi Selatan", "73"),
    ("Sulawesi Utara", "71"),
    ("Nusa Tenggara Barat", "52"),
    ("Papua", "91"),
];

/// Kode kota/kabupaten generik per provinsi (2 digit). TIDAK harus
/// akurat secara administratif — hanya untuk variasi NIK. Real-world
/// punya ~500+ kode, kita pakai subset 10 representatif.
pub const NIK_KOTA_PER_PROV: &[(&str, &[&str])] = &[
    ("31", &["71", "72", "73", "74", "75"]), // Jakarta (5 kotamadya)
    ("32", &["01", "04", "05", "07", "10"]), // Jawa Barat
    ("33", &["01", "02", "05", "10", "15"]), // Jawa Tengah
    ("34", &["01", "02", "03", "04", "05"]), // DI Yogyakarta
    ("35", &["01", "02", "05", "10", "15"]), // Jawa Timur
];

// =====================================================================
// Produk & premi
// =====================================================================

/// Spec produk: LIFE, PERSONAL_ACCIDENT, HEALTH.
/// (Tidak ada tabel `products` — product adalah VARCHAR di
/// `registrations.product`, validasi di Rust layer.)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Product {
    Life,
    PersonalAccident,
    Health,
}

impl Product {
    pub fn as_str(self) -> &'static str {
        match self {
            Product::Life => "LIFE",
            Product::PersonalAccident => "PERSONAL_ACCIDENT",
            Product::Health => "HEALTH",
        }
    }

    /// Rentang sum assured dalam IDR (integer). Mid-range realistis
    /// untuk produk ritel Indonesia.
    pub fn sum_assured_range(self) -> (u64, u64) {
        match self {
            // 50 juta – 500 juta
            Product::Life => (50_000_000, 500_000_000),
            // 10 juta – 100 juta
            Product::PersonalAccident => (10_000_000, 100_000_000),
            // 25 juta – 200 juta
            Product::Health => (25_000_000, 200_000_000),
        }
    }

    /// Rentang coverage term dalam tahun.
    pub fn coverage_term_range(self) -> (i32, i32) {
        match self {
            Product::Life => (5, 20),
            Product::PersonalAccident => (1, 5),
            Product::Health => (1, 10),
        }
    }

    /// Premium rate (% dari sum assured per tahun).
    /// LIFE: 0.5%, PA: 0.3%, HEALTH: 1.2%.
    pub fn premium_rate(self) -> f64 {
        match self {
            Product::Life => 0.005,
            Product::PersonalAccident => 0.003,
            Product::Health => 0.012,
        }
    }
}

// =====================================================================
// Claim & inquiry content
// =====================================================================

/// Alasan klaim yang umum di polis ritel.
pub const CLAIM_DESCRIPTIONS: &[&str] = &[
    "Kecelakaan lalu lintas di jalan raya saat berangkat kerja. Korban mengalami patah tulang dan rawat inap di rumah sakit.",
    "Rawat inap selama 7 hari karena demam berdarah. Biaya rumah sakit ditanggung sesuai polis.",
    "Meninggal dunia akibat serangan jantung. Ahli waris mengajukan klaim sesuai ketentuan polis LIFE.",
    "Cedera saat olahraga sepak bola — robek ligamen lutut, perlu operasi dan fisioterapi.",
    "Diagnosa penyakit kritis stadium awal. Polis mencakup perawatan intensif dan obat.",
    "Kecelakaan kerja di pabrik — luka bakar derajat 2 di lengan kanan, perlu cangkok kulit.",
    "Perawatan ICU selama 5 hari karena komplikasi diabetes. Termasuk biaya obat dan tindakan medis.",
    "Kecelakaan tunggal motor di jalan tol. Kendaraan rusak total, korban mengalami trauma kepala ringan.",
    "Rawat inap melahirkan normal dengan komplikasi. Bayi dan ibu dalam kondisi stabil.",
    "Tergelincir di kamar mandi rumah, patah tulang pinggul. Perlu operasi dan rehabilitasi.",
];

/// Subjects untuk inquiry customer.
pub const INQUIRY_SUBJECTS: &[&str] = &[
    "Cara mengajukan klaim polis",
    "Status pembayaran premi bulan ini",
    "Update data pribadi (alamat baru)",
    "Perpanjang polis yang akan jatuh tempo",
    "Bukti pembayaran hilang, butuh duplikat",
    "Cara download e-policy PDF",
    "Aktivasi akun portal belum收到 email",
    "Pertanyaan coverage polis kesehatan",
    "Proses refund premi kelebihan bayar",
    "Konsultasi manfaat polis LIFE",
];

/// Body inquiry singkat.
pub const INQUIRY_BODIES: &[&str] = &[
    "Mohon informasi prosedur klaim dan dokumen yang diperlukan.",
    "Saya sudah transfer premi 3 hari lalu, belum ada konfirmasi masuk. Mohon dicek.",
    "Baru pindah alamat, bagaimana cara update data di sistem?",
    "Polis akan expired 2 bulan lagi. Bisa perpanjang otomatis atau manual?",
    "Bukti pembayaran dari email saya terhapus. Bisa dikirim ulang?",
    "Tidak bisa download e-policy dari menu portal. Ada masalah dengan file PDF-nya.",
    "Sudah register tapi belum terima email aktivasi. Mohon bantu cek.",
    "Apakah polis saya cover rawat inap di rumah sakit luar negeri?",
    "Tolong dicek, sepertinya ada kelebihan bayar premi bulan lalu.",
    "Saya ingin tahu lebih detail manfaat polis LIFE, terutama untuk keluarga.",
];

/// Response dari admin (untuk inquiry ANSWERED/CLOSED).
pub const INQUIRY_RESPONSES: &[&str] = &[
    "Terima kasih atas pertanyaannya. Dokumen yang diperlukan: fotokopi KTP, surat keterangan dokter, dan kuitansi asli. Bisa dikirim via portal.",
    "Kami sudah verifikasi pembayaran Anda dan status premi sudah aktif. Mohon cek dashboard portal untuk konfirmasi.",
    "Untuk update alamat, silakan login ke portal → menu Profil → Edit Alamat. Perubahan langsung tersimpan.",
    "Perpanjang polis bisa dilakukan H-30 dari tanggal jatuh tempo via menu Perpanjangan di portal. Kami akan kirim notifikasi.",
    "Bukti pembayaran duplikat sudah kami kirim ke email Anda. Mohon dicek folder Inbox/Spam.",
    "Mohon coba clear cache browser atau gunakan mode incognito. Jika masih gagal, lampirkan screenshot error ke email support.",
    "Email aktivasi sudah kami kirim ulang. Mohon dicek dalam 5-10 menit ke depan.",
    "Polis kesehatan kami cover rawat inap dalam negeri saja sesuai条款 polis. Untuk luar negeri, ada produk tambahan Travel Insurance.",
    "Kami sudah lakukan recalculation dan refund sebesar Rp xxx akan ditransfer dalam 3-5 hari kerja ke rekening Anda.",
    "Manfaat polis LIFE mencakup santunan duka, biaya pemakaman, dan uang pertanggungan ahli waris. Detail ada di e-policy PDF Anda.",
];

// =====================================================================
// Company data (untuk Instansi / group registration)
// =====================================================================

/// Nama perusahaan generic Indonesia (PT/CV). Tidak real — semua fiktif
/// untuk demo. Pool 30 entry untuk variasi tanpa collision.
pub const COMPANY_NAMES: &[&str] = &[
    "PT Nusantara Jaya Sentosa",
    "PT Mitra Abadi Perkasa",
    "PT Cahaya Mandiri Sejahtera",
    "PT Garuda Indonesia Tech",
    "PT Sinar Mas Digital",
    "PT Bukit Hijau Lestari",
    "PT Wahana Karya Persada",
    "PT Bina Konstruksi Utama",
    "PT Cendana Textile Industri",
    "PT Sapta Jaya Makmur",
    "PT Palma Agro Lestari",
    "PT Surya Logistik Nusantara",
    "PT Mitra Edukasi Cerdas",
    "PT Anugerah Kimia Indonesia",
    "PT Graha Medika Sentosa",
    "PT Mitra Kesehatan Nusantara",
    "PT Optima Telekomunikasi",
    "PT Mitra Transportasi Mandiri",
    "PT Asri Properti Indonesia",
    "PT Pradipa Karya Mulia",
    "PT Katalis Digital Solusi",
    "PT Cakrawala Bisnis Global",
    "PT Bahari Samudera Pasifik",
    "PT Mitra Energi Terbarukan",
    "PT Tugu Baja Perkasa",
    "PT Kinarya Selaras Indonesia",
    "PT Lentera Teknologi Nusantara",
    "PT Mitra Otomotif Indonesia",
    "PT Andalan Food Industries",
    "PT Mitra Retail Indonesia",
];

/// Bidang usaha — 20 entry curated untuk variasi industri di seed.
pub const COMPANY_INDUSTRIES: &[&str] = &[
    "Teknologi Informasi",
    "Manufaktur",
    "Konstruksi",
    "Perdagangan Umum",
    "Jasa Keuangan",
    "Kesehatan",
    "Pendidikan",
    "Transportasi & Logistik",
    "Pertanian & Perkebunan",
    "Peternakan",
    "Perikanan",
    "Makanan & Minuman",
    "Tekstil & Garmen",
    "Otomotif",
    "Properti",
    "Telekomunikasi",
    "Energi & Pertambangan",
    "Konsultan",
    "Hospitality & Pariwisata",
    "Media & Hiburan",
];

/// Generate NPWP format Indonesia: `99.999.999.9-999.999` (15 digit
/// utama + 3 digit KPP, total 18 char dengan separator). Tidak validasi
/// checksum — hanya format placeholder untuk demo.
pub fn random_npwp(rng: &mut rand::rngs::StdRng) -> String {
    // 9 digit pertama
    let a1: u32 = rng.gen_range(10..=99);
    let b1: u32 = rng.gen_range(100..=999);
    let c1: u32 = rng.gen_range(100..=999);
    let d1: u32 = rng.gen_range(1..=9);
    // 6 digit setelah strip (KPP + kode cabang)
    let e1: u32 = rng.gen_range(100..=999);
    let f1: u32 = rng.gen_range(100..=999);
    format!("{a1:02}.{b1:03}.{c1:03}.{d1:1}-{e1:03}.{f1:03}")
}

// =====================================================================
// Email types — 8 dari spec FS-05
// =====================================================================

pub const EMAIL_TYPES: &[&str] = &[
    "REGISTRATION_SUCCESS",
    "INVOICE_NOTIFICATION",
    "PAYMENT_SUCCESS",
    "E_POLICY_DELIVERY",
    "PORTAL_ACTIVATION",
    "CLAIM_RECEIVED",
    "CLAIM_STATUS_UPDATE",
    "INQUIRY_RESPONSE",
];

// =====================================================================
// Audit actions — 11 dari spec FS-15
// =====================================================================

pub const AUDIT_ACTIONS: &[&str] = &[
    "admin.login",
    "customer.login",
    "registration.created",
    "invoice.generated",
    "payment.received",
    "policy.issued",
    "claim.submitted",
    "claim.status_changed",
    "inquiry.submitted",
    "inquiry.answered",
    "email.sent",
];
