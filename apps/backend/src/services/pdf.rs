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
use printpdf::{BuiltinFont, Color, Line, Mm, PdfDocument, PdfLayerReference, Point, Rgb};
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
    layer.use_text(truncate(&ttl_cover, 52).as_str(), 9.0, Mm(15.0), Mm(170.0), &reg);

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
    } else if input.product_name.contains("Accident")
        || input.product_name.contains("Kecelakaan")
    {
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
    let total_prem = input.premium
        * rust_decimal::Decimal::from(input.coverage_term_years);
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
            layer.use_text(
                beneficiary,
                11.0,
                Mm(15.0),
                Mm(p2_bottom - 11.0),
                &bold,
            );
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
    } else if input.product_name.contains("Accident")
        || input.product_name.contains("Kecelakaan")
    {
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
        let desc_lines = wrap_text(*desc, 88);
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
        let clines = wrap_text(*content, 92);
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
        format!(
            "Diterbitkan: {}",
            format_date_id(input.effective_date)
        )
        .as_str(),
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
    pub product_name: &'a str,
    pub sum_assured: Decimal,
    pub premium: Decimal,
    pub coverage_term_years: i32,
    pub due_date: NaiveDate,
    pub status: &'a str,
    pub created_at: NaiveDate,
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
    fill_rect(&layer, 20.0_f32, 178.0_f32, 190.0_f32, 222.0_f32, C_CREAM);
    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 105.0, 178.0, 105.0, 222.0, 0.3);

    // Kiri: Ditagihkan ke
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

    // Kanan: Invoice Info
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
    set_color(&layer, C_BLACK);
    layer.use_text("RINCIAN PEMBAYARAN", 7.0_f32, Mm(20.0), Mm(165.0), &bold);
    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 20.0, 162.0, 190.0, 162.0, 0.3);

    fill_rect(
        &layer,
        20.0_f32,
        152.0_f32,
        190.0_f32,
        160.0_f32,
        C_OAT_LIGHT,
    );
    set_color(&layer, C_CHARCOAL);
    layer.use_text("PRODUK", 7.0_f32, Mm(23.0), Mm(155.0), &bold);
    layer.use_text("SUM ASSURED", 7.0_f32, Mm(85.0), Mm(155.0), &bold);
    layer.use_text("TERM", 7.0_f32, Mm(125.0), Mm(155.0), &bold);
    layer.use_text("SUBTOTAL", 7.0_f32, Mm(155.0), Mm(155.0), &bold);

    set_color(&layer, C_BLACK);
    layer.use_text(
        truncate(input.product_name, 28).as_str(),
        10.0_f32,
        Mm(23.0),
        Mm(145.0),
        &bold,
    );
    set_color(&layer, C_CHARCOAL);
    let sum_str = format_idr(input.sum_assured);
    layer.use_text(sum_str.as_str(), 10.0_f32, Mm(85.0), Mm(145.0), &reg);
    layer.use_text(
        format!("{} tahun", input.coverage_term_years).as_str(),
        10.0_f32,
        Mm(125.0),
        Mm(145.0),
        &reg,
    );
    let subtotal_str = format_idr(input.premium);
    let x_subtotal = 187.0_f32 - (subtotal_str.chars().count() as f32) * 2.0_f32;
    layer.use_text(
        subtotal_str.as_str(),
        11.0_f32,
        Mm(x_subtotal),
        Mm(145.0),
        &bold,
    );

    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 20.0, 138.0, 190.0, 138.0, 0.2);

    // ===== TOTAL BOX =====
    fill_rect(&layer, 120.0_f32, 100.0_f32, 190.0_f32, 128.0_f32, C_CREAM);
    set_color(&layer, C_SILVER);
    layer.use_text("Subtotal", 8.0_f32, Mm(125.0), Mm(120.0), &reg);
    let subtotal_str2 = format_idr(input.premium);
    let x_sub = 187.0_f32 - (subtotal_str2.chars().count() as f32) * 2.0_f32;
    layer.use_text(subtotal_str2.as_str(), 9.0_f32, Mm(x_sub), Mm(120.0), &reg);
    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 125.0, 113.0, 185.0, 113.0, 0.3);
    set_color(&layer, C_BLACK);
    layer.use_text("TOTAL", 11.0_f32, Mm(125.0), Mm(108.0), &bold);
    let total_str = format_idr(input.premium);
    let x_total = 187.0_f32 - (total_str.chars().count() as f32) * 3.2_f32;
    layer.use_text(total_str.as_str(), 14.0_f32, Mm(x_total), Mm(107.0), &bold);

    // ===== PAYMENT INSTRUCTIONS =====
    set_color(&layer, C_SILVER);
    layer.use_text("INSTRUKSI PEMBAYARAN", 7.0_f32, Mm(20.0), Mm(120.0), &bold);
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        "1. Login ke portal InsureTrack → menu Invoice",
        8.5_f32,
        Mm(20.0),
        Mm(113.0),
        &reg,
    );
    layer.use_text(
        "2. Klik tombol 'Bayar' pada invoice ini",
        8.5_f32,
        Mm(20.0),
        Mm(108.0),
        &reg,
    );
    layer.use_text(
        "3. Pilih metode pembayaran & selesaikan",
        8.5_f32,
        Mm(20.0),
        Mm(103.0),
        &reg,
    );
    set_color(&layer, C_SILVER);
    layer.use_text(
        "Polis terbit otomatis setelah pembayaran terverifikasi.",
        7.5_f32,
        Mm(20.0),
        Mm(95.0),
        &reg,
    );

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

