//! Shared application state held in Axum extensions.

use std::sync::Arc;

use sqlx::PgPool;

use crate::{auth::TokenService, config::Config};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub tokens: Arc<TokenService>,
}

impl AppState {
    pub fn new(pool: PgPool, config: Config) -> Self {
        let tokens = TokenService::new(&config.jwt_secret);
        Self {
            pool,
            config: Arc::new(config),
            tokens: Arc::new(tokens),
        }
    }
}
