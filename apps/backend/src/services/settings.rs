//! Read-only accessors untuk `app_settings`. Tidak ada cache — codebase
//! convention adalah read-fresh per request, dan single-row PK lookup
//! cukup murah (~1ms) sehingga invalidation logic tidak diperlukan.
//!
//! "Hot-reload" effect-nya gratis: setiap request baca nilai terbaru.

use crate::error::AppError;
use serde_json::Value;
use sqlx::PgPool;

/// Default jika row belum ada di DB (mis. fresh deploy sebelum admin pernah
/// save setting). Aman untuk MVP — strict default lebih konservatif.
const DEFAULT_ONE_ACTIVE_PER_POLICY: bool = true;

pub async fn is_one_active_claim_per_policy(pool: &PgPool) -> Result<bool, AppError> {
    let row: Option<(Value,)> =
        sqlx::query_as("SELECT value FROM app_settings WHERE key = 'claims.one_active_per_policy'")
            .fetch_optional(pool)
            .await?;

    match row {
        Some((Value::Bool(b),)) => Ok(b),
        // Row ada tapi value shape corrupt (bukan bool) → fall back ke
        // default + log. Lebih aman daripada panic / 500 ke user.
        Some(_) => {
            tracing::warn!(
                key = "claims.one_active_per_policy",
                "app_settings.value bukan boolean — pakai default"
            );
            Ok(DEFAULT_ONE_ACTIVE_PER_POLICY)
        }
        None => Ok(DEFAULT_ONE_ACTIVE_PER_POLICY),
    }
}
