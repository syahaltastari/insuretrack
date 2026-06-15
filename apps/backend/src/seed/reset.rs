//! FK-safe truncate untuk dev data tables.
//!
//! Order urut dari child ke parent (FK references). `admin_users` dan
//! tabel marketing (`clients`, `testimonials`) tidak di-touch — admin
//! default dipreserve, marketing asset tetap dari migration 0005.
//!
//! Dipakai hanya saat `--reset` flag aktif.

use sqlx::PgPool;

/// Truncate semua tabel dev data (preserve `admin_users`).
///
/// Order sesuai FK chain di schema 0001-0013:
///   claim_documents → claims → inquiries → policies → invoices
///   → registration_participants → registrations → email_logs
///   → audit_logs → customers → id_sequences
///
/// `id_sequences` di-truncate supaya identifier counter reset ke 0
/// dan `--reset --registrations 50` selalu mulai dari `REG-YYYYMM-000001`.
pub async fn reset_dev_data(pool: &PgPool) -> anyhow::Result<()> {
    let mut tx = pool.begin().await?;

    // Urutan penting — child dulu, parent belakangan. `CASCADE` jadi
    // safety net kalau ada FK yang terlewat.
    let tables = [
        "claim_documents",
        "claims",
        "inquiries",
        "policies",
        "invoices",
        "registration_participants",
        "registrations",
        "email_logs",
        "audit_logs",
        "customers",
        "id_sequences",
    ];

    for table in &tables {
        // `RESTART IDENTITY` reset auto-increment (kami tidak pakai
        // untuk id UUID, tapi tidak ada efek samping). `CASCADE` truncate
        // semua rows yang reference table ini via FK.
        let sql = format!("TRUNCATE TABLE {} RESTART IDENTITY CASCADE", table);
        sqlx::query(&sql).execute(&mut *tx).await?;
    }

    // Kembalikan id_sequences row untuk bulan ini (seperti 0002_id_sequences).
    sqlx::query(
        r#"
        INSERT INTO id_sequences (entity_type, year_month, last_value)
        VALUES
            ('REG', to_char(now(), 'YYYYMM'), 0),
            ('INV', to_char(now(), 'YYYYMM'), 0),
            ('POL', to_char(now(), 'YYYYMM'), 0),
            ('CLM', to_char(now(), 'YYYYMM'), 0),
            ('INQ', to_char(now(), 'YYYYMM'), 0)
        ON CONFLICT (entity_type, year_month) DO NOTHING
        "#,
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}
