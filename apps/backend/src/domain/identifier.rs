//! Identifier generator (spec §9): REG/INV/POL/CLM/INQ-YYYYMM-NNNNNN.
//!
//! Allocation strategy: per-month counter via `UPDATE ... RETURNING`.
//! Postgres acquires a row-level lock on the matching `id_sequences` row,
//! so concurrent requests serialize and never mint duplicates within a
//! month. Counter resets automatically when a new month is reached
//! (the row is created on-demand with last_value=0).
//!
//! Callers MUST pass a transaction (`&mut PgConnection`) so the lock is
//! released only after the generated id is written to its target table —
//! otherwise a crash between allocation and insert could leave a gap.

use chrono::Utc;
use sqlx::{PgConnection, Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, Clone, Copy)]
pub enum EntityType {
    Registration,
    Invoice,
    Policy,
    Claim,
    Inquiry,
}

impl EntityType {
    pub fn prefix(self) -> &'static str {
        match self {
            EntityType::Registration => "REG",
            EntityType::Invoice => "INV",
            EntityType::Policy => "POL",
            EntityType::Claim => "CLM",
            EntityType::Inquiry => "INQ",
        }
    }
}

/// Allocate next id inside the given transaction.
/// Returns the formatted identifier (e.g. "REG-202606-000001").
pub async fn next_id(
    tx: &mut Transaction<'_, Postgres>,
    entity: EntityType,
) -> Result<String, AppError> {
    let year_month = Utc::now().format("%Y%m").to_string();
    let prefix = entity.prefix();

    // Upsert row for this month+entity with last_value=0 if absent, then
    // increment. Postgres evaluates the WHERE clause under row-level lock.
    let row: (i32,) = sqlx::query_as(
        r#"
        INSERT INTO id_sequences (entity_type, year_month, last_value)
            VALUES ($1, $2, 0)
        ON CONFLICT (entity_type, year_month) DO UPDATE
            SET last_value = id_sequences.last_value + 1
        RETURNING last_value
        "#,
    )
    .bind(prefix)
    .bind(&year_month)
    .fetch_one(&mut **tx)
    .await?;

    Ok(format!("{prefix}-{year_month}-{:06}", row.0))
}

/// Convenience: same as `next_id` but on a raw connection (auto-commit).
/// Prefer the transactional version in production paths so allocation and
/// insert of the target row share an atomic boundary.
#[allow(dead_code)]
pub async fn next_id_conn(
    conn: &mut PgConnection,
    entity: EntityType,
) -> Result<String, AppError> {
    let year_month = Utc::now().format("%Y%m").to_string();
    let prefix = entity.prefix();

    let row: (i32,) = sqlx::query_as(
        r#"
        INSERT INTO id_sequences (entity_type, year_month, last_value)
            VALUES ($1, $2, 0)
        ON CONFLICT (entity_type, year_month) DO UPDATE
            SET last_value = id_sequences.last_value + 1
        RETURNING last_value
        "#,
    )
    .bind(prefix)
    .bind(&year_month)
    .fetch_one(conn)
    .await?;

    Ok(format!("{prefix}-{year_month}-{:06}", row.0))
}

// Unused helper kept to avoid the uuid warning while we only need Uuid in M3+.
#[allow(dead_code)]
fn _typecheck(_: Uuid) {}
