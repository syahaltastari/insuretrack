//! Customer portal endpoints (Customer JWT required). Spec §8.2.
//!
//!   POST /api/customer/activate          (activation-purpose JWT, no prior auth)
//!   POST /api/customer/login
//!   POST /api/customer/password/reset
//!   POST /api/customer/password/reset/consume
//!   GET  /api/customer/me                 (dashboard summary)
//!   GET  /api/customer/policies           (own policies)
//!   GET  /api/customer/policies/:id
//!   GET  /api/customer/policies/:id/pdf
//!   POST /api/customer/claims            (multipart, claim form)
//!   GET  /api/customer/claims
//!   GET  /api/customer/claims/:id
//!   POST /api/customer/inquiries
//!   GET  /api/customer/inquiries
//!   GET  /api/customer/inquiries/:id

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::{
    auth::{password::hash_password, password::verify_password, Role, RequireCustomer},
    domain::{claim::can_transition as claim_can_transition, identifier::{next_id, EntityType}},
    dto::{
        ActivateRequest, LoginRequest, LoginResponse, PasswordResetConsumeRequest,
        PasswordResetRequest,
    },
    error::{AppError, AppResult},
    repo::{Page, PageQuery},
    routes::public::{calculate_premium, product_name_from_code, validate_registration, RegistrationData},
    services::{
        audit::{write as audit_write, AuditEntry},
        email::{send as send_email, Email, EmailType},
        pdf::{render_invoice as render_invoice_pdf, InvoicePdfInput},
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/activate", post(activate))
        .route("/login", post(login))
        .route("/password/reset", post(password_reset))
        .route(
            "/password/reset/consume",
            post(password_reset_consume),
        )
        .route("/me", get(me).patch(update_me))
        .route("/password/change", axum::routing::post(change_password))
        .route("/registrations", post(submit_insurance_application))
        .route("/policies", get(list_policies))
        .route("/policies/:id", get(get_policy))
        .route("/policies/:id/pdf", get(download_policy_pdf))
        .route("/invoices", get(list_invoices))
        .route("/invoices/:id", get(get_invoice))
        .route("/invoices/:id/pdf", get(download_invoice_pdf))
        .route("/claims", get(list_claims).post(create_claim))
        .route("/claims/:id", get(get_claim))
        .route("/inquiries", get(list_inquiries).post(create_inquiry))
        .route("/inquiries/:id", get(get_inquiry))
}

#[derive(sqlx::FromRow)]
struct CustomerCredRow {
    id: Uuid,
    email: String,
    password_hash: Option<String>,
    portal_status: Option<String>,
}

fn customer_id_from(claims: &crate::auth::Claims) -> AppResult<Uuid> {
    claims.sub.parse::<Uuid>().map_err(|_| AppError::Unauthorized)
}

// ---- POST /activate ----

async fn activate(
    State(state): State<AppState>,
    Json(req): Json<ActivateRequest>,
) -> AppResult<Json<LoginResponse>> {
    let claims = state.tokens.verify(&req.token)?;
    if claims.purpose.as_deref() != Some("activation") || claims.role != Role::Customer {
        return Err(AppError::Unauthorized);
    }

    let customer_id: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    let row: Option<CustomerCredRow> = sqlx::query_as(
        r#"
        UPDATE customers
           SET portal_status = 'ACTIVE', updated_at = now()
         WHERE id = $1 AND portal_status = 'PENDING'
         RETURNING id, email, password_hash, portal_status
        "#,
    )
    .bind(customer_id)
    .fetch_optional(&state.pool)
    .await?;

    let customer = row.ok_or(AppError::NotFound(
        "customer (already active or not found)".into(),
    ))?;

    let token = state
        .tokens
        .issue(&customer.id.to_string(), Role::Customer, None, 60 * 60 * 8)?;
    Ok(Json(LoginResponse {
        token,
        role: "customer".to_string(),
    }))
}

// ---- POST /login ----

async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    let row: Option<CustomerCredRow> = sqlx::query_as(
        r#"
        SELECT id, email, password_hash, portal_status
          FROM customers WHERE email = $1
        "#,
    )
    .bind(&req.username)
    .fetch_optional(&state.pool)
    .await?;

    let customer = row.ok_or(AppError::Unauthorized)?;
    let stored_hash = customer
        .password_hash
        .as_deref()
        .ok_or(AppError::Unauthorized)?;

    if !verify_password(&req.password, stored_hash)? {
        return Err(AppError::Unauthorized);
    }
    if customer.portal_status.as_deref() != Some("ACTIVE") {
        return Err(AppError::Forbidden);
    }

    let token = state
        .tokens
        .issue(&customer.id.to_string(), Role::Customer, None, 60 * 60 * 8)?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &customer.email,
            action: "customer_login",
            entity_type: "customer",
            entity_id: Some(customer.id),
            metadata: None,
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(LoginResponse {
        token,
        role: "customer".to_string(),
    }))
}

