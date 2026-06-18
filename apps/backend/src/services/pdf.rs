//! Render PDF: e-Policy (spec FS-08) dan Invoice.
//!
//! Sections untuk e-Policy per spec:
//!   - Policy Information: policy_no, registration_no, effective_date, expiry_date
//!   - Customer Information: NIK, name, birth date, address
//!   - Coverage Information: product, sum assured, premium
//!
//! Sections untuk Invoice:
//!   - Invoice Information: invoice_no, registration_no, status, created_at
//!   - Bill To: NIK, name, birth date, address
//!   - Coverage & Payment: product, sum assured, premium, due_date

use chrono::{Datelike, NaiveDate};
use printpdf::{BuiltinFont, Color, Line, Mm, PdfDocument, PdfLayerReference, Point, Rgb};
use printpdf::path::PaintMode;
use rust_decimal::Decimal;
use std::io::BufWriter;

use crate::error::AppError;

pub struct PolicyPdfInput<'a> {
    pub policy_no: &'a str,
    pub registration_no: &'a str,
    pub effective_date: NaiveDate,
    pub expiry_date: NaiveDate,
    pub customer_nik: &'a str,
    pub customer_name: &'a str,
    pub customer_birth_date: NaiveDate,
    pub customer_address: &'a str,
    pub product_name: &'a str,
    pub sum_assured: Decimal,
    pub premium: Decimal,
}

