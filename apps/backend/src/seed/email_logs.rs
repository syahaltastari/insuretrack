//! Generator email_logs — 5-10 per customer (terutama portal customer).
//!
//! Spec FS-05: 8 email types. Status: 80% SENT, 15% QUEUED, 5% FAILED.

use chrono::{Duration, Utc};
use rand::{rngs::StdRng, Rng, SeedableRng};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::seed::{config::SeedConfig, customers::SeededCustomer, data};

#[derive(Debug, Clone)]
pub struct SeededEmailLog {
    pub id: Uuid,
    pub email_type: String,
    pub status: String,
    pub recipient: String,
}

pub async fn seed_email_logs(
    tx: &mut Transaction<'_, Postgres>,
    _cfg: &SeedConfig,
    customers: &[SeededCustomer],
) -> anyhow::Result<Vec<SeededEmailLog>> {
    let mut rng = StdRng::seed_from_u64(0xE0A1_u64);
    let mut out = Vec::new();

    for customer in customers {
        // Portal customer dapat 8-12 emails; non-portal 3-6.
        let n_emails = if customer.portal_password.is_some() {
            rng.gen_range(8..=12)
        } else {
            rng.gen_range(3..=6)
        };

        for _ in 0..n_emails {
            let email_type = data::EMAIL_TYPES
                [rng.gen_range(0..data::EMAIL_TYPES.len())];

            // Status: 80% SENT, 15% QUEUED, 5% FAILED.
            let roll: u32 = rng.gen_range(0..100);
            let status = if roll < 80 {
                "SENT"
            } else if roll < 95 {
                "QUEUED"
            } else {
                "FAILED"
            };

            let subject = format!("[{}] {}", email_type, customer.full_name);
            let error_message = if status == "FAILED" {
                Some("SMTP timeout setelah 30s — auto-retry akan dijalankan.".to_string())
            } else {
                None
            };
            let sent_at = if status == "SENT" || status == "FAILED" {
                Some(Utc::now() - Duration::days(rng.gen_range(0..30)))
            } else {
                None
            };

            let id: Uuid = sqlx::query_scalar(
                r#"
                INSERT INTO email_logs (
                    recipient, email_type, subject, status, error_message, sent_at
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
                "#,
            )
            .bind(&customer.email)
            .bind(email_type)
            .bind(&subject)
            .bind(status)
            .bind(error_message)
            .bind(sent_at.map(|dt| dt.naive_utc()))
            .fetch_one(&mut **tx)
            .await?;

            out.push(SeededEmailLog {
                id,
                email_type: email_type.to_string(),
                status: status.to_string(),
                recipient: customer.email.clone(),
            });
        }
    }

    Ok(out)
}