// ---- POST /password/reset ----

async fn password_reset(
    State(state): State<AppState>,
    Json(req): Json<PasswordResetRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let row: Option<CustomerCredRow> = sqlx::query_as(
        "SELECT id, email, password_hash, portal_status FROM customers WHERE email = $1",
    )
    .bind(&req.email)
    .fetch_optional(&state.pool)
    .await?;

    let customer = row.ok_or(AppError::NotFound("email not registered".into()))?;
    if customer.portal_status.as_deref() != Some("ACTIVE") {
        return Err(AppError::Forbidden);
    }

    let reset_token = state.tokens.issue(
        &customer.id.to_string(),
        Role::Customer,
        Some("password_reset".to_string()),
        60 * 30,
    )?;

    Ok(Json(serde_json::json!({
        "ok": true,
        "reset_token": reset_token,
        "reset_url": format!(
            "{}/portal/reset?token={}",
            state.config.app_base_url, reset_token
        ),
    })))
}

async fn password_reset_consume(
    State(state): State<AppState>,
    Json(req): Json<PasswordResetConsumeRequest>,
) -> AppResult<Json<LoginResponse>> {
    if req.new_password.len() < 8 {
        return Err(AppError::Validation(
            "Password baru minimal 8 karakter".into(),
        ));
    }
    let claims = state.tokens.verify(&req.token)?;
    if claims.purpose.as_deref() != Some("password_reset") || claims.role != Role::Customer {
        return Err(AppError::Unauthorized);
    }
    let customer_id: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let new_hash = hash_password(&req.new_password)?;

    let row: Option<CustomerCredRow> = sqlx::query_as(
        r#"
        UPDATE customers
           SET password_hash = $1, updated_at = now()
         WHERE id = $2
        RETURNING id, email, password_hash, portal_status
        "#,
    )
    .bind(&new_hash)
    .bind(customer_id)
    .fetch_optional(&state.pool)
    .await?;
    let customer = row.ok_or(AppError::NotFound("customer".into()))?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &customer.email,
            action: "customer_password_reset",
            entity_type: "customer",
            entity_id: Some(customer.id),
            metadata: None,
            ip_address: None,
        },
    )
    .await?;

    // Issue a fresh login token so the user is signed in immediately.
    let token = state
        .tokens
        .issue(&customer.id.to_string(), Role::Customer, None, 60 * 60 * 8)?;
    Ok(Json(LoginResponse {
        token,
        role: "customer".to_string(),
    }))
}

// ---- GET /me ----

#[derive(Serialize)]
struct MeSummary {
    customer_id: Uuid,
    email: String,
    full_name: String,
    /// Nomor HP customer (diperlukan oleh form edit profil).
    mobile_number: String,
    active_policy_count: i64,
    total_sum_assured: Decimal,
    open_claim_count: i64,
    open_inquiry_count: i64,
}

async fn me(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
) -> AppResult<Json<MeSummary>> {
    let customer_id = customer_id_from(&claims)?;

    let summary: (Uuid, String, String, String, i64, Option<Decimal>, i64, i64) = sqlx::query_as(
        r#"
        SELECT c.id, c.email, c.full_name, c.mobile_number,
               (SELECT COUNT(*) FROM policies  p WHERE p.registration_id IN
                  (SELECT id FROM registrations WHERE customer_id = c.id) AND p.status = 'ACTIVE')
                 AS active_policy_count,
               (SELECT SUM(p.sum_assured) FROM policies p WHERE p.registration_id IN
                  (SELECT id FROM registrations WHERE customer_id = c.id) AND p.status = 'ACTIVE')
                 AS total_sum_assured,
               (SELECT COUNT(*) FROM claims   cl WHERE cl.customer_id = c.id
                  AND cl.status IN ('SUBMITTED','UNDER_REVIEW')) AS open_claim_count,
               (SELECT COUNT(*) FROM inquiries iq WHERE iq.customer_id = c.id
                  AND iq.status = 'OPEN') AS open_inquiry_count
          FROM customers c
         WHERE c.id = $1
        "#,
    )
    .bind(customer_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(MeSummary {
        customer_id: summary.0,
        email: summary.1,
        full_name: summary.2,
        mobile_number: summary.3,
        active_policy_count: summary.4,
        total_sum_assured: summary.5.unwrap_or_default(),
        open_claim_count: summary.6,
        open_inquiry_count: summary.7,
    }))
}

// ---- PATCH /me ----
//
// Update basic profile fields. Saat ini hanya 3 field yang boleh
// diubah dari portal: full_name, email, mobile_number. Field lain
// (NIK, birth_date, address, dll.) terkunci setelah registrasi
// aplikasi asuransi untuk konsistensi dengan data polis/klaim.

