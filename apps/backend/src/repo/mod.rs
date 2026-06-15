//! Pagination helper for list endpoints.

use serde::{Deserialize, Serialize};

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
