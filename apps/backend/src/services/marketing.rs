//! Marketing asset storage (client logos, testimonial photos).
//! Path: `${UPLOAD_DIR}/{kind}/{owner_id}/{filename}` where
//! kind ∈ {"clients", "testimonials"}.

use std::path::{Path, PathBuf};
use tokio::fs;
use uuid::Uuid;

use crate::error::AppError;

const MAX_BYTES: usize = 2 * 1024 * 1024; // 2 MB — gambar kecil.

const ALLOWED_MIMES: &[&str] = &["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

pub async fn save_image(
    upload_dir: &str,
    kind: &str,
    owner_id: Uuid,
    original_filename: &str,
    content_type: &str,
    bytes: &[u8],
) -> Result<String, AppError> {
    if !ALLOWED_MIMES.contains(&content_type) {
        return Err(AppError::Validation(format!(
            "unsupported mime type: {content_type} (allowed: jpg, png, webp, svg)"
        )));
    }
    if bytes.len() > MAX_BYTES {
        return Err(AppError::Validation(format!(
            "file too large: {} bytes (max {} bytes)",
            bytes.len(),
            MAX_BYTES
        )));
    }
    if !matches!(kind, "clients" | "testimonials") {
        return Err(AppError::Validation(format!("invalid asset kind: {kind}")));
    }

    let safe_name = sanitize_filename(original_filename);
    let relative = format!("{kind}/{owner_id}/{safe_name}");
    let absolute = resolve(upload_dir, &relative);

    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("create_dir: {e}")))?;
    }
    fs::write(&absolute, bytes)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("write: {e}")))?;

    Ok(relative)
}

fn resolve(upload_dir: &str, relative: &str) -> PathBuf {
    for component in Path::new(relative).components() {
        if matches!(component, std::path::Component::ParentDir) {
            return PathBuf::from(upload_dir);
        }
    }
    Path::new(upload_dir).join(relative)
}

fn sanitize_filename(name: &str) -> String {
    let stem = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("asset");
    let cleaned: String = stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "asset".to_string()
    } else {
        cleaned
    }
}
