//! Admin endpoints (Admin JWT required). Spec §8.3.

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rust_decimal::Decimal;
use serde::Serialize;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::{
    auth::{password::verify_password, Role, RequireAdmin},
    dto::{DashboardStats, LoginRequest, LoginResponse},
    error::{AppError, AppResult},
    repo::{Page, PageQuery},
    services::{
        audit::{write as audit_write, AuditEntry},
        storage,
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/dashboard/stats", get(dashboard_stats))
        .route("/registrations", get(list_registrations))
        .route("/registrations/{id}", get(get_registration))
        .route("/invoices", get(list_invoices))
        .route("/invoices/{id}", get(get_invoice))
        .route("/policies", get(list_policies))
        .route("/policies/{id}", get(get_policy))
        .route("/policies/{id}/pdf", get(download_policy_pdf))
        .route("/email-logs", get(list_email_logs))
        .route("/audit-logs", get(list_audit_logs))
        .route("/claims", get(list_claims_admin))
        .route("/claims/{id}", axum::routing::patch(patch_claim))
        .route("/inquiries", get(list_inquiries_admin))
        .route(
            "/inquiries/{id}/respond",
            axum::routing::post(respond_inquiry),
        )
}

async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    let row: Option<(Uuid, String, String)> = sqlx::query_as(
        "SELECT id, username, password_hash FROM admin_users WHERE username = $1",
    )
    .bind(&req.username)
    .fetch_optional(&state.pool)
    .await?;

    let (admin_id, admin_username, password_hash) = row.ok_or(AppError::Unauthorized)?;

    if !verify_password(&req.password, &password_hash)? {
        return Err(AppError::Unauthorized);
    }

    let token = state
        .tokens
        .issue(&admin_id.to_string(), Role::Admin, None, 60 * 60 * 8)?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_username,
            action: "admin_login",
            entity_type: "admin_user",
            entity_id: Some(admin_id),
            metadata: None,
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(LoginResponse {
        token,
        role: "admin".to_string(),
    }))
}

#[derive(sqlx::FromRow)]
struct DashboardRow {
    total_registrations: i64,
    total_invoices: i64,
    total_paid_invoices: i64,
    total_unpaid_invoices: i64,
    total_policies: i64,
    total_premium_collected: Decimal,
}

async fn dashboard_stats(
    State(state): State<AppState>,
    _: RequireAdmin,
) -> AppResult<Json<DashboardStats>> {
    let row: DashboardRow = sqlx::query_as(
        r#"
        SELECT
          (SELECT COUNT(*) FROM registrations)                                    AS total_registrations,
          (SELECT COUNT(*) FROM invoices)                                         AS total_invoices,
          (SELECT COUNT(*) FROM invoices WHERE status = 'PAID')                   AS total_paid_invoices,
          (SELECT COUNT(*) FROM invoices WHERE status = 'UNPAID')                 AS total_unpaid_invoices,
          (SELECT COUNT(*) FROM policies)                                         AS total_policies,
          (SELECT COALESCE(SUM(premium_amount), 0) FROM invoices WHERE status = 'PAID')
            AS total_premium_collected
        "#,
    )
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(DashboardStats {
        total_registrations: row.total_registrations,
        total_invoices: row.total_invoices,
        total_paid_invoices: row.total_paid_invoices,
        total_unpaid_invoices: row.total_unpaid_invoices,
        total_policies: row.total_policies,
        total_premium_collected: row.total_premium_collected,
    }))
}

