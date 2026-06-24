//! InsureTrack backend entry point (Axum).
//!
//! Module declarations pindah ke `lib.rs` (lihat komentar di sana)
//! supaya bisa di-share dengan `bin/seed.rs`. main.rs dan lib.rs adalah
//! 2 crate berbeda (binary vs library) — oleh karena itu kita `use
//! insuretrack_backend::*` di sini, BUKAN `crate::*`.

use std::{net::SocketAddr, sync::Arc, time::Duration};

use sqlx::postgres::PgPoolOptions;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use insuretrack_backend::{
    auth::csrf_guard,
    config::Config,
    routes,
    services::{email::EmailSender, resend::ResendClient, storage},
    state::AppState,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();

    let cfg = Config::from_env()?;
    tracing::info!("connecting to database");
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&cfg.database_url)
        .await?;

    tracing::info!("running migrations");
    sqlx::migrate!("./migrations").run(&pool).await?;

    tracing::info!("initializing storage backend: {}", cfg.storage_backend);
    let storage = storage::build_storage(&cfg).await?;

    tracing::info!("initializing Resend client");
    let resend = ResendClient::new(
        cfg.resend_api_key.clone(),
        cfg.resend_from_email.clone(),
        cfg.resend_from_name.clone(),
    )?;

    let state = AppState::new(
        pool,
        cfg.clone(),
        storage,
        Arc::new(resend) as Arc<dyn EmailSender>,
    );

    // CORS: explicit allowlist (tidak bisa pakai `*` saat credentials
    // enabled — browser modern reject kombinasi itu). Origin list baca
    // dari `CORS_ALLOWED_ORIGINS` env (comma-separated) atau fallback
    // ke localhost dev ports.
    let cors = build_cors_layer(&cfg);

    let app = routes::build(state.clone())
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            csrf_guard,
        ))
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], cfg.port));
    tracing::info!("insuretrack-backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// CORS allowlist baca dari `CORS_ALLOWED_ORIGINS` env (comma-separated).
/// Default = dev: portal :3000 + admin :3001. Di production set ke
/// `https://portal.${DOMAIN},https://admin.${DOMAIN}`. `allow_credentials(true)`
/// wajib agar browser kirim cookie cross-origin (login response Set-Cookie).
fn build_cors_layer(cfg: &Config) -> CorsLayer {
    use axum::http::{header, HeaderName, HeaderValue, Method};

    let allowed: Vec<HeaderValue> = cfg
        .cors_allowed_origins
        .iter()
        .filter_map(|s| HeaderValue::from_str(s).ok())
        .collect();

    let allow_origin = if allowed.is_empty() {
        // Fallback: dev defaults. Log warning sekali saat startup
        // (operator harus set eksplisit di prod).
        tracing::warn!(
            "CORS_ALLOWED_ORIGINS not set — falling back to localhost dev origins. \
             Set explicitly in production."
        );
        AllowOrigin::list([
            HeaderValue::from_static("http://localhost:3000"),
            HeaderValue::from_static("http://localhost:3001"),
        ])
    } else {
        AllowOrigin::list(allowed)
    };

    CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION, // legacy: beberapa test masih pakai, harmless
            HeaderName::from_static("x-csrf-token"),
        ])
        .allow_credentials(true)
        .max_age(Duration::from_secs(3600))
}
