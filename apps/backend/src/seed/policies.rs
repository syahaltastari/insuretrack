//! Generator policies — 1:1 dengan registration PAID/ISSUED.
//!
//! Status distribution (spec §10.3):
//!   90% ACTIVE    — polis baru atau polis berjalan normal
//!   5% LAPSED     — polis yang lapse karena premium telat (eff_date recent)
//!   5% EXPIRED    — polis yang sudah melewati coverage_term (eff_date = sekarang - coverage_term + 1 day)
//!
//! PDF di-render hanya di demo mode.

use chrono::{DateTime, Datelike, Duration, TimeZone, Utc};
use rust_decimal::Decimal;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::{
    domain::identifier::{next_id_with_year_month, EntityType as IdEntity},
    seed::{config::SeedConfig, pdf_writer, registrations::SeededRegistration},
};

#[derive(Debug, Clone)]
pub struct SeededPolicy {
    pub id: Uuid,
    pub policy_no: String,
    pub registration_id: Uuid,
    pub customer_id: Uuid,
    pub product: String,
    pub sum_assured: Decimal,
    pub premium: Decimal,
    pub effective_date: chrono::NaiveDate,
    pub expiry_date: chrono::NaiveDate,
    pub status: String,
    pub pdf_path: Option<String>,
}

pub async fn seed_policies(
    tx: &mut Transaction<'_, Postgres>,
    cfg: &SeedConfig,
    registrations: &[SeededRegistration],
    invoice_premium: &[Decimal],
) -> anyhow::Result<Vec<SeededPolicy>> {
    let mut out = Vec::new();
    let mut policy_idx = 0_usize;

    for (idx, reg) in registrations.iter().enumerate() {
        // Skip PENDING & CANCELLED — tidak ada policy.
        if matches!(reg.status.as_str(), "PENDING" | "CANCELLED") {
            continue;
        }

        // effective_date = paid_at atau created_at (untuk ISSUED reg).
        // Untuk EXPIRED/LAPSED, kita override effective_date di bawah.
        let paid_at: DateTime<Utc> = reg.created_at + Duration::days(2);
        let mut effective = paid_at;

        // Status distribution: 5% LAPSED, 5% EXPIRED, 90% ACTIVE.
        // `policy_idx` di-increment hanya untuk policy yang BENAR di-insert
        // (bukan PENDING/CANCELLED) supaya distribusi modulo akurat.
        let status = match policy_idx % 20 {
            0 => "LAPSED",
            1 => "EXPIRED",
            _ => "ACTIVE",
        };
        if status == "EXPIRED" {
            // Set effective_date mundur coverage_term + 30 hari, supaya
            // expiry_date sudah lewat.
            let now = Utc::now();
            let years_back = reg.coverage_term as i64 + 1;
            effective = now - Duration::days(365 * years_back + 30);
        } else if status == "LAPSED" {
            // eff_date recent, tapi kita set ke 60 hari lalu (premium unpaid).
            effective = Utc::now() - Duration::days(60);
        }

        let effective_date = effective.date_naive();
        let expiry_date = effective_date
            .checked_add_signed(chrono::Duration::days(365 * reg.coverage_term as i64))
            .expect("expiry date overflow");

        // Identifier untuk bulan effective.
        let year_month = format!(
            "{:04}{:02}",
            effective.year(),
            effective.month()
        );
        let policy_no = next_id_with_year_month(tx, IdEntity::Policy, &year_month).await?;

        let id: Uuid = sqlx::query_scalar(
            r#"
            INSERT INTO policies (
                policy_no, registration_id, product, sum_assured, premium,
                effective_date, expiry_date, status, pdf_path, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9)
            RETURNING id
            "#,
        )
        .bind(&policy_no)
        .bind(reg.id)
        .bind(&reg.product)
        .bind(reg.sum_assured)
        .bind(invoice_premium[idx])
        .bind(effective_date)
        .bind(expiry_date)
        .bind(status)
        .bind(Utc.from_utc_datetime(&effective.naive_utc()))
        .fetch_one(&mut **tx)
        .await?;

        // PDF rendering (demo mode).
        let pdf_path = if cfg.mode == crate::seed::config::SeedMode::Demo {
            Some(
                pdf_writer::write_policy_pdf(
                    &cfg.upload_dir,
                    id,
                    &policy_no,
                    &policy_for_pdf(reg, invoice_premium[idx], effective_date, expiry_date),
                )
                .await?,
            )
        } else {
            None
        };

        if let Some(p) = &pdf_path {
            sqlx::query("UPDATE policies SET pdf_path = $1 WHERE id = $2")
                .bind(p)
                .bind(id)
                .execute(&mut **tx)
                .await?;
        }

        out.push(SeededPolicy {
            id,
            policy_no,
            registration_id: reg.id,
            customer_id: reg.customer_id,
            product: reg.product.clone(),
            sum_assured: reg.sum_assured,
            premium: invoice_premium[idx],
            effective_date,
            expiry_date,
            status: status.to_string(),
            pdf_path,
        });

        policy_idx += 1;
    }

    Ok(out)
}

fn policy_for_pdf(
    reg: &SeededRegistration,
    premium: Decimal,
    effective: chrono::NaiveDate,
    expiry: chrono::NaiveDate,
) -> pdf_writer::PolicyDraft {
    pdf_writer::PolicyDraft {
        registration_no: reg.registration_no.clone(),
        product: reg.product.clone(),
        sum_assured: reg.sum_assured,
        premium,
        effective_date: effective,
        expiry_date: expiry,
    }
}
