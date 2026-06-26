//! Input structs untuk 3 PDF renderer: e-Policy, Invoice, Receipt.
//!
//! Field-field ini adalah contract publik — caller (routes/public.rs,
//! routes/customer.rs, seed/pdf_writer.rs) isi field-field ini dari data
//! database. Field `customer_*` (nama/NIK/TTL/etc) selalu dari `customers`
//! table — untuk INSTANSI, baris `customers` milik peserta
//! (di-resolve via `registration_members`), bukan kontak yang mendaftarkan.

use chrono::NaiveDate;
use rust_decimal::Decimal;

// ============================================================================
// E-Policy PDF
// ============================================================================

/// Input untuk e-Policy PDF.
pub struct PolicyPdfInput<'a> {
    // Identifiers
    pub policy_no: &'a str,
    pub registration_no: &'a str,
    pub effective_date: NaiveDate,
    pub expiry_date: NaiveDate,

    // Customer / participant identity
    pub customer_nik: &'a str,
    pub customer_name: &'a str,
    pub customer_birth_place: &'a str,
    pub customer_birth_date: NaiveDate,
    pub customer_gender: &'a str, // "MALE" | "FEMALE"
    pub customer_address: &'a str,

    // Contact (boleh empty string kalau tidak tersedia)
    pub customer_email: &'a str,
    pub customer_mobile: &'a str,

    // Coverage
    pub product_name: &'a str,
    /// Tier label ("BASIC" / "STANDARD" / "PREMIUM") — None/empty →
    /// tampilkan product_name saja tanpa tier.
    pub plan_tier: Option<String>,
    pub sum_assured: Decimal,
    pub premium: Decimal,
    pub coverage_term_years: i32,

    // Beneficiary (LIFE only) — None untuk PA/HEALTH
    pub beneficiary_name: Option<String>,

    // Company (INSTANSI only) — None untuk INDIVIDU
    pub company_name: Option<String>,
    pub company_npwp: Option<String>,
    pub company_industry: Option<String>,
}

/// Ringkasan identitas peserta Instansi — di-render di halaman lampiran
/// "DAFTAR PESERTA" invoice & receipt (FS-04 / FS-08). Tidak dipakai di
/// e-Policy (e-Policy per peserta di-render sebagai PDF terpisah).
/// `no` auto-numbering 1..=N; `gender` masih dalam wire format
/// ("MALE"/"FEMALE") — caller atau helper yang mapping ke label.
#[derive(Clone)]
pub struct ParticipantSummary {
    pub no: u32,
    pub nik: String,
    pub full_name: String,
    pub birth_place: String,
    pub birth_date: NaiveDate,
    pub gender: String,
    /// Wajib untuk produk LIFE (per peserta), None untuk PA/HEALTH.
    pub beneficiary_name: Option<String>,
}

// ============================================================================
// Invoice PDF
// ============================================================================

#[derive(Clone)]
pub struct InvoicePdfInput<'a> {
    pub invoice_no: &'a str,
    pub registration_no: &'a str,
    pub customer_nik: &'a str,
    pub customer_name: &'a str,
    pub customer_birth_place: &'a str,
    pub customer_birth_date: NaiveDate,
    pub customer_gender: &'a str,
    pub customer_email: &'a str,
    pub customer_mobile: &'a str,
    /// Alamat lengkap multi-baris (sudah di-join di caller).
    pub customer_address: &'a str,
    /// Kode produk (`"LIFE" | "PERSONAL_ACCIDENT" | "HEALTH"`) — drive
    /// branching beneficiary (LIFE only) dan product_name label.
    pub product_code: &'a str,
    pub product_name: &'a str,
    /// Plan tier (`"BASIC" | "STANDARD" | "PREMIUM"`) — None untuk render
    /// tanpa suffix tier (mis. PDF lama).
    pub plan_tier: Option<String>,
    pub sum_assured: Decimal,
    pub premium: Decimal,
    pub coverage_term_years: i32,
    pub due_date: NaiveDate,
    pub status: &'a str,
    pub created_at: NaiveDate,
    /// `"INDIVIDU" | "INSTANSI"` — drive branching DITAGIHKAN KEPADA card
    /// dan per-peserta breakdown.
    pub applicant_type: &'a str,
    /// Nama perusahaan (INSTANSI only) — None untuk INDIVIDU.
    pub company_name: Option<String>,
    pub company_npwp: Option<String>,
    /// Ahli waris / penerima manfaat (LIFE only) — caller pre-filter
    /// supaya field ini None untuk PA/HEALTH.
    pub beneficiary_name: Option<String>,
    /// Premi per-peserta (INSTANSI only) — None untuk INDIVIDU.
    /// Dipakai untuk breakdown "Rp X × N = Rp Y" di cover page.
    pub per_participant_premium: Option<Decimal>,
    /// Peserta Instansi (kosong untuk Individu → halaman lampiran di-skip).
    /// Untuk breakdown di cover, len(participants) = jumlah peserta.
    pub participants: Vec<ParticipantSummary>,
}

// ============================================================================
// Receipt PDF (Bukti Pembayaran)
// ============================================================================

#[derive(Clone)]
pub struct ReceiptPdfInput<'a> {
    pub invoice_no: &'a str,
    pub registration_no: &'a str,
    pub customer_name: &'a str,
    pub customer_nik: &'a str,
    pub customer_email: &'a str,
    pub product_code: &'a str,
    pub product_name: &'a str,
    pub plan_tier: Option<String>,
    pub coverage_term_years: i32,
    pub sum_assured: Decimal,
    pub paid_amount: Decimal,
    pub payment_date: NaiveDate,
    /// Channel pembayaran dari gateway (mis. VIRTUAL_ACCOUNT_BCA, QRIS). None = tidak diketahui.
    pub payment_channel: Option<&'a str>,
    /// ID transaksi / nomor referensi dari payment gateway. None = tidak dikirim gateway.
    pub payment_reference: Option<&'a str>,
    pub applicant_type: &'a str,
    pub company_name: Option<String>,
    pub company_npwp: Option<String>,
    /// LIFE only — caller pre-filter supaya None untuk PA/HEALTH.
    pub beneficiary_name: Option<String>,
    pub per_participant_premium: Option<Decimal>,
    /// Peserta Instansi (kosong untuk Individu → halaman lampiran di-skip).
    pub participants: Vec<ParticipantSummary>,
}
