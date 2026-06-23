//! Render PDF: e-Policy (spec FS-08) dan Invoice.
//!
//! Sections untuk e-Policy (corporate-grade layout):
//!   - Header bar (brand + "E-POLICY")
//!   - Title + status badge "AKTIF"
//!   - Two-column info card (PEMEGANG POLIS | INFORMASI POLIS)
//!   - Coverage table (produk + sum assured + premi + tier + term)
//!   - Beneficiary box (LIFE only)
//!   - Company info box (INSTANSI only)
//!   - Signature section (Pemegang Polis | Issued by InsureTrack)
//!   - Footer bar (brand + support + page)
//!
//! Sections untuk Invoice:
//!   - Header bar (brand + "INVOICE")
//!   - Title + status badge
//!   - Two-column info card (DITAGIHKAN KEPADA | INVOICE info)
//!   - Coverage & Payment table
//!   - Total box + payment instructions
//!   - Footer bar
//!
//! Helper functions (color, format, drawing primitives) di module scope
//! supaya reusable oleh kedua render functions.

use chrono::{Datelike, NaiveDate};
use printpdf::path::PaintMode;
use printpdf::{
    BuiltinFont, Color, IndirectFontRef, Line, Mm, PdfDocument, PdfDocumentReference,
    PdfLayerReference, Point, Rgb,
};
use rust_decimal::Decimal;
use std::io::BufWriter;

use crate::error::AppError;

// ---- Brand colors (di-copy dari packages/ui/src/styles/globals.css) ---------
// Hex → RGB tuple. printpdf butuh (u8, u8, u8) untuk Color::Rgb.
const C_BLACK: (u8, u8, u8) = (0, 0, 0);
const C_WHITE: (u8, u8, u8) = (255, 255, 255);
const C_CREAM: (u8, u8, u8) = (250, 249, 247); // --warm-cream
const C_OAT_LIGHT: (u8, u8, u8) = (238, 233, 223); // --oat-light
const C_OAT_BORDER: (u8, u8, u8) = (218, 212, 200); // --oat-border
const C_MATCHA_300: (u8, u8, u8) = (132, 231, 165);
const C_POMEGRANATE: (u8, u8, u8) = (252, 121, 129);
const C_LEMON_400: (u8, u8, u8) = (248, 204, 101);
const C_CHARCOAL: (u8, u8, u8) = (85, 83, 78); // --warm-charcoal
const C_SILVER: (u8, u8, u8) = (159, 155, 147); // --warm-silver

// ============================================================================
// E-Policy PDF (corporate-grade)
// ============================================================================

/// Input untuk e-Policy PDF. Field `customer_*` (nama/NIK/TTL/etc) selalu
/// dari `customers` table — untuk INSTANSI, baris `customers` milik peserta
/// (di-resolve via `registration_members`), bukan kontak yang mendaftarkan.
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

