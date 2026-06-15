//! InsureTrack backend entry point (Axum).
//!
//! Module declarations pindah ke `lib.rs` (lihat komentar di sana)
//! supaya bisa di-share dengan `bin/seed.rs`. main.rs dan lib.rs adalah
//! 2 crate berbeda (binary vs library) — oleh karena itu kita `use
//! insuretrack_backend::*` di sini, BUKAN `crate::*`.

use std::{net::SocketAddr, time::Duration};

use sqlx::postgres::PgPoolOptions;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use insuretrack_backend::{
    config::Config,
    routes,
    services::{resend::ResendClient, storage},
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

    let state = AppState::new(pool, cfg.clone(), storage, resend);

    let app = routes::build(state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], cfg.port));
    tracing::info!("insuretrack-backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
