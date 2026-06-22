//! Storage abstraction for uploaded files (KTP, claim documents, policy PDFs).
//!
//! Dua backend didukung via env `STORAGE_BACKEND`:
//! - `local`: filesystem di `UPLOAD_DIR` (dev default)
//! - `r2`:    Cloudflare R2 via S3-compatible API
//!
//! Key layout konsisten di kedua backend: `{kind}/{owner_id}/{filename}`.
//! "key" yang disimpan di DB adalah opaque string; resolusi ke URL publik
//! atau byte stream di-handle oleh `Storage::public_url` / `read_bytes`.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client as S3Client;
use tokio::fs;
use uuid::Uuid;

use crate::error::AppError;

pub const MAX_KTP_BYTES: usize = 5 * 1024 * 1024; // 5 MB per spec FS-02.
const ALLOWED_KTP_MIMES: &[&str] = &["image/jpeg", "image/png", "application/pdf"];

/// Mime types & size limit untuk bukti pembayaran klaim — sama dengan
/// KTP/claim_doc (JPG/PNG/PDF, 5 MB). Dipakai admin saat transisi klaim
/// APPROVED → PAID, lihat `routes/admin.rs::upload_payment_proof`.
const ALLOWED_PAYMENT_PROOF_MIMES: &[&str] = &["image/jpeg", "image/png", "application/pdf"];
const MAX_PAYMENT_PROOF_BYTES: usize = 5 * 1024 * 1024;

/// Opaque reference ke object yang tersimpan. Disimpan di kolom DB (ktp_path,
/// pdf_path, claim doc path) tanpa backend-specific prefix.
#[derive(Debug, Clone)]
pub struct StoredRef {
    /// Key/path di storage backend (mis. `ktp/<uuid>/file.jpg`).
    pub key: String,
    /// Identifier backend (`"local"` atau `"r2"`).
    pub backend: &'static str,
}

#[async_trait]
pub trait Storage: Send + Sync {
    async fn save_ktp(
        &self,
        customer_id: Uuid,
        original_filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError>;

    async fn save_claim_doc(
        &self,
        claim_id: Uuid,
        original_filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError>;

    async fn save_policy_pdf(&self, policy_id: Uuid, bytes: &[u8]) -> Result<StoredRef, AppError>;

    /// Bukti pembayaran klaim yang di-upload admin saat transisi
    /// APPROVED → PAID. Key prefix `payment_proofs/{claim_id}/…` (pisah
    /// dari `claims/{claim_id}/…` agar tidak konflik dengan dokumen
    /// pendukung yang di-upload customer).
    async fn save_payment_proof(
        &self,
        claim_id: Uuid,
        original_filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError>;

    async fn save_invoice_pdf(&self, invoice_id: Uuid, bytes: &[u8])
        -> Result<StoredRef, AppError>;

    /// Bukti Pembayaran (receipt) PDF — di-render di payment_webhook
    /// setelah invoice bertransisi UNPAID → PAID. Key: `receipts/{invoice_id}.pdf`.
    /// 1:1 dengan invoice (satu invoice = satu receipt); regenerate
    /// saat ini belum disupport — lihat TODO(M-receipt) di payment_webhook.
    async fn save_receipt_pdf(&self, invoice_id: Uuid, bytes: &[u8])
        -> Result<StoredRef, AppError>;

    /// Fetch raw bytes (untuk email attachment, download endpoint, dll).
    async fn read_bytes(&self, key: &str) -> Result<Vec<u8>, AppError>;

    /// Public URL untuk display object. None kalau backend tidak serve
    /// publik (caller pakai `read_bytes` via authorized endpoint).
    fn public_url(&self, key: &str) -> Option<String>;
}

// ============================================================
// LocalStorage
// ============================================================

pub struct LocalStorage {
    upload_dir: String,
}

impl LocalStorage {
    pub fn new(upload_dir: String) -> Self {
        Self { upload_dir }
    }

    fn absolute(&self, key: &str) -> PathBuf {
        let safe = guard_key(key);
        Path::new(&self.upload_dir).join(safe)
    }
}

#[async_trait]
impl Storage for LocalStorage {
    async fn save_ktp(
        &self,
        customer_id: Uuid,
        original_filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError> {
        validate_ktp(content_type, bytes.len())?;
        let safe_name = sanitize_filename(original_filename);
        let key = format!("ktp/{customer_id}/{safe_name}");
        let absolute = self.absolute(&key);
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("create_dir: {e}")))?;
        }
        fs::write(&absolute, bytes)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("write upload: {e}")))?;
        Ok(StoredRef {
            key,
            backend: "local",
        })
    }

    async fn save_claim_doc(
        &self,
        claim_id: Uuid,
        original_filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError> {
        if bytes.len() > MAX_KTP_BYTES {
            return Err(AppError::Validation(
                "claim file too large (max 5 MB)".into(),
            ));
        }
        if !ALLOWED_KTP_MIMES.contains(&content_type) {
            return Err(AppError::Validation(format!(
                "unsupported claim doc mime type: {content_type}"
            )));
        }
        let safe_name = sanitize_filename(original_filename);
        let key = format!("claims/{claim_id}/{safe_name}");
        let absolute = self.absolute(&key);
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("create_dir: {e}")))?;
        }
        fs::write(&absolute, bytes)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("write upload: {e}")))?;
        Ok(StoredRef {
            key,
            backend: "local",
        })
    }

    async fn save_policy_pdf(&self, policy_id: Uuid, bytes: &[u8]) -> Result<StoredRef, AppError> {
        let key = format!("policies/{policy_id}.pdf");
        let absolute = self.absolute(&key);
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("create_dir: {e}")))?;
        }
        fs::write(&absolute, bytes)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("write pdf: {e}")))?;
        Ok(StoredRef {
            key,
            backend: "local",
        })
    }

    async fn save_invoice_pdf(
        &self,
        invoice_id: Uuid,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError> {
        let key = format!("invoices/{invoice_id}.pdf");
        let absolute = self.absolute(&key);
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("create_dir: {e}")))?;
        }
        fs::write(&absolute, bytes)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("write pdf: {e}")))?;
        Ok(StoredRef {
            key,
            backend: "local",
        })
    }

    async fn save_receipt_pdf(
        &self,
        invoice_id: Uuid,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError> {
        let key = format!("receipts/{invoice_id}.pdf");
        let absolute = self.absolute(&key);
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("create_dir: {e}")))?;
        }
        fs::write(&absolute, bytes)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("write pdf: {e}")))?;
        Ok(StoredRef {
            key,
            backend: "local",
        })
    }

    async fn save_payment_proof(
        &self,
        claim_id: Uuid,
        original_filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError> {
        if !ALLOWED_PAYMENT_PROOF_MIMES.contains(&content_type) {
            return Err(AppError::Validation(format!(
                "unsupported payment proof mime type: {content_type} (allowed: jpg, png, pdf)"
            )));
        }
        if bytes.len() > MAX_PAYMENT_PROOF_BYTES {
            return Err(AppError::Validation(format!(
                "payment proof too large: {} bytes (max 5 MB)",
                bytes.len()
            )));
        }
        let safe_name = sanitize_filename(original_filename);
        let key = format!("payment_proofs/{claim_id}/{safe_name}");
        let absolute = self.absolute(&key);
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("create_dir: {e}")))?;
        }
        fs::write(&absolute, bytes)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("write upload: {e}")))?;
        Ok(StoredRef {
            key,
            backend: "local",
        })
    }

    async fn read_bytes(&self, key: &str) -> Result<Vec<u8>, AppError> {
        let absolute = self.absolute(key);
        fs::read(&absolute)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("read upload: {e}")))
    }

    fn public_url(&self, key: &str) -> Option<String> {
        // Local serve via authorized endpoint `/api/public/uploads/{key}`
        // — bukan direct file path. Caller/front-end tinggal substitusi
        // media_base_url di depan.
        Some(format!("/api/public/uploads/{key}"))
    }
}