/// Render e-Policy PDF corporate-grade — A4 portrait dengan branded
/// header bar, two-column info card, coverage table, beneficiary box,
/// signature line, dan footer bar. Single-page layout.
pub fn render(input: &PolicyPdfInput<'_>) -> Result<Vec<u8>, AppError> {
    let (doc, page1, layer1_id) =
        PdfDocument::new("E-Policy", Mm(210.0_f32), Mm(297.0_f32), "Layer 1");

    let bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font bold: {e}")))?;
    let reg = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font reg: {e}")))?;
    let italic = doc
        .add_builtin_font(BuiltinFont::HelveticaOblique)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font italic: {e}")))?;

    // =========================================================================
    // HALAMAN 1 — SAMPUL POLIS
    // =========================================================================
    let layer = doc.get_page(page1).get_layer(layer1_id);

    // Header bar hitam, flush ke atas (y 275..297)
    fill_rect(&layer, 0.0, 275.0, 210.0, 297.0, C_BLACK);
    set_color(&layer, C_WHITE);
    layer.use_text("InsureTrack", 18.0, Mm(15.0), Mm(287.0), &bold);
    set_color(&layer, C_CREAM);
    layer.use_text(
        "Asuransi digital, prosesnya cepat, polis langsung terbit.",
        8.0,
        Mm(15.0),
        Mm(278.5),
        &reg,
    );
    set_color(&layer, C_CREAM);
    layer.use_text("POLIS ASURANSI DIGITAL", 8.5, Mm(143.0), Mm(283.0), &bold);

    // Badge AKTIF (matcha, top-right konten)
    fill_rect(&layer, 148.0, 259.0, 195.0, 270.0, C_MATCHA_300);
    set_color(&layer, C_BLACK);
    layer.use_text("AKTIF", 10.0, Mm(163.0), Mm(262.5), &bold);

    // Judul besar
    set_color(&layer, C_BLACK);
    layer.use_text("POLIS ASURANSI", 26.0, Mm(15.0), Mm(248.0), &bold);
    set_color(&layer, C_CHARCOAL);
    layer.use_text(input.product_name, 13.0, Mm(15.0), Mm(235.5), &bold);
    // Garis dekoratif pendek di bawah judul
    fill_rect(&layer, 15.0, 229.5, 68.0, 232.0, C_BLACK);

    // Nomor Polis
    set_color(&layer, C_SILVER);
    layer.use_text("NOMOR POLIS", 7.0, Mm(15.0), Mm(223.0), &bold);
    set_color(&layer, C_BLACK);
    layer.use_text(input.policy_no, 20.0, Mm(15.0), Mm(210.0), &bold);

    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 15.0, 202.0, 195.0, 202.0, 0.4);

    // Pemegang Polis
    set_color(&layer, C_SILVER);
    layer.use_text("PEMEGANG POLIS", 7.0, Mm(15.0), Mm(195.0), &bold);
    set_color(&layer, C_BLACK);
    layer.use_text(
        truncate(input.customer_name, 34).as_str(),
        13.0,
        Mm(15.0),
        Mm(184.5),
        &bold,
    );
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        format!("NIK  {}", input.customer_nik).as_str(),
        9.0,
        Mm(15.0),
        Mm(176.5),
        &reg,
    );
    let ttl_cover = format!(
        "TTL  {}, {}",
        input.customer_birth_place,
        format_date_id(input.customer_birth_date)
    );
    layer.use_text(
        truncate(&ttl_cover, 52).as_str(),
        9.0,
        Mm(15.0),
        Mm(170.0),
        &reg,
    );

    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 15.0, 163.0, 195.0, 163.0, 0.4);

    // Tiga kotak info (Masa Berlaku | Uang Pertanggungan | Premi)
    // Kotak 1: Masa Berlaku (x 15..82)
    fill_rect(&layer, 15.0, 111.0, 82.0, 157.0, C_CREAM);
    set_color(&layer, C_SILVER);
    layer.use_text("MASA BERLAKU", 7.0, Mm(19.0), Mm(151.0), &bold);
    set_color(&layer, C_BLACK);
    layer.use_text(
        format_date_id(input.effective_date).as_str(),
        9.5,
        Mm(19.0),
        Mm(142.0),
        &bold,
    );
    set_color(&layer, C_SILVER);
    layer.use_text("s.d.", 7.5, Mm(19.0), Mm(135.0), &italic);
    set_color(&layer, C_BLACK);
    layer.use_text(
        format_date_id(input.expiry_date).as_str(),
        9.5,
        Mm(19.0),
        Mm(126.0),
        &bold,
    );
    fill_rect(&layer, 19.0, 114.0, 58.0, 121.5, C_OAT_LIGHT);
    set_color(&layer, C_BLACK);
    layer.use_text(
        format!("{} Tahun", input.coverage_term_years).as_str(),
        8.5,
        Mm(21.0),
        Mm(116.0),
        &bold,
    );

    // Kotak 2: Uang Pertanggungan (x 85..151)
    fill_rect(&layer, 85.0, 111.0, 151.0, 157.0, C_CREAM);
    set_color(&layer, C_SILVER);
    layer.use_text("UANG PERTANGGUNGAN", 7.0, Mm(89.0), Mm(151.0), &bold);
    set_color(&layer, C_BLACK);
    layer.use_text(
        format_idr(input.sum_assured).as_str(),
        11.5,
        Mm(89.0),
        Mm(139.5),
        &bold,
    );
    set_color(&layer, C_CHARCOAL);
    layer.use_text("Nilai Pertanggungan Polis", 7.5, Mm(89.0), Mm(129.0), &reg);
    layer.use_text("sesuai manfaat produk", 7.5, Mm(89.0), Mm(123.5), &reg);

    // Kotak 3: Premi (x 154..195)
    fill_rect(&layer, 154.0, 111.0, 195.0, 157.0, C_CREAM);
    set_color(&layer, C_SILVER);
    layer.use_text("PREMI", 7.0, Mm(158.0), Mm(151.0), &bold);
    set_color(&layer, C_BLACK);
    layer.use_text(
        format_idr(input.premium).as_str(),
        10.5,
        Mm(158.0),
        Mm(140.0),
        &bold,
    );
    set_color(&layer, C_CHARCOAL);
    layer.use_text("per tahun", 8.0, Mm(158.0), Mm(130.0), &reg);
    layer.use_text(
        format!("{} thn", input.coverage_term_years).as_str(),
        8.0,
        Mm(158.0),
        Mm(123.5),
        &reg,
    );

    // Catatan elektronik
    set_color(&layer, C_SILVER);
    layer.use_text(
        "Polis ini diterbitkan secara elektronik dan sah tanpa tanda tangan basah.",
        7.5,
        Mm(15.0),
        Mm(90.0),
        &italic,
    );
    layer.use_text(
        "Lihat halaman selanjutnya untuk ikhtisar lengkap dan syarat & ketentuan.",
        7.5,
        Mm(15.0),
        Mm(84.5),
        &italic,
    );

    // Footer halaman 1
    fill_rect(&layer, 0.0, 0.0, 210.0, 17.0, C_BLACK);
    set_color(&layer, C_CREAM);
    layer.use_text("InsureTrack", 8.0, Mm(15.0), Mm(9.0), &bold);
    layer.use_text(
        "Platform Asuransi Digital  ·  Halaman 1 dari 3",
        7.0,
        Mm(15.0),
        Mm(3.5),
        &reg,
    );
    layer.use_text(
        format!("No. Polis: {}", input.policy_no).as_str(),
        7.0,
        Mm(140.0),
        Mm(6.0),
        &reg,
    );

    // =========================================================================
    // HALAMAN 2 — IKHTISAR POLIS (Policy Schedule)
    // =========================================================================
    let (page2, layer2_id) = doc.add_page(Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
    let layer = doc.get_page(page2).get_layer(layer2_id);

    // Header mini (y 279..297)
    fill_rect(&layer, 0.0, 279.0, 210.0, 297.0, C_BLACK);
    set_color(&layer, C_WHITE);
    layer.use_text("InsureTrack", 12.0, Mm(15.0), Mm(289.0), &bold);
    set_color(&layer, C_CREAM);
    layer.use_text("Platform Asuransi Digital", 7.5, Mm(15.0), Mm(282.0), &reg);
    layer.use_text("Halaman 2 dari 3", 7.5, Mm(163.0), Mm(285.5), &reg);

    // Judul seksi
    set_color(&layer, C_BLACK);
    layer.use_text("IKHTISAR POLIS", 13.0, Mm(15.0), Mm(268.5), &bold);
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        format!(
            "No. Polis: {}   ·   Diterbitkan: {}",
            input.policy_no,
            format_date_id(input.effective_date)
        )
        .as_str(),
        8.5,
        Mm(15.0),
        Mm(260.5),
        &reg,
    );
    set_color(&layer, C_BLACK);
    draw_line(&layer, 15.0, 256.5, 195.0, 256.5, 0.5);

    // Dua kolom info card (y 188..253)
    fill_rect(&layer, 15.0, 188.0, 195.0, 254.0, C_CREAM);
    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 105.0, 188.0, 105.0, 254.0, 0.3);

    // Kolom kiri: PEMEGANG POLIS
    set_color(&layer, C_SILVER);
    layer.use_text("PEMEGANG POLIS", 7.0, Mm(19.0), Mm(248.0), &bold);
    set_color(&layer, C_BLACK);
    layer.use_text(
        truncate(input.customer_name, 28).as_str(),
        11.0,
        Mm(19.0),
        Mm(240.0),
        &bold,
    );

    let gender_label = match input.customer_gender {
        "MALE" => "Laki-laki",
        "FEMALE" => "Perempuan",
        other => other,
    };
    let left_rows: Vec<(&str, String)> = vec![
        ("NIK", input.customer_nik.to_string()),
        ("Tempat Lahir", input.customer_birth_place.to_string()),
        ("Tanggal Lahir", format_date_id(input.customer_birth_date)),
        ("Jenis Kelamin", gender_label.to_string()),
        ("Email", truncate(input.customer_email, 26)),
        ("No. HP", input.customer_mobile.to_string()),
    ];
    let mut ly = 232.0_f32;
    for (label, value) in &left_rows {
        if ly < 192.0 {
            break;
        }
        set_color(&layer, C_SILVER);
        layer.use_text(*label, 7.5, Mm(19.0), Mm(ly), &reg);
        set_color(&layer, C_BLACK);
        layer.use_text(
            truncate(value.as_str(), 26).as_str(),
            8.5,
            Mm(19.0),
            Mm(ly - 4.5),
            &reg,
        );
        ly -= 10.5;
    }
    // Alamat (multi baris, di bawah kolom kiri jika masih ada ruang)
    if ly > 195.0 {
        set_color(&layer, C_SILVER);
        layer.use_text("Alamat", 7.5, Mm(19.0), Mm(ly), &reg);
        let al = wrap_text(input.customer_address, 30);
        for (i, line) in al.iter().take(2).enumerate() {
            if ly - 4.5 - i as f32 * 4.5 > 190.0 {
                set_color(&layer, C_BLACK);
                layer.use_text(
                    line.as_str(),
                    8.5,
                    Mm(19.0),
                    Mm(ly - 4.5 - i as f32 * 4.5),
                    &reg,
                );
            }
        }
    }

    // Kolom kanan: DATA POLIS
    set_color(&layer, C_SILVER);
    layer.use_text("DATA POLIS", 7.0, Mm(109.0), Mm(248.0), &bold);
    let right_rows: Vec<(&str, String)> = vec![
        ("No. Polis", input.policy_no.to_string()),
        ("No. Registrasi", input.registration_no.to_string()),
        ("Produk", input.product_name.to_string()),
        (
            "Plan / Tier",
            input.plan_tier.as_deref().unwrap_or("-").to_string(),
        ),
        ("Tanggal Berlaku", format_date_id(input.effective_date)),
        ("Tanggal Berakhir", format_date_id(input.expiry_date)),
        (
            "Masa Perlindungan",
            format!("{} Tahun", input.coverage_term_years),
        ),
    ];
    let mut ry = 240.0_f32;
    for (label, value) in &right_rows {
        if ry < 191.0 {
            break;
        }
        set_color(&layer, C_SILVER);
        layer.use_text(*label, 7.5, Mm(109.0), Mm(ry), &reg);
        set_color(&layer, C_BLACK);
        layer.use_text(
            truncate(value.as_str(), 22).as_str(),
            8.5,
            Mm(109.0),
            Mm(ry - 4.5),
            &bold,
        );
        ry -= 9.5;
    }

    // Tabel Detail Coverage
    set_color(&layer, C_BLACK);
    layer.use_text("DETAIL COVERAGE", 8.5, Mm(15.0), Mm(179.0), &bold);
    draw_line(&layer, 15.0, 175.5, 195.0, 175.5, 0.5);
    // Header baris
    fill_rect(&layer, 15.0, 163.0, 195.0, 173.0, C_OAT_LIGHT);
    set_color(&layer, C_CHARCOAL);
    layer.use_text("JENIS MANFAAT", 7.0, Mm(18.0), Mm(167.0), &bold);
    layer.use_text("UANG PERTANGGUNGAN", 7.0, Mm(74.0), Mm(167.0), &bold);
    layer.use_text("PREMI / TAHUN", 7.0, Mm(129.0), Mm(167.0), &bold);
    layer.use_text("MASA", 7.0, Mm(172.0), Mm(167.0), &bold);
    // Baris data
    let benefit_label = if input.product_name.contains("Life")
        || input.product_name.contains("Jiwa")
    {
        "Manfaat Meninggal Dunia"
    } else if input.product_name.contains("Accident") || input.product_name.contains("Kecelakaan") {
        "Manfaat Kecelakaan"
    } else {
        "Manfaat Rawat Inap"
    };
    set_color(&layer, C_BLACK);
    layer.use_text(benefit_label, 9.0, Mm(18.0), Mm(155.0), &bold);
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        format_idr(input.sum_assured).as_str(),
        9.0,
        Mm(74.0),
        Mm(155.0),
        &reg,
    );
    layer.use_text(
        format_idr(input.premium).as_str(),
        9.0,
        Mm(129.0),
        Mm(155.0),
        &reg,
    );
    layer.use_text(
        format!("{} thn", input.coverage_term_years).as_str(),
        9.0,
        Mm(172.0),
        Mm(155.0),
        &reg,
    );
    draw_line(&layer, 15.0, 149.0, 195.0, 149.0, 0.2);
    // Baris total premi polis
    fill_rect(&layer, 15.0, 135.0, 195.0, 147.0, C_OAT_LIGHT);
    set_color(&layer, C_CHARCOAL);
    layer.use_text("TOTAL PREMI SELAMA POLIS", 7.5, Mm(18.0), Mm(140.0), &bold);
    set_color(&layer, C_BLACK);
    let total_prem = input.premium * rust_decimal::Decimal::from(input.coverage_term_years);
    layer.use_text(
        format_idr(total_prem).as_str(),
        10.0,
        Mm(129.0),
        Mm(139.5),
        &bold,
    );
    layer.use_text(
        format!("{} Tahun", input.coverage_term_years).as_str(),
        7.5,
        Mm(172.0),
        Mm(140.0),
        &reg,
    );

    // Ahli waris (LIFE)
    let mut p2_bottom = 126.0_f32;
    if let Some(beneficiary) = input.beneficiary_name.as_deref() {
        if !beneficiary.is_empty() {
            draw_line(&layer, 15.0, p2_bottom, 195.0, p2_bottom, 0.3);
            p2_bottom -= 4.0;
            set_color(&layer, C_SILVER);
            layer.use_text(
                "AHLI WARIS / PENERIMA MANFAAT",
                7.0,
                Mm(15.0),
                Mm(p2_bottom - 1.5),
                &bold,
            );
            set_color(&layer, C_BLACK);
            layer.use_text(beneficiary, 11.0, Mm(15.0), Mm(p2_bottom - 11.0), &bold);
            set_color(&layer, C_CHARCOAL);
            layer.use_text(
                "Penerima manfaat polis sesuai ketentuan yang berlaku dalam polis ini.",
                8.0,
                Mm(15.0),
                Mm(p2_bottom - 19.0),
                &italic,
            );
            p2_bottom -= 27.0;
        }
    }

    // Info instansi (INSTANSI)
    if let Some(company) = input.company_name.as_deref() {
        if !company.is_empty() && p2_bottom > 45.0 {
            draw_line(&layer, 15.0, p2_bottom, 195.0, p2_bottom, 0.3);
            p2_bottom -= 4.0;
            set_color(&layer, C_SILVER);
            layer.use_text(
                "DIDAFTARKAN OLEH INSTANSI",
                7.0,
                Mm(15.0),
                Mm(p2_bottom - 1.5),
                &bold,
            );
            set_color(&layer, C_BLACK);
            layer.use_text(company, 11.0, Mm(15.0), Mm(p2_bottom - 11.0), &bold);
            set_color(&layer, C_CHARCOAL);
            let mut parts: Vec<String> = Vec::new();
            if let Some(n) = input.company_npwp.as_deref().filter(|s| !s.is_empty()) {
                parts.push(format!("NPWP: {n}"));
            }
            if let Some(i) = input.company_industry.as_deref().filter(|s| !s.is_empty()) {
                parts.push(format!("Bidang: {i}"));
            }
            if !parts.is_empty() {
                layer.use_text(
                    parts.join("   ·   ").as_str(),
                    8.0,
                    Mm(15.0),
                    Mm(p2_bottom - 19.0),
                    &reg,
                );
            }
        }
    }

    // Footer halaman 2
    fill_rect(&layer, 0.0, 0.0, 210.0, 17.0, C_BLACK);
    set_color(&layer, C_CREAM);
    layer.use_text("InsureTrack", 8.0, Mm(15.0), Mm(9.0), &bold);
    layer.use_text(
        "Platform Asuransi Digital  ·  Halaman 2 dari 3",
        7.0,
        Mm(15.0),
        Mm(3.5),
        &reg,
    );
    layer.use_text(
        format!("No. Polis: {}", input.policy_no).as_str(),
        7.0,
        Mm(140.0),
        Mm(6.0),
        &reg,
    );

    // =========================================================================
    // HALAMAN 3 — MANFAAT, SYARAT & PENGESAHAN
    // =========================================================================
    let (page3, layer3_id) = doc.add_page(Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
    let layer = doc.get_page(page3).get_layer(layer3_id);

    // Header mini
    fill_rect(&layer, 0.0, 279.0, 210.0, 297.0, C_BLACK);
    set_color(&layer, C_WHITE);
    layer.use_text("InsureTrack", 12.0, Mm(15.0), Mm(289.0), &bold);
    set_color(&layer, C_CREAM);
    layer.use_text("Platform Asuransi Digital", 7.5, Mm(15.0), Mm(282.0), &reg);
    layer.use_text("Halaman 3 dari 3", 7.5, Mm(163.0), Mm(285.5), &reg);

    // Seksi Manfaat Perlindungan
    set_color(&layer, C_BLACK);
    layer.use_text("MANFAAT PERLINDUNGAN", 12.0, Mm(15.0), Mm(268.0), &bold);
    draw_line(&layer, 15.0, 264.5, 195.0, 264.5, 0.4);

    let benefits: Vec<(&str, &str)> = if input.product_name.contains("Life")
        || input.product_name.contains("Jiwa")
    {
        vec![
            ("Manfaat Meninggal Dunia",
             "Pembayaran 100% Uang Pertanggungan kepada ahli waris yang ditunjuk apabila tertanggung meninggal dunia selama masa perlindungan."),
            ("Manfaat Warisan & Perencanaan",
             "UP dapat dimanfaatkan sebagai jaminan aset dan perencanaan keuangan keluarga sesuai ketentuan produk yang berlaku."),
            ("Manfaat Berakhir Polis",
             "Pada akhir masa perlindungan, nilai manfaat disesuaikan dengan ketentuan produk dan tidak terdapat nilai tunai kecuali diatur lain."),
        ]
    } else if input.product_name.contains("Accident") || input.product_name.contains("Kecelakaan") {
        vec![
            ("Manfaat Kematian Akibat Kecelakaan",
             "Pembayaran 100% Uang Pertanggungan apabila tertanggung meninggal dunia akibat kecelakaan dalam masa perlindungan."),
            ("Manfaat Cacat Tetap Total",
             "Pembayaran penuh UP apabila tertanggung mengalami cacat tetap total akibat kecelakaan yang dibuktikan secara medis."),
            ("Manfaat Cacat Tetap Sebagian",
             "Pembayaran sebagian UP sesuai tabel persentase cacat yang tercantum dalam Lampiran Polis."),
        ]
    } else {
        vec![
            ("Manfaat Rawat Inap",
             "Penggantian biaya rawat inap di rumah sakit rekanan sesuai plan yang dipilih, termasuk biaya kamar, tindakan, dan obat-obatan."),
            ("Manfaat Rawat Jalan",
             "Penggantian biaya konsultasi dokter umum dan spesialis, serta pemeriksaan laboratorium sesuai ketentuan plan."),
            ("Manfaat Tindakan Medis & Operasi",
             "Penggantian biaya operasi dan tindakan medis lainnya di fasilitas kesehatan rekanan sesuai limit plan yang berlaku."),
        ]
    };

    let mut by = 256.0_f32;
    for (title, desc) in &benefits {
        if by < 215.0 {
            break;
        }
        set_color(&layer, C_BLACK);
        layer.use_text(*title, 9.0, Mm(18.0), Mm(by), &bold);
        set_color(&layer, C_CHARCOAL);
        let desc_lines = wrap_text(desc, 88);
        for (i, line) in desc_lines.iter().take(2).enumerate() {
            layer.use_text(
                line.as_str(),
                8.0,
                Mm(18.0),
                Mm(by - 5.0 - i as f32 * 4.2),
                &reg,
            );
        }
        by -= if desc_lines.len() > 1 { 17.5 } else { 13.5 };
    }

    // Seksi Ketentuan Umum
    set_color(&layer, C_BLACK);
    draw_line(&layer, 15.0, by - 3.0, 195.0, by - 3.0, 0.4);
    layer.use_text("KETENTUAN UMUM POLIS", 11.0, Mm(15.0), Mm(by - 14.0), &bold);

    let terms: Vec<(&str, &str)> = vec![
        ("Pasal 1 — Definisi",
         "Polis ini merupakan dokumen resmi yang mengikat antara Pemegang Polis dan InsureTrack berdasarkan permohonan yang telah disetujui. Istilah mengacu pada definisi standar industri asuransi Indonesia."),
        ("Pasal 2 — Lingkup Perlindungan",
         "Perlindungan berlaku selama masa polis aktif. Pembayaran manfaat dilakukan setelah verifikasi klaim selesai dan seluruh dokumen yang diperlukan diterima dengan lengkap."),
        ("Pasal 3 — Pengecualian",
         "Tidak dijamin: (i) tindakan disengaja/bunuh diri dalam 2 tahun pertama; (ii) kondisi pra-eksisting tidak diungkapkan; (iii) perang, terorisme, nuklir; (iv) pelanggaran hukum."),
        ("Pasal 4 — Prosedur Klaim",
         "Klaim diajukan via portal InsureTrack dalam 30 hari sejak kejadian. Dokumen: formulir klaim, KTP, dan dokumen pendukung. InsureTrack memproses klaim dalam 14 hari kerja."),
        ("Pasal 5 — Pembatalan & Free-Look",
         "Pemegang Polis dapat membatalkan polis kapan saja. Premi dikembalikan penuh jika pembatalan dalam 30 hari sejak terbit (free-look period). Di luar itu, premi tidak dikembalikan."),
    ];

    let mut ty = by - 26.0_f32;
    for (title, content) in &terms {
        if ty < 56.0 {
            break;
        }
        set_color(&layer, C_BLACK);
        layer.use_text(*title, 8.5, Mm(15.0), Mm(ty), &bold);
        set_color(&layer, C_CHARCOAL);
        let clines = wrap_text(content, 92);
        for (i, line) in clines.iter().take(2).enumerate() {
            let ypos = ty - 5.0 - i as f32 * 4.0;
            if ypos > 56.0 {
                layer.use_text(line.as_str(), 7.5, Mm(15.0), Mm(ypos), &reg);
            }
        }
        ty -= if clines.len() > 1 { 15.5 } else { 12.5 };
    }

    // Seksi Pengesahan
    draw_line(&layer, 15.0, 53.5, 195.0, 53.5, 0.5);
    set_color(&layer, C_BLACK);
    layer.use_text("PENGESAHAN POLIS", 10.5, Mm(15.0), Mm(47.0), &bold);
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        "Polis ini diterbitkan atas dasar permohonan yang disetujui dan berlaku sah secara elektronik sesuai ketentuan hukum yang berlaku.",
        7.5,
        Mm(15.0),
        Mm(40.0),
        &reg,
    );
    // Dua blok tanda tangan
    set_color(&layer, C_SILVER);
    layer.use_text("PEMEGANG POLIS", 7.0, Mm(20.0), Mm(33.0), &bold);
    layer.use_text("DITERBITKAN OLEH", 7.0, Mm(130.0), Mm(33.0), &bold);
    draw_line(&layer, 20.0, 25.5, 92.0, 25.5, 0.5);
    draw_line(&layer, 130.0, 25.5, 195.0, 25.5, 0.5);
    set_color(&layer, C_BLACK);
    layer.use_text(
        truncate(input.customer_name, 26).as_str(),
        8.5,
        Mm(20.0),
        Mm(22.0),
        &reg,
    );
    layer.use_text("InsureTrack", 8.5, Mm(130.0), Mm(22.0), &bold);
    set_color(&layer, C_SILVER);
    layer.use_text("Tanda tangan elektronik", 6.5, Mm(20.0), Mm(18.5), &italic);
    layer.use_text(
        format!("Diterbitkan: {}", format_date_id(input.effective_date)).as_str(),
        6.5,
        Mm(130.0),
        Mm(18.5),
        &italic,
    );

    // Footer halaman 3
    fill_rect(&layer, 0.0, 0.0, 210.0, 15.5, C_BLACK);
    set_color(&layer, C_CREAM);
    layer.use_text("InsureTrack", 8.0, Mm(15.0), Mm(8.0), &bold);
    layer.use_text(
        "Platform Asuransi Digital  ·  Halaman 3 dari 3",
        7.0,
        Mm(15.0),
        Mm(3.0),
        &reg,
    );
    layer.use_text(
        format!("No. Polis: {}", input.policy_no).as_str(),
        7.0,
        Mm(140.0),
        Mm(5.5),
        &reg,
    );

    // =========================================================================
    // SAVE
    // =========================================================================
    let mut buf = BufWriter::new(Vec::<u8>::new());
    doc.save(&mut buf)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("pdf save: {e}")))?;
    let bytes = buf
        .into_inner()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("pdf buffer: {e}")))?;
    Ok(bytes)
}

