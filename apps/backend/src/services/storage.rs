//! Local filesystem storage for uploaded files (KTP, claim documents).
//!
//! Path layout: `${UPLOAD_DIR}/{kind}/{owner_id}/{filename}`
//! where kind ∈ {"ktp", "claims"} and owner_id is a UUID.
//!
//! Files MUST be served back through authorized endpoints (see M4/M5
//! for the policy PDF download), never via static file middleware — the
//! spec requires non-public storage with authorized serving.

use std::path::{Path, PathBuf};
use tokio::fs;
use uuid::Uuid;

use crate::error::AppError;

pub const MAX_KTP_BYTES: usize = 5 * 1024 * 1024; // 5 MB per spec FS-02.

const ALLOWED_KTP_MIMES: &[&str] = &["image/jpeg", "image/png", "application/pdf"];

pub async fn save_ktp(
    upload_dir: &str,
    customer_id: Uuid,
    original_filename: &str,
    content_type: &str,
    bytes: &[u8],
) -> Result<String, AppError> {
    validate_ktp(content_type, bytes.len())?;

    let safe_name = sanitize_filename(original_filename);
    let relative = format!("ktp/{customer_id}/{safe_name}");
    let absolute = resolve(upload_dir, &relative);

    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("create_dir: {e}")))?;
    }

    fs::write(&absolute, bytes)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("write upload: {e}")))?;

    Ok(relative)
}

pub async fn save_claim_doc(
    upload_dir: &str,
    claim_id: Uuid,
    original_filename: &str,
    content_type: &str,
    bytes: &[u8],
) -> Result<String, AppError> {
    // Reuse size cap for claim docs (spec doesn't set a separate limit; conservative).
    if bytes.len() > MAX_KTP_BYTES {
        return Err(AppError::Validation("claim file too large (max 5 MB)".into()));
    }
    if !ALLOWED_KTP_MIMES.contains(&content_type) {
        return Err(AppError::Validation(format!(
            "unsupported claim doc mime type: {content_type}"
        )));
    }

    let safe_name = sanitize_filename(original_filename);
    let relative = format!("claims/{claim_id}/{safe_name}");
    let absolute = resolve(upload_dir, &relative);

    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("create_dir: {e}")))?;
    }

    fs::write(&absolute, bytes)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("write upload: {e}")))?;

    Ok(relative)
}

pub async fn save_policy_pdf(
    upload_dir: &str,
    policy_id: Uuid,
    bytes: &[u8],
) -> Result<String, AppError> {
    let relative = format!("policies/{policy_id}.pdf");
    let absolute = resolve(upload_dir, &relative);

    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("create_dir: {e}")))?;
    }

    fs::write(&absolute, bytes)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("write pdf: {e}")))?;

    Ok(relative)
}

pub fn absolute_path(upload_dir: &str, relative: &str) -> PathBuf {
    resolve(upload_dir, relative)
}

fn resolve(upload_dir: &str, relative: &str) -> PathBuf {
    // Path traversal guard: reject any ".." segment in the relative path.
    for component in Path::new(relative).components() {
        if matches!(component, std::path::Component::ParentDir) {
            return PathBuf::from(upload_dir); // fall back to root, refuse
        }
    }
    Path::new(upload_dir).join(relative)
}

fn validate_ktp(content_type: &str, size: usize) -> Result<(), AppError> {
    if !ALLOWED_KTP_MIMES.contains(&content_type) {
        return Err(AppError::Validation(format!(
            "unsupported KTP mime type: {content_type} (allowed: jpg, png, pdf)"
        )));
    }
    if size > MAX_KTP_BYTES {
        return Err(AppError::Validation(format!(
            "KTP file too large: {size} bytes (max 5 MB)"
        )));
    }
    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    let stem = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("upload");
    let cleaned: String = stem
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if cleaned.is_empty() {
        "upload".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_path_traversal() {
        assert!(!sanitize_filename("../etc/passwd").contains(".."));
        assert!(!sanitize_filename("..\\bad").contains(".."));
    }

    #[test]
    fn resolve_rejects_parent_dir() {
        let p = resolve("/uploads", "../etc/passwd");
        assert_eq!(p, PathBuf::from("/uploads"));
    }
}