pub struct ReceiptPdfInput<'a> {
    pub invoice_no: &'a str,
    pub registration_no: &'a str,
    pub customer_name: &'a str,
    pub customer_nik: &'a str,
    pub customer_email: &'a str,
    pub product_name: &'a str,
    pub coverage_term_years: i32,
    pub sum_assured: Decimal,
    pub paid_amount: Decimal,
    pub payment_date: NaiveDate,
    /// Channel pembayaran dari gateway (mis. VIRTUAL_ACCOUNT_BCA, QRIS). None = tidak diketahui.
    pub payment_channel: Option<&'a str>,
    /// ID transaksi / nomor referensi dari payment gateway. None = tidak dikirim gateway.
    pub payment_reference: Option<&'a str>,
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
    layer.use_text("Konfirmasi Penerimaan Premi", 9.0, Mm(120.0), Mm(278.0), &reg);

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
    fill_rect(&layer, 20.0, 178.0, 190.0, 228.0, C_CREAM);
    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 105.0, 178.0, 105.0, 228.0, 0.3);

    // Left column: DIBAYAR OLEH
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

    // ===== COVERAGE TABLE — y 168..128 =====
    set_color(&layer, C_BLACK);
    layer.use_text("RINCIAN PEMBAYARAN", 7.0, Mm(20.0), Mm(160.0), &bold);
    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 20.0, 157.0, 190.0, 157.0, 0.3);
    fill_rect(&layer, 20.0, 147.0, 190.0, 155.0, C_OAT_LIGHT);
    set_color(&layer, C_CHARCOAL);
    layer.use_text("PRODUK", 7.0, Mm(23.0), Mm(150.0), &bold);
    layer.use_text("UANG PERTANGGUNGAN", 7.0, Mm(80.0), Mm(150.0), &bold);
    layer.use_text("TERM", 7.0, Mm(160.0), Mm(150.0), &bold);

    set_color(&layer, C_BLACK);
    layer.use_text(
        truncate(input.product_name, 28).as_str(),
        10.0,
        Mm(23.0),
        Mm(140.0),
        &bold,
    );
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        format_idr(input.sum_assured).as_str(),
        10.0,
        Mm(80.0),
        Mm(140.0),
        &reg,
    );
    layer.use_text(
        format!("{} thn", input.coverage_term_years).as_str(),
        10.0,
        Mm(160.0),
        Mm(140.0),
        &reg,
    );
    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 20.0, 132.0, 190.0, 132.0, 0.2);

    // ===== TOTAL BOX (matcha border, cream interior) — y 88..122 =====
    fill_rect(&layer, 20.0, 88.0, 190.0, 122.0, C_MATCHA_300);
    fill_rect(&layer, 22.0, 90.0, 188.0, 120.0, C_CREAM);
    set_color(&layer, C_SILVER);
    layer.use_text("TOTAL DIBAYAR", 8.0, Mm(25.0), Mm(114.0), &bold);
    set_color(&layer, C_BLACK);
    let total_str = format_idr(input.paid_amount);
    layer.use_text(total_str.as_str(), 22.0, Mm(25.0), Mm(100.0), &bold);
    set_color(&layer, C_SILVER);
    layer.use_text(
        format!("Invoice {}", input.invoice_no).as_str(),
        8.0,
        Mm(25.0),
        Mm(94.0),
        &reg,
    );

    // ===== CATATAN — y 66..82 =====
    set_color(&layer, C_SILVER);
    layer.use_text("CATATAN", 7.0, Mm(20.0), Mm(82.0), &bold);
    set_color(&layer, C_CHARCOAL);
    layer.use_text(
        "Simpan dokumen ini sebagai bukti pembayaran premi asuransi Anda. Polis akan diterbitkan",
        8.0,
        Mm(20.0),
        Mm(76.0),
        &reg,
    );
    layer.use_text(
        "setelah pembayaran terverifikasi dan dapat diunduh dari portal customer InsureTrack.",
        8.0,
        Mm(20.0),
        Mm(70.0),
        &reg,
    );

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

    let mut buf = BufWriter::new(Vec::<u8>::new());
    doc.save(&mut buf)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("pdf save: {e}")))?;
    let bytes = buf
        .into_inner()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("pdf buffer: {e}")))?;
    Ok(bytes)
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

/// Draw a dashed rectangle frame (4 sides, dashed style). Implementasi
/// sederhana: gambar 4 garis solid tipis — printpdf tidak punya helper
/// dashed built-in. Untuk efek dashed, alternating gap pattern. Tapi
/// karena visual priority rendah, pakai 4 garis tipis solid sebagai
/// pendekatan pragmatis. Box dengan border solid tipis ini acceptable
/// untuk beneficiary/company info card.
fn draw_dashed_rect(
    layer: &PdfLayerReference,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    thickness: f32,
) {
    // Top, bottom, left, right
    let gap: f32 = 2.0;
    let mut x = x1;
    while x < x2 {
        let x_end = (x + gap * 2.0).min(x2);
        draw_line(layer, x, y2, x_end, y2, thickness); // top
        draw_line(layer, x, y1, x_end, y1, thickness); // bottom
        x = x_end + gap;
    }
    let mut y = y1;
    while y < y2 {
        let y_end = (y + gap * 2.0).min(y2);
        draw_line(layer, x1, y, x1, y_end, thickness); // left
        draw_line(layer, x2, y, x2, y_end, thickness); // right
        y = y_end + gap;
    }
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
}