#[derive(Debug, Deserialize)]
struct UpdateMeRequest {
    full_name: Option<String>,
    email: Option<String>,
    mobile_number: Option<String>,
}

#[derive(Serialize)]
struct UpdateMeResponse {
    customer_id: Uuid,
    full_name: String,
    email: String,
    mobile_number: String,
}

async fn update_me(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Json(req): Json<UpdateMeRequest>,
) -> AppResult<Json<UpdateMeResponse>> {
    let customer_id = customer_id_from(&claims)?;

    // Normalisasi & validasi per-field. Kalau field None, biarkan
    // nilai existing (tidak di-overwrite). Kalau Some("") ditolak.
    let full = req
        .full_name
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let email = req
        .email
        .as_deref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());
    let mobile = req
        .mobile_number
        .as_deref()
        .map(|s| {
            s.chars()
                .filter(|c| c.is_ascii_digit() || *c == '+')
                .collect::<String>()
        })
        .filter(|s: &String| (10..=15).contains(&s.len()));

    // Validasi format kalau user supply nilai baru.
    if let Some(ref e) = email {
        if !e.contains('@') || !e.contains('.') {
            return Err(AppError::Validation("format email tidak valid".into()));
        }
    }
    if let Some(ref m) = mobile {
        let digit_count = m.chars().filter(|c| c.is_ascii_digit()).count();
        if !(10..=15).contains(&digit_count) {
            return Err(AppError::Validation(
                "nomor HP harus 10-15 digit".into(),
            ));
        }
    }
    if let Some(ref f) = full {
        if f.chars().count() < 3 {
            return Err(AppError::Validation("nama minimal 3 karakter".into()));
        }
    }

    // Cek konflik email kalau diubah.
    if let Some(ref e) = email {
        let conflict: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM customers WHERE email = $1 AND id <> $2",
        )
        .bind(e)
        .bind(customer_id)
        .fetch_optional(&state.pool)
        .await?;
        if conflict.is_some() {
            return Err(AppError::Conflict("email sudah dipakai customer lain".into()));
        }
    }

    let row: (Uuid, String, String, String) = sqlx::query_as(
        r#"
        UPDATE customers
           SET full_name     = COALESCE($2, full_name),
               email         = COALESCE($3, email),
               mobile_number = COALESCE($4, mobile_number),
               updated_at    = now()
         WHERE id = $1
        RETURNING id, full_name, email, mobile_number
        "#,
    )
    .bind(customer_id)
    .bind(full)
    .bind(email)
    .bind(mobile)
    .fetch_one(&state.pool)
    .await?;

    // Audit (FS-15) — best-effort, jangan fail request kalau audit error.
    let fields_changed: Vec<&str> = [
        req.full_name.as_ref().map(|_| "full_name" as &str),
        req.email.as_ref().map(|_| "email" as &str),
        req.mobile_number.as_ref().map(|_| "mobile_number" as &str),
    ]
    .into_iter()
    .flatten()
    .collect();
    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.sub,
            action: "customer_profile_updated",
            entity_type: "customer",
            entity_id: Some(customer_id),
            metadata: Some(serde_json::json!({ "fields_changed": fields_changed })),
            ip_address: None,
        },
    )
    .await;

    Ok(Json(UpdateMeResponse {
        customer_id: row.0,
        full_name: row.1,
        email: row.2,
        mobile_number: row.3,
    }))
}

// ---- POST /password/change ----
//
// Change password while logged in. User harus supply current password
// (autentikasi ulang) sebelum password baru di-set. Tidak ada token
// email — kalau user lupa password, pakai /password/reset flow
// (lihat routes/customer.rs::password_reset).

#[derive(Debug, Deserialize)]
struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Json(req): Json<ChangePasswordRequest>,
) -> AppResult<StatusCode> {
    let customer_id = customer_id_from(&claims)?;

    if req.new_password.len() < 8 {
        return Err(AppError::Validation(
            "Password baru minimal 8 karakter".into(),
        ));
    }
    if req.new_password == req.current_password {
        return Err(AppError::Validation(
            "Password baru harus berbeda dari password lama".into(),
        ));
    }

    let row: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT password_hash FROM customers WHERE id = $1",
    )
    .bind(customer_id)
    .fetch_optional(&state.pool)
    .await?;
    let (current_hash_opt,) = row.ok_or(AppError::Unauthorized)?;
    let current_hash = current_hash_opt.as_deref().ok_or(AppError::Unauthorized)?;

    if !verify_password(&req.current_password, current_hash)? {
        return Err(AppError::Unauthorized);
    }

    let new_hash = hash_password(&req.new_password)?;
    sqlx::query(
        "UPDATE customers SET password_hash = $1, password_changed_at = now(), updated_at = now() WHERE id = $2",
    )
    .bind(&new_hash)
    .bind(customer_id)
    .execute(&state.pool)
    .await?;

    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.sub,
            action: "customer_password_changed",
            entity_type: "customer",
            entity_id: Some(customer_id),
            metadata: None,
            ip_address: None,
        },
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ---- /policies ----

