//! PDF writer — render e-Policy & Invoice via `services::pdf` lalu
//! tulis ke disk. Return relative path untuk disimpan di DB.

use std::path::Path;

use rust_decimal::Decimal;
use tokio::fs;
use uuid::Uuid;

use crate::services::pdf::{render, render_invoice, InvoicePdfInput, PolicyPdfInput};

/// Plain-data untuk e-Policy PDF. Field customer (nama, NIK, address)
/// belum di-include di step 5 ini — PDF minimal dulu. Step M4 bisa
/// enhance dengan join ke customer.
#[derive(Debug)]
pub struct PolicyDraft {
    pub registration_no: String,
    pub product: String,
    pub sum_assured: Decimal,
    pub premium: Decimal,
    pub effective_date: chrono::NaiveDate,
    pub expiry_date: chrono::NaiveDate,
}

#[derive(Debug)]
pub struct InvoiceDraft {
    pub product: String,
    pub sum_assured: Decimal,
    pub premium: Decimal,
    pub due_date: chrono::NaiveDate,
    pub status: String,
    pub created_at: chrono::NaiveDate,
}

/// Render e-Policy PDF → tulis ke disk → return relative path.
pub async fn write_policy_pdf(
    upload_dir: &str,
    policy_id: Uuid,
    policy_no: &str,
    draft: &PolicyDraft,
) -> anyhow::Result<String> {
    let input = PolicyPdfInput {
        policy_no,
        registration_no: &draft.registration_no,
        effective_date: draft.effective_date,
        expiry_date: draft.expiry_date,
        // TODO(M4): pass real customer NIK/name/birth/address.
        customer_nik: "0000000000000000",
        customer_name: "Customer Name",
        customer_birth_place: "Kota",
        customer_birth_date: chrono::NaiveDate::from_ymd_opt(1990, 1, 1).unwrap(),
        customer_gender: "MALE",
        customer_address: "Alamat customer (placeholder seeder)",
        customer_email: "customer@example.com",
        customer_mobile: "6281234567890",
        product_name: &draft.product,
        plan_tier: None,
        sum_assured: draft.sum_assured,
        premium: draft.premium,
        coverage_term_years: 1,
        beneficiary_name: None,
        company_name: None,
        company_npwp: None,
        company_industry: None,
    };

    let bytes = render(&input).map_err(|e| anyhow::anyhow!("render policy pdf: {e}"))?;
    let file_name = format!("{policy_no}.pdf");
    write_pdf_to_disk(upload_dir, "policies", policy_id, &file_name, &bytes).await
}

/// Render Invoice PDF → tulis ke disk → return relative path.
pub async fn write_invoice_pdf(
    upload_dir: &str,
    invoice_id: Uuid,
    invoice_no: &str,
    draft: &InvoiceDraft,
) -> anyhow::Result<String> {
    let input = InvoicePdfInput {
        invoice_no,
        registration_no: "", // Tidak di-pass di seeder step 5; placeholder.
        customer_nik: "0000000000000000",
        customer_name: "Customer Name",
        customer_birth_place: "Kota",
        customer_birth_date: chrono::NaiveDate::from_ymd_opt(1990, 1, 1).unwrap(),
        customer_gender: "MALE",
        customer_email: "customer@example.com",
        customer_mobile: "6281234567890",
        customer_address: "Alamat customer (placeholder seeder)",
        product_name: &draft.product,
        sum_assured: draft.sum_assured,
        premium: draft.premium,
        coverage_term_years: 1,
        due_date: draft.due_date,
        status: &draft.status,
        created_at: draft.created_at,
    };

    let bytes = render_invoice(&input).map_err(|e| anyhow::anyhow!("render invoice pdf: {e}"))?;
    let file_name = format!("{invoice_no}.pdf");
    write_pdf_to_disk(upload_dir, "invoices", invoice_id, &file_name, &bytes).await
}

async fn write_pdf_to_disk(
    upload_dir: &str,
    kind: &str,
    owner_id: Uuid,
    file_name: &str,
    bytes: &[u8],
) -> anyhow::Result<String> {
    let relative = format!("{kind}/{owner_id}/{file_name}");
    let absolute = Path::new(upload_dir).join(&relative);

    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::write(&absolute, bytes).await?;

    Ok(relative)
}
