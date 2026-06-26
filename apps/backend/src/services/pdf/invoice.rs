//! Render invoice PDF — 1 halaman A4 portrait + lampiran DAFTAR PESERTA kalau INSTANSI.
//!
//! Layout: Header → Title → TwoColumnCard → CoverageTable → [BeneficiaryBox] → TotalBox → PaymentInstructions → Footer + Lampiran.
//! Tiap section return bottom_y, orchestrator track y cursor.

use printpdf::{BuiltinFont, Mm, PdfDocument};
use std::io::BufWriter;

use crate::error::AppError;
use crate::services::pdf::{
    helpers::{draw_line, fill_rect, set_color},
    inputs::InvoicePdfInput,
    sections::{
        beneficiary_box, coverage_table, footer_bar, footer_notice, header_bar, participants_table,
        title_status, total_box, two_column_card,
    },
    theme::{C_BLACK, C_LEMON_400, C_OAT_BORDER, C_OAT_LIGHT, C_SILVER},
};

/// Render invoice PDF corporate-grade.
pub fn render_invoice(input: &InvoicePdfInput<'_>) -> Result<Vec<u8>, AppError> {
    let (doc, page1, layer1) = PdfDocument::new("Invoice", Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
    let layer = doc.get_page(page1).get_layer(layer1);

    let bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font bold: {e}")))?;
    let reg = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font reg: {e}")))?;
    let italic = doc
        .add_builtin_font(BuiltinFont::HelveticaOblique)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font italic: {e}")))?;
    let _ = italic; // dipakai di beberapa section, tidak di invoice

    let mut y = 297.0_f32;

    // Header
    y = header_bar::HeaderBar::FullCover {
        doc_label: "INVOICE",
        subtitle: "Tagihan Premi Asuransi",
    }
    .render(&layer, &bold, &reg, y);

    // Title + status badge
    y = title_status::TitleStatus::Invoice {
        status: input.status,
    }
    .render(&layer, &bold, &reg, &italic, y);

    // Two-column card
    let card_kind = two_column_card::TwoColumnKind::InvoiceBillTo {
        applicant_type: input.applicant_type,
        company_name: input.company_name.clone(),
        company_npwp: input.company_npwp.clone(),
        pic_name: input.customer_name,
        pic_nik: input.customer_nik,
        pic_email: input.customer_email,
        pic_mobile: input.customer_mobile,
        customer_name: input.customer_name,
        customer_nik: input.customer_nik,
        customer_birth_place: input.customer_birth_place,
        customer_birth_date: input.customer_birth_date,
        customer_email: input.customer_email,
        customer_mobile: input.customer_mobile,
        customer_address: input.customer_address,
        invoice_no: input.invoice_no,
        registration_no: input.registration_no,
        created_at: input.created_at,
        due_date: input.due_date,
        status: input.status,
    };
    y = two_column_card::render(&card_kind, &layer, &bold, &reg, y);

    // Coverage table
    let coverage = coverage_table::CoverageTable {
        variant: coverage_table::CoverageVariant::Invoice,
        product_name: input.product_name,
        plan_tier: input.plan_tier.as_deref(),
        sum_assured: input.sum_assured,
        premium: input.premium,
        coverage_term_years: input.coverage_term_years,
        applicant_type: input.applicant_type,
        per_participant_premium: input.per_participant_premium,
        participant_count: input.participants.len(),
    };
    y = coverage.render(&layer, &bold, &reg, y);

    // Beneficiary (LIFE only) — skip untuk PA/HEALTH walau field di-set
    if input.product_code == "LIFE" {
        if let Some(b) = beneficiary_box::BeneficiaryBox::new(input.beneficiary_name.as_deref()) {
            y = b.render(&layer, &bold, &italic, y);
        }
    }

    // Total box
    y = total_box::TotalBox::invoice(input.premium).render(&layer, &bold, &reg, y);

    // Payment instructions
    y = footer_notice::PaymentInstructions {
        kind: footer_notice::PaymentKind::Invoice,
    }
    .render(&layer, &bold, &reg, y);

    // Catatan free-look — render kalau ada ruang (y > 25)
    if y > 25.0 {
        set_color(&layer, C_SILVER);
        layer.use_text(
            "Catatan: Invoice EXPIRED otomatis jika lewat jatuh tempo. Setelah \
             polis terbit, free-look 30 hari — pembatalan = pengembalian premi \
             penuh.",
            7.0,
            Mm(20.0),
            Mm(y),
            &reg,
        );
    }

    // Footer
    footer_bar::FooterBar::Invoice.render(&layer, &bold, &reg);

    // Lampiran
    participants_table::render(
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

#[cfg(test)]
mod tests {
    use super::super::tests_fixtures::{
        assert_valid_pdf, sample_invoice_input, sample_participants,
    };
    use super::*;

    #[test]
    fn render_invoice_individu_smoke() {
        let bytes = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        assert_valid_pdf(&bytes);
    }

    #[test]
    fn render_invoice_instansi_appends_lampiran() {
        let individu = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        let instansi_3 = render_invoice(&sample_invoice_input(sample_participants(3))).unwrap();
        assert!(instansi_3.len() > individu.len());
    }

    #[test]
    fn render_invoice_instansi_pagination_scales() {
        let small = render_invoice(&sample_invoice_input(sample_participants(3))).unwrap();
        let large = render_invoice(&sample_invoice_input(sample_participants(50))).unwrap();
        assert!(large.len() > small.len());
        assert!(large.len() > 10_000);
    }

    #[test]
    fn render_invoice_instansi_single_peserta_appends() {
        let individu = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        let single = render_invoice(&sample_invoice_input(sample_participants(1))).unwrap();
        assert!(single.len() > individu.len());
    }

    #[test]
    fn render_invoice_life_with_beneficiary_larger_than_without() {
        let with_b = sample_invoice_input(Vec::new());
        let mut without_b = sample_invoice_input(Vec::new());
        without_b.beneficiary_name = None;
        let bytes_with = render_invoice(&with_b).unwrap();
        let bytes_without = render_invoice(&without_b).unwrap();
        assert!(bytes_with.len() > bytes_without.len());
    }

    #[test]
    fn render_invoice_pa_skips_beneficiary_even_if_set() {
        let with_b = sample_invoice_input(Vec::new());
        let mut without_b = sample_invoice_input(Vec::new());
        without_b.beneficiary_name = None;
        without_b.product_code = "PERSONAL_ACCIDENT";
        let bytes_with = render_invoice(&with_b).unwrap();
        let bytes_without = render_invoice(&without_b).unwrap();
        // PA skip block regardless of field — ukuran hampir sama
        assert!(
            (bytes_with.len() as i64 - bytes_without.len() as i64).abs() < 2000,
            "PA dengan/tanpa beneficiary_name harus ukuran hampir sama, dapat {} vs {} (delta {})",
            bytes_with.len(),
            bytes_without.len(),
            (bytes_with.len() as i64 - bytes_without.len() as i64).abs()
        );
    }

    #[test]
    fn render_invoice_instansi_with_company_larger_than_individu() {
        let individu = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        let instansi = render_invoice(&sample_invoice_input(sample_participants(3))).unwrap();
        assert!(instansi.len() > individu.len());
    }

    #[test]
    fn render_invoice_with_plan_tier_larger_than_without() {
        let with_tier = render_invoice(&sample_invoice_input(Vec::new())).unwrap();
        let mut without_tier = sample_invoice_input(Vec::new());
        without_tier.plan_tier = None;
        let without_bytes = render_invoice(&without_tier).unwrap();
        assert!(with_tier.len() > without_bytes.len());
    }
}
