//! Resend HTTP API client untuk transactional email delivery.
//!
//! Resend API docs: https://resend.com/docs/api-reference/emails/send-email
//!
//! Endpoint: `POST https://api.resend.com/emails`
//! Auth: `Authorization: Bearer <api_key>`
//! Payload: { from, to: [..], subject, html|text, attachments: [{filename, content (base64)}] }
//! Response: { "id": "<message_id>" }

use base64::Engine;
use reqwest::Client;
use serde::Serialize;

use crate::error::AppError;

const RESEND_API_URL: &str = "https://api.resend.com/emails";

#[derive(Clone)]
pub struct ResendClient {
    http: Client,
    api_key: String,
    from_email: String,
    from_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ResendAttachment {
    pub filename: String,
    pub content: Vec<u8>,
}

#[derive(Debug, Serialize)]
struct ResendPayload<'a> {
    from: String,
    to: &'a [String],
    subject: &'a str,
    text: &'a str,
    /// Optional HTML body. Kalau Some(""), Resend default ke text-only.
    /// Caller pass `&rendered.html`; kalau kosong tetap di-serialize
    /// (Resend menerima empty string dengan baik).
    html: &'a str,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    attachments: Vec<ResendAttachmentPayload>,
}

#[derive(Debug, Serialize)]
struct ResendAttachmentPayload {
    filename: String,
    /// Base64-encoded content. Resend expects standard base64, not URL-safe.
    content: String,
}

impl ResendClient {
    pub fn new(
        api_key: String,
        from_email: String,
        from_name: Option<String>,
    ) -> Result<Self, AppError> {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .https_only(true)
            .build()
            .map_err(|e| AppError::Internal(anyhow::anyhow!("build http client: {e}")))?;
        Ok(Self {
            http,
            api_key,
            from_email,
            from_name,
        })
    }

    /// Send transactional email. Returns Resend message ID on success.
    /// `text` adalah fallback plain-text body; `html` adalah HTML version
    /// (preferred). Keduanya dikirim supaya email client bisa pilih
    /// (HTML-capable client pakai `html`, sisanya pakai `text`).
    pub async fn send(
        &self,
        to: &str,
        subject: &str,
        text: &str,
        html: &str,
        attachments: &[ResendAttachment],
    ) -> Result<String, AppError> {
        let from = match &self.from_name {
            Some(name) => format!("{name} <{0}>", self.from_email),
            None => self.from_email.clone(),
        };

        let attachment_payloads: Vec<ResendAttachmentPayload> = attachments
            .iter()
            .map(|a| ResendAttachmentPayload {
                filename: a.filename.clone(),
                content: base64::engine::general_purpose::STANDARD.encode(&a.content),
            })
            .collect();

        let to_list = vec![to.to_string()];
        let payload = ResendPayload {
            from,
            to: &to_list,
            subject,
            text,
            html,
            attachments: attachment_payloads,
        };

        let resp = self
            .http
            .post(RESEND_API_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("resend http: {e}")))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("resend body: {e}")))?;

        if !status.is_success() {
            return Err(AppError::Internal(anyhow::anyhow!(
                "resend returned {status}: {body}"
            )));
        }

        // Parse message ID from response.
        #[derive(serde::Deserialize)]
        struct Response {
            id: String,
        }
        let parsed: Response = serde_json::from_str(&body)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("resend json: {e}; body: {body}")))?;
        Ok(parsed.id)
    }
}
