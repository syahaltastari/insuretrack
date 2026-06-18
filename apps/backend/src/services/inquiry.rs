//! Shared inquiry helpers — dipakai oleh customer & admin route handlers.
//!
//! State machine + status derivation tetap di `crate::domain::inquiry`.
//! Module ini fokus pada side-effects (DB + email + audit) yang terjadi
//! lintas permukaan (customer vs admin) sehingga tidak ada duplikasi.

use uuid::Uuid;

use crate::{
    domain::inquiry::can_transition,
    error::AppResult,
    services::audit::{write as audit_write, AuditEntry},
    state::AppState,
};

/// Lazy auto-close inquiry kalau stale.
///
/// Trigger: inquiry dengan status = `ANSWERED` dan `last_message_at` lebih
/// tua dari `now - config.inquiry_auto_close_days` (env `INQUIRY_AUTO_CLOSE_DAYS`,
/// default 7). Saat di-trigger, set `status = 'CLOSED'`, `closed_at = now()`,
/// audit log, dan email customer (`InquiryAutoClosed`). Idempotent: kalau
/// sudah CLOSED atau belum stale, return `Ok(None)` tanpa side-effect.
///
/// Best-effort: kalau email gagal, auto-close tetap applied (status sudah
/// CLOSED di DB). Caller tidak perlu rollback.
///
/// Return:
/// - `Some(closed_at)` — call ini yang baru saja menutup inquiry
/// - `None` — inquiry sudah closed / belum stale / tidak ditemukan
pub async fn try_auto_close_stale(
    state: &AppState,
    id: Uuid,
) -> AppResult<Option<chrono::DateTime<chrono::Utc>>> {
    if state.config.inquiry_auto_close_days <= 0 {
        return Ok(None); // disabled
    }
    let threshold_secs = state.config.inquiry_auto_close_days * 86_400;
    let cutoff: chrono::DateTime<chrono::Utc> =
        chrono::Utc::now() - chrono::Duration::seconds(threshold_secs);

    let row: Option<(String, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
        r#"
        SELECT status, last_message_at FROM inquiries WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (status, last_msg_at) = match row {
        Some(r) => r,
        None => return Ok(None),
    };
    if status != "ANSWERED" {
        return Ok(None);
    }
    let last_at = match last_msg_at {
        Some(t) => t,
        None => return Ok(None),
    };
    if last_at > cutoff {
        return Ok(None); // not stale yet
    }

    if !can_transition(&status, "CLOSED") {
        return Ok(None);
    }
    let closed_at: chrono::DateTime<chrono::Utc> = sqlx::query_scalar(
        r#"
        UPDATE inquiries
           SET status = 'CLOSED',
               closed_at = now()
         WHERE id = $1 AND status = 'ANSWERED'
         RETURNING closed_at
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .flatten()
    .unwrap_or_else(chrono::Utc::now);

    // Audit.
    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: "system",
            action: "inquiry_auto_closed",
            entity_type: "inquiry",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({
                "reason": "inactivity",
                "threshold_days": state.config.inquiry_auto_close_days,
                "last_message_at": last_at,
            })),
            ip_address: None,
        },
    )
    .await;

    // Email customer — best-effort.
    let customer_email: Option<String> = sqlx::query_scalar(
        r#"
        SELECT c.email
          FROM inquiries i JOIN customers c ON c.id = i.customer_id
         WHERE i.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    if let Some(email) = customer_email {
        let inquiry_no: String =
            sqlx::query_scalar("SELECT inquiry_no FROM inquiries WHERE id = $1")
                .bind(id)
                .fetch_one(&state.pool)
                .await?;
        let subject_line: String =
            sqlx::query_scalar("SELECT subject FROM inquiries WHERE id = $1")
                .bind(id)
                .fetch_one(&state.pool)
                .await?;
        let body = format!(
            "Halo,\n\n\
             Inquiry {inquiry_no} (\"{subject_line}\") sudah ditutup otomatis \
             karena tidak ada balasan dari kamu dalam \
             {days} hari sejak jawaban admin.\n\n\
             Punya pertanyaan lanjutan? Buat inquiry baru aja di portal — \
             kami siap bantu.\n\n\
             Salam,\n\
             Tim InsureTrack",
            days = state.config.inquiry_auto_close_days,
        );
        let _ = crate::services::email::send(
            &state.pool,
            &*state.storage,
            &*state.email,
            crate::services::email::Email {
                email_type: crate::services::email::EmailType::InquiryAutoClosed,
                recipient: &email,
                subject: &format!("[Inquiry {inquiry_no}] Ditutup otomatis"),
                body: &body,
                cta_text: Some("Buka Portal"),
                cta_url: Some(&state.config.app_base_url),
                related_entity_type: Some("inquiry"),
                related_entity_id: Some(id),
                attachment_path: None,
            },
        )
        .await;
    }

    Ok(Some(closed_at))
}
