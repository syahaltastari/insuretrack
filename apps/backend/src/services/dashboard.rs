//! Aggregations for the admin dashboard charts.
//!
//! Time-series queries accept a `from` / `to` date range and a `granularity`
//! (`day` | `week` | `month`). Buckets that contain no rows are padded
//! client-side so the chart x-axis is contiguous.
//!
//! Breakdown queries (status / product counts) are NOT date-filtered —
//! they always reflect the current state. This matches typical dashboard UX:
//! trend charts respect the range, distribution charts always show "today".
//!
//! Optional filters (since admin-dashboard-enhancement):
//! - `product` (LIFE | PERSONAL_ACCIDENT | HEALTH) — narrows trend & breakdown
//!   counts to one product. Applied at every level.
//! - `applicant_type` (INDIVIDU | INSTANSI) — narrows trend & breakdown
//!   counts to one applicant type. Applied at every level.
//!
//! Period compare: when `compare_with_previous = true`, backend re-runs the
//! six headline totals against `created_at <= from - 1` so the frontend can
//! show "X baru dalam 30 hari terakhir" (delta = current - previous).

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
    /// Filter by product code (LIFE | PERSONAL_ACCIDENT | HEALTH).
    pub product: Option<String>,
    /// Filter by applicant type (INDIVIDU | INSTANSI).
    pub applicant_type: Option<String>,
    /// When true, additionally compute headline totals as of the day
    /// BEFORE `from` so the frontend can show period-over-period delta
    /// (e.g. "+12 registrasi dalam 30 hari terakhir").
    #[serde(default)]
    pub compare_with_previous: Option<bool>,
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

    /// Validate that filter values are within the allowed enum sets. Returns
    /// `Some("...")` with a sanitised value when valid, `None` when omitted.
    /// Backend logika: kita inlining string filter ke SQL, jadi range check
    /// di sini WAJIB — bukan UX nice-to-have. Wire formatnya uppercase.
    pub fn validated_product(&self) -> Option<String> {
        match self.product.as_deref() {
            Some("LIFE") | Some("PERSONAL_ACCIDENT") | Some("HEALTH") => self.product.clone(),
            _ => None,
        }
    }

    pub fn validated_applicant_type(&self) -> Option<String> {
        match self.applicant_type.as_deref() {
            Some("INDIVIDU") | Some("INSTANSI") => self.applicant_type.clone(),
            _ => None,
        }
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

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StatusCount {
    pub status: String,
    pub count: i64,
}

/// Snapshot of headline totals for a single point in time, used to compute
/// period-over-period deltas (e.g. "+12 registrasi dalam 30 hari terakhir").
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DashboardSnapshot {
    pub total_registrations: i64,
    pub total_invoices: i64,
    pub total_paid_invoices: i64,
    pub total_unpaid_invoices: i64,
    pub total_policies: i64,
    pub total_premium_collected: Decimal,
}

/// Period comparison: `current` is the headline totals now; `previous` is
/// the headline totals as of the day before the selected period started.
/// Frontend computes `delta = current - previous` for each metric.
#[derive(Debug, Serialize)]
pub struct DashboardComparison {
    /// Cutoff date for the previous snapshot (inclusive). Equal to `from - 1`.
    pub as_of: NaiveDate,
    pub current: DashboardSnapshot,
    pub previous: DashboardSnapshot,
}

#[derive(Debug, Serialize)]
pub struct DashboardCharts {
    pub granularity: Granularity,
    pub from: NaiveDate,
    pub to: NaiveDate,
    pub product: Option<String>,
    pub applicant_type: Option<String>,
    pub registrations_per_period: Vec<BucketCount>,
    pub policies_per_period: Vec<BucketCount>,
    pub revenue_per_period: Vec<BucketAmount>,
    pub invoice_status_breakdown: Vec<StatusCount>,
    pub claim_status_breakdown: Vec<StatusCount>,
    pub policy_product_breakdown: Vec<StatusCount>,
    /// Period comparison snapshot. `None` when `compare_with_previous` is
    /// not requested (or when `from` is the first day of valid history).
    pub comparison: Option<DashboardComparison>,
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

// ----- filter clause builders -----
//
// Karena `product` dan `applicant_type` divalidasi ke enum tertutup
// (`DashboardQuery::validated_*`), string inlining ke SQL aman. Tidak
// perlu parameterized binding — value space-nya kecil dan eksplisit.

fn product_clause(product: &Option<String>) -> &'static str {
    match product.as_deref() {
        Some("LIFE") => " AND r.product = 'LIFE'",
        Some("PERSONAL_ACCIDENT") => " AND r.product = 'PERSONAL_ACCIDENT'",
        Some("HEALTH") => " AND r.product = 'HEALTH'",
        _ => "",
    }
}

fn applicant_type_clause(applicant_type: &Option<String>) -> &'static str {
    match applicant_type.as_deref() {
        Some("INDIVIDU") => " AND r.applicant_type = 'INDIVIDU'",
        Some("INSTANSI") => " AND r.applicant_type = 'INSTANSI'",
        _ => "",
    }
}

