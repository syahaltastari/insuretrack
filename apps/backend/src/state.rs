//! Shared application state held in Axum extensions.

use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    auth::TokenService,
    config::Config,
    services::{email::EmailSender, storage::Storage},
};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub tokens: Arc<TokenService>,
    pub storage: Arc<dyn Storage>,
    /// Production: `Arc<ResendClient>` (impl `EmailSender`).
    /// Tests: `Arc<RecordingEmailSender>` (lihat `tests/common/mod.rs`).
    pub email: Arc<dyn EmailSender>,
}

impl AppState {
    pub fn new(
        pool: PgPool,
        config: Config,
        storage: Arc<dyn Storage>,
        email: Arc<dyn EmailSender>,
    ) -> Self {
        let tokens = TokenService::new(&config.jwt_secret);
        Self {
            pool,
            config: Arc::new(config),
            tokens: Arc::new(tokens),
            storage,
            email,
        }
    }
}