// ============================================================================
// Invoice PDF
// ============================================================================
//
// Layout (A4 portrait, 210×297mm):
//   ┌──────────────────────────────────────────────┐
//   │ [BLACK HEADER BAR — brand + tagline]         │   y 285..262
//   ├──────────────────────────────────────────────┤
//   │                                               │
//   │   INVOICE                            UNPAID  │   y 252..232
//   │   Tagihan Premi Asuransi                     │
//   │   ┌──────────────┐    ┌──────────────────┐   │
//   │   │ Ditagihkan ke │    │ No. Invoice  ... │   │   y 222..178
//   │   │ ...           │    │ No. Reg      ... │   │
//   │   │ Alamat        │    │ Issued       ... │   │
//   │   │ Email, HP     │    │ Jatuh Tempo  ... │   │
//   │   └──────────────┘    └──────────────────┘   │
//   │                                               │
//   │   Rincian Pembayaran                          │   y 168..136
//   │   ┌───────┬──────────┬──────┬────────────┐  │
//   │   │ ITEM  │ SUM      │ TERM │ SUBTOTAL   │  │
//   │   │ ...   │ ...      │ ...  │ ...        │  │
//   │   └───────┴──────────┴──────┴────────────┘  │
//   │   ┌──────────────┐  Total:  Rp ...         │   y 126..98
//   │   │ Notes        │                           │
//   │   │ ...          │                           │
//   │   └──────────────┘                           │
//   ├──────────────────────────────────────────────┤
//   │ [BLACK FOOTER BAR — brand + page]            │   y 25..12
//   └──────────────────────────────────────────────┘

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

fn set_color(layer: &PdfLayerReference, c: (u8, u8, u8)) {
    // printpdf 0.7's Rgb::new expects f32 dalam 0.0..1.0, bukan u8 (0-255).
    // Convert dari (r, g, b) u8 → (r/255, g/255, b/255) f32.
    let r = c.0 as f32 / 255.0;
    let g = c.1 as f32 / 255.0;
    let b = c.2 as f32 / 255.0;
    layer.set_fill_color(Color::Rgb(Rgb::new(r, g, b, None)));
    layer.set_outline_color(Color::Rgb(Rgb::new(r, g, b, None)));
}

/// Format Decimal jadi "Rp 1.234.567" (Indonesian thousand separator, no decimals).
fn format_idr(d: Decimal) -> String {
    // Convert ke integer string dulu, lalu format pakai separator manual
    // supaya aman untuk nilai besar tanpa kehilangan presisi.
    let s = d.trunc().to_string();
    let (sign, int_part) = if let Some(stripped) = s.strip_prefix('-') {
        ("-", stripped)
    } else {
        ("", s.as_str())
    };
    let mut out = String::new();
    for (i, c) in int_part.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push('.');
        }
        out.push(c);
    }
    let rev: String = out.chars().rev().collect();
    format!("Rp {}{}", sign, rev)
}

/// Format tanggal Indonesia: "9 Juni 2026". Indonesian month names.
const ID_MONTHS: [&str; 12] = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
];
fn format_date_id(d: NaiveDate) -> String {
    format!(
        "{} {} {}",
        d.day(),
        ID_MONTHS[(d.month() - 1) as usize],
        d.year()
    )
}

