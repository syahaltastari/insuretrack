//! Shared test fixtures untuk policy.rs / invoice.rs / receipt.rs unit tests.
//! Hanya di-compile saat `cfg(test)`.

#![allow(dead_code)]

use chrono::NaiveDate;
use rust_decimal::Decimal;

use crate::services::pdf::inputs::{
    InvoicePdfInput, ParticipantSummary, PolicyPdfInput, ReceiptPdfInput,
};

/// Sample `PolicyPdfInput` — match pola existing test di pdf.rs.
pub(crate) fn sample_input() -> PolicyPdfInput<'static> {
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

/// Sample `InvoicePdfInput` dengan peserta opsional (None = INDIVIDU).
pub(crate) fn sample_invoice_input(participants: Vec<ParticipantSummary>) -> InvoicePdfInput<'static> {
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

/// Sample `ReceiptPdfInput` dengan peserta opsional (None = INDIVIDU).
pub(crate) fn sample_receipt_input(participants: Vec<ParticipantSummary>) -> ReceiptPdfInput<'static> {
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

/// Generate N sample participants untuk test lampiran.
pub(crate) fn sample_participants(n: usize) -> Vec<ParticipantSummary> {
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

/// Assert byte output valid PDF (magic header + EOF marker).
pub(crate) fn assert_valid_pdf(bytes: &[u8]) {
    assert!(bytes.starts_with(b"%PDF-"), "missing PDF magic bytes");
    let tail = &bytes[bytes.len().saturating_sub(32)..];
    assert!(
        tail.windows(5).any(|w| w == b"%%EOF"),
        "PDF missing %%EOF marker"
    );
}
