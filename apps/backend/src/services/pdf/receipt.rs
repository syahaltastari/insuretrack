//! Render Bukti Pembayaran PDF — 1 halaman A4 portrait + lampiran kalau INSTANSI.
//!
//! Layout: Header → Title → TwoColumnCard → CoverageTable → [BeneficiaryBox] → TotalBox → PaymentInstructions → Footer + Lampiran.

use printpdf::{BuiltinFont, Mm, PdfDocument};
use std::io::BufWriter;

use crate::error::AppError;
use crate::services::pdf::{
    helpers::set_color,
    inputs::ReceiptPdfInput,
    sections::{
        beneficiary_box, coverage_table, footer_bar, footer_notice, header_bar, participants_table,
        title_status, total_box, two_column_card,
    },
    theme::C_SILVER,
};

/// Render Bukti Pembayaran PDF.
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
    let italic = doc
        .add_builtin_font(BuiltinFont::HelveticaOblique)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("font italic: {e}")))?;
    let _ = italic;

    let mut y = 297.0_f32;

    // Header
    y = header_bar::HeaderBar::FullCover {
        doc_label: "BUKTI PEMBAYARAN",
        subtitle: "Konfirmasi Penerimaan Premi",
    }
    .render(&layer, &bold, &reg, y);

    // Title
    y = title_status::TitleStatus::Receipt.render(&layer, &bold, &reg, &italic, y);

    // TwoColumnCard
    let card_kind = two_column_card::TwoColumnKind::ReceiptPayer {
        applicant_type: input.applicant_type,
        company_name: input.company_name.clone(),
        company_npwp: input.company_npwp.clone(),
        pic_name: input.customer_name,
        pic_nik: input.customer_nik,
        pic_email: input.customer_email,
        customer_name: input.customer_name,
        customer_nik: input.customer_nik,
        customer_email: input.customer_email,
        invoice_no: input.invoice_no,
        registration_no: input.registration_no,
        payment_date: input.payment_date,
        payment_channel: input.payment_channel,
        payment_reference: input.payment_reference,
    };
    y = two_column_card::render(&card_kind, &layer, &bold, &reg, y);

    // Coverage table — effective_date = payment_date + 1 day (periode dimulai besok)
    let effective = input.payment_date + chrono::Duration::days(1);
    let coverage = coverage_table::CoverageTable {
        variant: coverage_table::CoverageVariant::Receipt {
            effective_date: effective,
        },
        product_name: input.product_name,
        plan_tier: input.plan_tier.as_deref(),
        sum_assured: input.sum_assured,
        premium: input.paid_amount,
        coverage_term_years: input.coverage_term_years,
        applicant_type: input.applicant_type,
        per_participant_premium: input.per_participant_premium,
        participant_count: input.participants.len(),
    };
    y = coverage.render(&layer, &bold, &reg, y);

    // Beneficiary (LIFE only)
    if input.product_code == "LIFE" {
        if let Some(b) = beneficiary_box::BeneficiaryBox::new(input.beneficiary_name.as_deref()) {
            y = b.render(&layer, &bold, &italic, y);
        }
    }

    // Total box
    y = total_box::TotalBox::receipt(input.paid_amount, input.invoice_no)
        .render(&layer, &bold, &reg, y);

    // Catatan
    y = footer_notice::PaymentInstructions {
        kind: footer_notice::PaymentKind::Receipt,
    }
    .render(&layer, &bold, &reg, y);

    // Free-look reminder
    if y > 25.0 {
        set_color(&layer, C_SILVER);
        layer.use_text(
            "Free-look 30 hari: pembatalan dalam 30 hari sejak tanggal di atas = pengembalian premi penuh.",
            7.0,
            Mm(20.0),
            Mm(y),
            &reg,
        );
    }

    // Footer
    footer_bar::FooterBar::Receipt.render(&layer, &bold, &reg);

    // Lampiran
    participants_table::render(
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

#[cfg(test)]
mod tests {
    use super::super::tests_fixtures::{
        assert_valid_pdf, sample_participants, sample_receipt_input,
    };
    use super::*;

    #[test]
    fn render_receipt_individu_smoke() {
        let bytes = render_receipt(&sample_receipt_input(Vec::new())).unwrap();
        assert_valid_pdf(&bytes);
    }

    #[test]
    fn render_receipt_instansi_appends_lampiran() {
        let individu = render_receipt(&sample_receipt_input(Vec::new())).unwrap();
        let instansi_3 = render_receipt(&sample_receipt_input(sample_participants(3))).unwrap();
        assert!(instansi_3.len() > individu.len());
    }

    #[test]
    fn render_receipt_instansi_pagination_scales() {
        let small = render_receipt(&sample_receipt_input(sample_participants(3))).unwrap();
        let large = render_receipt(&sample_receipt_input(sample_participants(50))).unwrap();
        assert!(large.len() > small.len());
        assert!(large.len() > 10_000);
    }

    #[test]
    fn render_receipt_life_with_beneficiary_larger_than_without() {
        let with_b = sample_receipt_input(Vec::new());
        let mut without_b = sample_receipt_input(Vec::new());
        without_b.beneficiary_name = None;
        let bytes_with = render_receipt(&with_b).unwrap();
        let bytes_without = render_receipt(&without_b).unwrap();
        assert!(bytes_with.len() > bytes_without.len());
    }

    #[test]
    fn render_receipt_instansi_with_company_larger_than_individu() {
        let individu = render_receipt(&sample_receipt_input(Vec::new())).unwrap();
        let instansi = render_receipt(&sample_receipt_input(sample_participants(3))).unwrap();
        assert!(instansi.len() > individu.len());
    }

    #[test]
    fn render_receipt_with_plan_tier_larger_than_without() {
        let with_tier = render_receipt(&sample_receipt_input(Vec::new())).unwrap();
        let mut without_tier = sample_receipt_input(Vec::new());
        without_tier.plan_tier = None;
        let without_bytes = render_receipt(&without_tier).unwrap();
        assert!(with_tier.len() > without_bytes.len());
    }
}
