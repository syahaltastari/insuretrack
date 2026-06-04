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
    pub upload_dir: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let app_base_url = env::var("APP_BASE_URL")
            .unwrap_or_else(|_| "http://localhost:3000".to_string());
        let media_base_url = env::var("MEDIA_BASE_URL").unwrap_or_else(|_| app_base_url.clone());
        Ok(Self {
            database_url: env::var("DATABASE_URL")
                .map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?,
            jwt_secret: env::var("JWT_SECRET")
                .map_err(|_| anyhow::anyhow!("JWT_SECRET is required"))?,
            payment_webhook_secret: env::var("PAYMENT_WEBHOOK_SECRET")
                .map_err(|_| anyhow::anyhow!("PAYMENT_WEBHOOK_SECRET is required"))?,
            app_base_url,
            media_base_url,
            upload_dir: env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".to_string()),
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
        })
    }
}
