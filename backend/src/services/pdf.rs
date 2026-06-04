//! Render e-Policy PDF (spec FS-08).
//!
//! Sections per spec:
//!   - Policy Information: policy_no, registration_no, effective_date, expiry_date
//!   - Customer Information: NIK, name, birth date, address
//!   - Coverage Information: product, sum assured, premium

use chrono::NaiveDate;
use printpdf::{BuiltinFont, Mm, PdfDocument};
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
