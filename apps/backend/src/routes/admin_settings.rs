//! Admin endpoints untuk `app_settings`. Mounted at `/api/admin/settings`.
//!
//! Pattern dari `admin_underwriting.rs`: RequireAdmin extractor, audit log
//! di setiap mutation dengan metadata old/new value untuk forensik.
//!
//! Saat ini hanya `claims.one_active_per_policy` yang di-expose via API.
//! Setting lain di `app_settings` table tetap ada tapi belum punya UI —
//! schema generik, tinggal tambah endpoint baru kalau ada setting baru.

use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::RequireAdmin,
    error::{AppError, AppResult},
    services::audit::{write as audit_write, AuditEntry},
    state::AppState,
};

const KEY_ONE_ACTIVE_PER_POLICY: &str = "claims.one_active_per_policy";
const DEFAULT_ONE_ACTIVE_PER_POLICY: bool = true;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/settings/claims",
        get(get_claims_settings).put(update_claims_settings),
    )
}

#[derive(Debug, Serialize)]
pub struct ClaimsSettingsResponse {
    pub one_active_per_policy: bool,
    pub updated_at: Option<DateTime<Utc>>,
    pub updated_by: Option<Uuid>,
}

pub async fn get_claims_settings(
    State(state): State<AppState>,
    _admin: RequireAdmin,
) -> AppResult<Json<ClaimsSettingsResponse>> {
    let row: Option<(Value, Option<DateTime<Utc>>, Option<Uuid>)> = sqlx::query_as(
        r#"SELECT value, updated_at, updated_by
           FROM app_settings
           WHERE key = $1"#,
    )
    .bind(KEY_ONE_ACTIVE_PER_POLICY)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some((Value::Bool(b), updated_at, updated_by)) => Ok(Json(ClaimsSettingsResponse {
            one_active_per_policy: b,
            updated_at,
            updated_by,
        })),
        // Row missing → pakai default. Update_at/updated_by null sampai
        // admin pertama kali save.
        Some(_) => Ok(Json(ClaimsSettingsResponse {
            one_active_per_policy: DEFAULT_ONE_ACTIVE_PER_POLICY,
            updated_at: None,
            updated_by: None,
        })),
        None => Ok(Json(ClaimsSettingsResponse {
            one_active_per_policy: DEFAULT_ONE_ACTIVE_PER_POLICY,
            updated_at: None,
            updated_by: None,
        })),
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateClaimsSettingsRequest {
    pub one_active_per_policy: bool,
}

pub async fn update_claims_settings(
    State(state): State<AppState>,
    admin: RequireAdmin,
    Json(req): Json<UpdateClaimsSettingsRequest>,
) -> AppResult<Json<ClaimsSettingsResponse>> {
    let admin_id = Uuid::parse_str(&admin.0.sub).map_err(|_| AppError::Unauthorized)?;

    // 1. Capture old value untuk audit metadata.
    let old: Option<(Value,)> = sqlx::query_as("SELECT value FROM app_settings WHERE key = $1")
        .bind(KEY_ONE_ACTIVE_PER_POLICY)
        .fetch_optional(&state.pool)
        .await?;
    let old_value = old.and_then(|(v,)| {
        if let Value::Bool(b) = v {
            Some(b)
        } else {
            None
        }
    });

    // 2. Upsert (admin bisa set pertama kali tanpa pre-seed).
    let row: (DateTime<Utc>, Uuid) = sqlx::query_as(
        r#"
        INSERT INTO app_settings (key, value, updated_by, updated_at)
        VALUES ($1, $2::jsonb, $3, now())
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_by = EXCLUDED.updated_by,
              updated_at = now()
        RETURNING updated_at, updated_by
        "#,
    )
    .bind(KEY_ONE_ACTIVE_PER_POLICY)
    .bind(Value::Bool(req.one_active_per_policy))
    .bind(admin_id)
    .fetch_one(&state.pool)
    .await?;

    // Pakai `?` (bukan `let _ =`) — audit failure harus propagate ke caller
    // supaya client tahu update belum sepenuhnya persisted.
    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin.0.sub,
            action: "settings_updated",
            entity_type: "app_setting",
            entity_id: None,
            metadata: Some(serde_json::json!({
                "key": KEY_ONE_ACTIVE_PER_POLICY,
                "old_value": old_value,
                "new_value": req.one_active_per_policy,
            })),
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(ClaimsSettingsResponse {
        one_active_per_policy: req.one_active_per_policy,
        updated_at: Some(row.0),
        updated_by: Some(row.1),
    }))
}