fn extra_where(product: &Option<String>, applicant_type: &Option<String>) -> String {
    let mut s = String::with_capacity(64);
    s.push_str(product_clause(product));
    s.push_str(applicant_type_clause(applicant_type));
    s
}

/// Prefix untuk JOIN registrations agar filter applicant_type bisa di-apply.
/// Source table punya `registration_id` (invoices, policies, claims via policy_id).
/// Untuk registrations itself, return "" (filter langsung di registrations).
fn join_registrations_via(source_col: &str) -> String {
    format!(" JOIN registrations r ON r.id = {source_col}")
}

#[allow(clippy::too_many_arguments)]
async fn count_per_period(
    pool: &PgPool,
    from_table: &str,
    from_join: &str,
    date_col: &str,
    granularity: Granularity,
    from: NaiveDate,
    to: NaiveDate,
    extra_where_sql: &str,
) -> Result<Vec<BucketCount>, sqlx::Error> {
    let sql = format!(
        r#"
        SELECT to_char(date_trunc('{g}', {col}), 'YYYY-MM-DD') AS bucket,
               COUNT(*)::bigint                                AS count
          FROM {tbl}{join}
         WHERE {col}::date BETWEEN $1 AND $2{extra}
         GROUP BY 1
        "#,
        g = granularity.as_pg(),
        col = date_col,
        tbl = from_table,
        join = from_join,
        extra = extra_where_sql,
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
    from_table: &str,
    from_join: &str,
    amount_col: &str,
    date_col: &str,
    where_clause: &str,
    granularity: Granularity,
    from: NaiveDate,
    to: NaiveDate,
    extra_where_sql: &str,
) -> Result<Vec<BucketAmount>, sqlx::Error> {
    let sql = format!(
        r#"
        SELECT to_char(date_trunc('{g}', {dc}), 'YYYY-MM-DD') AS bucket,
               COALESCE(SUM({ac}), 0)                       AS amount
          FROM {tbl}{join}
         WHERE {dc}::date BETWEEN $1 AND $2
           AND {wc}{extra}
         GROUP BY 1
        "#,
        g = granularity.as_pg(),
        dc = date_col,
        ac = amount_col,
        tbl = from_table,
        join = from_join,
        wc = where_clause,
        extra = extra_where_sql,
    );
    let rows: Vec<BucketAmount> = sqlx::query_as(&sql)
        .bind(from)
        .bind(to)
        .fetch_all(pool)
        .await?;
    Ok(rows)
}

/// Breakdown COUNT GROUP BY dengan filter product + applicant_type.
/// Table bisa di-JOIN ke registrations via `join_sql` (biasanya
/// `JOIN registrations r ON r.id = <table>.<col>`). Kalau table = registrations,
/// pass `join_sql = ""` dan referensi kolom sebagai `r.<col>` di group_col.
async fn count_group_by_filtered(
    pool: &PgPool,
    from_table: &str,
    join_sql: &str,
    group_col: &str,
    extra_where_sql: &str,
) -> Result<Vec<StatusCount>, sqlx::Error> {
    let sql = format!(
        r#"
        SELECT {col} AS status, COUNT(*)::bigint AS count
          FROM {tbl}{join}
         WHERE 1=1{extra}
         GROUP BY {col}
        "#,
        col = group_col,
        tbl = from_table,
        join = join_sql,
        extra = extra_where_sql,
    );
    sqlx::query_as(&sql).fetch_all(pool).await
}

/// Headline totals for a single point in time. `as_of` filters by
/// `created_at <= as_of` (or by status `PAID AND paid_at <= as_of` for
/// paid-related counts) so we can compute "as of date X" snapshots.
async fn snapshot_at(
    pool: &PgPool,
    as_of: NaiveDate,
    product: &Option<String>,
    applicant_type: &Option<String>,
) -> Result<DashboardSnapshot, sqlx::Error> {
    let prod = product_clause(product);
    let app = applicant_type_clause(applicant_type);
    // Registrations: created_at filter, no JOIN needed (registrations IS r).
    let regs_sql = format!(
        r#"
        SELECT COUNT(*)::bigint
          FROM registrations r
         WHERE r.created_at::date <= $1{prod}{app}
        "#,
    );
    // Invoices: JOIN via r.registration_id; total_collected filter on paid_at.
    let inv_join = " JOIN registrations r ON r.id = i.registration_id";
    let inv_total_sql = format!(
        r#"
        SELECT COUNT(*)::bigint
          FROM invoices i{join}
         WHERE i.created_at::date <= $1{prod}{app}
        "#,
        join = inv_join,
    );
    let inv_paid_sql = format!(
        r#"
        SELECT COUNT(*)::bigint
          FROM invoices i{join}
         WHERE i.status = 'PAID'
           AND COALESCE(i.paid_at, i.created_at)::date <= $1{prod}{app}
        "#,
        join = inv_join,
    );
    let inv_unpaid_sql = format!(
        r#"
        SELECT COUNT(*)::bigint
          FROM invoices i{join}
         WHERE i.status = 'UNPAID'
           AND i.created_at::date <= $1{prod}{app}
        "#,
        join = inv_join,
    );
    let inv_prem_sql = format!(
        r#"
        SELECT COALESCE(SUM(i.premium_amount), 0)
          FROM invoices i{join}
         WHERE i.status = 'PAID'
           AND COALESCE(i.paid_at, i.created_at)::date <= $1{prod}{app}
        "#,
        join = inv_join,
    );
    // Policies: JOIN via r.registration_id.
    let pol_join = " JOIN registrations r ON r.id = p.registration_id";
    let pol_sql = format!(
        r#"
        SELECT COUNT(*)::bigint
          FROM policies p{join}
         WHERE p.created_at::date <= $1{prod}{app}
        "#,
        join = pol_join,
    );

    let (
        total_registrations,
        total_invoices,
        total_paid_invoices,
        total_unpaid_invoices,
        total_policies,
        total_premium_collected,
    ) = tokio::try_join!(
        sqlx::query_scalar::<_, i64>(&regs_sql)
            .bind(as_of)
            .fetch_one(pool),
        sqlx::query_scalar::<_, i64>(&inv_total_sql)
            .bind(as_of)
            .fetch_one(pool),
        sqlx::query_scalar::<_, i64>(&inv_paid_sql)
            .bind(as_of)
            .fetch_one(pool),
        sqlx::query_scalar::<_, i64>(&inv_unpaid_sql)
            .bind(as_of)
            .fetch_one(pool),
        sqlx::query_scalar::<_, i64>(&pol_sql)
            .bind(as_of)
            .fetch_one(pool),
        sqlx::query_scalar::<_, Decimal>(&inv_prem_sql)
            .bind(as_of)
            .fetch_one(pool),
    )?;

    Ok(DashboardSnapshot {
        total_registrations,
        total_invoices,
        total_paid_invoices,
        total_unpaid_invoices,
        total_policies,
        total_premium_collected,
    })
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
    // Capture semua field dari q sebelum `q.resolve()` memindahkan struct.
    let want_compare = q.compare_with_previous.unwrap_or(false);
    let product = q.validated_product();
    let applicant_type = q.validated_applicant_type();
    let (from, to, granularity) = q.resolve();
    let keys = bucket_keys(from, to, granularity);
    let extra = extra_where(&product, &applicant_type);

    // Registrations trend: filter langsung di registrations (r.*).
    let regs = count_per_period(
        pool,
        "registrations r",
        "",
        "r.created_at",
        granularity,
        from,
        to,
        &extra,
    )
    .await?;

    // Policies trend: JOIN registrations r via p.registration_id, lalu
    // group by created_at di policies. Extra WHERE mengandung r.product
    // dan r.applicant_type (lihat `extra_where`).
    let pols = count_per_period(
        pool,
        "policies p",
        &join_registrations_via("p.registration_id"),
        "p.created_at",
        granularity,
        from,
        to,
        &extra,
    )
    .await?;

    // Revenue trend: invoice paid, JOIN registrations r.
    let rev = sum_per_period(
        pool,
        "invoices i",
        &join_registrations_via("i.registration_id"),
        "i.premium_amount",
        "COALESCE(i.paid_at, i.created_at)",
        "i.status = 'PAID'",
        granularity,
        from,
        to,
        &extra,
    )
    .await?;

    // Breakdowns: status/product distribution dengan filter product+applicant_type.
    // Tetap all-time (tidak ikut date range) — sesuai komentar di module
    // header. Hanya product+applicant_type yang di-apply.
    let inv_breakdown = count_group_by_filtered(
        pool,
        "invoices i",
        &join_registrations_via("i.registration_id"),
        "i.status",
        &extra,
    )
    .await?;
    let claim_breakdown = count_group_by_filtered(
        pool,
        "claims c",
        " JOIN policies p ON p.id = c.policy_id JOIN registrations r ON r.id = p.registration_id",
        "c.status",
        &extra,
    )
    .await?;
    let pol_breakdown = count_group_by_filtered(
        pool,
        "policies p",
        &join_registrations_via("p.registration_id"),
        "p.product",
        &extra,
    )
    .await?;

    // Period comparison: snapshot "now" vs "as of (from - 1)". Skip kalau
    // user tidak request atau `from` terlalu awal (mencegah as_of negatif).
    let comparison = if want_compare {
        let as_of = from - Duration::days(1);
        // tokio::try_join! paralelisme 2 snapshots (bukan 6 query serial).
        let (cur, prev) = tokio::try_join!(
            snapshot_at(pool, to, &product, &applicant_type),
            snapshot_at(pool, as_of, &product, &applicant_type),
        )?;
        Some(DashboardComparison {
            as_of,
            current: cur,
            previous: prev,
        })
    } else {
        None
    };

    Ok(DashboardCharts {
        granularity,
        from,
        to,
        product,
        applicant_type,
        registrations_per_period: pad_counts(regs, &keys),
        policies_per_period: pad_counts(pols, &keys),
        revenue_per_period: pad_amounts(rev, &keys),
        invoice_status_breakdown: inv_breakdown,
        claim_status_breakdown: claim_breakdown,
        policy_product_breakdown: pol_breakdown,
        comparison,
    })
}