#[derive(Serialize, sqlx::FromRow)]
struct PolicyRow {
    id: Uuid,
    policy_no: String,
    product: String,
    sum_assured: Decimal,
    premium: Decimal,
    effective_date: chrono::NaiveDate,
    expiry_date: chrono::NaiveDate,
    status: String,
    pdf_path: Option<String>,
}

async fn list_policies(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<PolicyRow>>> {
    let customer_id = customer_id_from(&claims)?;
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let status = q.status.clone().unwrap_or_default();

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
         WHERE r.customer_id = $1
           AND ($2 = '' OR p.status = $2)
        "#,
    )
    .bind(customer_id)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<PolicyRow> = sqlx::query_as(
        r#"
        SELECT p.id, p.policy_no, p.product, p.sum_assured, p.premium,
               p.effective_date, p.expiry_date, p.status, p.pdf_path
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
         WHERE r.customer_id = $1
           AND ($2 = '' OR p.status = $2)
         ORDER BY p.created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(customer_id)
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
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Json<PolicyRow>> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<PolicyRow> = sqlx::query_as(
        r#"
        SELECT p.id, p.policy_no, p.product, p.sum_assured, p.premium,
               p.effective_date, p.expiry_date, p.status, p.pdf_path
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
         WHERE r.customer_id = $1 AND p.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    row.map(Json).ok_or(AppError::NotFound("policy".into()))
}

async fn download_policy_pdf(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Response> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<(Option<String>,)> = sqlx::query_as(
        r#"
        SELECT p.pdf_path
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
         WHERE r.customer_id = $1 AND p.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (pdf_path_opt,) = row.ok_or(AppError::NotFound("policy".into()))?;
    let pdf_path = pdf_path_opt.ok_or(AppError::NotFound("policy pdf".into()))?;

    let bytes = state
        .storage
        .read_bytes(&pdf_path)
        .await?;
    let body = Body::from(bytes);

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

// ---- /claims ----

#[derive(Serialize, sqlx::FromRow)]
struct ClaimRow {
    id: Uuid,
    claim_no: String,
    policy_id: Uuid,
    policy_no: String,
    claim_type: String,
    incident_date: chrono::NaiveDate,
    claimed_amount: Decimal,
    description: String,
    status: String,
    decision_note: Option<String>,
    submitted_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
struct CreateClaimJson {
    policy_id: Uuid,
    claim_type: String,
    incident_date: chrono::NaiveDate,
    claimed_amount: Decimal,
    description: String,
}

#[derive(Serialize)]
struct CreateClaimResponse {
    claim_no: String,
    status: String,
}

async fn list_claims(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<ClaimRow>>> {
    let customer_id = customer_id_from(&claims)?;
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let status = q.status.clone().unwrap_or_default();

    let total: (i64,) = sqlx::query_as(
        r#"SELECT COUNT(*) FROM claims WHERE customer_id = $1 AND ($2 = '' OR status = $2)"#,
    )
    .bind(customer_id)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<ClaimRow> = sqlx::query_as(
        r#"
        SELECT cl.id, cl.claim_no, cl.policy_id, p.policy_no,
               cl.claim_type, cl.incident_date, cl.claimed_amount, cl.description,
               cl.status, cl.decision_note, cl.submitted_at, cl.updated_at
          FROM claims cl
          JOIN policies p ON p.id = cl.policy_id
         WHERE cl.customer_id = $1
           AND ($2 = '' OR cl.status = $2)
         ORDER BY cl.submitted_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(customer_id)
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

async fn get_claim(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ClaimRow>> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<ClaimRow> = sqlx::query_as(
        r#"
        SELECT cl.id, cl.claim_no, cl.policy_id, p.policy_no,
               cl.claim_type, cl.incident_date, cl.claimed_amount, cl.description,
               cl.status, cl.decision_note, cl.submitted_at, cl.updated_at
          FROM claims cl
          JOIN policies p ON p.id = cl.policy_id
         WHERE cl.customer_id = $1 AND cl.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    row.map(Json).ok_or(AppError::NotFound("claim".into()))
}

async fn create_claim(
    State(state): State<AppState>,
    RequireCustomer(customer_claims): RequireCustomer,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    let customer_id = customer_id_from(&customer_claims)?;

    let mut data_json: Option<String> = None;
    let mut doc_files: Vec<(String, String, Vec<u8>)> = Vec::new(); // (name, mime, bytes)

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Validation(format!("multipart: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "data" => {
                data_json = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::Validation(format!("data: {e}")))?,
                );
            }
            "documents" => {
                let file_name = field.file_name().unwrap_or("evidence").to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::Validation(format!("doc bytes: {e}")))?;
                doc_files.push((file_name, content_type, bytes.to_vec()));
            }
            _ => {}
        }
    }

    let data_str = data_json.ok_or_else(|| AppError::Validation("missing 'data' field".into()))?;
    let data: CreateClaimJson = serde_json::from_str(&data_str)
        .map_err(|e| AppError::Validation(format!("invalid data JSON: {e}")))?;

    // Validate: policy belongs to customer, ACTIVE, incident_date in coverage period, claimed_amount <= sum_assured
    let policy: Option<(Uuid, String, Decimal, chrono::NaiveDate, chrono::NaiveDate)> = sqlx::query_as(
        r#"
        SELECT p.id, p.status, p.sum_assured, p.effective_date, p.expiry_date
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
         WHERE p.id = $1 AND r.customer_id = $2
        "#,
    )
    .bind(data.policy_id)
    .bind(customer_id)
    .fetch_optional(&state.pool)
    .await?;
    let (pid, pstatus, sum_assured, eff, exp) =
        policy.ok_or(AppError::NotFound("policy not found or not owned".into()))?;
    if pstatus != "ACTIVE" {
        return Err(AppError::Validation(format!(
            "policy not active (status: {pstatus})"
        )));
    }
    let today = Utc::now().date_naive();
    if data.incident_date > today {
        return Err(AppError::Validation(
            "incident_date cannot be in the future".into(),
        ));
    }
    if data.incident_date < eff || data.incident_date > exp {
        return Err(AppError::Validation(
            "incident_date outside policy coverage period".into(),
        ));
    }
    if data.claimed_amount <= Decimal::ZERO {
        return Err(AppError::Validation("claimed_amount must be > 0".into()));
    }
    if data.claimed_amount > sum_assured {
        return Err(AppError::Validation(format!(
            "claimed_amount exceeds sum assured ({sum_assured})"
        )));
    }
    let _ = pid;

    // Save documents first so we can reference claim_id.
    let mut tx = state.pool.begin().await?;
    let claim_no = next_id(&mut tx, EntityType::Claim).await?;
    let claim_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO claims
          (id, claim_no, policy_id, customer_id, claim_type, incident_date,
           claimed_amount, description, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SUBMITTED')
        "#,
    )
    .bind(claim_id)
    .bind(&claim_no)
    .bind(data.policy_id)
    .bind(customer_id)
    .bind(&data.claim_type)
    .bind(data.incident_date)
    .bind(data.claimed_amount)
    .bind(&data.description)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    for (fname, mime_t, bytes) in &doc_files {
        let doc_ref = state
            .storage
            .save_claim_doc(claim_id, fname, mime_t, bytes)
            .await?;
        let rel = doc_ref.key;
        sqlx::query(
            r#"INSERT INTO claim_documents (claim_id, file_name, file_path) VALUES ($1, $2, $3)"#,
        )
        .bind(claim_id)
        .bind(fname)
        .bind(rel)
        .execute(&state.pool)
        .await?;
    }

    // Email + audit
    let customer_email: String = sqlx::query_scalar("SELECT email FROM customers WHERE id = $1")
        .bind(customer_id)
        .fetch_one(&state.pool)
        .await?;

    send_email(
        &state.pool,
        &*state.storage,
        &state.resend,
        Email {
            email_type: EmailType::ClaimReceived,
            recipient: &customer_email,
            subject: &format!("Klaim {} Diterima — Dalam Peninjauan", claim_no),
            body: &format!(
                "Halo,\n\n\
                 Klaim {} untuk polis terkait telah kami terima dan sedang \
                 dalam antrian peninjauan tim kami. Kamu akan dapat notifikasi \
                 email begitu ada update status.\n\n\
                 Untuk lihat progress klaim kapan saja, login ke portal > menu Klaim.\n\n\
                 Salam,\n\
                 Tim InsureTrack",
                claim_no
            ),
            cta_text: None,
            cta_url: None,
            related_entity_type: Some("claim"),
            related_entity_id: Some(claim_id),
            attachment_path: None,
        },
    )
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &customer_email,
            action: "claim_submitted",
            entity_type: "claim",
            entity_id: Some(claim_id),
            metadata: Some(serde_json::json!({
                "claim_no": claim_no,
                "policy_id": data.policy_id,
                "claimed_amount": data.claimed_amount,
            })),
            ip_address: None,
        },
    )
    .await?;

    // Touch state machine helper so we know it's wired (no transition at submit; just import).
    let _ = claim_can_transition;

    Ok((
        StatusCode::CREATED,
        Json(CreateClaimResponse {
            claim_no,
            status: "SUBMITTED".to_string(),
        }),
    ))
}

// ---- /inquiries ----

#[derive(Serialize, sqlx::FromRow)]
struct InquiryRow {
    id: Uuid,
    inquiry_no: String,
    policy_id: Option<Uuid>,
    policy_no: Option<String>,
    subject: String,
    message: String,
    status: String,
    response: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    responded_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(serde::Deserialize)]
struct CreateInquiryJson {
    policy_id: Option<Uuid>,
    subject: String,
    message: String,
}

#[derive(Serialize)]
struct CreateInquiryResponse {
    inquiry_no: String,
    status: String,
}

async fn list_inquiries(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<InquiryRow>>> {
    let customer_id = customer_id_from(&claims)?;
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let status = q.status.clone().unwrap_or_default();

    let total: (i64,) = sqlx::query_as(
        r#"SELECT COUNT(*) FROM inquiries WHERE customer_id = $1 AND ($2 = '' OR status = $2)"#,
    )
    .bind(customer_id)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<InquiryRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, i.policy_id, p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at
          FROM inquiries i
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE i.customer_id = $1
           AND ($2 = '' OR i.status = $2)
         ORDER BY i.created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(customer_id)
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

async fn get_inquiry(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Json<InquiryRow>> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<InquiryRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, i.policy_id, p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at
          FROM inquiries i
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE i.customer_id = $1 AND i.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    row.map(Json).ok_or(AppError::NotFound("inquiry".into()))
}

async fn create_inquiry(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Json(req): Json<CreateInquiryJson>,
) -> AppResult<impl IntoResponse> {
    let customer_id = customer_id_from(&claims)?;

    if req.subject.trim().is_empty() {
        return Err(AppError::Validation("subject required".into()));
    }
    if req.message.trim().is_empty() {
        return Err(AppError::Validation("message required".into()));
    }

    // If policy_id is provided, verify ownership.
    if let Some(pid) = req.policy_id {
        let owned: Option<(Uuid,)> = sqlx::query_as(
            r#"
            SELECT p.id
              FROM policies p
              JOIN registrations r ON r.id = p.registration_id
             WHERE p.id = $1 AND r.customer_id = $2
            "#,
        )
        .bind(pid)
        .bind(customer_id)
        .fetch_optional(&state.pool)
        .await?;
        if owned.is_none() {
            return Err(AppError::NotFound("policy".into()));
        }
    }

    let mut tx = state.pool.begin().await?;
    let inquiry_no = next_id(&mut tx, EntityType::Inquiry).await?;
    let inquiry_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO inquiries
          (id, inquiry_no, customer_id, policy_id, subject, message, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')
        "#,
    )
    .bind(inquiry_id)
    .bind(&inquiry_no)
    .bind(customer_id)
    .bind(req.policy_id)
    .bind(&req.subject)
    .bind(&req.message)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let customer_email: String = sqlx::query_scalar("SELECT email FROM customers WHERE id = $1")
        .bind(customer_id)
        .fetch_one(&state.pool)
        .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &customer_email,
            action: "inquiry_submitted",
            entity_type: "inquiry",
            entity_id: Some(inquiry_id),
            metadata: Some(serde_json::json!({ "inquiry_no": inquiry_no })),
            ip_address: None,
        },
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(CreateInquiryResponse {
            inquiry_no,
            status: "OPEN".to_string(),
        }),
    ))
}

// ---- POST /registrations (insurance application, requires customer auth) ----
//
// Setelah flow split, customer membuat akun via POST /api/public/customers
// (Task 3). Setelah aktivasi email + login, customer bisa submit
// aplikasi asuransi dari portal. Endpoint ini requires customer JWT.
//
// Behavior:
// - Customer ID dari JWT (bukan dari request body)
// - Multipart: data (JSON) + id_card (file KTP)
// - UPDATE customer record dengan field insurance-spesifik
//   (nik, ktp, address, dll.) — sebelumnya NULL setelah account creation
// - Create registration + invoice
// - Send RegistrationSuccess + InvoiceNotification emails

async fn submit_insurance_application(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    let customer_id = claims.sub.parse::<Uuid>().map_err(|_| AppError::Unauthorized)?;
    let customer_email = claims.sub.clone();

    let row: Option<(String,)> = sqlx::query_as(
        "SELECT portal_status FROM customers WHERE id = $1",
    )
    .bind(customer_id)
    .fetch_optional(&state.pool)
    .await?;
    let status = row.ok_or(AppError::NotFound("customer".into()))?.0;
    if status != "ACTIVE" {
        return Err(AppError::Forbidden);
    }

    let mut data_field: Option<String> = None;
    let mut ktp_field: Option<(String, String, Vec<u8>)> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Validation(format!("multipart: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "data" => {
                data_field = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::Validation(format!("data field: {e}")))?,
                );
            }
            "id_card" => {
                let file_name = field
                    .file_name()
                    .unwrap_or("ktp")
                    .to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::Validation(format!("id_card bytes: {e}")))?;
                ktp_field = Some((file_name, content_type, bytes.to_vec()));
            }
            _ => {}
        }
    }

    let data_json = data_field.ok_or_else(|| AppError::Validation("missing 'data' field".into()))?;
    let (ktp_name, ktp_ct, ktp_bytes) =
        ktp_field.ok_or_else(|| AppError::Validation("missing 'id_card' file".into()))?;
    let data: RegistrationData = serde_json::from_str(&data_json)
        .map_err(|e| AppError::Validation(format!("invalid data JSON: {e}")))?;
    validate_registration(&data)?;

    let mut tx = state.pool.begin().await?;

    let ktp_ref = state
        .storage
        .save_ktp(customer_id, &ktp_name, &ktp_ct, &ktp_bytes)
        .await?;
    let ktp_path = ktp_ref.key;

    sqlx::query(
        r#"
        UPDATE customers
           SET nik = $1, birth_place = $2, birth_date = $3, gender = $4,
               address = $5, rt_rw = $6, village = $7, district = $8,
               city = $9, province = $10, postal_code = $11, mobile_number = $12,
               id_card_path = $13, updated_at = now()
         WHERE id = $14
        "#,
    )
    .bind(&data.nik)
    .bind(&data.birth_place)
    .bind(data.birth_date)
    .bind(&data.gender)
    .bind(&data.address)
    .bind(&data.rt_rw)
    .bind(&data.village)
    .bind(&data.district)
    .bind(&data.city)
    .bind(&data.province)
    .bind(&data.postal_code)
    .bind(&data.mobile_number)
    .bind(&ktp_path)
    .bind(customer_id)
    .execute(&mut *tx)
    .await?;

    let registration_no = next_id(&mut tx, EntityType::Registration).await?;
    let premium_amount = calculate_premium(&data.product, data.sum_assured, data.coverage_term);
    let due_date = (Utc::now() + chrono::Duration::days(7)).date_naive();

    let reg_id: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO registrations
          (registration_no, customer_id, product, sum_assured, coverage_term, status)
        VALUES ($1, $2, $3, $4, $5, 'PENDING')
        RETURNING id
        "#,
    )
    .bind(&registration_no)
    .bind(customer_id)
    .bind(&data.product)
    .bind(data.sum_assured)
    .bind(data.coverage_term)
    .fetch_one(&mut *tx)
    .await?;

    let invoice_no = next_id(&mut tx, EntityType::Invoice).await?;
    let invoice_id: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO invoices
          (invoice_no, registration_id, premium_amount, due_date, status)
        VALUES ($1, $2, $3, $4, 'UNPAID')
        RETURNING id
        "#,
    )
    .bind(&invoice_no)
    .bind(reg_id.0)
    .bind(premium_amount)
    .bind(due_date)
    .fetch_one(&mut *tx)
    .await?;
    let invoice_id = invoice_id.0;

    tx.commit().await?;

    // Render invoice PDF + save ke storage. UPDATE pdf_path di luar tx
    // (mirror pattern payment_webhook di public.rs:292 — agar policy/invoice
    // row tetap exist kalau storage atau email gagal).
    let product_name = product_name_from_code(&data.product);
    let pdf_bytes = render_invoice_pdf(&InvoicePdfInput {
        invoice_no: &invoice_no,
        registration_no: &registration_no,
        customer_nik: &data.nik,
        customer_name: &data.full_name,
        customer_birth_date: data.birth_date,
        customer_address: &data.address,
        product_name,
        sum_assured: data.sum_assured,
        premium: premium_amount,
        due_date,
        status: "UNPAID",
        created_at: Utc::now().date_naive(),
    })?;
    let pdf_ref = state
        .storage
        .save_invoice_pdf(invoice_id, &pdf_bytes)
        .await?;
    let pdf_path = pdf_ref.key;

    sqlx::query("UPDATE invoices SET pdf_path = $1 WHERE id = $2")
        .bind(&pdf_path)
        .bind(invoice_id)
        .execute(&state.pool)
        .await?;

    let _ = send_email(
        &state.pool,
        &*state.storage,
        &state.resend,
        Email {
            email_type: EmailType::RegistrationSuccess,
            recipient: &customer_email,
            subject: &format!("Pendaftaran {} Diterima", registration_no),
            body: &format!(
                "Halo {},\n\n\
                 Pendaftaran asuransi kamu ({}) telah kami terima. Invoice \
                 untuk pembayaran premi sudah diterbitkan — kami kirim detail \
                 lengkapnya di email terpisah.\n\n\
                 Mohon selesaikan pembayaran sebelum jatuh tempo agar polis \
                 bisa langsung aktif.\n\n\
                 Salam,\n\
                 Tim InsureTrack",
                data.full_name, registration_no
            ),
            cta_text: None,
            cta_url: None,
            related_entity_type: Some("registration"),
            related_entity_id: Some(reg_id.0),
            attachment_path: None,
        },
    )
    .await?;

    let _ = send_email(
        &state.pool,
        &*state.storage,
        &state.resend,
        Email {
            email_type: EmailType::InvoiceNotification,
            recipient: &customer_email,
            subject: &format!("Invoice {} — Tagihan Premi", invoice_no),
            body: &format!(
                "Halo {},\n\n\
                 Berikut invoice untuk pendaftaran polis kamu:\n\n\
                 No. Invoice: {}\n\
                 Premi: Rp {}\n\
                 Jatuh tempo: {}\n\n\
                 Invoice PDF terlampir di email ini — bisa langsung di-download \
                 dari attachment di atas.\n\n\
                 Bayar via payment gateway di portal untuk mengaktifkan polis.\n\n\
                 Salam,\n\
                 Tim InsureTrack",
                data.full_name, invoice_no, premium_amount, due_date
            ),
            cta_text: None,
            cta_url: None,
            related_entity_type: Some("invoice"),
            related_entity_id: Some(invoice_id),
            attachment_path: Some(pdf_path.clone()),
        },
    )
    .await?;

    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &customer_email,
            action: "registration_created",
            entity_type: "registration",
            entity_id: Some(reg_id.0),
            metadata: Some(serde_json::json!({
                "registration_no": registration_no,
                "invoice_no": invoice_no,
                "invoice_id": invoice_id.to_string(),
                "product": data.product,
                "sum_assured": data.sum_assured.to_string(),
                "premium": premium_amount.to_string(),
                "via": "customer_portal",
            })),
            ip_address: None,
        },
    )
    .await;

    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: "system",
            action: "invoice_generated",
            entity_type: "invoice",
            entity_id: Some(invoice_id),
            metadata: Some(serde_json::json!({
                "invoice_no": invoice_no,
                "registration_no": registration_no,
                "pdf_path": pdf_path,
            })),
            ip_address: None,
        },
    )
    .await;

    Ok(Json(serde_json::json!({
        "registration_no": registration_no,
        "invoice_no": invoice_no,
        "status": "PENDING",
    })))
}