// ============================================================
// R2Storage
// ============================================================

pub struct R2Storage {
    client: S3Client,
    bucket: String,
    public_base: String,
}

impl R2Storage {
    pub async fn new(
        account_id: &str,
        access_key_id: &str,
        secret_access_key: &str,
        bucket: String,
        public_base: String,
    ) -> Self {
        let creds = aws_credential_types::Credentials::new(
            access_key_id,
            secret_access_key,
            None, // session token
            None, // expiry
            "r2-static",
        );
        let shared = aws_credential_types::provider::SharedCredentialsProvider::new(creds);
        let endpoint = format!("https://{account_id}.r2.cloudflarestorage.com");
        let cfg = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .endpoint_url(&endpoint)
            .region(aws_sdk_s3::config::Region::new("auto"))
            .credentials_provider(shared)
            .load()
            .await;
        let client = S3Client::new(&cfg);
        Self {
            client,
            bucket,
            public_base,
        }
    }

    async fn put(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<(), AppError> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(body))
            .content_type(content_type)
            .send()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("r2 put_object: {e}")))?;
        Ok(())
    }
}

#[async_trait]
impl Storage for R2Storage {
    async fn save_ktp(
        &self,
        customer_id: Uuid,
        original_filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError> {
        validate_ktp(content_type, bytes.len())?;
        let safe_name = sanitize_filename(original_filename);
        let key = format!("ktp/{customer_id}/{safe_name}");
        self.put(&key, bytes.to_vec(), content_type).await?;
        Ok(StoredRef { key, backend: "r2" })
    }

    async fn save_claim_doc(
        &self,
        claim_id: Uuid,
        original_filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError> {
        if bytes.len() > MAX_KTP_BYTES {
            return Err(AppError::Validation(
                "claim file too large (max 5 MB)".into(),
            ));
        }
        if !ALLOWED_KTP_MIMES.contains(&content_type) {
            return Err(AppError::Validation(format!(
                "unsupported claim doc mime type: {content_type}"
            )));
        }
        let safe_name = sanitize_filename(original_filename);
        let key = format!("claims/{claim_id}/{safe_name}");
        self.put(&key, bytes.to_vec(), content_type).await?;
        Ok(StoredRef { key, backend: "r2" })
    }

    async fn save_policy_pdf(&self, policy_id: Uuid, bytes: &[u8]) -> Result<StoredRef, AppError> {
        let key = format!("policies/{policy_id}.pdf");
        self.put(&key, bytes.to_vec(), "application/pdf").await?;
        Ok(StoredRef { key, backend: "r2" })
    }

    async fn save_invoice_pdf(
        &self,
        invoice_id: Uuid,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError> {
        let key = format!("invoices/{invoice_id}.pdf");
        self.put(&key, bytes.to_vec(), "application/pdf").await?;
        Ok(StoredRef { key, backend: "r2" })
    }

    async fn save_receipt_pdf(
        &self,
        invoice_id: Uuid,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError> {
        let key = format!("receipts/{invoice_id}.pdf");
        self.put(&key, bytes.to_vec(), "application/pdf").await?;
        Ok(StoredRef { key, backend: "r2" })
    }

    async fn save_payment_proof(
        &self,
        claim_id: Uuid,
        original_filename: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<StoredRef, AppError> {
        if !ALLOWED_PAYMENT_PROOF_MIMES.contains(&content_type) {
            return Err(AppError::Validation(format!(
                "unsupported payment proof mime type: {content_type} (allowed: jpg, png, pdf)"
            )));
        }
        if bytes.len() > MAX_PAYMENT_PROOF_BYTES {
            return Err(AppError::Validation(format!(
                "payment proof too large: {} bytes (max 5 MB)",
                bytes.len()
            )));
        }
        let safe_name = sanitize_filename(original_filename);
        let key = format!("payment_proofs/{claim_id}/{safe_name}");
        self.put(&key, bytes.to_vec(), content_type).await?;
        Ok(StoredRef { key, backend: "r2" })
    }

    async fn read_bytes(&self, key: &str) -> Result<Vec<u8>, AppError> {
        let out = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("r2 get_object: {e}")))?;
        let bytes = out
            .body
            .collect()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("r2 read body: {e}")))?;
        Ok(bytes.into_bytes().to_vec())
    }

    fn public_url(&self, key: &str) -> Option<String> {
        if self.public_base.is_empty() {
            return None;
        }
        let base = self.public_base.trim_end_matches('/');
        Some(format!("{base}/{key}"))
    }
}

// ============================================================
// Builder
// ============================================================

/// Build the configured Storage backend. Hard-fail kalau config invalid.
pub async fn build_storage(config: &crate::config::Config) -> anyhow::Result<Arc<dyn Storage>> {
    match config.storage_backend.as_str() {
        "local" => Ok(Arc::new(LocalStorage::new(config.upload_dir.clone()))),
        "r2" => {
            let account = config.r2_account_id.as_deref().ok_or_else(|| {
                anyhow::anyhow!("R2_ACCOUNT_ID wajib di-set saat STORAGE_BACKEND=r2")
            })?;
            let access = config.r2_access_key_id.as_deref().ok_or_else(|| {
                anyhow::anyhow!("R2_ACCESS_KEY_ID wajib di-set saat STORAGE_BACKEND=r2")
            })?;
            let secret = config.r2_secret_access_key.as_deref().ok_or_else(|| {
                anyhow::anyhow!("R2_SECRET_ACCESS_KEY wajib di-set saat STORAGE_BACKEND=r2")
            })?;
            let bucket = config
                .r2_bucket
                .clone()
                .ok_or_else(|| anyhow::anyhow!("R2_BUCKET wajib di-set saat STORAGE_BACKEND=r2"))?;
            let public_base = config.r2_public_base_url.clone().unwrap_or_default();
            Ok(Arc::new(
                R2Storage::new(account, access, secret, bucket, public_base).await,
            ))
        }
        other => {
            anyhow::bail!("unknown STORAGE_BACKEND: {other} (expected 'local' or 'r2')")
        }
    }
}

// ============================================================
// Shared helpers
// ============================================================

fn guard_key(key: &str) -> &str {
    // Path traversal guard: reject any ".." segment in the key.
    for component in Path::new(key).components() {
        if matches!(component, std::path::Component::ParentDir) {
            return ".";
        }
    }
    key
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
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    // `..` di-string bisa survive di Linux/Mac di mana `\` bukan path
    // separator, jadi `Path::file_name("..\\bad")` mengembalikan string
    // utuh. Strip manual supaya hasil akhir aman lintas platform — tanpa
    // ini, test `sanitize_strips_path_traversal` gagal di CI Linux.
    let safe = cleaned.replace("..", "_");
    if safe.is_empty() {
        "upload".to_string()
    } else {
        safe
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
    fn guard_rejects_parent_dir() {
        assert_eq!(guard_key("../etc/passwd"), ".");
        assert_eq!(guard_key("ktp/abc/file.jpg"), "ktp/abc/file.jpg");
    }
}
