pub mod admin;
pub mod admin_customers;
pub mod admin_marketing;
pub mod admin_settings;
pub mod admin_underwriting;
pub mod admin_users;
pub mod customer;
pub mod public;
pub mod underwriting;
pub mod util;

use axum::{routing::get, Json, Router};
use serde_json::json;

use crate::state::AppState;

pub fn build(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .nest("/api/public", public::router())
        .nest("/api/public", underwriting::router())
        .nest("/api/admin", admin::router())
        .nest("/api/admin", admin_marketing::router())
        .nest("/api/admin", admin_settings::router())
        .nest("/api/admin", admin_underwriting::router())
        .nest("/api/admin", admin_users::router())
        .nest("/api/admin", admin_customers::router())
        .nest("/api/customer", customer::router())
        .with_state(state)
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "service": "insuretrack-backend",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