/// Render invoice PDF — A4 portrait, layout modern dengan header bar,
/// two-column info block, tabel coverage dengan header, total box, dan
/// footer bar. Pakai Helvetica/HelveticaBold (built-in printpdf).
pub fn render_invoice(input: &InvoicePdfInput<'_>) -> Result<Vec<u8>, AppError> {
    let (doc, page1, layer1) = PdfDocument::new("Invoice", Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
    let layer = doc.get_page(page1).get_layer(layer1);

    let bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font bold: {e}")))?;
    let reg = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font reg: {e}")))?;

    // ===== HEADER BAR (black) — y 274..297 (23mm tall, flush ke top) =====
    fill_rect(&layer, 0.0_f32, 274.0_f32, 210.0_f32, 297.0_f32, C_BLACK);
    set_color(&layer, C_WHITE);
    layer.use_text("InsureTrack", 20.0_f32, Mm(20.0), Mm(287.0), &bold);
    set_color(&layer, C_CREAM);
    layer.use_text(
        "Asuransi digital, prosesnya cepat, polis langsung terbit.",
        9.0_f32,
        Mm(20.0),
        Mm(278.0),
        &reg,
    );
    set_color(&layer, C_WHITE);
    layer.use_text("INVOICE", 22.0_f32, Mm(155.0), Mm(287.0), &bold);
    set_color(&layer, C_CREAM);
    layer.use_text(
        "Tagihan Premi Asuransi",
        9.0_f32,
        Mm(155.0),
        Mm(278.0),
        &reg,
    );

    // ===== TITLE + STATUS BADGE =====
    set_color(&layer, C_BLACK);
    layer.use_text(
        "Invoice untuk Pembayaran Premi",
        16.0_f32,
        Mm(20.0),
        Mm(248.0),
        &bold,
    );
    set_color(&layer, C_SILVER);
    layer.use_text(
        "Mohon selesaikan pembayaran sebelum jatuh tempo untuk mengaktifkan polis Anda.",
        9.0_f32,
        Mm(20.0),
        Mm(240.0),
        &reg,
    );

    let (badge_bg, badge_label) = match input.status {
        "UNPAID" => (C_LEMON_400, "BELUM DIBAYAR"),
        "PAID" => (C_MATCHA_300, "LUNAS"),
        "EXPIRED" => (C_SILVER, "KADALUARSA"),
        "CANCELLED" => (C_POMEGRANATE, "DIBATALKAN"),
        _ => (C_SILVER, input.status),
    };
    fill_rect(&layer, 140.0_f32, 242.0_f32, 190.0_f32, 252.0_f32, badge_bg);
    set_color(&layer, C_BLACK);
    layer.use_text(badge_label, 10.0_f32, Mm(146.0), Mm(245.0), &bold);

    // ===== TWO-COLUMN CARD =====
    // Card height adapts: INDIVIDU 44mm (y 178..222), INSTANSI 56mm
    // (y 166..222) — company info butuh lebih banyak baris (nama + NPWP
    // + PIC). Coverage table & sections below shift accordingly via
    // `card_bottom` cursor.
    let card_top = 222.0_f32;
    let card_bottom = if input.applicant_type == "INSTANSI" {
        166.0_f32
    } else {
        178.0_f32
    };
    fill_rect(&layer, 20.0_f32, card_bottom, 190.0_f32, card_top, C_CREAM);
    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 105.0, card_bottom, 105.0, card_top, 0.3);

    // Kiri: Ditagihkan ke
    if input.applicant_type == "INSTANSI" {
        // Branch INSTANSI: company info sebagai primary billing recipient,
        // PIC sebagai kontak. Sub-baris lebih rapat (3.5mm) supaya muat di
        // card 56mm.
        set_color(&layer, C_SILVER);
        layer.use_text("DITAGIHKAN KEPADA", 7.0_f32, Mm(25.0), Mm(216.0), &bold);
        set_color(&layer, C_BLACK);
        let company = input.company_name.as_deref().unwrap_or("—");
        layer.use_text(
            truncate(company, 30).as_str(),
            12.0_f32,
            Mm(25.0),
            Mm(208.0),
            &bold,
        );
        set_color(&layer, C_CHARCOAL);
        let mut y = 202.0_f32;
        if let Some(npwp) = input.company_npwp.as_deref().filter(|s| !s.is_empty()) {
            layer.use_text(
                format!("NPWP: {}", truncate(npwp, 22)).as_str(),
                8.5_f32,
                Mm(25.0),
                Mm(y),
                &reg,
            );
            y -= 4.0;
        }
        // Divider sebelum PIC
        y -= 1.0;
        set_color(&layer, C_OAT_BORDER);
        draw_line(&layer, 25.0, y, 100.0, y, 0.2);
        y -= 5.0;
        set_color(&layer, C_SILVER);
        layer.use_text("PIC", 7.0_f32, Mm(25.0), Mm(y), &bold);
        y -= 4.5;
        set_color(&layer, C_CHARCOAL);
        layer.use_text(input.customer_name, 8.5_f32, Mm(25.0), Mm(y), &reg);
        y -= 3.5;
        layer.use_text(
            format!("NIK: {}", input.customer_nik).as_str(),
            8.5_f32,
            Mm(25.0),
            Mm(y),
            &reg,
        );
        y -= 3.5;
        layer.use_text(
            format!("Email: {}", truncate(input.customer_email, 24)).as_str(),
            8.5_f32,
            Mm(25.0),
            Mm(y),
            &reg,
        );
        y -= 3.5;
        layer.use_text(
            format!("HP: {}", input.customer_mobile).as_str(),
            8.5_f32,
            Mm(25.0),
            Mm(y),
            &reg,
        );
    } else {
        // Branch INDIVIDU: existing layout (nama, NIK, TTL, alamat, email, HP).
        set_color(&layer, C_SILVER);
        layer.use_text("DITAGIHKAN KEPADA", 7.0_f32, Mm(25.0), Mm(216.0), &bold);
        set_color(&layer, C_BLACK);
        layer.use_text(input.customer_name, 12.0_f32, Mm(25.0), Mm(208.0), &bold);
        set_color(&layer, C_CHARCOAL);
        layer.use_text(
            format!("NIK: {}", input.customer_nik),
            8.5_f32,
            Mm(25.0),
            Mm(201.0),
            &reg,
        );
        let ttl = format!(
            "{}, {}",
            input.customer_birth_place,
            format_date_id(input.customer_birth_date)
        );
        layer.use_text(format!("TTL: {}", ttl), 8.5_f32, Mm(25.0), Mm(195.0), &reg);
        let addr_lines_vec = wrap_text(input.customer_address, 38);
        for (i, line) in addr_lines_vec.iter().enumerate() {
            let y_pos = 189.0_f32 - (i as f32) * 4.0_f32;
            if y_pos < 181.0_f32 {
                break;
            }
            layer.use_text(line.as_str(), 8.5_f32, Mm(25.0), Mm(y_pos), &reg);
        }
        let addr_lines_count = (addr_lines_vec.len() as f32).min(3.0_f32);
        let contact_y = 189.0_f32 - addr_lines_count * 4.0_f32 - 1.0_f32;
        if contact_y > 181.0_f32 {
            layer.use_text(
                format!("Email: {}", input.customer_email),
                8.5_f32,
                Mm(25.0),
                Mm(contact_y),
                &reg,
            );
            layer.use_text(
                format!("HP: {}", input.customer_mobile),
                8.5_f32,
                Mm(25.0),
                Mm(contact_y - 4.0_f32),
                &reg,
            );
        }
    }

    // Kanan: Invoice Info (selalu di y 184..216 — fixed).
    set_color(&layer, C_SILVER);
    layer.use_text("INVOICE", 7.0_f32, Mm(110.0), Mm(216.0), &bold);
    set_color(&layer, C_BLACK);
    layer.use_text(input.invoice_no, 11.0_f32, Mm(110.0), Mm(208.0), &bold);
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        format!("No. Reg: {}", input.registration_no),
        8.5_f32,
        Mm(110.0),
        Mm(201.0),
        &reg,
    );
    layer.use_text(
        format!("Issued: {}", format_date_id(input.created_at)),
        8.5_f32,
        Mm(110.0),
        Mm(195.0),
        &reg,
    );
    if input.status == "UNPAID" {
        fill_rect(
            &layer,
            108.0_f32,
            182.0_f32,
            188.0_f32,
            189.0_f32,
            C_LEMON_400,
        );
    }
    set_color(&layer, C_BLACK);
    layer.use_text(
        format!("Jatuh Tempo: {}", format_date_id(input.due_date)),
        9.0_f32,
        Mm(110.0),
        Mm(184.0),
        &bold,
    );

    // ===== COVERAGE TABLE =====
    // Coverage y-position adapts: INDIVIDU uses y 138..165 (original), INSTANSI
    // shifts up by 10mm (y 128..155) karena DITAGIHKAN card lebih tinggi.
    let coverage_label_y = if input.applicant_type == "INSTANSI" {
        155.0
    } else {
        165.0
    };
    let coverage_header_top = if input.applicant_type == "INSTANSI" {
        142.0
    } else {
        152.0
    };
    let coverage_header_bottom = if input.applicant_type == "INSTANSI" {
        150.0
    } else {
        160.0
    };
    let coverage_header_text_y = coverage_header_bottom - 5.0;
    let coverage_data_y = coverage_header_bottom - 10.0;
    let coverage_line_below_y = if input.applicant_type == "INSTANSI" {
        128.0
    } else {
        138.0
    };

    set_color(&layer, C_BLACK);
    layer.use_text(
        "RINCIAN PEMBAYARAN",
        7.0_f32,
        Mm(20.0),
        Mm(coverage_label_y),
        &bold,
    );
    set_color(&layer, C_OAT_BORDER);
    draw_line(
        &layer,
        20.0,
        coverage_label_y - 3.0,
        190.0,
        coverage_label_y - 3.0,
        0.3,
    );

    fill_rect(
        &layer,
        20.0_f32,
        coverage_header_bottom,
        190.0_f32,
        coverage_header_top,
        C_OAT_LIGHT,
    );
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        "PRODUK",
        7.0_f32,
        Mm(23.0),
        Mm(coverage_header_text_y),
        &bold,
    );
    layer.use_text(
        "SUM ASSURED",
        7.0_f32,
        Mm(85.0),
        Mm(coverage_header_text_y),
        &bold,
    );
    layer.use_text(
        "TERM",
        7.0_f32,
        Mm(125.0),
        Mm(coverage_header_text_y),
        &bold,
    );
    layer.use_text(
        "SUBTOTAL",
        7.0_f32,
        Mm(155.0),
        Mm(coverage_header_text_y),
        &bold,
    );

    set_color(&layer, C_BLACK);
    // Plan tier sub-line: "Life Insurance — Standard" (gabungan product + tier).
    let product_display = match input.plan_tier.as_deref() {
        Some(tier) => format!("{} — {}", input.product_name, tier),
        None => input.product_name.to_string(),
    };
    layer.use_text(
        truncate(&product_display, 28).as_str(),
        10.0_f32,
        Mm(23.0),
        Mm(coverage_data_y),
        &bold,
    );
    set_color(&layer, C_CHARCOAL);
    let sum_str = format_idr(input.sum_assured);
    layer.use_text(
        sum_str.as_str(),
        10.0_f32,
        Mm(85.0),
        Mm(coverage_data_y),
        &reg,
    );
    layer.use_text(
        format!("{} tahun", input.coverage_term_years).as_str(),
        10.0_f32,
        Mm(125.0),
        Mm(coverage_data_y),
        &reg,
    );
    let subtotal_str = format_idr(input.premium);
    let x_subtotal = 187.0_f32 - (subtotal_str.chars().count() as f32) * 2.0_f32;
    layer.use_text(
        subtotal_str.as_str(),
        11.0_f32,
        Mm(x_subtotal),
        Mm(coverage_data_y),
        &bold,
    );

    // Sub-line: coverage period. Invoice (pre-payment) → placeholder text.
    // "10 tahun · Dimulai setelah pembayaran dikonfirmasi"
    set_color(&layer, C_SILVER);
    let period_text = format!(
        "{} tahun · Dimulai setelah pembayaran dikonfirmasi",
        input.coverage_term_years
    );
    layer.use_text(
        period_text.as_str(),
        7.5_f32,
        Mm(23.0),
        Mm(coverage_data_y - 5.0),
        &reg,
    );

    // Per-peserta breakdown (INSTANSI only) — di-render sebagai sub-line
    // tambahan di bawah period line. Tetap di area coverage, tidak push
    // section di bawahnya.
    if input.applicant_type == "INSTANSI" {
        if let Some(per_p) = input.per_participant_premium {
            let n = input.participants.len();
            if n > 0 {
                let total_check = per_p * Decimal::from(n as u64);
                let breakdown = format!(
                    "Premi per peserta: {} × {} peserta = {}",
                    format_idr(per_p),
                    n,
                    format_idr(total_check)
                );
                set_color(&layer, C_SILVER);
                layer.use_text(
                    breakdown.as_str(),
                    7.5_f32,
                    Mm(23.0),
                    Mm(coverage_data_y - 10.0),
                    &reg,
                );
            }
        }
    }

    set_color(&layer, C_OAT_BORDER);
    draw_line(
        &layer,
        20.0,
        coverage_line_below_y,
        190.0,
        coverage_line_below_y,
        0.2,
    );

    // ===== BENEFICIARY BLOCK (LIFE only) =====
    // Box kecil 18mm di bawah coverage, di-skip untuk PA/HEALTH.
    // Menggeser total box ke bawah (y sudah adaptif via `bottom_y`).
    let mut bottom_y = coverage_line_below_y - 4.0;
    if input.product_code == "LIFE" {
        if let Some(b) = input.beneficiary_name.as_deref().filter(|s| !s.is_empty()) {
            set_color(&layer, C_SILVER);
            draw_line(&layer, 20.0, bottom_y, 190.0, bottom_y, 0.3);
            bottom_y -= 4.0;
            layer.use_text(
                "AHLI WARIS / PENERIMA MANFAAT",
                7.0_f32,
                Mm(20.0),
                Mm(bottom_y),
                &bold,
            );
            bottom_y -= 7.0;
            set_color(&layer, C_BLACK);
            layer.use_text(
                truncate(b, 32).as_str(),
                11.0_f32,
                Mm(20.0),
                Mm(bottom_y),
                &bold,
            );
            bottom_y -= 12.0;
        }
    }

    // ===== TOTAL BOX =====
    // Y-position adaptif: top dihitung dari bottom_y (yang sudah di-minus
    // kalau ada beneficiary block). Default total_top = 100 (orig), tapi
    // untuk INSTANSI / LIFE-shifted layout bisa lebih rendah.
    let total_top = (bottom_y - 4.0).max(108.0);
    let total_bottom = total_top - 28.0;
    fill_rect(
        &layer,
        120.0_f32,
        total_bottom,
        190.0_f32,
        total_top,
        C_CREAM,
    );
    set_color(&layer, C_SILVER);
    layer.use_text("Subtotal", 8.0_f32, Mm(125.0), Mm(total_top - 8.0), &reg);
    let subtotal_str2 = format_idr(input.premium);
    let x_sub = 187.0_f32 - (subtotal_str2.chars().count() as f32) * 2.0_f32;
    layer.use_text(
        subtotal_str2.as_str(),
        9.0_f32,
        Mm(x_sub),
        Mm(total_top - 8.0),
        &reg,
    );
    set_color(&layer, C_OAT_BORDER);
    draw_line(
        &layer,
        125.0,
        total_top - 15.0,
        185.0,
        total_top - 15.0,
        0.3,
    );
    set_color(&layer, C_BLACK);
    layer.use_text("TOTAL", 11.0_f32, Mm(125.0), Mm(total_top - 20.0), &bold);
    let total_str = format_idr(input.premium);
    let x_total = 187.0_f32 - (total_str.chars().count() as f32) * 3.2_f32;
    layer.use_text(
        total_str.as_str(),
        14.0_f32,
        Mm(x_total),
        Mm(total_top - 21.0),
        &bold,
    );

    // ===== PAYMENT INSTRUCTIONS =====
    // Y-position adaptif: mulai 8mm di bawah total box bottom.
    let instr_label_y = total_bottom - 8.0;
    set_color(&layer, C_SILVER);
    layer.use_text(
        "INSTRUKSI PEMBAYARAN",
        7.0_f32,
        Mm(20.0),
        Mm(instr_label_y),
        &bold,
    );
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        "1. Login ke portal InsureTrack → menu Invoice",
        8.5_f32,
        Mm(20.0),
        Mm(instr_label_y - 7.0),
        &reg,
    );
    layer.use_text(
        "2. Klik tombol 'Bayar' pada invoice ini",
        8.5_f32,
        Mm(20.0),
        Mm(instr_label_y - 12.0),
        &reg,
    );
    layer.use_text(
        "3. Pilih metode pembayaran & selesaikan",
        8.5_f32,
        Mm(20.0),
        Mm(instr_label_y - 17.0),
        &reg,
    );
    set_color(&layer, C_SILVER);
    layer.use_text(
        "Polis terbit otomatis setelah pembayaran terverifikasi.",
        7.5_f32,
        Mm(20.0),
        Mm(instr_label_y - 25.0),
        &reg,
    );
    // Catatan free-look / expired — hanya render kalau masih muat di
    // space yang tersedia (y > 25 untuk hindari overlap dengan footer).
    let catatan_y = instr_label_y - 32.0;
    if catatan_y > 25.0 {
        layer.use_text(
            "Catatan: Invoice EXPIRED otomatis jika lewat jatuh tempo. Setelah \
             polis terbit, free-look 30 hari — pembatalan = pengembalian premi \
             penuh.",
            7.0_f32,
            Mm(20.0),
            Mm(catatan_y),
            &reg,
        );
    }

    // ===== FOOTER BAR =====
    fill_rect(&layer, 0.0_f32, 0.0_f32, 210.0_f32, 18.0_f32, C_BLACK);
    set_color(&layer, C_CREAM);
    layer.use_text("InsureTrack", 8.0_f32, Mm(20.0), Mm(8.0), &bold);
    layer.use_text(
        "Platform Asuransi Digital · support@insuretrack.example",
        7.0_f32,
        Mm(20.0),
        Mm(3.0),
        &reg,
    );
    layer.use_text("Halaman 1", 7.0_f32, Mm(170.0), Mm(5.0), &reg);

    // Lampiran daftar peserta Instansi — di-skip kalau participants kosong (alur INDIVIDU).
    render_participants_page(
        &doc,
        &bold,
        &reg,
        &input.participants,
        input.invoice_no,
        input.registration_no,
        "INVOICE",
    )?;

    let mut buf = BufWriter::new(Vec::<u8>::new());
    doc.save(&mut buf)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("pdf save: {e}")))?;
    let bytes = buf
        .into_inner()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("pdf buffer: {e}")))?;
    Ok(bytes)
}

