//! Audit log writer.
//!
//! Semua event bisnis-signifikan (login, registrasi, payment, policy, claim,
//! inquiry, email sent) harus lewat helper ini. Insert ke `audit_logs`.
//! Tabel ini append-only by convention (lihat CLAUDE.md).

use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct AuditEntry<'a> {
    pub actor: &'a str,
    pub action: &'a str,
    pub entity_type: &'a str,
    pub entity_id: Option<Uuid>,
    pub metadata: Option<Value>,
    pub ip_address: Option<&'a str>,
}

pub async fn write(pool: &PgPool, entry: AuditEntry<'_>) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO audit_logs
            (actor, action, entity_type, entity_id, metadata, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(entry.actor)
    .bind(entry.action)
    .bind(entry.entity_type)
    .bind(entry.entity_id)
    .bind(entry.metadata)
    .bind(entry.ip_address)
    .execute(pool)
    .await?;
    Ok(())
}

/// Shortcut untuk callsite yang sering muncul: tidak butuh `ip_address`.
/// Caller wajib pakai `?` (atau `let _ = .await` eksplisit untuk
/// best-effort) — audit failure harus visible, tidak silent-swallowed.
pub async fn record(
    pool: &PgPool,
    actor: &str,
    action: &str,
    entity_type: &str,
    entity_id: Option<Uuid>,
    metadata: Value,
) -> Result<(), AppError> {
    write(
        pool,
        AuditEntry {
            actor,
            action,
            entity_type,
            entity_id,
            metadata: Some(metadata),
            ip_address: None,
        },
    )
    .await
}
