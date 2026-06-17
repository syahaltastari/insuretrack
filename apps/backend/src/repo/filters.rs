//! Validation helpers + ORDER BY builder for admin list endpoints.
//!
//! Endpoints in `routes/admin.rs` each repeat the same shape of
//! SQL building for the new admin filter enhancements (date range,
//! product, claim_type, sort). The **string interpolation** of column
//! names + `sort_dir` is the part that needs a central whitelist —
//! without it, an attacker could send `?sort_by=1; DROP TABLE invoices`
//! and break out of the SQL string.
//!
//! This module provides:
//!
//! - `VALID_PRODUCTS` / `VALID_CLAIM_TYPES` — closed sets, validated at
//!   the endpoint layer; a value outside the set returns
//!   `AppError::Validation` (400).
//! - `parse_date_range` — converts the raw `Option<String>` from
//!   `PageQuery` into `Option<NaiveDate>` pairs, returning
//!   `AppError::Validation` on bad input and on `from > to`.
//! - `validate_date_field` / `validate_sort` / `validate_sort_dir` —
//!   re-exported for convenience. They live in `repo/mod.rs` because they
//!   are tiny; this module re-exports to keep import lists in handlers
//!   short.
//! - `order_clause` — small helper that combines a validated column +
//!   validated dir into a final `ORDER BY ...` string.
//!
//! ## Why no shared WHERE-clause builder
//!
//! sqlx requires numbered, sequential placeholders (`$1, $2, ...`) in
//! the final SQL string — there is no way to defer placeholder
//! numbering to bind time. A "builder" that returns placeholders like
//! `$X` would just shift the problem to the handler. The pattern we use
//! instead: each handler keeps its own SQL string with **literal**
//! numbered placeholders, but it sources the column / sort_dir strings
//! from this module's validators so the SQL is safe to interpolate.

use crate::error::{AppError, AppResult};
use chrono::NaiveDate;

pub use crate::repo::{validate_date_field, validate_sort, validate_sort_dir};

/// Closed set of products. Used to validate the `?product=` query param
/// before binding it as a SQL parameter.
pub const VALID_PRODUCTS: &[&str] = &["LIFE", "PERSONAL_ACCIDENT", "HEALTH"];

/// Closed set of claim types. Mirrors the value set in the
/// `claim_type` CHECK constraint (see migration 0001).
pub const VALID_CLAIM_TYPES: &[&str] = &[
    "DEATH",
    "ACCIDENT",
    "HOSPITALIZATION",
    "MATURITY",
    "SURRENDER",
];

/// Parse + validate a `product` query string. Returns:
/// - `Ok(None)` when the caller sent no value (filter not applied)
/// - `Ok(Some(v))` when the value is in the closed set
/// - `Err(Validation)` when the value is present but not in the set
///
/// `Option::None` is deliberately not allowed: an empty string from the
/// query string is treated as "no filter" and normalized to `None`
/// upstream (handlers should treat `""` the same as `None`).
pub fn parse_product(raw: Option<&str>) -> AppResult<Option<String>> {
    match raw {
        None => Ok(None),
        Some(v) if v.is_empty() => Ok(None),
        Some(v) if VALID_PRODUCTS.contains(&v) => Ok(Some(v.to_string())),
        Some(v) => Err(AppError::Validation(format!(
            "invalid product '{v}'; must be one of {}",
            VALID_PRODUCTS.join("|")
        ))),
    }
}

/// Parse + validate a `claim_type` query string. Same contract as
/// [`parse_product`].
pub fn parse_claim_type(raw: Option<&str>) -> AppResult<Option<String>> {
    match raw {
        None => Ok(None),
        Some(v) if v.is_empty() => Ok(None),
        Some(v) if VALID_CLAIM_TYPES.contains(&v) => Ok(Some(v.to_string())),
        Some(v) => Err(AppError::Validation(format!(
            "invalid claim_type '{v}'; must be one of {}",
            VALID_CLAIM_TYPES.join("|")
        ))),
    }
}