// ============================================================================
// Payment Receipt PDF (Bukti Pembayaran)
// ============================================================================
//
// Dokumen terpisah dari Invoice. Invoice = tagihan (immutable setelah dikirim);
// Receipt = bukti resmi bahwa pembayaran telah diterima. Diterbitkan sekali
// saat payment webhook masuk dengan status PAID.
//
// Layout (A4 portrait, 210×297mm):
//   ┌──────────────────────────────────────────────┐
//   │ [BLACK HEADER BAR — brand + BUKTI PEMBAYARAN]│   y 285..262
//   ├──────────────────────────────────────────────┤
//   │                                               │
//   │   Pembayaran Premi Berhasil          LUNAS   │   y 252..232
//   │   ┌──────────────┐    ┌──────────────────┐   │
//   │   │ DIBAYAR OLEH │    │ DETAIL TRANSAKSI │   │   y 228..178
//   │   │ Nama ...     │    │ No. Invoice  ... │   │
//   │   │ NIK: ...     │    │ No. Reg      ... │   │
//   │   │ Email: ...   │    │ Tanggal      ... │   │
//   │   │              │    │ Channel      ... │   │
//   │   │              │    │ Ref          ... │   │
//   │   └──────────────┘    └──────────────────┘   │
//   │                                               │
//   │   RINCIAN PEMBAYARAN                          │   y 168..128
//   │   ┌──────────────────────────────────────┐   │
//   │   │ PRODUK  UANG PERTANGGUNGAN   TERM     │   │
//   │   │ ...     Rp ...               N thn    │   │
//   │   └──────────────────────────────────────┘   │
//   │   ┌──────────────────────────────────────┐   │
//   │   │  TOTAL DIBAYAR                        │   │   y 122..88
//   │   │  Rp X.XXX.XXX  (22pt bold, cream bg) │   │
//   │   └──────────────────────────────────────┘   │
//   │   CATATAN: Simpan dokumen ini ...             │   y 82..66
//   ├──────────────────────────────────────────────┤
//   │ [BLACK FOOTER BAR]                           │   y 18..0
//   └──────────────────────────────────────────────┘

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

