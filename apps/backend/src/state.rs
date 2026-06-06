//! Shared application state held in Axum extensions.

use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    auth::TokenService,
    config::Config,
    services::{resend::ResendClient, storage::Storage},
};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub tokens: Arc<TokenService>,
    pub storage: Arc<dyn Storage>,
    pub resend: Arc<ResendClient>,
}

impl AppState {
    pub fn new(
        pool: PgPool,
        config: Config,
        storage: Arc<dyn Storage>,
        resend: ResendClient,
    ) -> Self {
        let tokens = TokenService::new(&config.jwt_secret);
        Self {
            pool,
            config: Arc::new(config),
            tokens: Arc::new(tokens),
            storage,
            resend: Arc::new(resend),
        }
    }
}
