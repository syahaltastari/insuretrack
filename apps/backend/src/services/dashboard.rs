//! Aggregations for the admin dashboard charts.
//!
//! Time-series queries accept a `from` / `to` date range and a `granularity`
//! (`day` | `week` | `month`). Buckets that contain no rows are padded
//! client-side so the chart x-axis is contiguous.
//!
//! Breakdown queries (status / product counts) are NOT date-filtered —
//! they always reflect the current state. This matches typical dashboard UX:
//! trend charts respect the range, distribution charts always show "today".

use chrono::{Datelike, Duration, NaiveDate};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Granularity {
    Day,
    Week,
    Month,
}

impl Granularity {
    /// Postgres date_trunc argument corresponding to the variant.
    fn as_pg(self) -> &'static str {
        match self {
            Granularity::Day => "day",
            Granularity::Week => "week",
            Granularity::Month => "month",
        }
    }

    /// Display label for charts, e.g. "Jan", "01 Jan", "W3 Jan".
    pub fn short_label(self, bucket: &str) -> String {
        use chrono::NaiveDate;
        let parse = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok();
        match self {
            Granularity::Day => parse(bucket)
                .map(|d| d.format("%d %b").to_string())
                .unwrap_or_else(|| bucket.to_string()),
            Granularity::Week => {
                // bucket is the Monday of the ISO week (e.g. 2026-01-27).
                parse(bucket)
                    .map(|d| {
                        let week_num = d.iso_week().week();
                        format!("W{} {}", week_num, d.format("%b"))
                    })
                    .unwrap_or_else(|| bucket.to_string())
            }
            Granularity::Month => {
                // bucket is "YYYY-MM-01" (truncated month start). Show "Jan".
                let parts: Vec<&str> = bucket.split('-').collect();
                if parts.len() >= 2 {
                    let m: u32 = parts[1].parse().unwrap_or(0);
                    const MONTHS: [&str; 12] = [
                        "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt",
                        "Nov", "Des",
                    ];
                    MONTHS
                        .get((m.saturating_sub(1)) as usize)
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| bucket.to_string())
                } else {
                    bucket.to_string()
                }
            }
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct DashboardQuery {
    /// Inclusive lower bound. Optional — defaults to 12 months ago.
    pub from: Option<NaiveDate>,
    /// Inclusive upper bound. Optional — defaults to today.
    pub to: Option<NaiveDate>,
    /// Bucket size. Optional — auto-picked from range if omitted.
    pub granularity: Option<Granularity>,
}

impl DashboardQuery {
    /// Resolve the (from, to, granularity) triple with sensible defaults.
    pub fn resolve(self) -> (NaiveDate, NaiveDate, Granularity) {
        let to = self.to.unwrap_or_else(|| chrono::Utc::now().date_naive());
        let (default_from, default_gran) = match self.granularity {
            Some(g) => {
                let from = self
                    .from
                    .unwrap_or_else(|| default_from_for_granularity(g, to));
                (from, g)
            }
            None => {
                let g = self.granularity.unwrap_or_else(|| {
                    auto_granularity(self.from.unwrap_or(to) - Duration::days(0), to)
                });
                let from = self
                    .from
                    .unwrap_or_else(|| default_from_for_granularity(g, to));
                (from, g)
            }
        };
        (default_from, to, default_gran)
    }
}

fn default_from_for_granularity(g: Granularity, to: NaiveDate) -> NaiveDate {
    match g {
        Granularity::Day => to - Duration::days(13), // last 14 days
        Granularity::Week => to - Duration::weeks(11), // last 12 weeks
        Granularity::Month => {
            // last 12 calendar months
            let total = to.year() * 12 + (to.month() as i32 - 1) - 11;
            let y = total.div_euclid(12);
            let m = (total.rem_euclid(12) + 1) as u32;
            NaiveDate::from_ymd_opt(y, m, 1).unwrap_or(to)
        }
    }
}

fn auto_granularity(from: NaiveDate, to: NaiveDate) -> Granularity {
    let days = (to - from).num_days();
    if days <= 45 {
        Granularity::Day
    } else if days <= 180 {
        Granularity::Week
    } else {
        Granularity::Month
    }
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BucketCount {
    pub bucket: String, // YYYY-MM-DD
    pub count: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BucketAmount {
    pub bucket: String,
    pub amount: Decimal,
}

#[derive(Debug, Serialize)]
pub struct DashboardCharts {
    pub granularity: Granularity,
    pub from: NaiveDate,
    pub to: NaiveDate,
    pub registrations_per_period: Vec<BucketCount>,
    pub policies_per_period: Vec<BucketCount>,
    pub revenue_per_period: Vec<BucketAmount>,
    pub invoice_status_breakdown: Vec<StatusCount>,
    pub claim_status_breakdown: Vec<StatusCount>,
    pub policy_product_breakdown: Vec<StatusCount>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StatusCount {
    pub status: String,
    pub count: i64,
}

/// Build the contiguous list of bucket keys between `from` and `to`,
/// in chronological order.
fn bucket_keys(from: NaiveDate, to: NaiveDate, granularity: Granularity) -> Vec<String> {
    let mut keys = Vec::new();
    let mut cur = match granularity {
        Granularity::Day => from,
        Granularity::Week => {
            // Round `from` down to its containing Monday so the first bucket
            // is a complete week.
            let days_from_mon = from.weekday().num_days_from_monday() as i64;
            from - Duration::days(days_from_mon)
        }
        Granularity::Month => NaiveDate::from_ymd_opt(from.year(), from.month(), 1).unwrap_or(from),
    };
    let cap = 400; // safety
    while cur <= to && keys.len() < cap {
        keys.push(cur.format("%Y-%m-%d").to_string());
        cur = match granularity {
            Granularity::Day => cur + Duration::days(1),
            Granularity::Week => cur + Duration::weeks(1),
            Granularity::Month => add_one_month(cur),
        };
    }
    keys
}

fn add_one_month(d: NaiveDate) -> NaiveDate {
    let total = d.year() * 12 + (d.month() as i32 - 1) + 1;
    let y = total.div_euclid(12);
    let m = (total.rem_euclid(12) + 1) as u32;
    NaiveDate::from_ymd_opt(y, m, 1).unwrap_or(d)
}

async fn count_per_period(
    pool: &PgPool,
    table: &str,
    column: &str,
    granularity: Granularity,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<BucketCount>, sqlx::Error> {
    let sql = format!(
        r#"
        SELECT to_char(date_trunc('{g}', {col}), 'YYYY-MM-DD') AS bucket,
               COUNT(*)::bigint                                AS count
          FROM {tbl}
         WHERE {col}::date BETWEEN $1 AND $2
         GROUP BY 1
        "#,
        g = granularity.as_pg(),
        col = column,
        tbl = table,
    );
    let rows: Vec<BucketCount> = sqlx::query_as(&sql)
        .bind(from)
        .bind(to)
        .fetch_all(pool)
        .await?;
    Ok(rows)
}

#[allow(clippy::too_many_arguments)]
async fn sum_per_period(
    pool: &PgPool,
    table: &str,
    amount_col: &str,
    date_col: &str,
    where_clause: &str,
    granularity: Granularity,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<BucketAmount>, sqlx::Error> {
    let sql = format!(
        r#"
        SELECT to_char(date_trunc('{g}', {dc}), 'YYYY-MM-DD') AS bucket,
               COALESCE(SUM({ac}), 0)                       AS amount
          FROM {tbl}
         WHERE {dc}::date BETWEEN $1 AND $2
           AND {wc}
         GROUP BY 1
        "#,
        g = granularity.as_pg(),
        dc = date_col,
        ac = amount_col,
        tbl = table,
        wc = where_clause,
    );
    let rows: Vec<BucketAmount> = sqlx::query_as(&sql)
        .bind(from)
        .bind(to)
        .fetch_all(pool)
        .await?;
    Ok(rows)
}

async fn count_group_by(
    pool: &PgPool,
    table: &str,
    column: &str,
) -> Result<Vec<StatusCount>, sqlx::Error> {
    let sql = format!(
        "SELECT {col} AS status, COUNT(*)::bigint AS count FROM {tbl} GROUP BY {col}",
        col = column,
        tbl = table,
    );
    sqlx::query_as(&sql).fetch_all(pool).await
}

fn pad_counts(rows: Vec<BucketCount>, keys: &[String]) -> Vec<BucketCount> {
    let map: BTreeMap<String, i64> = rows.into_iter().map(|r| (r.bucket, r.count)).collect();
    keys.iter()
        .map(|k| BucketCount {
            bucket: k.clone(),
            count: *map.get(k).unwrap_or(&0),
        })
        .collect()
}

fn pad_amounts(rows: Vec<BucketAmount>, keys: &[String]) -> Vec<BucketAmount> {
    let map: BTreeMap<String, Decimal> = rows.into_iter().map(|r| (r.bucket, r.amount)).collect();
    keys.iter()
        .map(|k| BucketAmount {
            bucket: k.clone(),
            amount: *map.get(k).unwrap_or(&Decimal::ZERO),
        })
        .collect()
}

pub async fn fetch_all(pool: &PgPool, q: DashboardQuery) -> Result<DashboardCharts, sqlx::Error> {
    let (from, to, granularity) = q.resolve();
    let keys = bucket_keys(from, to, granularity);

    let regs = count_per_period(pool, "registrations", "created_at", granularity, from, to).await?;
    let pols = count_per_period(pool, "policies", "created_at", granularity, from, to).await?;
    let rev = sum_per_period(
        pool,
        "invoices",
        "premium_amount",
        "COALESCE(paid_at, created_at)",
        "status = 'PAID'",
        granularity,
        from,
        to,
    )
    .await?;
    let inv_breakdown = count_group_by(pool, "invoices", "status").await?;
    let claim_breakdown = count_group_by(pool, "claims", "status").await?;
    let pol_breakdown = count_group_by(pool, "policies", "product").await?;

    Ok(DashboardCharts {
        granularity,
        from,
        to,
        registrations_per_period: pad_counts(regs, &keys),
        policies_per_period: pad_counts(pols, &keys),
        revenue_per_period: pad_amounts(rev, &keys),
        invoice_status_breakdown: inv_breakdown,
        claim_status_breakdown: claim_breakdown,
        policy_product_breakdown: pol_breakdown,
    })
}