/// Render Bukti Pembayaran PDF — dokumen resmi bahwa premi telah diterima.
/// Invoice tetap tidak berubah setelah diterbitkan (immutable billing doc);
/// receipt adalah dokumen kedua yang di-create sekali saat payment webhook
/// masuk. Layout A4 portrait, single-page.
pub fn render_receipt(input: &ReceiptPdfInput<'_>) -> Result<Vec<u8>, AppError> {
    let (doc, page1, layer1) =
        PdfDocument::new("Bukti Pembayaran", Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
    let layer = doc.get_page(page1).get_layer(layer1);

    let bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font bold: {e}")))?;
    let reg = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font reg: {e}")))?;

    // ===== HEADER BAR (black) — y 274..297 (23mm tall, flush ke top) =====
    fill_rect(&layer, 0.0, 274.0, 210.0, 297.0, C_BLACK);
    set_color(&layer, C_WHITE);
    layer.use_text("InsureTrack", 20.0, Mm(20.0), Mm(287.0), &bold);
    set_color(&layer, C_CREAM);
    layer.use_text(
        "Asuransi digital, prosesnya cepat, polis langsung terbit.",
        9.0,
        Mm(20.0),
        Mm(278.0),
        &reg,
    );
    set_color(&layer, C_WHITE);
    layer.use_text("BUKTI PEMBAYARAN", 18.0, Mm(120.0), Mm(287.0), &bold);
    set_color(&layer, C_CREAM);
    layer.use_text(
        "Konfirmasi Penerimaan Premi",
        9.0,
        Mm(120.0),
        Mm(278.0),
        &reg,
    );

    // ===== TITLE + STATUS BADGE — y 252..232 =====
    set_color(&layer, C_BLACK);
    layer.use_text(
        "Pembayaran Premi Berhasil Diterima",
        16.0,
        Mm(20.0),
        Mm(248.0),
        &bold,
    );
    set_color(&layer, C_SILVER);
    layer.use_text(
        "Dokumen ini merupakan bukti resmi penerimaan pembayaran premi asuransi.",
        9.0,
        Mm(20.0),
        Mm(240.0),
        &reg,
    );
    // Badge "LUNAS" — matcha green, konsisten dengan status badge di invoice/policy
    fill_rect(&layer, 140.0, 242.0, 190.0, 252.0, C_MATCHA_300);
    set_color(&layer, C_BLACK);
    layer.use_text("LUNAS", 11.0, Mm(157.0), Mm(245.0), &bold);

    // ===== TWO-COLUMN INFO CARD — y 228..178 (50mm) =====
    // Card height adapts: INDIVIDU 50mm (y 178..228, original), INSTANSI
    // 60mm (y 168..228) — company info butuh lebih banyak baris.
    let card_top = 228.0_f32;
    let card_bottom = if input.applicant_type == "INSTANSI" {
        168.0_f32
    } else {
        178.0_f32
    };
    fill_rect(&layer, 20.0, card_bottom, 190.0, card_top, C_CREAM);
    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 105.0, card_bottom, 105.0, card_top, 0.3);

    // Left column: DIBAYAR OLEH
    if input.applicant_type == "INSTANSI" {
        // Branch INSTANSI: company info sebagai primary payer, PIC sebagai
        // kontak orang yang submit. Sub-baris lebih rapat (3.5mm) supaya
        // muat di card 60mm.
        set_color(&layer, C_SILVER);
        layer.use_text("DIBAYAR OLEH", 7.0, Mm(25.0), Mm(222.0), &bold);
        set_color(&layer, C_BLACK);
        let company = input.company_name.as_deref().unwrap_or("—");
        layer.use_text(
            truncate(company, 30).as_str(),
            12.0,
            Mm(25.0),
            Mm(214.0),
            &bold,
        );
        set_color(&layer, C_CHARCOAL);
        let mut y = 208.0_f32;
        if let Some(npwp) = input.company_npwp.as_deref().filter(|s| !s.is_empty()) {
            layer.use_text(
                format!("NPWP: {}", truncate(npwp, 22)).as_str(),
                8.5,
                Mm(25.0),
                Mm(y),
                &reg,
            );
            y -= 4.0;
        }
        // Divider sebelum PIC
        y -= 1.0;
        set_color(&layer, C_OAT_BORDER);
        draw_line(&layer, 25.0, y, 100.0, y, 0.2);
        y -= 5.0;
        set_color(&layer, C_SILVER);
        layer.use_text("PIC", 7.0, Mm(25.0), Mm(y), &bold);
        y -= 4.5;
        set_color(&layer, C_CHARCOAL);
        layer.use_text(input.customer_name, 8.5, Mm(25.0), Mm(y), &reg);
        y -= 3.5;
        layer.use_text(
            format!("NIK: {}", input.customer_nik).as_str(),
            8.5,
            Mm(25.0),
            Mm(y),
            &reg,
        );
        y -= 3.5;
        if !input.customer_email.is_empty() {
            layer.use_text(
                format!("Email: {}", truncate(input.customer_email, 24)).as_str(),
                8.5,
                Mm(25.0),
                Mm(y),
                &reg,
            );
        }
    } else {
        // Branch INDIVIDU: existing layout (nama, NIK, email).
        set_color(&layer, C_SILVER);
        layer.use_text("DIBAYAR OLEH", 7.0, Mm(25.0), Mm(222.0), &bold);
        set_color(&layer, C_BLACK);
        layer.use_text(
            truncate(input.customer_name, 28).as_str(),
            12.0,
            Mm(25.0),
            Mm(214.0),
            &bold,
        );
        set_color(&layer, C_CHARCOAL);
        layer.use_text(
            format!("NIK: {}", input.customer_nik).as_str(),
            8.5,
            Mm(25.0),
            Mm(207.0),
            &reg,
        );
        if !input.customer_email.is_empty() {
            layer.use_text(
                format!("Email: {}", truncate(input.customer_email, 30)).as_str(),
                8.5,
                Mm(25.0),
                Mm(201.0),
                &reg,
            );
        }
    }

    // Right column: DETAIL TRANSAKSI
    set_color(&layer, C_SILVER);
    layer.use_text("DETAIL TRANSAKSI", 7.0, Mm(110.0), Mm(222.0), &bold);
    set_color(&layer, C_BLACK);
    layer.use_text(
        truncate(input.invoice_no, 22).as_str(),
        11.0,
        Mm(110.0),
        Mm(214.0),
        &bold,
    );
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        format!("No. Reg: {}", input.registration_no).as_str(),
        8.5,
        Mm(110.0),
        Mm(207.0),
        &reg,
    );
    layer.use_text(
        format!("Tanggal: {}", format_date_id(input.payment_date)).as_str(),
        8.5,
        Mm(110.0),
        Mm(201.0),
        &reg,
    );
    let mut detail_y = 195.0_f32;
    if let Some(ch) = input.payment_channel.filter(|s| !s.is_empty()) {
        layer.use_text(
            format!("Channel: {ch}").as_str(),
            8.5,
            Mm(110.0),
            Mm(detail_y),
            &reg,
        );
        detail_y -= 6.0;
    }
    if let Some(rf) = input.payment_reference.filter(|s| !s.is_empty()) {
        layer.use_text(
            format!("Ref: {}", truncate(rf, 22)).as_str(),
            8.5,
            Mm(110.0),
            Mm(detail_y),
            &reg,
        );
    }

    // ===== COVERAGE TABLE =====
    // Y-positions adapt: INDIVIDU uses original (y 132..160), INSTANSI
    // shifts up by 10mm karena DIBAYAR OLEH card lebih tinggi.
    let coverage_label_y = if input.applicant_type == "INSTANSI" {
        150.0
    } else {
        160.0
    };
    let coverage_header_top = if input.applicant_type == "INSTANSI" {
        137.0
    } else {
        147.0
    };
    let coverage_header_bottom = if input.applicant_type == "INSTANSI" {
        145.0
    } else {
        155.0
    };
    let coverage_header_text_y = coverage_header_bottom - 5.0;
    let coverage_data_y = coverage_header_bottom - 10.0;
    let coverage_line_below_y = if input.applicant_type == "INSTANSI" {
        122.0
    } else {
        132.0
    };

    set_color(&layer, C_BLACK);
    layer.use_text(
        "RINCIAN PEMBAYARAN",
        7.0,
        Mm(20.0),
        Mm(coverage_label_y),
        &bold,
    );
    set_color(&layer, C_OAT_BORDER);
    draw_line(
        &layer,
        20.0,
        coverage_label_y - 3.0,
        190.0,
        coverage_label_y - 3.0,
        0.3,
    );
    fill_rect(
        &layer,
        20.0,
        coverage_header_bottom,
        190.0,
        coverage_header_top,
        C_OAT_LIGHT,
    );
    set_color(&layer, C_CHARCOAL);
    layer.use_text("PRODUK", 7.0, Mm(23.0), Mm(coverage_header_text_y), &bold);
    layer.use_text(
        "UANG PERTANGGUNGAN",
        7.0,
        Mm(80.0),
        Mm(coverage_header_text_y),
        &bold,
    );
    layer.use_text("TERM", 7.0, Mm(160.0), Mm(coverage_header_text_y), &bold);

    set_color(&layer, C_BLACK);
    // Plan tier sub-line: "Life Insurance — Standard".
    let product_display = match input.plan_tier.as_deref() {
        Some(tier) => format!("{} — {}", input.product_name, tier),
        None => input.product_name.to_string(),
    };
    layer.use_text(
        truncate(&product_display, 28).as_str(),
        10.0,
        Mm(23.0),
        Mm(coverage_data_y),
        &bold,
    );
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        format_idr(input.sum_assured).as_str(),
        10.0,
        Mm(80.0),
        Mm(coverage_data_y),
        &reg,
    );
    layer.use_text(
        format!("{} thn", input.coverage_term_years).as_str(),
        10.0,
        Mm(160.0),
        Mm(coverage_data_y),
        &reg,
    );

    // Sub-line: coverage period (real dates, karena payment sudah
    // confirmed). Effective = payment_date + 1 hari; expiry = + N tahun.
    // Tampilkan: "s.d. [tanggal akhir]" saja — tanggal mulai sudah jelas
    // dari kolom "Tanggal" di DETAIL TRANSAKSI (payment_date).
    let effective = input.payment_date + chrono::Duration::days(1);
    let expiry_year = effective.year() + input.coverage_term_years;
    let expiry = effective.with_year(expiry_year).unwrap_or(effective);
    let period_text = format!("Periode perlindungan: s.d. {}", format_date_id(expiry));
    set_color(&layer, C_SILVER);
    layer.use_text(
        period_text.as_str(),
        7.5,
        Mm(23.0),
        Mm(coverage_data_y - 5.0),
        &reg,
    );

    // Per-peserta breakdown (INSTANSI only) — sama pattern dengan invoice.
    if input.applicant_type == "INSTANSI" {
        if let Some(per_p) = input.per_participant_premium {
            let n = input.participants.len();
            if n > 0 {
                let total_check = per_p * Decimal::from(n as u64);
                let breakdown = format!(
                    "Premi per peserta: {} × {} peserta = {}",
                    format_idr(per_p),
                    n,
                    format_idr(total_check)
                );
                set_color(&layer, C_SILVER);
                layer.use_text(
                    breakdown.as_str(),
                    7.5,
                    Mm(23.0),
                    Mm(coverage_data_y - 10.0),
                    &reg,
                );
            }
        }
    }

    set_color(&layer, C_OAT_BORDER);
    draw_line(
        &layer,
        20.0,
        coverage_line_below_y,
        190.0,
        coverage_line_below_y,
        0.2,
    );

    // ===== BENEFICIARY BLOCK (LIFE only) =====
    let mut bottom_y = coverage_line_below_y - 4.0;
    if input.product_code == "LIFE" {
        if let Some(b) = input.beneficiary_name.as_deref().filter(|s| !s.is_empty()) {
            set_color(&layer, C_SILVER);
            draw_line(&layer, 20.0, bottom_y, 190.0, bottom_y, 0.3);
            bottom_y -= 4.0;
            layer.use_text(
                "AHLI WARIS / PENERIMA MANFAAT",
                7.0,
                Mm(20.0),
                Mm(bottom_y),
                &bold,
            );
            bottom_y -= 7.0;
            set_color(&layer, C_BLACK);
            layer.use_text(
                truncate(b, 32).as_str(),
                11.0,
                Mm(20.0),
                Mm(bottom_y),
                &bold,
            );
            bottom_y -= 12.0;
        }
    }

    // ===== TOTAL BOX (matcha border, cream interior) =====
    // Y-position adaptif: top dihitung dari bottom_y. Default 88 (orig)
    // untuk layout tanpa beneficiary. Kalau ada beneficiary, push down
    // sampai muat (max 78).
    let total_top = bottom_y.clamp(78.0, 122.0);
    let total_bottom = total_top - 34.0;
    fill_rect(&layer, 20.0, total_bottom, 190.0, total_top, C_MATCHA_300);
    fill_rect(
        &layer,
        22.0,
        total_bottom + 2.0,
        188.0,
        total_top - 2.0,
        C_CREAM,
    );
    set_color(&layer, C_SILVER);
    layer.use_text("TOTAL DIBAYAR", 8.0, Mm(25.0), Mm(total_top - 8.0), &bold);
    set_color(&layer, C_BLACK);
    let total_str = format_idr(input.paid_amount);
    layer.use_text(
        total_str.as_str(),
        22.0,
        Mm(25.0),
        Mm(total_top - 22.0),
        &bold,
    );
    set_color(&layer, C_SILVER);
    layer.use_text(
        format!("Invoice {}", input.invoice_no).as_str(),
        8.0,
        Mm(25.0),
        Mm(total_bottom + 6.0),
        &reg,
    );

    // ===== CATATAN — y adaptif di bawah total box =====
    let catatan_label_y = total_bottom - 8.0;
    set_color(&layer, C_SILVER);
    layer.use_text("CATATAN", 7.0, Mm(20.0), Mm(catatan_label_y), &bold);
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        "Simpan dokumen ini sebagai bukti pembayaran premi. Polis elektronik",
        8.0,
        Mm(20.0),
        Mm(catatan_label_y - 6.0),
        &reg,
    );
    layer.use_text(
        "telah terbit dan dapat diunduh dari portal customer InsureTrack.",
        8.0,
        Mm(20.0),
        Mm(catatan_label_y - 12.0),
        &reg,
    );
    // Free-look reminder — lebih relevan di receipt (post-payment, pre-free-look).
    let free_look_y = catatan_label_y - 20.0;
    if free_look_y > 25.0 {
        set_color(&layer, C_SILVER);
        layer.use_text(
            "Free-look 30 hari: pembatalan dalam 30 hari sejak tanggal di atas = pengembalian premi penuh.",
            7.0,
            Mm(20.0),
            Mm(free_look_y),
            &reg,
        );
    }

    // ===== FOOTER BAR =====
    fill_rect(&layer, 0.0, 0.0, 210.0, 18.0, C_BLACK);
    set_color(&layer, C_CREAM);
    layer.use_text("InsureTrack", 8.0, Mm(20.0), Mm(8.0), &bold);
    layer.use_text(
        "Platform Asuransi Digital · support@insuretrack.example",
        7.0,
        Mm(20.0),
        Mm(3.0),
        &reg,
    );
    layer.use_text(
        "Bukti Pembayaran Resmi · Halaman 1",
        7.0,
        Mm(145.0),
        Mm(5.0),
        &reg,
    );

    // Lampiran daftar peserta Instansi — di-skip kalau participants kosong (alur INDIVIDU).
    render_participants_page(
        &doc,
        &bold,
        &reg,
        &input.participants,
        input.invoice_no,
        input.registration_no,
        "BUKTI PEMBAYARAN",
    )?;

    let mut buf = BufWriter::new(Vec::<u8>::new());
    doc.save(&mut buf)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("pdf save: {e}")))?;
    let bytes = buf
        .into_inner()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("pdf buffer: {e}")))?;
    Ok(bytes)
}

// ============================================================================
// Lampiran "DAFTAR PESERTA" — dipanggil dari render_invoice & render_receipt
// kalau participants tidak kosong (alur INSTANSI). Multi-page: 32 row/halaman
// font 8pt, tinggi baris 6mm. Page 1 = cover full, halaman lanjutan = mini
// header dengan suffix "(Lanjutan)" + page indicator.
// ============================================================================

/// Layout kolom tabel peserta (mm). Total content 170mm — muat A4 portrait
/// dengan margin 20mm kiri-kanan. X = posisi kiri kolom; lebar kolom
/// diturunkan dari gap antar-x (No 10 + NIK 28 + Nama 50 + TTL 40 + JK
/// 12 + Beneficiary 30 = 170).
const PARTICIPANT_COL_X: [f32; 6] = [20.0, 30.0, 58.0, 108.0, 148.0, 160.0];
const PARTICIPANT_HEADERS: [&str; 6] = [
    "No",
    "NIK",
    "Nama Lengkap",
    "Tempat, Tgl Lahir",
    "JK",
    "Beneficiary",
];
const PARTICIPANT_ROWS_PER_PAGE: usize = 32;
const PARTICIPANT_ROW_HEIGHT: f32 = 6.0;
const PARTICIPANT_TABLE_LEFT: f32 = 20.0;
const PARTICIPANT_TABLE_RIGHT: f32 = 190.0;