#[derive(Serialize, sqlx::FromRow)]
struct RegistrationRow {
    id: Uuid,
    registration_no: String,
    customer_id: Uuid,
    customer_name: String,
    customer_email: String,
    product: String,
    sum_assured: Decimal,
    coverage_term: i32,
    status: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

async fn list_registrations(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<RegistrationRow>>> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM registrations r
          JOIN customers c ON c.id = r.customer_id
         WHERE ($1 = '' OR r.registration_no ILIKE $1
                          OR c.full_name    ILIKE $1
                          OR c.email        ILIKE $1
                          OR c.nik          ILIKE $1)
           AND ($2 = '' OR r.status = $2)
        "#,
    )
    .bind(&search)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<RegistrationRow> = sqlx::query_as(
        r#"
        SELECT r.id, r.registration_no, r.customer_id,
               c.full_name AS customer_name, c.email AS customer_email,
               r.product, r.sum_assured, r.coverage_term, r.status, r.created_at
          FROM registrations r
          JOIN customers c ON c.id = r.customer_id
         WHERE ($1 = '' OR r.registration_no ILIKE $1
                          OR c.full_name    ILIKE $1
                          OR c.email        ILIKE $1
                          OR c.nik          ILIKE $1)
           AND ($2 = '' OR r.status = $2)
         ORDER BY r.created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&like)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

#[derive(Serialize, sqlx::FromRow)]
struct RegistrationDetail {
    id: Uuid,
    registration_no: String,
    customer_id: Uuid,
    customer_name: String,
    customer_email: String,
    customer_nik: String,
    product: String,
    sum_assured: Decimal,
    coverage_term: i32,
    status: String,
    created_at: chrono::DateTime<chrono::Utc>,
    invoice_no: Option<String>,
    invoice_status: Option<String>,
    premium_amount: Option<Decimal>,
    due_date: Option<chrono::NaiveDate>,
    policy_no: Option<String>,
    policy_status: Option<String>,
}

async fn get_registration(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<RegistrationDetail>> {
    let row: Option<RegistrationDetail> = sqlx::query_as(
        r#"
        SELECT r.id, r.registration_no, r.customer_id,
               c.full_name AS customer_name, c.email AS customer_email, c.nik AS customer_nik,
               r.product, r.sum_assured, r.coverage_term, r.status, r.created_at,
               i.invoice_no, i.status AS invoice_status, i.premium_amount, i.due_date,
               p.policy_no, p.status AS policy_status
          FROM registrations r
          JOIN customers c ON c.id = r.customer_id
          LEFT JOIN invoices i ON i.registration_id = r.id
          LEFT JOIN policies  p ON p.registration_id = r.id
         WHERE r.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    row.map(Json).ok_or(AppError::NotFound("registration".into()))
}

#[derive(Serialize, sqlx::FromRow)]
struct InvoiceRow {
    id: Uuid,
    invoice_no: String,
    registration_no: String,
    customer_name: String,
    premium_amount: Decimal,
    due_date: chrono::NaiveDate,
    status: String,
    paid_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
}

async fn list_invoices(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<InvoiceRow>>> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
          JOIN customers c     ON c.id = r.customer_id
         WHERE ($1 = '' OR i.invoice_no ILIKE $1
                          OR r.registration_no ILIKE $1
                          OR c.full_name       ILIKE $1
                          OR c.email           ILIKE $1)
           AND ($2 = '' OR i.status = $2)
        "#,
    )
    .bind(&search)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<InvoiceRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.invoice_no, r.registration_no, c.full_name AS customer_name,
               i.premium_amount, i.due_date, i.status, i.paid_at, i.created_at
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
          JOIN customers c     ON c.id = r.customer_id
         WHERE ($1 = '' OR i.invoice_no ILIKE $1
                          OR r.registration_no ILIKE $1
                          OR c.full_name       ILIKE $1
                          OR c.email           ILIKE $1)
           AND ($2 = '' OR i.status = $2)
         ORDER BY i.created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&like)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

async fn get_invoice(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<InvoiceRow>> {
    let row: Option<InvoiceRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.invoice_no, r.registration_no, c.full_name AS customer_name,
               i.premium_amount, i.due_date, i.status, i.paid_at, i.created_at
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
          JOIN customers c     ON c.id = r.customer_id
         WHERE i.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    row.map(Json).ok_or(AppError::NotFound("invoice".into()))
}

#[derive(Serialize, sqlx::FromRow)]
struct PolicyRow {
    id: Uuid,
    policy_no: String,
    registration_no: String,
    customer_name: String,
    product: String,
    sum_assured: Decimal,
    premium: Decimal,
    effective_date: chrono::NaiveDate,
    expiry_date: chrono::NaiveDate,
    status: String,
    pdf_path: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

async fn list_policies(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<PolicyRow>>> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
          JOIN customers c     ON c.id = r.customer_id
         WHERE ($1 = '' OR p.policy_no ILIKE $1
                          OR r.registration_no ILIKE $1
                          OR c.full_name       ILIKE $1)
           AND ($2 = '' OR p.status = $2)
        "#,
    )
    .bind(&search)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<PolicyRow> = sqlx::query_as(
        r#"
        SELECT p.id, p.policy_no, r.registration_no, c.full_name AS customer_name,
               p.product, p.sum_assured, p.premium,
               p.effective_date, p.expiry_date, p.status, p.pdf_path, p.created_at
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
          JOIN customers c     ON c.id = r.customer_id
         WHERE ($1 = '' OR p.policy_no ILIKE $1
                          OR r.registration_no ILIKE $1
                          OR c.full_name       ILIKE $1)
           AND ($2 = '' OR p.status = $2)
         ORDER BY p.created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&like)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

async fn get_policy(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<PolicyRow>> {
    let row: Option<PolicyRow> = sqlx::query_as(
        r#"
        SELECT p.id, p.policy_no, r.registration_no, c.full_name AS customer_name,
               p.product, p.sum_assured, p.premium,
               p.effective_date, p.expiry_date, p.status, p.pdf_path, p.created_at
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
          JOIN customers c     ON c.id = r.customer_id
         WHERE p.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    row.map(Json).ok_or(AppError::NotFound("policy".into()))
}

async fn download_policy_pdf(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Response> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT pdf_path FROM policies WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    let (pdf_path_opt,) = row.ok_or(AppError::NotFound("policy".into()))?;
    let pdf_path = pdf_path_opt.ok_or(AppError::NotFound("policy pdf".into()))?;

    let abs = storage::absolute_path(&state.config.upload_dir, &pdf_path);
    let file = tokio::fs::File::open(&abs)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("open pdf: {e}")))?;
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment"),
    );
    Ok((StatusCode::OK, headers, body).into_response())
}

#[derive(Serialize, sqlx::FromRow)]
struct EmailLogRow {
    id: Uuid,
    recipient: String,
    email_type: String,
    subject: String,
    status: String,
    error_message: Option<String>,
    sent_at: Option<chrono::DateTime<chrono::Utc>>,
}

async fn list_email_logs(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<EmailLogRow>>> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM email_logs
         WHERE ($1 = '' OR recipient ILIKE $1 OR subject ILIKE $1)
           AND ($2 = '' OR status = $2)
        "#,
    )
    .bind(&search)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<EmailLogRow> = sqlx::query_as(
        r#"
        SELECT id, recipient, email_type, subject, status, error_message, sent_at
          FROM email_logs
         WHERE ($1 = '' OR recipient ILIKE $1 OR subject ILIKE $1)
           AND ($2 = '' OR status = $2)
         ORDER BY id DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&like)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

#[derive(Serialize, sqlx::FromRow)]
struct AuditLogRow {
    id: Uuid,
    actor: String,
    action: String,
    entity_type: String,
    entity_id: Option<Uuid>,
    metadata: Option<serde_json::Value>,
    ip_address: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

async fn list_audit_logs(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<AuditLogRow>>> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM audit_logs
         WHERE ($1 = '' OR actor ILIKE $1 OR action ILIKE $1 OR entity_type ILIKE $1)
           AND ($2 = '' OR entity_type = $2)
        "#,
    )
    .bind(&search)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<AuditLogRow> = sqlx::query_as(
        r#"
        SELECT id, actor, action, entity_type, entity_id, metadata, ip_address, created_at
          FROM audit_logs
         WHERE ($1 = '' OR actor ILIKE $1 OR action ILIKE $1 OR entity_type ILIKE $1)
           AND ($2 = '' OR entity_type = $2)
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&like)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

// ---- Claims (admin view & review) ----

#[derive(Serialize, sqlx::FromRow)]
struct AdminClaimRow {
    id: Uuid,
    claim_no: String,
    policy_no: String,
    customer_name: String,
    claim_type: String,
    incident_date: chrono::NaiveDate,
    claimed_amount: Decimal,
    status: String,
    decision_note: Option<String>,
    submitted_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

async fn list_claims_admin(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<AdminClaimRow>>> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM claims cl
          JOIN policies p ON p.id = cl.policy_id
          JOIN customers c ON c.id = cl.customer_id
         WHERE ($1 = '' OR cl.claim_no ILIKE $1 OR c.full_name ILIKE $1)
           AND ($2 = '' OR cl.status = $2)
        "#,
    )
    .bind(&search)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<AdminClaimRow> = sqlx::query_as(
        r#"
        SELECT cl.id, cl.claim_no, p.policy_no, c.full_name AS customer_name,
               cl.claim_type, cl.incident_date, cl.claimed_amount,
               cl.status, cl.decision_note, cl.submitted_at, cl.updated_at
          FROM claims cl
          JOIN policies p ON p.id = cl.policy_id
          JOIN customers c ON c.id = cl.customer_id
         WHERE ($1 = '' OR cl.claim_no ILIKE $1 OR c.full_name ILIKE $1)
           AND ($2 = '' OR cl.status = $2)
         ORDER BY cl.submitted_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&like)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

#[derive(serde::Deserialize)]
struct PatchClaimBody {
    status: String,
    #[serde(default)]
    decision_note: Option<String>,
}

async fn patch_claim(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    Path(id): Path<Uuid>,
    Json(req): Json<PatchClaimBody>,
) -> AppResult<Json<AdminClaimRow>> {
    use crate::domain::claim::can_transition as claim_can_transition;

    let current: Option<(String,)> = sqlx::query_as("SELECT status FROM claims WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    let (current_status,) = current.ok_or(AppError::NotFound("claim".into()))?;
    if !claim_can_transition(&current_status, &req.status) {
        return Err(AppError::Validation(format!(
            "illegal status transition: {current_status} -> {}",
            req.status
        )));
    }

    sqlx::query(
        "UPDATE claims SET status = $1, decision_note = $2, updated_at = now() WHERE id = $3",
    )
    .bind(&req.status)
    .bind(req.decision_note.as_deref())
    .bind(id)
    .execute(&state.pool)
    .await?;

    let row: AdminClaimRow = sqlx::query_as(
        r#"
        SELECT cl.id, cl.claim_no, p.policy_no, c.full_name AS customer_name,
               cl.claim_type, cl.incident_date, cl.claimed_amount,
               cl.status, cl.decision_note, cl.submitted_at, cl.updated_at
          FROM claims cl
          JOIN policies p ON p.id = cl.policy_id
          JOIN customers c ON c.id = cl.customer_id
         WHERE cl.id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    let customer_email: String = sqlx::query_scalar(
        "SELECT c.email FROM claims cl JOIN customers c ON c.id = cl.customer_id WHERE cl.id = $1",
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    let body = match req.decision_note.as_deref() {
        Some(note) => format!(
            "Klaim {} sekarang berstatus {}. Catatan: {}",
            row.claim_no, req.status, note
        ),
        None => format!("Klaim {} sekarang berstatus {}.", row.claim_no, req.status),
    };

    crate::services::email::send(
        &state.pool,
        crate::services::email::Email {
            email_type: crate::services::email::EmailType::ClaimStatusUpdate,
            recipient: &customer_email,
            subject: "Claim Status Update",
            body: &body,
            related_entity_type: Some("claim"),
            related_entity_id: Some(id),
            attachment_path: None,
        },
    )
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_claims.sub,
            action: "claim_status_changed",
            entity_type: "claim",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({
                "from": current_status,
                "to": req.status,
                "decision_note": req.decision_note,
            })),
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(row))
}

// ---- Inquiries (admin view & respond) ----

#[derive(Serialize, sqlx::FromRow)]
struct AdminInquiryRow {
    id: Uuid,
    inquiry_no: String,
    customer_name: String,
    customer_email: String,
    policy_no: Option<String>,
    subject: String,
    message: String,
    status: String,
    response: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    responded_at: Option<chrono::DateTime<chrono::Utc>>,
}

async fn list_inquiries_admin(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<AdminInquiryRow>>> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM inquiries i
          JOIN customers c ON c.id = i.customer_id
         WHERE ($1 = '' OR i.inquiry_no ILIKE $1 OR i.subject ILIKE $1 OR c.full_name ILIKE $1)
           AND ($2 = '' OR i.status = $2)
        "#,
    )
    .bind(&search)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<AdminInquiryRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, c.full_name AS customer_name, c.email AS customer_email,
               p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at
          FROM inquiries i
          JOIN customers c ON c.id = i.customer_id
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE ($1 = '' OR i.inquiry_no ILIKE $1 OR i.subject ILIKE $1 OR c.full_name ILIKE $1)
           AND ($2 = '' OR i.status = $2)
         ORDER BY i.created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&like)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

#[derive(serde::Deserialize)]
struct RespondInquiryBody {
    response: String,
    #[serde(default)]
    close: bool,
}

async fn respond_inquiry(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    Path(id): Path<Uuid>,
    Json(req): Json<RespondInquiryBody>,
) -> AppResult<Json<AdminInquiryRow>> {
    use crate::domain::inquiry::can_transition as inquiry_can_transition;

    let current: Option<(String,)> = sqlx::query_as("SELECT status FROM inquiries WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    let (current_status,) = current.ok_or(AppError::NotFound("inquiry".into()))?;

    let new_status = if req.close { "CLOSED" } else { "ANSWERED" };
    if !inquiry_can_transition(&current_status, new_status) {
        return Err(AppError::Validation(format!(
            "illegal inquiry transition: {current_status} -> {new_status}"
        )));
    }

    sqlx::query(
        "UPDATE inquiries SET response = $1, status = $2, responded_at = now() WHERE id = $3",
    )
    .bind(&req.response)
    .bind(new_status)
    .bind(id)
    .execute(&state.pool)
    .await?;

    let row: AdminInquiryRow = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, c.full_name AS customer_name, c.email AS customer_email,
               p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at
          FROM inquiries i
          JOIN customers c ON c.id = i.customer_id
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE i.id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    crate::services::email::send(
        &state.pool,
        crate::services::email::Email {
            email_type: crate::services::email::EmailType::InquiryResponse,
            recipient: &row.customer_email,
            subject: "Inquiry Response",
            body: &format!(
                "Inquiry {} ({})\n\nJawaban: {}",
                row.inquiry_no, row.subject, req.response
            ),
            related_entity_type: Some("inquiry"),
            related_entity_id: Some(id),
            attachment_path: None,
        },
    )
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_claims.sub,
            action: "inquiry_answered",
            entity_type: "inquiry",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({
                "from": current_status,
                "to": new_status,
            })),
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(row))
}
