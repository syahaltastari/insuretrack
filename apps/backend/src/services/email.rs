//! Email service — record ke `email_logs` lalu kirim via `EmailSender`
//! (production: ResendClient → Resend HTTP API; tests: RecordingEmailSender).
//!
//! Spec FS-05 lists 8 email types + 3 tambahan untuk inquiry ticketing
//! (InquiryNew, InquiryCustomerReply, InquiryAutoClosed). Setiap send:
//! 1. Insert `email_logs` row dengan status `QUEUED` (return id buat tracking).
//! 2. Kalau `attachment_path` di-set, fetch file dari storage.
//! 3. Render template (header + body + footer) → text + html.
//! 4. POST ke sender. Update email_logs ke `SENT` (simpan message id) atau `FAILED` (simpan error_message).
//! 5. Audit `email_queued`, `email_sent`, atau `email_failed` ke `audit_logs` (FS-15).

use async_trait::async_trait;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::Config,
    error::AppError,
    services::{audit::AuditEntry, storage::Storage},
};

/// Attachment file yang akan dikirim sebagai email attachment.
/// `content` = raw bytes; `EmailSender` impl bertanggung jawab encoding
/// (Resend butuh base64).
#[derive(Debug, Clone)]
pub struct EmailAttachment {
    pub filename: String,
    pub content: Vec<u8>,
}

/// Abstraction untuk HTTP call ke provider email. Production pakai
/// `ResendClient`; test pakai `RecordingEmailSender` (lihat
/// `tests/common/mod.rs`). Return value = provider message id
/// (Resend: `"<uuid>@resend.dev"`).
#[async_trait]
pub trait EmailSender: Send + Sync {
    async fn send(
        &self,
        to: &str,
        subject: &str,
        text: &str,
        html: &str,
        attachments: &[EmailAttachment],
    ) -> Result<String, AppError>;
}

/// Resolve admin notification email dengan fallback chain:
/// 1. `Config.admin_notification_email` (env `ADMIN_NOTIFICATION_EMAIL`)
/// 2. First row `admin_users.email` di DB (biasanya hasil seed 0004)
/// 3. `None` — caller skip email kalau tidak ada recipient
///
/// Pakai untuk notifikasi inbound: InquiryNew (customer submit), InquiryCustomerReply.
pub async fn admin_notification_email(
    pool: &PgPool,
    config: &Config,
) -> Result<Option<String>, AppError> {
    if let Some(ref e) = config.admin_notification_email {
        if !e.is_empty() {
            return Ok(Some(e.clone()));
        }
    }
    // Fallback: first admin's email (urut by created_at).
    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT email FROM admin_users ORDER BY created_at ASC LIMIT 1")
            .fetch_optional(pool)
            .await?;
    Ok(row.and_then(|(e,)| e).filter(|s| !s.is_empty()))
}

#[derive(Debug, Clone, Copy)]
pub enum EmailType {
    RegistrationSuccess,
    InvoiceNotification,
    PaymentSuccess,
    EPolicyDelivery,
    PortalActivation,
    /// Customer request password reset via /portal/forgot-password
    /// (lupa password). Kirim link dengan JWT purpose="password_reset"
    /// (TTL 30 menit).
    PasswordReset,
    ClaimReceived,
    ClaimStatusUpdate,
    InquiryResponse,
    /// Customer membuat inquiry baru — notifikasi ke admin.
    InquiryNew,
    /// Customer membalas pesan admin di thread inquiry.
    InquiryCustomerReply,
    /// Inquiry di-close otomatis karena customer tidak balas dalam N hari.
    InquiryAutoClosed,
}

impl EmailType {
    pub fn as_str(self) -> &'static str {
        match self {
            EmailType::RegistrationSuccess => "REGISTRATION_SUCCESS",
            EmailType::InvoiceNotification => "INVOICE_NOTIFICATION",
            EmailType::PaymentSuccess => "PAYMENT_SUCCESS",
            EmailType::EPolicyDelivery => "E_POLICY_DELIVERY",
            EmailType::PortalActivation => "PORTAL_ACTIVATION",
            EmailType::PasswordReset => "PASSWORD_RESET",
            EmailType::ClaimReceived => "CLAIM_RECEIVED",
            EmailType::ClaimStatusUpdate => "CLAIM_STATUS_UPDATE",
            EmailType::InquiryResponse => "INQUIRY_RESPONSE",
            EmailType::InquiryNew => "INQUIRY_NEW",
            EmailType::InquiryCustomerReply => "INQUIRY_CUSTOMER_REPLY",
            EmailType::InquiryAutoClosed => "INQUIRY_AUTO_CLOSED",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Email<'a> {
    pub email_type: EmailType,
    pub recipient: &'a str,
    pub subject: &'a str,
    /// Body utama plain text. Akan di-wrap dengan header + footer
    /// oleh `email_template::render` sebelum dikirim. Body ini juga
    /// yang dipakai Resend sebagai `text` payload (fallback untuk
    /// email client yang tidak support HTML).
    pub body: &'a str,
    /// Optional call-to-action button. Mis. aktivasi akun: tombol
    /// "Aktifkan Akun Saya" yang link-nya activation URL.
    pub cta_text: Option<&'a str>,
    pub cta_url: Option<&'a str>,
    pub related_entity_type: Option<&'a str>,
    pub related_entity_id: Option<Uuid>,
    /// Key di storage backend (output dari `Storage::save_*().key`).
    /// Untuk E_POLICY_DELIVERY, file di-fetch dan di-attach ke email.
    pub attachment_path: Option<String>,
}

pub async fn send(
    pool: &PgPool,
    storage: &dyn Storage,
    sender: &dyn EmailSender,
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
    let mut attachments: Vec<EmailAttachment> = Vec::new();
    if let Some(key) = email.attachment_path.as_deref() {
        match storage.read_bytes(key).await {
            Ok(bytes) => {
                let filename = key
                    .rsplit('/')
                    .next()
                    .unwrap_or("attachment.pdf")
                    .to_string();
                attachments.push(EmailAttachment {
                    filename,
                    content: bytes,
                });
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

    // 4. Render template (header + body + footer) → text + html,
    //    lalu kirim via Resend. Caller supply `body` plain + optional
    //    CTA; template yang bentuk final presentasi.
    let rendered =
        crate::services::email_template::render(&crate::services::email_template::EmailTemplate {
            subject: email.subject,
            body_text: email.body,
            cta_text: email.cta_text,
            cta_url: email.cta_url,
        });
    let result = sender
        .send(
            email.recipient,
            email.subject,
            &rendered.text,
            &rendered.html,
            &attachments,
        )
        .await;

    match &result {
        Ok(message_id) => {
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
                        "resend_id": message_id,
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
                resend_id = %message_id,
                "email sent",
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
