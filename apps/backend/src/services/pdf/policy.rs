//! Render e-Policy PDF — 3 halaman A4 portrait corporate-grade.
//!
//! Page 1: Header → Title → 3 Info Boxes → Footer Notice → Footer
//! Page 2: Header → TwoColumnCard → CoverageTable → [BeneficiaryBox] → [CompanyBox] → Footer
//! Page 3: Header → BenefitList → TermsList → SignatureBlock → Footer

use printpdf::{BuiltinFont, Mm, PdfDocument};
use std::io::BufWriter;

use crate::error::AppError;
use crate::services::pdf::{
    helpers::set_color,
    inputs::PolicyPdfInput,
    sections::{
        beneficiary_box, benefit_list, company_box, coverage_table, footer_bar, footer_notice,
        header_bar, info_boxes, terms_list, title_status, two_column_card,
    },
    theme::{C_BLACK, C_OAT_BORDER, C_SILVER},
};

pub fn render(input: &PolicyPdfInput<'_>) -> Result<Vec<u8>, AppError> {
    let (doc, page1, layer1) =
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
    let layer = doc.get_page(page1).get_layer(layer1);
    let mut y = 297.0_f32;

    // Header mini untuk page 1 e-Policy sebenarnya full cover juga, tapi versi
    // monolith pakai style mirip MiniPolicy. Kita pakai FullCover dengan label
    // "E-POLICY" supaya lebih informatif — atau tetap MiniPolicy style.
    // Monolith: brand 18pt "InsureTrack", "POLIS ASURANSI DIGITAL" 8.5pt — pakai custom.
    // Untuk simplicity: pakai HeaderBar::FullCover dengan "E-POLICY" label.
    y = header_bar::HeaderBar::FullCover {
        doc_label: "POLIS ASURANSI DIGITAL",
        subtitle: "Asuransi digital, prosesnya cepat, polis langsung terbit.",
    }
    .render(&layer, &bold, &reg, y);

    // Title + status badge + nomor polis (termasuk 3 info boxes di height)
    y = title_status::TitleStatus::policy(input.product_name, input.policy_no)
        .render(&layer, &bold, &reg, &italic, y);

    // 3 info boxes (Masa Berlaku | Uang Pertanggungan | Premi)
    let info_boxes = info_boxes::PolicyScheduleBoxes {
        effective_date: input.effective_date,
        expiry_date: input.expiry_date,
        coverage_term_years: input.coverage_term_years,
        sum_assured: input.sum_assured,
        premium: input.premium,
    };
    y = info_boxes.render(&layer, &bold, &italic, &reg, y);

    // Footer notice (italic)
    y = footer_notice::FooterNotice::render(&layer, &italic, y);

    // Footer page 1
    footer_bar::FooterBar::PolicyStandard {
        policy_no: input.policy_no,
        page_label: "Halaman 1 dari 3",
    }
    .render(&layer, &bold, &reg);

    // =========================================================================
    // HALAMAN 2 — IKHTISAR POLIS (Policy Schedule)
    // =========================================================================
    let (page2, layer2_id) = doc.add_page(Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
    let layer = doc.get_page(page2).get_layer(layer2_id);
    let mut y = 297.0_f32;

    // Header mini + page label "Halaman 2 dari 3"
    y = header_bar::HeaderBar::MiniPolicy {
        page_label: "Halaman 2 dari 3",
    }
    .render(&layer, &bold, &reg, y);

    // Judul seksi IKHTISAR POLIS + No. Polis & Diterbitkan
    set_color(&layer, C_BLACK);
    layer.use_text("IKHTISAR POLIS", 13.0, Mm(15.0), Mm(y - 9.5), &bold);
    set_color(&layer, (85, 83, 78));
    layer.use_text(
        format!(
            "No. Polis: {}   ·   Diterbitkan: {}",
            input.policy_no,
            crate::services::pdf::helpers::format_date_id(input.effective_date)
        )
        .as_str(),
        8.5,
        Mm(15.0),
        Mm(y - 17.5),
        &reg,
    );
    set_color(&layer, C_BLACK);
    crate::services::pdf::helpers::draw_line(&layer, 15.0, y - 21.5, 195.0, y - 21.5, 0.5);
    y -= 26.0; // geser ke y=271.0 (di bawah IKHTISAR POLIS header)

    // TwoColumnCard
    let gender_label = match input.customer_gender {
        "MALE" => "Laki-laki",
        "FEMALE" => "Perempuan",
        other => other,
    };
    let left_rows = vec![
        two_column_card::CardRow {
            label: "NIK",
            value: input.customer_nik.to_string(),
        },
        two_column_card::CardRow {
            label: "Tempat Lahir",
            value: input.customer_birth_place.to_string(),
        },
        two_column_card::CardRow {
            label: "Tanggal Lahir",
            value: crate::services::pdf::helpers::format_date_id(input.customer_birth_date),
        },
        two_column_card::CardRow {
            label: "Jenis Kelamin",
            value: gender_label.to_string(),
        },
        two_column_card::CardRow {
            label: "Email",
            value: crate::services::pdf::helpers::truncate(input.customer_email, 26),
        },
        two_column_card::CardRow {
            label: "No. HP",
            value: input.customer_mobile.to_string(),
        },
    ];
    let right_rows = vec![
        two_column_card::CardRow {
            label: "No. Polis",
            value: input.policy_no.to_string(),
        },
        two_column_card::CardRow {
            label: "No. Registrasi",
            value: input.registration_no.to_string(),
        },
        two_column_card::CardRow {
            label: "Produk",
            value: input.product_name.to_string(),
        },
        two_column_card::CardRow {
            label: "Plan / Tier",
            value: input.plan_tier.as_deref().unwrap_or("-").to_string(),
        },
        two_column_card::CardRow {
            label: "Tanggal Berlaku",
            value: crate::services::pdf::helpers::format_date_id(input.effective_date),
        },
        two_column_card::CardRow {
            label: "Tanggal Berakhir",
            value: crate::services::pdf::helpers::format_date_id(input.expiry_date),
        },
        two_column_card::CardRow {
            label: "Masa Perlindungan",
            value: format!("{} Tahun", input.coverage_term_years),
        },
    ];
    let card_kind = two_column_card::TwoColumnKind::PolicySchedule {
        left_title: "PEMEGANG POLIS",
        right_title: "DATA POLIS",
        left_rows,
        right_rows,
        alamat: Some(input.customer_address.to_string()),
    };
    y = two_column_card::render(&card_kind, &layer, &bold, &reg, y);

    // Coverage table
    let coverage = coverage_table::CoverageTable {
        variant: coverage_table::CoverageVariant::Policy,
        product_name: input.product_name,
        plan_tier: input.plan_tier.as_deref(),
        sum_assured: input.sum_assured,
        premium: input.premium,
        coverage_term_years: input.coverage_term_years,
        applicant_type: if input.company_name.is_some() {
            "INSTANSI"
        } else {
            "INDIVIDU"
        },
        per_participant_premium: None,
        participant_count: 0,
    };
    y = coverage.render(&layer, &bold, &reg, y);

    // Beneficiary (LIFE only)
    if let Some(b) = beneficiary_box::BeneficiaryBox::new(input.beneficiary_name.as_deref()) {
        y = b.render(&layer, &bold, &italic, y);
    }

    // Company (INSTANSI only)
    if let Some(c) = company_box::CompanyBox::new(
        input.company_name.as_deref(),
        input.company_npwp.as_deref(),
        input.company_industry.as_deref(),
    ) {
        y = c.render(&layer, &bold, &reg, y);
    }

    // Footer page 2
    footer_bar::FooterBar::PolicyStandard {
        policy_no: input.policy_no,
        page_label: "Halaman 2 dari 3",
    }
    .render(&layer, &bold, &reg);

    // =========================================================================
    // HALAMAN 3 — MANFAAT, SYARAT & PENGESAHAN
    // =========================================================================
    let (page3, layer3_id) = doc.add_page(Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
    let layer = doc.get_page(page3).get_layer(layer3_id);
    let mut y = 297.0_f32;

    // Header mini
    y = header_bar::HeaderBar::MiniPolicy {
        page_label: "Halaman 3 dari 3",
    }
    .render(&layer, &bold, &reg, y);

    // MANFAAT PERLINDUNGAN
    set_color(&layer, C_BLACK);
    layer.use_text("MANFAAT PERLINDUNGAN", 12.0, Mm(15.0), Mm(y - 9.0), &bold);
    crate::services::pdf::helpers::draw_line(&layer, 15.0, y - 12.5, 195.0, y - 12.5, 0.4);

    let benefits = benefit_list::BenefitList::new(input.product_name);
    y = benefits.render(&layer, &bold, &reg, y - 15.0);

    // KETENTUAN UMUM POLIS
    y = terms_list::TermsList::render(&layer, &bold, &reg, y);

    // PENGESAHAN POLIS + SignatureBlock
    set_color(&layer, C_BLACK);
    crate::services::pdf::helpers::draw_line(&layer, 15.0, 53.5, 195.0, 53.5, 0.5);
    layer.use_text("PENGESAHAN POLIS", 10.5, Mm(15.0), Mm(47.0), &bold);
    set_color(&layer, (85, 83, 78));
    layer.use_text(
        "Polis ini diterbitkan atas dasar permohonan yang disetujui dan berlaku sah secara elektronik sesuai ketentuan hukum yang berlaku.",
        7.5,
        Mm(15.0),
        Mm(40.0),
        &reg,
    );
    let signature = info_boxes::SignatureBlock {
        customer_name: input.customer_name,
        effective_date: input.effective_date,
    };
    let _ = signature.render(&layer, &bold, &reg, &italic, 33.0);

    // Footer page 3 (lebih pendek 15.5mm)
    footer_bar::FooterBar::PolicyLastPage {
        policy_no: input.policy_no,
        page_label: "Halaman 3 dari 3",
    }
    .render(&layer, &bold, &reg);

    // Save
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
    use super::super::tests_fixtures::{assert_valid_pdf, sample_input};
    use super::*;

    #[test]
    fn render_returns_non_empty_bytes() {
        let bytes = render(&sample_input()).unwrap();
        assert!(!bytes.is_empty());
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn render_produces_substantial_output() {
        let bytes = render(&sample_input()).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.len() > 5_000);
        let tail = &bytes[bytes.len().saturating_sub(32)..];
        assert!(tail.windows(5).any(|w| w == b"%%EOF"));
    }

    #[test]
    fn render_handles_optional_beneficiary_and_company() {
        let mut input = sample_input();
        input.beneficiary_name = None;
        let bytes = render(&input).unwrap();
        assert_valid_pdf(&bytes);
        assert!(bytes.len() > 5_000);
    }

    #[test]
    fn render_handles_instansi_with_company_info() {
        let mut input = sample_input();
        input.beneficiary_name = None;
        input.company_name = Some("PT ABC Indonesia".to_string());
        input.company_npwp = Some("01.234.567.8-901.000".to_string());
        input.company_industry = Some("Manufaktur".to_string());
        let bytes = render(&input).unwrap();
        assert_valid_pdf(&bytes);
        assert!(bytes.len() > 5_000);
    }
}
