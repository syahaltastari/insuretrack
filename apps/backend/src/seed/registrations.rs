//! Generator registrations.
//!
//! 50 registrations, di-spread 4 bulan ke belakang. Status state
//! machine (spec §10.2): PENDING/PAID/ISSUED/CANCELLED — distribution
//! deterministic via index modulo untuk konsistensi antar run.
//!
//! `created_at` di-backdate ke bulan yang dipilih supaya identifier
//! prefix `REG-YYYYMM-NNNNNN` berbeda per bulan (sesuai spec §9).

use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use rand::{rngs::StdRng, Rng, SeedableRng};
use rust_decimal::Decimal;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::{
    domain::identifier::{next_id_with_year_month, EntityType as IdEntity},
    seed::{config::SeedConfig, customers::SeededCustomer, data::Product},
};

#[derive(Debug, Clone)]
pub struct SeededRegistration {
    pub id: Uuid,
    pub registration_no: String,
    pub customer_id: Uuid,
    pub product: String,
    pub sum_assured: Decimal,
    pub coverage_term: i32,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

pub async fn seed_registrations(
    tx: &mut Transaction<'_, Postgres>,
    cfg: &SeedConfig,
    customers: &[SeededCustomer],
) -> anyhow::Result<Vec<SeededRegistration>> {
    let mut rng = StdRng::seed_from_u64(0xBEEFCAFE_u64);
    let mut out = Vec::with_capacity(cfg.counts.registrations);

    // 4 bulan ke belakang (counted from "now" = 2026-06-15). Bulan
    // dipilih deterministik per index supaya distribusi stabil.
    let now = Utc::now();
    let base_year = now.format("%Y").to_string().parse::<i32>()?;
    let base_month = now.format("%m").to_string().parse::<u32>()?;

    for i in 0..cfg.counts.registrations {
        // Tentukan bulan: distribusi deterministik per i, range offset
        // 1..=4 (4 bulan ke belakang). `n_months` selalu 4 (bukan
        // `--registrations` value) supaya spread fix ke 4 bulan walau
        // registrations count kecil.
        let n_months = cfg.months_back.clamp(1, 12) as u32;
        let month_offset = (i as u32 % n_months) + 1;
        let (year, month) = subtract_months(base_year, base_month, month_offset);

        // Pilih customer round-robin.
        let customer = &customers[i % customers.len()];

        // Pilih product random.
        let product = match rng.gen_range(0..3) {
            0 => Product::Life,
            1 => Product::PersonalAccident,
            _ => Product::Health,
        };
        let (sa_min, sa_max) = product.sum_assured_range();
        let sum_assured: u64 = rng.gen_range(sa_min..=sa_max);
        let (ct_min, ct_max) = product.coverage_term_range();
        let coverage_term = rng.gen_range(ct_min..=ct_max);

        // Status distribution (deterministic via modulo):
        //   i % 20 == 0 → PENDING (5%)
        //   i % 20 == 1 → CANCELLED (5%)
        //   15/20 = 75% → ISSUED
        //   4/20 = 20% → PAID (subset of ISSUED path: paid but not yet issued)
        // Total PENDING+PAID+ISSUED+CANCELLED = 5+5+20+70 if my math is off
        // Use simpler mapping: i%4 → ISSUED, i%20==0 → PENDING, etc.
        let status = match i % 20 {
            0 => "PENDING",
            1 => "CANCELLED",
            2..=5 => "PAID", // 4/20 = 20%
            _ => "ISSUED",   // 15/20 = 75%
        }
        .to_string();

        // Allocate identifier untuk bulan ini.
        let year_month = format!("{:04}{:02}", year, month);
        let registration_no =
            next_id_with_year_month(tx, IdEntity::Registration, &year_month).await?;

        // `created_at` di-set ke tanggal 5-25 di bulan tersebut, jam 10 pagi.
        let day = 5 + (i as u32 % 21);
        let created_naive = NaiveDate::from_ymd_opt(year, month, day)
            .expect("valid date")
            .and_hms_opt(10, 0, 0)
            .expect("valid time");
        let created_at: DateTime<Utc> = Utc.from_utc_datetime(&created_naive);

        // Insert. `applicant_type` selalu INDIVIDU (seeder tidak handle
        // group registration — out of scope per plan).
        let id: Uuid = sqlx::query_scalar(
            r#"
            INSERT INTO registrations (
                registration_no, customer_id, product, sum_assured,
                coverage_term, status, created_at, applicant_type
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'INDIVIDU')
            RETURNING id
            "#,
        )
        .bind(&registration_no)
        .bind(customer.id)
        .bind(product.as_str())
        .bind(Decimal::from(sum_assured))
        .bind(coverage_term)
        .bind(&status)
        .bind(created_naive)
        .fetch_one(&mut **tx)
        .await?;

        // Karena `created_at` di-insert dengan custom value, dan kita
        // juga butuh konsistensi antara identifier (month) vs created_at,
        // kita tidak perlu UPDATE — `created_at` di-set dari awal.

        out.push(SeededRegistration {
            id,
            registration_no,
            customer_id: customer.id,
            product: product.as_str().to_string(),
            sum_assured: Decimal::from(sum_assured),
            coverage_term,
            status,
            created_at,
        });
    }

    // Suppress unused warnings untuk type yang dipakai di step 6+.
    let _ = NaiveDate::MIN;

    Ok(out)
}

/// Helper: kurangi `month` sebanyak `n` dari (year, month). Menghandle
/// rollover tahun (Jan → Dec tahun sebelumnya). `n` diasumsikan
/// non-negative dan kecil (<= 24).
fn subtract_months(year: i32, month: u32, n: u32) -> (i32, u32) {
    let total = year as i64 * 12 + month as i64 - n as i64;
    let new_year = total.div_euclid(12) as i32;
    let new_month_raw = total.rem_euclid(12) as u32;
    // rem_euclid returns 0..12, dengan 0 = Desember tahun sebelumnya
    // (artinya kita perlu (new_year-1, 12)). Tapi `div_euclid` sudah
    // handle ini — kalau raw=0 dan ada rollover, new_year sudah di-
    // adjust. Tetap: kalau raw==0, new_month jadi 12 dan new_year-1.
    let (new_year, new_month) = if new_month_raw == 0 {
        (new_year - 1, 12)
    } else {
        (new_year, new_month_raw)
    };
    (new_year, new_month)
}