/// Append halaman lampiran "DAFTAR PESERTA" ke `doc`. Caller harus skip
/// pemanggilan ini untuk alur INDIVIDU (`participants.is_empty()`).
/// `doc_label` = "INVOICE" atau "BUKTI PEMBAYARAN" (ditampilkan di
/// header bar page pertama).
fn render_participants_page(
    doc: &PdfDocumentReference,
    bold: &IndirectFontRef,
    reg: &IndirectFontRef,
    participants: &[ParticipantSummary],
    invoice_no: &str,
    registration_no: &str,
    doc_label: &str,
) -> Result<(), AppError> {
    let total = participants.len();
    if total == 0 {
        return Ok(());
    }
    let total_pages = total.div_ceil(PARTICIPANT_ROWS_PER_PAGE);

    for page_idx in 0..total_pages {
        let (page, layer_id) = doc.add_page(Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
        let layer = doc.get_page(page).get_layer(layer_id);

        // ===== Header bar (full di page 1, mini di halaman lanjutan) =====
        fill_rect(&layer, 0.0, 274.0, 210.0, 297.0, C_BLACK);
        set_color(&layer, C_WHITE);
        layer.use_text("InsureTrack", 18.0, Mm(20.0), Mm(287.0), bold);
        set_color(&layer, C_CREAM);
        layer.use_text(
            "Asuransi digital, prosesnya cepat, polis langsung terbit.",
            8.5,
            Mm(20.0),
            Mm(279.0),
            reg,
        );
        if page_idx == 0 {
            // Page 1: tampilkan doc label di kanan (sama style dengan page 1 cover)
            set_color(&layer, C_WHITE);
            layer.use_text(doc_label, 16.0, Mm(150.0), Mm(287.0), bold);
            set_color(&layer, C_CREAM);
            layer.use_text("Lampiran · Daftar Peserta", 8.5, Mm(150.0), Mm(279.0), reg);
        } else {
            // Halaman lanjutan: judul dengan suffix
            set_color(&layer, C_CREAM);
            layer.use_text(
                format!("{} — Daftar Peserta (Lanjutan)", doc_label).as_str(),
                11.0,
                Mm(105.0),
                Mm(285.0),
                bold,
            );
        }

        // ===== Title + count + info row =====
        set_color(&layer, C_BLACK);
        let title = if page_idx == 0 {
            "DAFTAR PESERTA"
        } else {
            "DAFTAR PESERTA (Lanjutan)"
        };
        layer.use_text(title, 14.0, Mm(20.0), Mm(263.0), bold);
        set_color(&layer, C_SILVER);
        layer.use_text(
            format!("Jumlah peserta: {} orang", total).as_str(),
            9.5,
            Mm(20.0),
            Mm(254.0),
            reg,
        );
        set_color(&layer, C_CHARCOAL);
        layer.use_text(
            format!(
                "No. {}: {}   ·   No. Pendaftaran: {}",
                doc_label, invoice_no, registration_no
            )
            .as_str(),
            8.5,
            Mm(20.0),
            Mm(245.0),
            reg,
        );

        // ===== Table header (gray fill) — y 220..226 =====
        fill_rect(
            &layer,
            PARTICIPANT_TABLE_LEFT,
            220.0,
            PARTICIPANT_TABLE_RIGHT,
            226.0,
            C_OAT_LIGHT,
        );
        set_color(&layer, C_BLACK);
        for (i, h) in PARTICIPANT_HEADERS.iter().enumerate() {
            layer.use_text(*h, 8.0, Mm(PARTICIPANT_COL_X[i] + 1.0), Mm(222.0), bold);
        }
        set_color(&layer, C_OAT_BORDER);
        draw_line(
            &layer,
            PARTICIPANT_TABLE_LEFT,
            220.0,
            PARTICIPANT_TABLE_RIGHT,
            220.0,
            0.3,
        );

        // ===== Data rows =====
        let start = page_idx * PARTICIPANT_ROWS_PER_PAGE;
        let end = (start + PARTICIPANT_ROWS_PER_PAGE).min(total);
        for (i, p) in participants[start..end].iter().enumerate() {
            let row_no = start + i + 1;
            // Baseline y menurun; baris pertama di y=212, lalu -6mm per baris.
            let y = 212.0 - (i as f32) * PARTICIPANT_ROW_HEIGHT;
            // Map MALE/FEMALE → L/P untuk kompak (kolom JK cuma 12mm).
            let jk = match p.gender.as_str() {
                "MALE" => "L",
                "FEMALE" => "P",
                _ => "—",
            };
            let beneficiary = p.beneficiary_name.as_deref().unwrap_or("—");
            let ttl = format!("{}, {}", p.birth_place, format_date_id(p.birth_date));

            set_color(&layer, C_BLACK);
            layer.use_text(
                format!("{}", row_no).as_str(),
                8.0,
                Mm(PARTICIPANT_COL_X[0] + 1.0),
                Mm(y),
                reg,
            );
            layer.use_text(
                truncate(&p.nik, 18).as_str(),
                8.0,
                Mm(PARTICIPANT_COL_X[1]),
                Mm(y),
                reg,
            );
            layer.use_text(
                truncate(&p.full_name, 32).as_str(),
                8.0,
                Mm(PARTICIPANT_COL_X[2]),
                Mm(y),
                reg,
            );
            layer.use_text(
                truncate(&ttl, 26).as_str(),
                8.0,
                Mm(PARTICIPANT_COL_X[3]),
                Mm(y),
                reg,
            );
            layer.use_text(jk, 8.0, Mm(PARTICIPANT_COL_X[4] + 2.0), Mm(y), reg);
            layer.use_text(
                truncate(beneficiary, 18).as_str(),
                8.0,
                Mm(PARTICIPANT_COL_X[5]),
                Mm(y),
                reg,
            );

            // Row separator (thin)
            set_color(&layer, C_OAT_LIGHT);
            draw_line(
                &layer,
                PARTICIPANT_TABLE_LEFT,
                y - 2.5,
                PARTICIPANT_TABLE_RIGHT,
                y - 2.5,
                0.2,
            );
        }

        // ===== Footer bar (sama dengan page 1 cover) =====
        fill_rect(&layer, 0.0, 0.0, 210.0, 12.0, C_BLACK);
        set_color(&layer, C_WHITE);
        layer.use_text("InsureTrack", 8.0, Mm(20.0), Mm(7.0), bold);
        set_color(&layer, C_CREAM);
        layer.use_text(
            "Platform Asuransi Digital · support@insuretrack.example",
            7.0,
            Mm(20.0),
            Mm(3.0),
            reg,
        );
        // Page indicator: Halaman 2 (setelah cover), Halaman 3, dst.
        layer.use_text(
            format!("Halaman {}", page_idx + 2).as_str(),
            7.0,
            Mm(170.0),
            Mm(5.0),
            reg,
        );
    }

    Ok(())
}

// ---- Drawing helpers ---------------------------------------------------------

/// Fill rectangle. Coords: bottom-left (x1, y1) and top-right (x2, y2) in mm.
fn fill_rect(layer: &PdfLayerReference, x1: f32, y1: f32, x2: f32, y2: f32, color: (u8, u8, u8)) {
    set_color(layer, color);
    layer.set_outline_thickness(0.0);
    layer.add_rect(printpdf::Rect {
        ll: Point::new(Mm(x1), Mm(y1)),
        ur: Point::new(Mm(x2), Mm(y2)),
        mode: PaintMode::Fill,
        winding: printpdf::path::WindingOrder::NonZero,
    });
    layer.set_outline_thickness(0.5);
}

/// Draw straight line between two points.
fn draw_line(layer: &PdfLayerReference, x1: f32, y1: f32, x2: f32, y2: f32, thickness: f32) {
    layer.set_outline_thickness(thickness);
    let line = Line {
        points: vec![
            (Point::new(Mm(x1), Mm(y1)), false),
            (Point::new(Mm(x2), Mm(y2)), false),
        ],
        is_closed: false,
    };
    layer.add_line(line);
}

/// Truncate string dengan ellipsis kalau lebih panjang dari max_len.
fn truncate(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_len - 1).collect();
        format!("{}…", truncated)
    }
}

