//! Generator invoices — 1:1 dengan registration.
//!
//! Status invoice derived dari registration status (spec §10.1):
//!   reg PENDING    → invoice UNPAID
//!   reg PAID       → invoice PAID
//!   reg ISSUED     → invoice PAID
//!   reg CANCELLED  → invoice CANCELLED
//!
//! Untuk variasi, sebagian kecil UNPAID di-backdate ke EXPIRED
//! (due_date lewat dari "now" — i.e. lewat 30+ hari).

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use rust_decimal::Decimal;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::{
    domain::identifier::{next_id_with_year_month, EntityType as IdEntity},
    seed::{config::SeedConfig, data::Product, pdf_writer, registrations::SeededRegistration},
};

#[derive(Debug, Clone)]
pub struct SeededInvoice {
    pub id: Uuid,
    pub invoice_no: String,
    pub registration_id: Uuid,
    pub premium_amount: Decimal,
    pub status: String,
    pub pdf_path: Option<String>,
    pub paid_at: Option<DateTime<Utc>>,
}

pub async fn seed_invoices(
    tx: &mut Transaction<'_, Postgres>,
    cfg: &SeedConfig,
    registrations: &[SeededRegistration],
) -> anyhow::Result<Vec<SeededInvoice>> {
    let mut out = Vec::with_capacity(registrations.len());

    for (idx, reg) in registrations.iter().enumerate() {
        // Status derived dari reg status, dengan override ke EXPIRED
        // untuk 1 dari 6 UNPAID (backdate ke due_date > 30 hari lalu).
        let (invoice_status, paid_at) = match reg.status.as_str() {
            "PENDING" if idx % 6 == 0 => ("EXPIRED".to_string(), None),
            "PENDING" => ("UNPAID".to_string(), None),
            "PAID" | "ISSUED" => ("PAID".to_string(), Some(reg.created_at + Duration::days(2))),
            "CANCELLED" => ("CANCELLED".to_string(), None),
            other => panic!("unknown registration status: {other}"),
        };

        // Premium = sum_assured * rate * coverage_term.
        let product = match reg.product.as_str() {
            "LIFE" => Product::Life,
            "PERSONAL_ACCIDENT" => Product::PersonalAccident,
            "HEALTH" => Product::Health,
            other => panic!("unknown product: {other}"),
        };
        let rate = Decimal::try_from(product.premium_rate())?;
        let term = Decimal::from(reg.coverage_term);
        let premium = reg.sum_assured * rate * term;

        // due_date: created_at + 14 hari (untuk UNPAID/EXPIRED).
        let due_date: NaiveDate = (reg.created_at + Duration::days(14)).date_naive();

        // Identifier pakai bulan registration (konsisten dengan REG).
        let year_month = format!("{:04}{:02}", reg.created_at.year(), reg.created_at.month());
        let invoice_no = next_id_with_year_month(tx, IdEntity::Invoice, &year_month).await?;

        // Insert.
        let id: Uuid = sqlx::query_scalar(
            r#"
            INSERT INTO invoices (
                invoice_no, registration_id, premium_amount,
                due_date, status, paid_at, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
            "#,
        )
        .bind(&invoice_no)
        .bind(reg.id)
        .bind(premium)
        .bind(due_date)
        .bind(&invoice_status)
        .bind(paid_at)
        .bind(reg.created_at.naive_utc())
        .fetch_one(&mut **tx)
        .await?;

        // PDF rendering (demo mode saja).
        let pdf_path = if cfg.mode == crate::seed::config::SeedMode::Demo {
            Some(
                pdf_writer::write_invoice_pdf(
                    &cfg.upload_dir,
                    id,
                    &invoice_no,
                    &invoice_for_pdf(reg, premium, due_date, &invoice_status),
                )
                .await?,
            )
        } else {
            None
        };

        // Update pdf_path di DB.
        if let Some(p) = &pdf_path {
            sqlx::query("UPDATE invoices SET pdf_path = $1 WHERE id = $2")
                .bind(p)
                .bind(id)
                .execute(&mut **tx)
                .await?;
        }

        out.push(SeededInvoice {
            id,
            invoice_no,
            registration_id: reg.id,
            premium_amount: premium,
            status: invoice_status,
            pdf_path,
            paid_at,
        });
    }

    Ok(out)
}

/// Build struct untuk PDF rendering. Memisahkan agar tidak borrow
/// `SeededRegistration` langsung (lifetime ribet).
fn invoice_for_pdf(
    reg: &SeededRegistration,
    premium: Decimal,
    due_date: NaiveDate,
    status: &str,
) -> pdf_writer::InvoiceDraft {
    pdf_writer::InvoiceDraft {
        product: reg.product.clone(),
        sum_assured: reg.sum_assured,
        premium,
        due_date,
        status: status.to_string(),
        created_at: reg.created_at.date_naive(),
    }
}

// Silence unused (Utc dipakai untuk derivasi time di M4+).
#[allow(dead_code)]
fn _typecheck(_: Utc) -> chrono::NaiveDateTime {
    Utc::now().naive_utc()
}
