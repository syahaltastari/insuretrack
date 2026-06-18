//! Generator claims.
//!
//! 40% dari active policies dapat 1 claim. Status distribution:
//!   50% APPROVED, 25% PAID, 10% UNDER_REVIEW, 10% SUBMITTED, 5% REJECTED
//!
//! `claim_type` (spec FS-19) tergantung product:
//!   LIFE              → DEATH_BENEFIT atau CRITICAL_ILLNESS
//!   PERSONAL_ACCIDENT → ACCIDENTAL_INJURY atau ACCIDENTAL_DEATH
//!   HEALTH            → HOSPITALIZATION atau MEDICAL_EXPENSE
//!
//! `incident_date` harus di dalam coverage period (effective_date .. expiry_date).
//! `claimed_amount` ≤ sum_assured (1-50%).

use chrono::{Datelike, Duration, NaiveDate};
use rand::{rngs::StdRng, Rng, SeedableRng};
use rust_decimal::Decimal;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::{
    domain::identifier::{next_id_with_year_month, EntityType as IdEntity},
    seed::{config::SeedConfig, data, policies::SeededPolicy},
};

#[derive(Debug, Clone)]
pub struct SeededClaim {
    pub id: Uuid,
    pub claim_no: String,
    pub policy_id: Uuid,
    pub customer_id: Uuid,
    pub status: String,
    pub claimed_amount: Decimal,
}

pub async fn seed_claims(
    tx: &mut Transaction<'_, Postgres>,
    cfg: &SeedConfig,
    policies: &[SeededPolicy],
) -> anyhow::Result<Vec<SeededClaim>> {
    let mut rng = StdRng::seed_from_u64(0xCA1B0001_u64);
    let mut out = Vec::new();

    for (idx, policy) in policies.iter().enumerate() {
        // Skip 60% policies (40% punya claim).
        if rng.gen::<f32>() > cfg.claims_ratio {
            continue;
        }

        // Status distribution (deterministic by idx).
        let status = match idx % 20 {
            0..=1 => "REJECTED",     // 2/20 = 10%
            2..=3 => "UNDER_REVIEW", // 2/20 = 10%
            4..=5 => "SUBMITTED",    // 2/20 = 10%
            6..=14 => "APPROVED",    // 9/20 = 45%
            _ => "PAID",             // 5/20 = 25%
        };

        // claim_type: pick sesuai product.
        let claim_type = match policy.product.as_str() {
            "LIFE" => {
                if idx % 2 == 0 {
                    "DEATH_BENEFIT"
                } else {
                    "CRITICAL_ILLNESS"
                }
            }
            "PERSONAL_ACCIDENT" => {
                if idx % 2 == 0 {
                    "ACCIDENTAL_INJURY"
                } else {
                    "ACCIDENTAL_DEATH"
                }
            }
            "HEALTH" => {
                if idx % 2 == 0 {
                    "HOSPITALIZATION"
                } else {
                    "MEDICAL_EXPENSE"
                }
            }
            other => panic!("unknown product: {other}"),
        };

        // incident_date: random dalam coverage period.
        let days_into = rng.gen_range(0..30_i64);
        let incident_date = policy.effective_date + Duration::days(days_into);
        // Validate: incident_date <= today.
        let today = chrono::Utc::now().date_naive();
        let incident_date = if incident_date > today {
            today
        } else {
            incident_date
        };

        // claimed_amount: 1-50% dari sum_assured.
        let pct = rng.gen_range(1..=50_u64);
        let claimed_amount = policy.sum_assured * Decimal::from(pct) / Decimal::from(100);

        // Description: random pick.
        let description =
            data::CLAIM_DESCRIPTIONS[rng.gen_range(0..data::CLAIM_DESCRIPTIONS.len())];

        // decision_note: untuk APPROVED/REJECTED/PAID.
        let decision_note = match status {
            "APPROVED" => Some(
                "Klaim disetujui setelah review dokumen medis dan verifikasi polis aktif."
                    .to_string(),
            ),
            "REJECTED" => Some(
                "Klaim ditolak: dokumen pendukung tidak lengkap / di luar coverage polis."
                    .to_string(),
            ),
            "PAID" => Some(
                "Klaim telah dibayar via transfer bank ke rekening tertanggung pada 2026-06-01."
                    .to_string(),
            ),
            _ => None,
        };

        // Identifier: bulan incident_date.
        let year_month = format!("{:04}{:02}", incident_date.year(), incident_date.month());
        let claim_no = next_id_with_year_month(tx, IdEntity::Claim, &year_month).await?;

        // submitted_at & updated_at: derived dari status + today.
        let submitted_at = chrono::Utc::now() - Duration::days(rng.gen_range(1..30));
        let updated_at = match status {
            "SUBMITTED" => submitted_at,
            _ => chrono::Utc::now() - Duration::days(rng.gen_range(0..5)),
        };

        let id: Uuid = sqlx::query_scalar(
            r#"
            INSERT INTO claims (
                claim_no, policy_id, customer_id, claim_type, incident_date,
                claimed_amount, description, status, decision_note,
                submitted_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
            "#,
        )
        .bind(&claim_no)
        .bind(policy.id)
        .bind(policy.customer_id)
        .bind(claim_type)
        .bind(incident_date)
        .bind(claimed_amount)
        .bind(description)
        .bind(status)
        .bind(decision_note)
        .bind(submitted_at.naive_utc())
        .bind(updated_at.naive_utc())
        .fetch_one(&mut **tx)
        .await?;

        out.push(SeededClaim {
            id,
            claim_no,
            policy_id: policy.id,
            customer_id: policy.customer_id,
            status: status.to_string(),
            claimed_amount,
        });
    }

    // Suppress unused (NaiveDate dipakai di future).
    let _ = NaiveDate::MIN;

    Ok(out)
}
