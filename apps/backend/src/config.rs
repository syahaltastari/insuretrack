//! Application configuration loaded from environment variables.

use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub payment_webhook_secret: String,
    /// Base URL untuk tautan di email (aktivasi portal, dll.) — frontend.
    pub app_base_url: String,
    /// Base URL publik untuk file upload (logo/foto klien & testimoni) —
    /// biasanya menunjuk ke backend, agar <img> bisa load langsung dari
    /// `GET /api/public/uploads/...`. Default ke `app_base_url` jika tidak di-set.
    pub media_base_url: String,
    /// Backend storage: `"local"` (filesystem) atau `"r2"` (Cloudflare R2).
    /// Hard-fail kalau value tidak dikenal atau env vars backend-specific kosong.
    pub storage_backend: String,
    /// Path upload untuk `local` backend (default `./uploads`).
    pub upload_dir: String,
    // === R2-only (required saat STORAGE_BACKEND=r2) ===
    pub r2_account_id: Option<String>,
    pub r2_access_key_id: Option<String>,
    pub r2_secret_access_key: Option<String>,
    pub r2_bucket: Option<String>,
    /// Custom domain atau r2.dev URL untuk R2 public bucket. None => caller
    /// pakai authorized endpoint untuk serve files.
    pub r2_public_base_url: Option<String>,

    // === Email (Resend) ===
    /// API key Resend (https://resend.com). WAJIB di-set, hard-fail kalau kosong.
    pub resend_api_key: String,
    /// From email, mis. `noreply@insuretrack.example` (harus domain yang
    /// sudah diverifikasi di Resend dashboard).
    pub resend_from_email: String,
    /// Optional from name (mis. "InsureTrack").
    pub resend_from_name: Option<String>,

    pub port: u16,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let app_base_url = env::var("APP_BASE_URL")
            .unwrap_or_else(|_| "http://localhost:3000".to_string());
        let media_base_url = env::var("MEDIA_BASE_URL").unwrap_or_else(|_| app_base_url.clone());

        let storage_backend = env::var("STORAGE_BACKEND")
            .unwrap_or_else(|_| "local".to_string())
            .to_lowercase();
        let upload_dir = env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".to_string());

        // Collect R2 env vars (validated based on backend choice).
        let r2_account_id = env::var("R2_ACCOUNT_ID").ok().filter(|s| !s.is_empty());
        let r2_access_key_id = env::var("R2_ACCESS_KEY_ID").ok().filter(|s| !s.is_empty());
        let r2_secret_access_key = env::var("R2_SECRET_ACCESS_KEY").ok().filter(|s| !s.is_empty());
        let r2_bucket = env::var("R2_BUCKET").ok().filter(|s| !s.is_empty());
        let r2_public_base_url = env::var("R2_PUBLIC_BASE_URL").ok().filter(|s| !s.is_empty());

        if storage_backend == "r2" {
            // Hard-fail kalau ada R2 var yang missing.
            let missing: Vec<&str> = [
                ("R2_ACCOUNT_ID", r2_account_id.as_deref()),
                ("R2_ACCESS_KEY_ID", r2_access_key_id.as_deref()),
                ("R2_SECRET_ACCESS_KEY", r2_secret_access_key.as_deref()),
                ("R2_BUCKET", r2_bucket.as_deref()),
            ]
            .iter()
            .filter_map(|(k, v)| v.is_none().then_some(*k))
            .collect();
            if !missing.is_empty() {
                anyhow::bail!(
                    "STORAGE_BACKEND=r2 requires these env vars: {}",
                    missing.join(", ")
                );
            }
        } else if storage_backend != "local" {
            anyhow::bail!("unknown STORAGE_BACKEND: {storage_backend} (expected 'local' or 'r2')");
        }

        // Resend config — hard-fail kalau kosong.
        let resend_api_key = env::var("RESEND_API_KEY")
            .ok()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| anyhow::anyhow!("RESEND_API_KEY wajib di-set (lihat .env.example)"))?;
        let resend_from_email = env::var("RESEND_FROM_EMAIL")
            .ok()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| anyhow::anyhow!("RESEND_FROM_EMAIL wajib di-set (lihat .env.example)"))?;
        let resend_from_name = env::var("RESEND_FROM_NAME").ok().filter(|s| !s.is_empty());

        Ok(Self {
            database_url: env::var("DATABASE_URL")
                .map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?,
            jwt_secret: env::var("JWT_SECRET")
                .map_err(|_| anyhow::anyhow!("JWT_SECRET is required"))?,
            payment_webhook_secret: env::var("PAYMENT_WEBHOOK_SECRET")
                .map_err(|_| anyhow::anyhow!("PAYMENT_WEBHOOK_SECRET is required"))?,
            app_base_url,
            media_base_url,
            storage_backend,
            upload_dir,
            r2_account_id,
            r2_access_key_id,
            r2_secret_access_key,
            r2_bucket,
            r2_public_base_url,
            resend_api_key,
            resend_from_email,
            resend_from_name,
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
        })
    }
}
