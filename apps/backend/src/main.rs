//! InsureTrack backend entry point (Axum).

mod auth;
mod config;
mod domain;
mod dto;
mod error;
mod repo;
mod routes;
mod services;
mod state;

use std::{net::SocketAddr, time::Duration};

use sqlx::postgres::PgPoolOptions;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::{config::Config, state::AppState};

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

    let state = AppState::new(pool, cfg.clone());

    let app = routes::build(state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], cfg.port));
    tracing::info!("insuretrack-backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
