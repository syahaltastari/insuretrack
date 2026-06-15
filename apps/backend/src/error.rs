//! Application-wide error type with consistent JSON envelope.
//!
//! Response shape:
//! ```json
//! { "error": { "code": "VALIDATION", "message": "...", "details": {...} } }
//! ```

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("validation failed: {0}")]
    Validation(String),

    #[error("unauthorized")]
    Unauthorized,

    #[error("forbidden")]
    Forbidden,

    /// User login OK tapi email belum diaktivasi (portal_status='PENDING').
    /// Dipakai gate aksi yang butuh akun aktif (mis. submit aplikasi
    /// asuransi, claim, inquiry). Frontend pakai error code ini untuk
    /// tampilkan banner "aktivasi email".
    #[error("email belum diaktivasi")]
    EmailNotActivated,

    #[error("not found: {0}")]
    NotFound(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("idempotent replay")]
    IdempotentReplay,

    #[error("upstream error: {0}")]
    Upstream(String),

    #[error("internal error: {0}")]
    Internal(#[from] anyhow::Error),

    #[error("database error: {0}")]
    Sqlx(#[from] sqlx::Error),
}

impl AppError {
    fn status_and_code(&self) -> (StatusCode, &'static str) {
        match self {
            AppError::Validation(_) => (StatusCode::BAD_REQUEST, "VALIDATION"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED"),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "FORBIDDEN"),
            AppError::EmailNotActivated => (StatusCode::FORBIDDEN, "EMAIL_NOT_ACTIVATED"),
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "NOT_FOUND"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "CONFLICT"),
            AppError::IdempotentReplay => (StatusCode::OK, "OK"),
            AppError::Upstream(_) => (StatusCode::BAD_GATEWAY, "UPSTREAM_ERROR"),
            AppError::Internal(_) | AppError::Sqlx(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR")
            }
        }
    }
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    code: &'a str,
    message: String,
}

#[derive(Serialize)]
struct ErrorEnvelope<'a> {
    error: ErrorBody<'a>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = self.status_and_code();

        // Log internal errors with full chain; surface safe message to client.
        let message = match &self {
            AppError::Internal(e) => {
                tracing::error!(error = ?e, "internal error");
                "internal server error".to_string()
            }
            AppError::Sqlx(e) => {
                tracing::error!(error = ?e, "database error");
                "database error".to_string()
            }
            other => other.to_string(),
        };

        let body = ErrorEnvelope {
            error: ErrorBody { code, message },
        };
        (status, Json(json!(body))).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