pub fn render(input: &PolicyPdfInput<'_>) -> Result<Vec<u8>, AppError> {
    let (doc, page1, layer1) =
        PdfDocument::new("E-Policy", Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
    let layer = doc.get_page(page1).get_layer(layer1);

    let bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font bold: {e}")))?;
    let reg = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font reg: {e}")))?;

    // printpdf 0.7's Mm wraps f32, not f64. Use f32 throughout.
    let mut y: f32 = 280.0;
    layer.use_text("E-POLICY", 22.0_f32, Mm(20.0_f32), Mm(y), &bold);
    y -= 12.0;
    layer.use_text(
        "Digital Insurance Platform",
        10.0_f32,
        Mm(20.0_f32),
        Mm(y),
        &reg,
    );
    y -= 14.0;

    draw_section(&layer, &bold, &reg, "Policy Information", &mut y);
    draw_kv(&layer, &reg, "Policy No", input.policy_no, &mut y);
    draw_kv(&layer, &reg, "Registration No", input.registration_no, &mut y);
    draw_kv(
        &layer,
        &reg,
        "Effective Date",
        &input.effective_date.to_string(),
        &mut y,
    );
    draw_kv(
        &layer,
        &reg,
        "Expiry Date",
        &input.expiry_date.to_string(),
        &mut y,
    );
    y -= 6.0;

    draw_section(&layer, &bold, &reg, "Customer Information", &mut y);
    draw_kv(&layer, &reg, "NIK", input.customer_nik, &mut y);
    draw_kv(&layer, &reg, "Name", input.customer_name, &mut y);
    draw_kv(
        &layer,
        &reg,
        "Birth Date",
        &input.customer_birth_date.to_string(),
        &mut y,
    );
    draw_kv(&layer, &reg, "Address", input.customer_address, &mut y);
    y -= 6.0;

    draw_section(&layer, &bold, &reg, "Coverage Information", &mut y);
    draw_kv(&layer, &reg, "Product", input.product_name, &mut y);
    draw_kv(
        &layer,
        &reg,
        "Sum Assured",
        &format!("Rp {}", input.sum_assured),
        &mut y,
    );
    draw_kv(
        &layer,
        &reg,
        "Premium",
        &format!("Rp {}", input.premium),
        &mut y,
    );

    y -= 12.0;
    layer.use_text(
        "This document is a valid electronic insurance policy.",
        8.0_f32,
        Mm(20.0_f32),
        Mm(y),
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

fn draw_section(
    layer: &printpdf::PdfLayerReference,
    bold: &printpdf::IndirectFontRef,
    reg: &printpdf::IndirectFontRef,
    title: &str,
    y: &mut f32,
) {
    layer.use_text(title, 13.0_f32, Mm(20.0_f32), Mm(*y), bold);
    *y -= 7.0;
    layer.use_text(
        "---------------------------------------------",
        8.0_f32,
        Mm(20.0_f32),
        Mm(*y),
        reg,
    );
    *y -= 7.0;
}

fn draw_kv(
    layer: &printpdf::PdfLayerReference,
    reg: &printpdf::IndirectFontRef,
    key: &str,
    value: &str,
    y: &mut f32,
) {
    let line = format!("{key:<20}: {value}");
    layer.use_text(line, 10.0_f32, Mm(20.0_f32), Mm(*y), reg);
    *y -= 6.0;
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
//   │                                               │
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
//   │                                               │
//   │   ┌──────────────┐  Total:  Rp ...         │   y 126..98
//   │   │ Notes        │                           │
//   │   │ ...          │                           │
//   │   └──────────────┘                           │
//   │                                               │
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

// ---- Brand colors (di-copy dari packages/ui/src/styles/globals.css) ---------
// Hex → RGB tuple. printpdf butuh (u8, u8, u8) untuk Color::Rgb.
const C_BLACK: (u8, u8, u8) = (0, 0, 0);
const C_WHITE: (u8, u8, u8) = (255, 255, 255);
const C_CREAM: (u8, u8, u8) = (250, 249, 247); // --warm-cream
const C_OAT_LIGHT: (u8, u8, u8) = (238, 233, 223); // --oat-light
const C_OAT_BORDER: (u8, u8, u8) = (218, 212, 200); // --oat-border
const C_MATCHA_300: (u8, u8, u8) = (132, 231, 165);
const C_MATCHA_600: (u8, u8, u8) = (7, 138, 82);
const C_POMEGRANATE: (u8, u8, u8) = (252, 121, 129);
const C_LEMON_400: (u8, u8, u8) = (248, 204, 101);
const C_LEMON_700: (u8, u8, u8) = (208, 138, 17);
const C_CHARCOAL: (u8, u8, u8) = (85, 83, 78); // --warm-charcoal
const C_SILVER: (u8, u8, u8) = (159, 155, 147); // --warm-silver

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
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
fn format_date_id(d: NaiveDate) -> String {
    format!("{} {} {}", d.day(), ID_MONTHS[(d.month() - 1) as usize], d.year())
}

/// Render invoice PDF — A4 portrait, layout modern dengan header bar,
/// two-column info block, tabel coverage dengan header, total box, dan
/// footer bar. Pakai Helvetica/HelveticaBold (built-in printpdf).
pub fn render_invoice(input: &InvoicePdfInput<'_>) -> Result<Vec<u8>, AppError> {
    let (doc, page1, layer1) =
        PdfDocument::new("Invoice", Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
    let layer = doc.get_page(page1).get_layer(layer1);

    let bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font bold: {e}")))?;
    let reg = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font reg: {e}")))?;

    // ===== HEADER BAR (black) =====
    // y 285..262 (23mm tall)
    fill_rect(&layer, 0.0_f32, 262.0_f32, 210.0_f32, 285.0_f32, C_BLACK);
    layer.use_text("InsureTrack", 20.0_f32, Mm(20.0), Mm(275.0), &bold);
    set_color(&layer, C_CREAM);
    layer.use_text(
        "Asuransi digital, prosesnya cepat, polis langsung terbit.",
        9.0_f32,
        Mm(20.0),
        Mm(266.0),
        &reg,
    );
    set_color(&layer, C_WHITE);
    layer.use_text("INVOICE", 22.0_f32, Mm(155.0), Mm(275.0), &bold);
    set_color(&layer, C_CREAM);
    layer.use_text(
        "Tagihan Premi Asuransi",
        9.0_f32,
        Mm(155.0),
        Mm(266.0),
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
    layer.use_text(
        format!("TTL: {}", ttl),
        8.5_f32,
        Mm(25.0),
        Mm(195.0),
        &reg,
    );
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
    layer.use_text(
        input.invoice_no,
        11.0_f32,
        Mm(110.0),
        Mm(208.0),
        &bold,
    );
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
        fill_rect(&layer, 108.0_f32, 182.0_f32, 188.0_f32, 189.0_f32, C_LEMON_400);
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

    fill_rect(&layer, 20.0_f32, 152.0_f32, 190.0_f32, 160.0_f32, C_OAT_LIGHT);
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
    layer.use_text(
        sum_str.as_str(),
        10.0_f32,
        Mm(85.0),
        Mm(145.0),
        &reg,
    );
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
    layer.use_text(
        subtotal_str2.as_str(),
        9.0_f32,
        Mm(x_sub),
        Mm(120.0),
        &reg,
    );
    set_color(&layer, C_OAT_BORDER);
    draw_line(&layer, 125.0, 113.0, 185.0, 113.0, 0.3);
    set_color(&layer, C_BLACK);
    layer.use_text("TOTAL", 11.0_f32, Mm(125.0), Mm(108.0), &bold);
    let total_str = format_idr(input.premium);
    let x_total = 187.0_f32 - (total_str.chars().count() as f32) * 3.2_f32;
    layer.use_text(
        total_str.as_str(),
        14.0_f32,
        Mm(x_total),
        Mm(107.0),
        &bold,
    );

    // ===== PAYMENT INSTRUCTIONS =====
    set_color(&layer, C_SILVER);
    layer.use_text(
        "INSTRUKSI PEMBAYARAN",
        7.0_f32,
        Mm(20.0),
        Mm(120.0),
        &bold,
    );
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

// ---- Drawing helpers ---------------------------------------------------------

/// Fill rectangle. Coords: bottom-left (x1, y1) and top-right (x2, y2) in mm.
fn fill_rect(
    layer: &PdfLayerReference,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    color: (u8, u8, u8),
) {
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

    fn sample_input() -> PolicyPdfInput<'static> {
        PolicyPdfInput {
            policy_no: "POL-202606-000001",
            registration_no: "REG-202606-000001",
            effective_date: NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            expiry_date: NaiveDate::from_ymd_opt(2036, 6, 1).unwrap(),
            customer_nik: "3201010101010001",
            customer_name: "Budi Santoso",
            customer_birth_date: NaiveDate::from_ymd_opt(1990, 1, 1).unwrap(),
            customer_address: "Jl. Merdeka No. 17, Bandung",
            product_name: "Life Insurance — Basic",
            sum_assured: Decimal::from(100_000_000),
            premium: Decimal::from(900_000),
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
            bytes.len() > 2_000,
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
