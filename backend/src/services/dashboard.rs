//! Aggregations for the admin dashboard charts.
//!
//! All queries are time-bucketed in SQL using `date_trunc('month', ...)`. The
//! result is padded client-side to always return the last 12 calendar months,
//! so the chart is consistent even when a month has zero rows.

use rust_decimal::Decimal;
use serde::Serialize;
use sqlx::PgPool;
use std::collections::BTreeMap;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MonthCount {
    pub month: String, // YYYY-MM
    pub count: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MonthAmount {
    pub month: String, // YYYY-MM
    pub amount: Decimal,
}

#[derive(Debug, Serialize)]
pub struct DashboardCharts {
    pub registrations_per_month: Vec<MonthCount>,
    pub policies_per_month: Vec<MonthCount>,
    pub revenue_per_month: Vec<MonthAmount>,
    pub invoice_status_breakdown: Vec<StatusCount>,
    pub claim_status_breakdown: Vec<StatusCount>,
    pub policy_product_breakdown: Vec<StatusCount>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StatusCount {
    pub status: String,
    pub count: i64,
}

/// Build the 12-month window ending on the current month, inclusive.
/// Returns (months_vec, label_set) — months is `YYYY-MM` strings in order.
fn last_12_months() -> Vec<String> {
    use chrono::{Datelike, Utc};
    let now = Utc::now().date_naive();
    let mut months: Vec<String> = Vec::with_capacity(12);
    for i in (0..12).rev() {
        // naive subtraction: we shift back `i` months from `now`
        let total = now.year() * 12 + (now.month() as i32 - 1) - i;
        let y = total.div_euclid(12);
        let m = (total.rem_euclid(12) + 1) as u32;
        months.push(format!("{:04}-{:02}", y, m));
    }
    months
}

async fn count_per_month(
    pool: &PgPool,
    table: &str,
    column: &str,
) -> Result<Vec<MonthCount>, sqlx::Error> {
    let sql = format!(
        r#"
        SELECT to_char(date_trunc('month', {col}), 'YYYY-MM') AS month,
               COUNT(*)::bigint                                 AS count
          FROM {tbl}
         WHERE {col} >= date_trunc('month', now()) - INTERVAL '11 months'
         GROUP BY 1
        "#,
        col = column,
        tbl = table,
    );
    let rows: Vec<MonthCount> = sqlx::query_as(&sql).fetch_all(pool).await?;
    Ok(rows)
}

async fn sum_per_month(
    pool: &PgPool,
    table: &str,
    amount_col: &str,
    date_col: &str,
    where_clause: &str,
) -> Result<Vec<MonthAmount>, sqlx::Error> {
    let sql = format!(
        r#"
        SELECT to_char(date_trunc('month', {dc}), 'YYYY-MM') AS month,
               COALESCE(SUM({ac}), 0)                        AS amount
          FROM {tbl}
         WHERE {dc} >= date_trunc('month', now()) - INTERVAL '11 months'
           AND {wc}
         GROUP BY 1
        "#,
        dc = date_col,
        ac = amount_col,
        tbl = table,
        wc = where_clause,
    );
    let rows: Vec<MonthAmount> = sqlx::query_as(&sql).fetch_all(pool).await?;
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

fn pad_counts(rows: Vec<MonthCount>) -> Vec<MonthCount> {
    let map: BTreeMap<String, i64> = rows.into_iter().map(|r| (r.month, r.count)).collect();
    last_12_months()
        .into_iter()
        .map(|m| MonthCount {
            month: m.clone(),
            count: *map.get(&m).unwrap_or(&0),
        })
        .collect()
}

fn pad_amounts(rows: Vec<MonthAmount>) -> Vec<MonthAmount> {
    let map: BTreeMap<String, Decimal> = rows.into_iter().map(|r| (r.month, r.amount)).collect();
    last_12_months()
        .into_iter()
        .map(|m| MonthAmount {
            month: m.clone(),
            amount: *map.get(&m).unwrap_or(&Decimal::ZERO),
        })
        .collect()
}

pub async fn fetch_all(pool: &PgPool) -> Result<DashboardCharts, sqlx::Error> {
    let regs = count_per_month(pool, "registrations", "created_at").await?;
    let pols = count_per_month(pool, "policies", "created_at").await?;
    let rev = sum_per_month(
        pool,
        "invoices",
        "premium_amount",
        "COALESCE(paid_at, created_at)",
        "status = 'PAID'",
    )
    .await?;
    let inv_breakdown = count_group_by(pool, "invoices", "status").await?;
    let claim_breakdown = count_group_by(pool, "claims", "status").await?;
    let pol_breakdown = count_group_by(pool, "policies", "product").await?;

    Ok(DashboardCharts {
        registrations_per_month: pad_counts(regs),
        policies_per_month: pad_counts(pols),
        revenue_per_month: pad_amounts(rev),
        invoice_status_breakdown: inv_breakdown,
        claim_status_breakdown: claim_breakdown,
        policy_product_breakdown: pol_breakdown,
    })
}