// ---- /invoices (customer-owned) ----
//
// Customer dapat melihat daftar invoice miliknya dan re-download PDF.
// Ownership check via JOIN invoices -> registrations -> customers.customer_id.

#[derive(Serialize, sqlx::FromRow)]
struct InvoiceRow {
    id: Uuid,
    invoice_no: String,
    registration_no: String,
    premium_amount: Decimal,
    due_date: chrono::NaiveDate,
    status: String,
    paid_at: Option<chrono::DateTime<chrono::Utc>>,
    pdf_path: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

async fn list_invoices(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<InvoiceRow>>> {
    let customer_id = customer_id_from(&claims)?;
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let status = q.status.clone().unwrap_or_default();

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
         WHERE r.customer_id = $1
           AND ($2 = '' OR i.status = $2)
        "#,
    )
    .bind(customer_id)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<InvoiceRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.invoice_no, r.registration_no,
               i.premium_amount, i.due_date, i.status, i.paid_at,
               i.pdf_path, i.created_at
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
         WHERE r.customer_id = $1
           AND ($2 = '' OR i.status = $2)
         ORDER BY i.due_date ASC, i.created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(customer_id)
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
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Json<InvoiceRow>> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<InvoiceRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.invoice_no, r.registration_no,
               i.premium_amount, i.due_date, i.status, i.paid_at,
               i.pdf_path, i.created_at
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
         WHERE r.customer_id = $1 AND i.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    row.map(Json).ok_or(AppError::NotFound("invoice".into()))
}

async fn download_invoice_pdf(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Response> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<(Option<String>, String)> = sqlx::query_as(
        r#"
        SELECT i.pdf_path, i.invoice_no
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
         WHERE r.customer_id = $1 AND i.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (pdf_path_opt, invoice_no) = row.ok_or(AppError::NotFound("invoice".into()))?;
    let pdf_path = pdf_path_opt.ok_or(AppError::NotFound("invoice pdf".into()))?;

    let bytes = state
        .storage
        .read_bytes(&pdf_path)
        .await?;
    let body = Body::from(bytes);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    // Gunakan filename dinamis `{invoice_no}.pdf` — lebih mudah ditemukan
    // di folder Download customer dibanding UUID.
    let disp = format!("attachment; filename=\"{invoice_no}.pdf\"");
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disp).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("invalid content-disposition: {e}"))
        })?,
    );
    Ok((StatusCode::OK, headers, body).into_response())
}
