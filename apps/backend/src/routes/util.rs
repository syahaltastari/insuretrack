//! Shared helpers for route modules — CSV export, query string parsing.
//!
//! Dipakai oleh list endpoint di `admin.rs` (registrations/invoices/...)
//! dan `admin_customers.rs`. Sebelum extraction, helpers ini duplicatable
//! atau private di `admin.rs` — sekarang sentralisasi supaya semua
//! list endpoint share pola yang sama (escape RFC 4180, header filename).

use axum::{
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use chrono::Utc;
use serde::Deserialize;

/// Query string untuk toggle JSON vs CSV pada list endpoint.
/// `?format=csv` → CSV stream (semua row, no pagination).
/// Default → JSON Page<T>.
#[derive(Debug, Deserialize)]
pub struct ListFormatQuery {
    #[serde(default)]
    pub format: Option<String>,
}

impl ListFormatQuery {
    pub fn is_csv(&self) -> bool {
        self.format.as_deref() == Some("csv")
    }
}

/// Escape satu field CSV per RFC 4180.
pub fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// Build response CSV download. `headers` = label kolom; `rows` = cell
/// text per row (Decimal / NaiveDate / Option<…> pre-format ke String
/// sebelum dipanggil). Filename di-prefix dengan tanggal hari ini.
pub fn csv_response(headers: &[&str], rows: Vec<Vec<String>>, filename: &str) -> Response {
    let mut s = String::new();
    s.push_str(
        &headers
            .iter()
            .map(|h| csv_escape(h))
            .collect::<Vec<_>>()
            .join(","),
    );
    s.push_str("\r\n");
    for row in rows {
        s.push_str(
            &row.iter()
                .map(|c| csv_escape(c))
                .collect::<Vec<_>>()
                .join(","),
        );
        s.push_str("\r\n");
    }
    let mut resp = (StatusCode::OK, s).into_response();
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    let today = Utc::now().format("%Y-%m-%d");
    let safe_name = format!("{}-{}.csv", filename, today);
    let disp = format!("attachment; filename=\"{}\"", safe_name);
    if let Ok(v) = HeaderValue::from_str(&disp) {
        resp.headers_mut().insert(header::CONTENT_DISPOSITION, v);
    }
    resp
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_through_plain_strings() {
        assert_eq!(csv_escape("hello"), "hello");
        assert_eq!(csv_escape("REG-202606-000001"), "REG-202606-000001");
        assert_eq!(csv_escape(""), "");
    }

    #[test]
    fn wraps_values_with_comma() {
        assert_eq!(csv_escape("Doe, John"), r#""Doe, John""#);
    }

    #[test]
    fn doubles_inner_quotes() {
        assert_eq!(csv_escape(r#"she said "hi""#), r#""she said ""hi""""#);
    }

    #[test]
    fn wraps_values_with_newlines() {
        assert_eq!(csv_escape("line1\nline2"), "\"line1\nline2\"");
        assert_eq!(csv_escape("line1\r\nline2"), "\"line1\r\nline2\"");
    }
}