/// Parse `date_from` / `date_to` query strings into `NaiveDate`.
///
/// Returns:
/// - `(None, None)` when both are missing or empty
/// - `Err(Validation)` when either string is not a valid `YYYY-MM-DD`,
///   or when `from > to`
///
/// Format is strict ISO date (no time). Time-of-day filtering is
/// intentionally not exposed in the admin filter UI for v1.
pub fn parse_date_range(
    raw_from: Option<&str>,
    raw_to: Option<&str>,
) -> AppResult<(Option<NaiveDate>, Option<NaiveDate>)> {
    let from = match raw_from {
        None | Some("") => None,
        Some(s) => Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| {
            AppError::Validation(format!("invalid date_from '{s}' (expected YYYY-MM-DD): {e}"))
        })?),
    };
    let to = match raw_to {
        None | Some("") => None,
        Some(s) => Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| {
            AppError::Validation(format!("invalid date_to '{s}' (expected YYYY-MM-DD): {e}"))
        })?),
    };
    if let (Some(f), Some(t)) = (from, to) {
        if f > t {
            return Err(AppError::Validation(format!(
                "date_from ({f}) must be on or before date_to ({t})"
            )));
        }
    }
    Ok((from, to))
}

/// Build a safe `ORDER BY <column> <dir>` fragment.
///
/// Both `column` and `dir` MUST come from a whitelist in the caller
/// (see `validate_sort` / `validate_sort_dir` in `repo/mod.rs`).
/// We don't re-validate here to keep the function cheap; passing an
/// unsanitized value would be a security bug.
pub fn order_clause(column: &str, dir: &str) -> String {
    format!("ORDER BY {column} {dir}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_product_none_when_missing() {
        assert!(parse_product(None).unwrap().is_none());
    }

    #[test]
    fn parse_product_none_when_empty() {
        assert!(parse_product(Some("")).unwrap().is_none());
    }

    #[test]
    fn parse_product_accepts_known_values() {
        for v in VALID_PRODUCTS {
            assert_eq!(
                parse_product(Some(v)).unwrap(),
                Some(v.to_string()),
                "expected '{v}' to be accepted"
            );
        }
    }

    #[test]
    fn parse_product_rejects_unknown() {
        let err = parse_product(Some("UNKNOWN")).unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn parse_claim_type_accepts_known_values() {
        for v in VALID_CLAIM_TYPES {
            assert!(parse_claim_type(Some(v)).unwrap().is_some());
        }
    }

    #[test]
    fn parse_claim_type_rejects_unknown() {
        assert!(parse_claim_type(Some("FIRE")).is_err());
    }

    #[test]
    fn parse_date_range_handles_missing() {
        let (f, t) = parse_date_range(None, None).unwrap();
        assert!(f.is_none() && t.is_none());
    }

    #[test]
    fn parse_date_range_parses_valid() {
        let (f, t) = parse_date_range(Some("2026-06-01"), Some("2026-06-30")).unwrap();
        assert_eq!(f, NaiveDate::from_ymd_opt(2026, 6, 1));
        assert_eq!(t, NaiveDate::from_ymd_opt(2026, 6, 30));
    }

    #[test]
    fn parse_date_range_rejects_bad_format() {
        assert!(parse_date_range(Some("01-06-2026"), None).is_err());
        assert!(parse_date_range(None, Some("not-a-date")).is_err());
    }

    #[test]
    fn parse_date_range_rejects_inverted_range() {
        let err = parse_date_range(Some("2026-06-30"), Some("2026-06-01")).unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn parse_date_range_allows_same_day() {
        let (f, t) = parse_date_range(Some("2026-06-01"), Some("2026-06-01")).unwrap();
        assert_eq!(f, t);
    }

    #[test]
    fn order_clause_combines_column_and_dir() {
        assert_eq!(order_clause("i.created_at", "asc"), "ORDER BY i.created_at asc");
    }
}
