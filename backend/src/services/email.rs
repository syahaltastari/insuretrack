//! Mock email service (no real SMTP in MVP).
//!
//! Every send is recorded in `email_logs`, an `audit_logs` row is written
//! (`action='email_sent'`), and the payload is printed via tracing.
//! Spec FS-05 lists 8 email types; this helper handles all of them. To
//! swap in a real provider (Resend, Mailtrap, SES, dll.) replace the body
//! of `send` and adjust the status accordingly.

use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{error::AppError, services::audit::AuditEntry};

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
    /// Path ke file lampiran (mis. PDF e-policy) — disimpan di email_logs
    /// sebagai metadata saja; untuk MVP, attachment tidak benar-benar di-deliver.
    pub attachment_path: Option<String>,
}

pub async fn send(pool: &PgPool, email: Email<'_>) -> Result<Uuid, AppError> {
    let id: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO email_logs
            (recipient, email_type, subject, status, sent_at, error_message)
        VALUES ($1, $2, $3, 'SENT', now(), NULL)
        RETURNING id
        "#,
    )
    .bind(email.recipient)
    .bind(email.email_type.as_str())
    .bind(email.subject)
    .fetch_one(pool)
    .await?;

    // Audit: spec FS-15 lists "Email sent" as an auditable event.
    let _ = crate::services::audit::write(
        pool,
        AuditEntry {
            actor: "system",
            action: "email_sent",
            entity_type: "email_log",
            entity_id: Some(id.0),
            metadata: Some(json!({
                "email_type": email.email_type.as_str(),
                "recipient": email.recipient,
            })),
            ip_address: None,
        },
    )
    .await; // best-effort: log emit failure doesn't break email send

    let metadata = json!({
        "body": email.body,
        "related_entity_type": email.related_entity_type,
        "related_entity_id": email.related_entity_id,
        "attachment_path": email.attachment_path,
    });

    tracing::info!(
        email_log_id = %id.0,
        email_type = email.email_type.as_str(),
        recipient = email.recipient,
        subject = email.subject,
        attachment = email.attachment_path.as_deref().unwrap_or("(none)"),
        "[MOCK EMAIL] payload={}",
        metadata,
    );

    Ok(id.0)
}
