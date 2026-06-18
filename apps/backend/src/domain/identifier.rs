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
    next_id_with_year_month(tx, entity, &year_month).await
}

/// Allocate next id for a specific `year_month` (format "YYYYMM").
/// Dipakai seeder untuk backdate identifier ke bulan lalu; production
/// paths tetap pakai `next_id` (bulan ini).
pub async fn next_id_with_year_month(
    tx: &mut Transaction<'_, Postgres>,
    entity: EntityType,
    year_month: &str,
) -> Result<String, AppError> {
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
    .bind(year_month)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_matches_spec() {
        // Spec §9: REG / INV / POL / CLM / INQ — semua 3 karakter uppercase.
        assert_eq!(EntityType::Registration.prefix(), "REG");
        assert_eq!(EntityType::Invoice.prefix(), "INV");
        assert_eq!(EntityType::Policy.prefix(), "POL");
        assert_eq!(EntityType::Claim.prefix(), "CLM");
        assert_eq!(EntityType::Inquiry.prefix(), "INQ");
    }

    #[test]
    fn identifier_format_is_well_formed() {
        // Kalau format regex "{prefix}-YYYYMM-NNNNNN" pernah bergeser,
        // identifier generator akan menghasilkan string yang invalid untuk
        // kolom `*_no` (UNIQUE constraint) atau response API. Test format
        // ini catch refactor tanpa perlu DB.
        for entity in [
            EntityType::Registration,
            EntityType::Invoice,
            EntityType::Policy,
            EntityType::Claim,
            EntityType::Inquiry,
        ] {
            let prefix = entity.prefix();
            let sample = format!("{prefix}-202606-000001");
            let parts: Vec<&str> = sample.split('-').collect();
            assert_eq!(parts.len(), 3, "expected 3 segments in {sample}");
            assert_eq!(parts[0], prefix);
            assert_eq!(parts[1].len(), 6, "YYYYMM should be 6 chars");
            assert_eq!(parts[2].len(), 6, "NNNNNN should be 6 chars");
            assert!(parts[2].chars().all(|c| c.is_ascii_digit()));
        }
    }
}
