//! Pagination + filter helpers for list endpoints.
//!
//! `PageQuery` collects query-string parameters common across admin/customer
//! list endpoints. Fields are all `Option<>` so endpoints stay
//! backward-compatible — old clients that don't send the new fields work
//! unchanged. New fields are validated via [`validate_sort`] /
//! [`validate_date_field`] (whitelist) to prevent SQL injection through
//! `sort_by` / `date_field` (which are interpolated into the SQL string,
//! not bound as parameters).

use serde::{Deserialize, Serialize};

pub mod filters;

#[derive(Debug, Deserialize)]
pub struct PageQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub q: Option<String>,
    /// Filter by `status` column (used by registrations, invoices, claims, etc).
    pub status: Option<String>,
    /// Filter by `entity_type` column (used by audit-logs; the table has no
    /// `status` column). Distinct from `status` to avoid silent mis-binding
    /// when callers pass a value that looks like a status but should match
    /// entity_type, or vice versa.
    pub entity_type: Option<String>,

    // --- Date range filter (admin filter enhancement) ---
    /// ISO date (YYYY-MM-DD). Lower bound (inclusive) of the `date_field`
    /// column. Validated at the endpoint layer to be parseable as
    /// `chrono::NaiveDate`.
    pub date_from: Option<String>,
    /// ISO date (YYYY-MM-DD). Upper bound (inclusive) of the `date_field`
    /// column.
    pub date_to: Option<String>,
    /// Which date column to filter on. Validated against an endpoint-scoped
    /// whitelist (`created_at` | `due_date` | `paid_at` for invoice, etc).
    /// Invalid values silently fall back to the default
    /// (see [`validate_date_field`]).
    pub date_field: Option<String>,

    // --- Product / claim-type filters (admin filter enhancement) ---
    /// `LIFE` | `PERSONAL_ACCIDENT` | `HEALTH` (used by policy + claim).
    /// Validated against the closed set; otherwise 400.
    pub product: Option<String>,
    /// `DEATH` | `ACCIDENT` | `HOSPITALIZATION` | `MATURITY` | `SURRENDER`
    /// (used by claim). Validated against the closed set; otherwise 400.
    pub claim_type: Option<String>,

    // --- Sort (admin filter enhancement) ---
    /// Column name to sort by. Whitelisted per-endpoint
    /// (see [`validate_sort`]). Invalid values silently fall back to the
    /// endpoint's default column.
    pub sort_by: Option<String>,
    /// `asc` | `desc`. Default `desc`. Other values fall back to `desc`.
    pub sort_dir: Option<String>,
}

impl PageQuery {
    pub fn page(&self) -> u32 {
        self.page.unwrap_or(1).max(1)
    }
    pub fn page_size(&self) -> u32 {
        self.page_size.unwrap_or(20).clamp(1, 100)
    }
    pub fn offset(&self) -> i64 {
        ((self.page() - 1) as i64) * (self.page_size() as i64)
    }
    pub fn limit(&self) -> i64 {
        self.page_size() as i64
    }
}

#[derive(Debug, Serialize)]
pub struct Page<T> {
    pub data: Vec<T>,
    pub page: u32,
    pub page_size: u32,
    pub total: i64,
}

/// Validate `sort_by` against an endpoint-specific whitelist. Returns the
/// first allowed entry (the endpoint's default) when the input is missing
/// or not in the whitelist — this matches the "silent fallback" policy
/// documented in `PageQuery.sort_by`.
///
/// The whitelist is supplied as `&[&str]` of bare column names (e.g.
/// `&["created_at", "due_date"]`). Callers must include the table alias
/// at the call site (e.g. `i.created_at`) when interpolating into SQL.
pub fn validate_sort<'a>(input: Option<&str>, allowed: &'a [&'a str]) -> &'a str {
    match input {
        Some(s) if allowed.iter().any(|a| *a == s) => {
            // Safe: we just confirmed `s` is one of `allowed` entries.
            allowed.iter().find(|a| **a == s).copied().unwrap_or(allowed[0])
        }
        _ => allowed[0],
    }
}

/// Validate `sort_dir`. Returns `"desc"` (most common admin default) for
/// missing or unrecognized values.
pub fn validate_sort_dir(input: Option<&str>) -> &'static str {
    match input {
        Some("asc") => "asc",
        _ => "desc",
    }
}

/// Validate `date_field` against an endpoint-specific whitelist. Returns
/// the first allowed entry (the endpoint's default) when the input is
/// missing or not in the whitelist.
///
/// `date_field` is interpolated into SQL (with table alias) and therefore
/// must be whitelisted — same anti-SQL-injection rule as `sort_by`.
pub fn validate_date_field<'a>(input: Option<&str>, allowed: &'a [&'a str]) -> &'a str {
    validate_sort(input, allowed)
}
