//! Generator inquiries — ~30% customers punya 1 inquiry.
//!
//! Status: 60% OPEN, 25% ANSWERED, 15% CLOSED.
//! `responded_at` + `response` di-set untuk ANSWERED/CLOSED.

use chrono::{Duration, Utc};
use rand::{rngs::StdRng, Rng, SeedableRng};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::{
    domain::identifier::{next_id_with_year_month, EntityType as IdEntity},
    seed::{config::SeedConfig, customers::SeededCustomer, data, policies::SeededPolicy},
};

#[derive(Debug, Clone)]
pub struct SeededInquiry {
    pub id: Uuid,
    pub inquiry_no: String,
    pub customer_id: Uuid,
    pub status: String,
}

pub async fn seed_inquiries(
    tx: &mut Transaction<'_, Postgres>,
    cfg: &SeedConfig,
    customers: &[SeededCustomer],
    policies: &[SeededPolicy],
) -> anyhow::Result<Vec<SeededInquiry>> {
    let mut rng = StdRng::seed_from_u64(0x1AFFE_u64);
    let mut out = Vec::new();

    for customer in customers {
        // 30% chance inquiry per customer.
        if !rng.gen_bool(0.30) {
            continue;
        }

        // Status distribution: 60% OPEN, 25% ANSWERED, 15% CLOSED.
        let roll: u32 = rng.gen_range(0..20);
        let status = if roll < 12 {
            "OPEN"
        } else if roll < 17 {
            "ANSWERED"
        } else {
            "CLOSED"
        };

        // policy_id: link ke 1 policy customer ini (jika ada).
        let customer_policy: Option<&SeededPolicy> = policies
            .iter()
            .find(|p| p.customer_id == customer.id);

        // Subject + body: random pick.
        let subject = data::INQUIRY_SUBJECTS[rng.gen_range(0..data::INQUIRY_SUBJECTS.len())];
        let message = data::INQUIRY_BODIES[rng.gen_range(0..data::INQUIRY_BODIES.len())];
        let (response, responded_at) = if status == "ANSWERED" || status == "CLOSED" {
            let resp = data::INQUIRY_RESPONSES
                [rng.gen_range(0..data::INQUIRY_RESPONSES.len())]
                .to_string();
            let resp_at = Utc::now() - Duration::days(rng.gen_range(0..14));
            (Some(resp), Some(resp_at))
        } else {
            (None, None)
        };

        // Identifier: bulan sekarang.
        let now = Utc::now();
        let year_month = now.format("%Y%m").to_string();
        let inquiry_no = next_id_with_year_month(tx, IdEntity::Inquiry, &year_month).await?;

        let created_at = now - Duration::days(rng.gen_range(0..30));
        let id: Uuid = sqlx::query_scalar(
            r#"
            INSERT INTO inquiries (
                inquiry_no, customer_id, policy_id, subject, message,
                status, response, created_at, responded_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
            "#,
        )
        .bind(&inquiry_no)
        .bind(customer.id)
        .bind(customer_policy.map(|p| p.id))
        .bind(subject)
        .bind(message)
        .bind(status)
        .bind(response)
        .bind(created_at.naive_utc())
        .bind(responded_at.map(|dt| dt.naive_utc()))
        .fetch_one(&mut **tx)
        .await?;

        out.push(SeededInquiry {
            id,
            inquiry_no,
            customer_id: customer.id,
            status: status.to_string(),
        });
    }

    // Silence unused (cfg tidak dipakai di sini, reserved untuk load mode tuning).
    let _ = cfg;

    Ok(out)
}