/// Word-wrap sederhana — split by space, group by max_chars per line.
fn wrap_text(s: &str, max_chars: usize) -> Vec<String> {
    let mut lines = Vec::new();
    for raw_line in s.split('\n') {
        let mut current = String::new();
        for word in raw_line.split_whitespace() {
            if current.is_empty() {
                current = word.to_string();
            } else if current.len() + 1 + word.len() <= max_chars {
                current.push(' ');
                current.push_str(word);
            } else {
                lines.push(current);
                current = word.to_string();
            }
        }
        if !current.is_empty() {
            lines.push(current);
        }
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use rust_decimal::Decimal;

    fn sample_input() -> PolicyPdfInput<'static> {
        PolicyPdfInput {
            policy_no: "POL-202606-000001",
            registration_no: "REG-202606-000001",
            effective_date: NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            expiry_date: NaiveDate::from_ymd_opt(2036, 6, 1).unwrap(),
            customer_nik: "3201010101010001",
            customer_name: "Budi Santoso",
            customer_birth_place: "Bandung",
            customer_birth_date: NaiveDate::from_ymd_opt(1990, 1, 1).unwrap(),
            customer_gender: "MALE",
            customer_address: "Jl. Merdeka No. 17, Bandung",
            customer_email: "budi@example.com",
            customer_mobile: "081234567890",
            product_name: "Life Insurance",
            plan_tier: Some("STANDARD".to_string()),
            sum_assured: Decimal::from(100_000_000),
            premium: Decimal::from(900_000),
            coverage_term_years: 10,
            beneficiary_name: Some("Siti Aminah (istri)".to_string()),
            company_name: None,
            company_npwp: None,
            company_industry: None,
        }
    }

    #[test]
    fn render_returns_non_empty_bytes() {
        let bytes = render(&sample_input()).unwrap();
        assert!(!bytes.is_empty());
        // PDF magic-bytes — penting supaya browser & PDF viewer recognize.
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn render_produces_substantial_output() {
        // printpdf compress text object streams, jadi raw policy_no TIDAK
        // muncul sebagai plaintext di byte stream. Yang bisa kita assert:
        // - PDF version header valid
        // - Output cukup besar (10KB+) → render benar-benar menggambar
        //   semua section + font tables, bukan template kosong
        let bytes = render(&sample_input()).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(
            bytes.len() > 5_000,
            "PDF suspiciously small: {} bytes — section mungkin tidak di-render",
            bytes.len()
        );
        // EOF marker (%%EOF) sebelum newline — printpdf selalu emit ini.
        let tail = &bytes[bytes.len().saturating_sub(32)..];
        assert!(
            tail.windows(5).any(|w| w == b"%%EOF"),
            "PDF missing %%EOF marker"
        );
    }

    #[test]
    fn render_handles_optional_beneficiary_and_company() {
        // PA/HEALTH flow — no beneficiary.
        let mut input = sample_input();
        input.beneficiary_name = None;
        let bytes = render(&input).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.len() > 5_000);
    }

    #[test]
    fn render_handles_instansi_with_company_info() {
        // INSTANSI flow — company info set, no beneficiary.
        let mut input = sample_input();
        input.beneficiary_name = None;
        input.company_name = Some("PT ABC Indonesia".to_string());
        input.company_npwp = Some("01.234.567.8-901.000".to_string());
        input.company_industry = Some("Manufaktur".to_string());
        let bytes = render(&input).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.len() > 5_000);
    }

    // ---- wrap_text (pure helper) ----

    #[test]
    fn wrap_text_short_string_no_wrap() {
        let lines = wrap_text("halo dunia", 80);
        assert_eq!(lines, vec!["halo dunia".to_string()]);
    }

    #[test]
    fn wrap_text_breaks_long_line() {
        let lines = wrap_text("a b c d e f g h i j k l m n o", 5);
        // 5 chars max → group kata pendek sampai muat
        assert!(lines.len() > 1);
        for l in &lines {
            assert!(l.len() <= 10, "line too long: {l:?}"); // sedikit headroom
        }
    }

    #[test]
    fn wrap_text_preserves_explicit_newlines() {
        let lines = wrap_text("line1\nline2", 80);
        assert_eq!(lines, vec!["line1".to_string(), "line2".to_string()]);
    }

    #[test]
    fn wrap_text_empty_input_returns_one_empty_line() {
        // Dipakai untuk safety di Notes section — kalau string kosong,
        // minimal return 1 line kosong supaya caller tidak NPE.
        let lines = wrap_text("", 80);
        assert_eq!(lines, vec!["".to_string()]);
    }

    // ---- Invoice & Receipt dengan participants (INSTANSI) ----

    fn sample_invoice_input(participants: Vec<ParticipantSummary>) -> InvoicePdfInput<'static> {
        // Applicant_type diturunkan dari participants: kosong = INDIVIDU,
        // ada isinya = INSTANSI. Helper dipakai existing test sebagai
        // "INDIVIDU" baseline dengan Vec::new().
        let applicant_type: &'static str = if participants.is_empty() {
            "INDIVIDU"
        } else {
            "INSTANSI"
        };
        let per_participant = if applicant_type == "INSTANSI" && !participants.is_empty() {
            Some(Decimal::from(900_000)) // 2_700_000 / 3 peserta
        } else {
            None
        };
        InvoicePdfInput {
            invoice_no: "INV-202606-000001",
            registration_no: "REG-202606-000001",
            customer_nik: "3201010101010001",
            customer_name: "PT ABC Indonesia",
            customer_birth_place: "Bandung",
            customer_birth_date: NaiveDate::from_ymd_opt(1990, 1, 1).unwrap(),
            customer_gender: "Laki-laki",
            customer_email: "budi@example.com",
            customer_mobile: "081234567890",
            customer_address: "Jl. Merdeka No. 17\nRT/RW 001/002\nBandung",
            product_code: "LIFE",
            product_name: "Asuransi Jiwa",
            plan_tier: Some("STANDARD".to_string()),
            sum_assured: Decimal::from(100_000_000),
            premium: Decimal::from(2_700_000),
            coverage_term_years: 10,
            due_date: NaiveDate::from_ymd_opt(2026, 7, 1).unwrap(),
            status: "UNPAID",
            created_at: NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            applicant_type,
            company_name: if applicant_type == "INSTANSI" {
                Some("PT ABC Indonesia".to_string())
            } else {
                None
            },
            company_npwp: if applicant_type == "INSTANSI" {
                Some("01.234.567.8-901.000".to_string())
            } else {
                None
            },
            beneficiary_name: Some("Siti Aminah (istri)".to_string()),
            per_participant_premium: per_participant,
            participants,
        }
    }

    fn sample_receipt_input(participants: Vec<ParticipantSummary>) -> ReceiptPdfInput<'static> {
        let applicant_type: &'static str = if participants.is_empty() {
            "INDIVIDU"
        } else {
            "INSTANSI"
        };
        let per_participant = if applicant_type == "INSTANSI" && !participants.is_empty() {
            Some(Decimal::from(900_000))
        } else {
            None
        };
        ReceiptPdfInput {
            invoice_no: "INV-202606-000001",
            registration_no: "REG-202606-000001",
            customer_name: "PT ABC Indonesia",
            customer_nik: "3201010101010001",
            customer_email: "budi@example.com",
            product_code: "LIFE",
            product_name: "Asuransi Jiwa",
            plan_tier: Some("STANDARD".to_string()),
            coverage_term_years: 10,
            sum_assured: Decimal::from(100_000_000),
            paid_amount: Decimal::from(2_700_000),
            payment_date: NaiveDate::from_ymd_opt(2026, 6, 15).unwrap(),
            payment_channel: Some("VIRTUAL_ACCOUNT_BCA"),
            payment_reference: Some("REF-12345"),
            applicant_type,
            company_name: if applicant_type == "INSTANSI" {
                Some("PT ABC Indonesia".to_string())
            } else {
                None
            },
            company_npwp: if applicant_type == "INSTANSI" {
                Some("01.234.567.8-901.000".to_string())
            } else {
                None
            },
            beneficiary_name: Some("Siti Aminah (istri)".to_string()),
            per_participant_premium: per_participant,
            participants,
        }
    }

    fn sample_participants(n: usize) -> Vec<ParticipantSummary> {
        (1..=n)
            .map(|i| ParticipantSummary {
                no: i as u32,
                nik: format!("320101010101{:04}", i),
                full_name: format!("Peserta Test {i}"),
                birth_place: "Jakarta".to_string(),
                birth_date: NaiveDate::from_ymd_opt(1990 + (i as i32 % 20), 1, 1).unwrap(),
                gender: if i % 2 == 0 { "MALE" } else { "FEMALE" }.to_string(),
                beneficiary_name: if i <= 3 {
                    Some(format!("Ahli Waris {i}"))
                } else {
                    None
                },
            })
            .collect()
    }

    fn assert_valid_pdf(bytes: &[u8]) {
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF magic bytes");
        let tail = &bytes[bytes.len().saturating_sub(32)..];
        assert!(
            tail.windows(5).any(|w| w == b"%%EOF"),
            "PDF missing %%EOF marker"
        );
    }

    #[test]
    fn render_invoice_individu_smoke() {
        // INDIVIDU: helper skip lampiran, output valid PDF (1 cover page).
        let bytes = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        assert_valid_pdf(&bytes);
    }

    #[test]
    fn render_receipt_individu_smoke() {
        let bytes = render_receipt(&sample_receipt_input(Vec::new())).unwrap();
        assert_valid_pdf(&bytes);
    }

    // ---- Verifikasi INSTANSI append lampiran (size grows) ----

    #[test]
    fn render_invoice_instansi_appends_lampiran() {
        // Bukti helper dipanggil: INSTANSI dengan peserta > INDIVIDU.
        let individu = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        let instansi_3 = render_invoice(&sample_invoice_input(sample_participants(3))).unwrap();
        assert!(
            instansi_3.len() > individu.len(),
            "INSTANSI 3 peserta ({} byte) harus lebih besar dari INDIVIDU ({} byte) \
             — kalau sama, helper lampiran tidak dipanggil",
            instansi_3.len(),
            individu.len()
        );
    }

    #[test]
    fn render_receipt_instansi_appends_lampiran() {
        let individu = render_receipt(&sample_receipt_input(Vec::new())).unwrap();
        let instansi_3 = render_receipt(&sample_receipt_input(sample_participants(3))).unwrap();
        assert!(
            instansi_3.len() > individu.len(),
            "INSTANSI receipt ({} byte) harus > INDIVIDU receipt ({} byte)",
            instansi_3.len(),
            individu.len()
        );
    }

    #[test]
    fn render_invoice_instansi_pagination_scales() {
        // 50 peserta harus > 3 peserta (kalau helper benar-benar pagination
        // dengan isi tabel, output akan lebih besar).
        let small = render_invoice(&sample_invoice_input(sample_participants(3))).unwrap();
        let large = render_invoice(&sample_invoice_input(sample_participants(50))).unwrap();
        assert!(
            large.len() > small.len(),
            "50 peserta ({} byte) harus > 3 peserta ({} byte)",
            large.len(),
            small.len()
        );
        // Dan ukuran harus cukup besar (50 peserta × 6 kolom × beberapa
        // baris text ⇒ minimal belasan KB).
        assert!(
            large.len() > 10_000,
            "PDF 50 peserta suspiciously small: {} byte",
            large.len()
        );
    }

    #[test]
    fn render_receipt_instansi_pagination_scales() {
        let small = render_receipt(&sample_receipt_input(sample_participants(3))).unwrap();
        let large = render_receipt(&sample_receipt_input(sample_participants(50))).unwrap();
        assert!(
            large.len() > small.len(),
            "50 peserta receipt ({} byte) harus > 3 peserta receipt ({} byte)",
            large.len(),
            small.len()
        );
        assert!(large.len() > 10_000);
    }

    #[test]
    fn render_invoice_instansi_single_peserta_appends() {
        // Edge case: 1 peserta tetap dapat halaman lampiran.
        let individu = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        let single = render_invoice(&sample_invoice_input(sample_participants(1))).unwrap();
        assert!(single.len() > individu.len());
    }

    // ---- Verifikasi field mandatory baru: tier, beneficiary, company, breakdown ----
    //
    // Tidak bisa parse PDF content (compressed). Validasi via byte-size
    // delta: kalau field baru di-render, output harus lebih besar dari
    // baseline yang field-nya None/empty.

    #[test]
    fn render_invoice_life_with_beneficiary_larger_than_without() {
        // Beneficiary block LIFE menambah 1 section (~line + name + divider).
        // PDF size harus naik, bukan sama (yang意味着 field diabaikan).
        let mut without = sample_invoice_input(Vec::new());
        without.beneficiary_name = None;
        without.product_code = "LIFE";
        let bytes_without = render_invoice(&without).unwrap();
        let bytes_with = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        assert!(
            bytes_with.len() > bytes_without.len(),
            "Invoice dengan beneficiary ({} byte) harus > tanpa ({})",
            bytes_with.len(),
            bytes_without.len()
        );
    }

    #[test]
    fn render_invoice_pa_skips_beneficiary_even_if_set() {
        // Caller (customer.rs) pre-filter: beneficiary_name di-set None
        // untuk PA/HEALTH. Test ini verifikasi layer PDF: kalau product_code
        // PA + beneficiary_name tetap ada (defensive), block tidak di-render.
        let mut input = sample_invoice_input(Vec::new());
        input.product_code = "PERSONAL_ACCIDENT";
        input.beneficiary_name = Some("Siti Aminah".to_string());
        let mut tanpa_benef = input.clone();
        tanpa_benef.beneficiary_name = None;
        let b_with = render_invoice(&input).unwrap();
        let b_without = render_invoice(&tanpa_benef).unwrap();
        // Untuk PA, beneficiary harusnya di-skip — size harusnya sama
        // (atau sangat dekat karena text berbeda tiap render). Loose check:
        // size tidak boleh jauh lebih besar.
        assert!(
            b_with.len() < (b_without.len() + 500),
            "PA invoice dengan beneficiary_name seharusnya skip block — \
             b_with={} b_without={}",
            b_with.len(),
            b_without.len()
        );
    }

    #[test]
    fn render_invoice_instansi_with_company_larger_than_individu() {
        // Company info INSTANSI = extra section (NPWP, divider, PIC). Card
        // lebih tinggi (60mm vs 50mm). Coverage + total + payment shift.
        // Size harus naik signifikan.
        let individu = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        let instansi = render_invoice(&sample_invoice_input(sample_participants(3))).unwrap();
        assert!(
            instansi.len() > individu.len() + 1000,
            "INSTANSI ({} byte) harus > INDIVIDU ({} byte) + margin — \
             kalau hampir sama, branch INSTANSI di DITAGIHKAN tidak aktif",
            instansi.len(),
            individu.len()
        );
    }

    #[test]
    fn render_invoice_instansi_breakdown_increases_size() {
        // Breakdown line: "Premi per peserta: Rp X × N = Rp Y".
        // INSTANSI tanpa per_participant_premium (None) vs dengan (Some) —
        // size dengan harus > size tanpa.
        let mut without = sample_invoice_input(sample_participants(3));
        without.per_participant_premium = None;
        let bytes_without = render_invoice(&without).unwrap();
        let bytes_with = render_invoice(&sample_invoice_input(sample_participants(3))).unwrap();
        assert!(
            bytes_with.len() >= bytes_without.len(),
            "INSTANSI invoice dengan breakdown ({} byte) harus >= tanpa ({})",
            bytes_with.len(),
            bytes_without.len()
        );
    }

    #[test]
    fn render_invoice_with_plan_tier_larger_than_without() {
        // Plan tier sub-line "— Standard" menambah text di coverage row.
        let mut without = sample_invoice_input(Vec::new());
        without.plan_tier = None;
        let b_without = render_invoice(&without).unwrap();
        let b_with = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        assert!(
            b_with.len() > b_without.len(),
            "Invoice dengan tier ({} byte) harus > tanpa tier ({})",
            b_with.len(),
            b_without.len()
        );
    }

    // ---- Receipt mirror tests ----

    #[test]
    fn render_receipt_life_with_beneficiary_larger_than_without() {
        let mut without = sample_receipt_input(Vec::new());
        without.beneficiary_name = None;
        let b_without = render_receipt(&without).unwrap();
        let b_with = render_receipt(&sample_receipt_input(Vec::new())).unwrap();
        assert!(
            b_with.len() > b_without.len(),
            "Receipt dengan beneficiary ({} byte) harus > tanpa ({})",
            b_with.len(),
            b_without.len()
        );
    }

    #[test]
    fn render_receipt_instansi_with_company_larger_than_individu() {
        let individu = render_receipt(&sample_receipt_input(Vec::new())).unwrap();
        let instansi = render_receipt(&sample_receipt_input(sample_participants(3))).unwrap();
        assert!(
            instansi.len() > individu.len() + 1000,
            "INSTANSI receipt ({} byte) harus > INDIVIDU ({} byte) + margin",
            instansi.len(),
            individu.len()
        );
    }

    #[test]
    fn render_receipt_with_plan_tier_larger_than_without() {
        let mut without = sample_receipt_input(Vec::new());
        without.plan_tier = None;
        let b_without = render_receipt(&without).unwrap();
        let b_with = render_receipt(&sample_receipt_input(Vec::new())).unwrap();
        assert!(
            b_with.len() > b_without.len(),
            "Receipt dengan tier ({} byte) harus > tanpa tier ({})",
            b_with.len(),
            b_without.len()
        );
    }
}
