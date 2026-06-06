//! Resend HTTP API client for transactional email delivery.
//!
//! Stub di Task 4 — di-fill dengan HTTP call proper di Task 5.

use crate::error::AppError;

#[derive(Clone)]
pub struct ResendClient {
    _api_key: String,
    _from_email: String,
    _from_name: Option<String>,
}

impl ResendClient {
    pub fn new(api_key: String, from_email: String, from_name: Option<String>) -> Result<Self, AppError> {
        Ok(Self {
            _api_key: api_key,
            _from_email: from_email,
            _from_name: from_name,
        })
    }
}
