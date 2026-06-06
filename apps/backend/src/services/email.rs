//! Email service — record ke `email_logs` lalu kirim via Resend HTTP API.
//!
//! Spec FS-05 lists 8 email types; helper ini handle semuanya. Setiap
//! send dicatat sebagai `QUEUED` di email_logs, lalu:
//! - sukses -> status SENT, audit_logs entry dengan resend_id.
//! - gagal -> status FAILED, error_message diisi, audit_logs entry
//!   dengan error.
//!
//! Untuk E_POLICY_DELIVERY, kalau `attachment_path` di-set, PDF di-fetch
//! dari storage (R2 atau local) lalu di-attach ke Resend sebagai
//! base64-encoded file (per spec FS-04/FS-05).

use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    services::{
        audit::AuditEntry,
        resend::{ResendAttachment, ResendClient},
        storage::Storage,
    },
};

#[derive(Debug, Clone, Copy)]
pub enum EmailType {
    RegistrationSuccess,
    InvoiceNotification,
    PaymentSuccess,
    EPolicyDelivery,
    PortalActivation,
    ClaimReceived,
    ClaimStatusUpdate,
    InquiryResponse,
}

impl EmailType {
    pub fn as_str(self) -> &'static str {
        match self {
            EmailType::RegistrationSuccess => "REGISTRATION_SUCCESS",
            EmailType::InvoiceNotification => "INVOICE_NOTIFICATION",
            EmailType::PaymentSuccess => "PAYMENT_SUCCESS",
            EmailType::EPolicyDelivery => "E_POLICY_DELIVERY",
            EmailType::PortalActivation => "PORTAL_ACTIVATION",
            EmailType::ClaimReceived => "CLAIM_RECEIVED",
            EmailType::ClaimStatusUpdate => "CLAIM_STATUS_UPDATE",
            EmailType::InquiryResponse => "INQUIRY_RESPONSE",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Email<'a> {
    pub email_type: EmailType,
    pub recipient: &'a str,
    pub subject: &'a str,
    pub body: &'a str,
    pub related_entity_type: Option<&'a str>,
    pub related_entity_id: Option<Uuid>,
    /// Key di storage backend (output dari `Storage::save_*().key`).
    /// Untuk E_POLICY_DELIVERY, file di-fetch dan di-attach ke email.
    pub attachment_path: Option<String>,
}

pub async fn send(
    pool: &PgPool,
    storage: &dyn Storage,
    resend: &ResendClient,
    email: Email<'_>,
) -> Result<Uuid, AppError> {
    // 1. Insert email_logs dengan status QUEUED.
    let id: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO email_logs
            (recipient, email_type, subject, status, sent_at, error_message)
        VALUES ($1, $2, $3, 'QUEUED', NULL, NULL)
        RETURNING id
        "#,
    )
    .bind(email.recipient)
    .bind(email.email_type.as_str())
    .bind(email.subject)
    .fetch_one(pool)
    .await?;
    let email_log_id = id.0;

    // 2. Audit: "email queued" — early record sebelum actually send.
    let _ = crate::services::audit::write(
        pool,
        AuditEntry {
            actor: "system",
            action: "email_queued",
            entity_type: "email_log",
            entity_id: Some(email_log_id),
            metadata: Some(json!({
                "email_type": email.email_type.as_str(),
                "recipient": email.recipient,
                "has_attachment": email.attachment_path.is_some(),
            })),
            ip_address: None,
        },
    )
    .await;

    // 3. Resolve attachment (kalau ada).
    let mut attachments: Vec<ResendAttachment> = Vec::new();
    if let Some(key) = email.attachment_path.as_deref() {
        match storage.read_bytes(key).await {
            Ok(bytes) => {
                let filename = key.rsplit('/').next().unwrap_or("attachment.pdf").to_string();
                attachments.push(ResendAttachment { filename, content: bytes });
            }
            Err(e) => {
                // Attachment gagal di-fetch -> log FAILED, return error.
                let err_msg = format!("fetch attachment '{key}': {e}");
                sqlx::query(
                    r#"UPDATE email_logs
                       SET status = 'FAILED', error_message = $2
                       WHERE id = $1"#,
                )
                .bind(email_log_id)
                .bind(&err_msg)
                .execute(pool)
                .await?;
                let _ = crate::services::audit::write(
                    pool,
                    AuditEntry {
                        actor: "system",
                        action: "email_failed",
                        entity_type: "email_log",
                        entity_id: Some(email_log_id),
                        metadata: Some(json!({
                            "email_type": email.email_type.as_str(),
                            "recipient": email.recipient,
                            "stage": "fetch_attachment",
                            "error": err_msg,
                        })),
                        ip_address: None,
                    },
                )
                .await;
                return Err(AppError::Internal(anyhow::anyhow!(err_msg)));
            }
        }
    }

    // 4. Kirim via Resend.
    let text_body = email.body;
    let result = resend
        .send(email.recipient, email.subject, text_body, &attachments)
        .await;

    match &result {
        Ok(resend_id) => {
            // 5a. Update status SENT, audit log success.
            sqlx::query(
                r#"UPDATE email_logs
                   SET status = 'SENT', sent_at = now(), error_message = NULL
                   WHERE id = $1"#,
            )
            .bind(email_log_id)
            .execute(pool)
            .await?;

            let _ = crate::services::audit::write(
                pool,
                AuditEntry {
                    actor: "system",
                    action: "email_sent",
                    entity_type: "email_log",
                    entity_id: Some(email_log_id),
                    metadata: Some(json!({
                        "email_type": email.email_type.as_str(),
                        "recipient": email.recipient,
                        "resend_id": resend_id,
                        "related_entity_type": email.related_entity_type,
                        "related_entity_id": email.related_entity_id,
                    })),
                    ip_address: None,
                },
            )
            .await;

            tracing::info!(
                email_log_id = %email_log_id,
                email_type = email.email_type.as_str(),
                recipient = email.recipient,
                resend_id = %resend_id,
                "email sent via Resend",
            );
        }
        Err(e) => {
            // 5b. Update status FAILED.
            let err_msg = format!("{e}");
            sqlx::query(
                r#"UPDATE email_logs
                   SET status = 'FAILED', error_message = $2
                   WHERE id = $1"#,
            )
            .bind(email_log_id)
            .bind(&err_msg)
            .execute(pool)
            .await?;

            let _ = crate::services::audit::write(
                pool,
                AuditEntry {
                    actor: "system",
                    action: "email_failed",
                    entity_type: "email_log",
                    entity_id: Some(email_log_id),
                    metadata: Some(json!({
                        "email_type": email.email_type.as_str(),
                        "recipient": email.recipient,
                        "stage": "resend_send",
                        "error": err_msg,
                    })),
                    ip_address: None,
                },
            )
            .await;

            tracing::warn!(
                email_log_id = %email_log_id,
                email_type = email.email_type.as_str(),
                recipient = email.recipient,
                error = %err_msg,
                "email send via Resend failed",
            );
        }
    }

    Ok(email_log_id)
}
