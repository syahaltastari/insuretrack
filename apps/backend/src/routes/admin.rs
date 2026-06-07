//! Admin endpoints (Admin JWT required). Spec §8.3.

use axum::{
    body::Body,
    extract::{Path, Query, State},
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
    auth::{password::verify_password, Role, RequireAdmin},
    dto::{DashboardStats, LoginRequest, LoginResponse},
    error::{AppError, AppResult},
    repo::{Page, PageQuery},
    services::{
        audit::{write as audit_write, AuditEntry},
        dashboard,
        storage,
    },
    state::AppState,
};

/// Query string for list endpoints: when `format=csv`, return all rows
/// as CSV instead of paginated JSON. `q` and `status` are reused from
/// PageQuery so the existing filters still apply.
#[derive(Debug, Deserialize)]
struct ListFormatQuery {
    #[serde(default)]
    format: Option<String>,
}

impl ListFormatQuery {
    fn is_csv(&self) -> bool {
        self.format.as_deref() == Some("csv")
    }
}

/// Escape a single CSV field per RFC 4180.
fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// Build a CSV download response. `headers` is the column labels; `rows`
/// is the cell text per row (Decimal / NaiveDate / Option<…> should be
/// pre-formatted to String before calling).
fn csv_response(headers: &[&str], rows: Vec<Vec<String>>, filename: &str) -> Response {
    let mut s = String::new();
    s.push_str(&headers.iter().map(|h| csv_escape(h)).collect::<Vec<_>>().join(","));
    s.push_str("\r\n");
    for row in rows {
        s.push_str(&row.iter().map(|c| csv_escape(c)).collect::<Vec<_>>().join(","));
        s.push_str("\r\n");
    }
    let mut resp = (StatusCode::OK, s).into_response();
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    let today = Utc::now().format("%Y-%m-%d");
    let safe_name = format!("{}-{}.csv", filename, today);
    let disp = format!("attachment; filename=\"{}\"", safe_name);
    if let Ok(v) = HeaderValue::from_str(&disp) {
        resp.headers_mut().insert(header::CONTENT_DISPOSITION, v);
    }
    resp
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/dashboard/stats", get(dashboard_stats))
        .route("/dashboard/charts", get(dashboard_charts))
        .route("/me", get(get_me).patch(update_me))
        .route("/me/password", axum::routing::post(change_password))
        .route("/registrations", get(list_registrations))
        .route("/registrations/:id", get(get_registration))
        .route("/invoices", get(list_invoices))
        .route("/invoices/:id", get(get_invoice))
        .route("/invoices/:id/pdf", get(download_invoice_pdf))
        .route("/policies", get(list_policies))
        .route("/policies/:id", get(get_policy))
        .route("/policies/:id/pdf", get(download_policy_pdf))
        .route("/email-logs", get(list_email_logs))
        .route("/audit-logs", get(list_audit_logs))
        .route("/claims", get(list_claims_admin))
        .route("/claims/:id", axum::routing::patch(patch_claim))
        .route("/inquiries", get(list_inquiries_admin))
        .route(
            "/inquiries/:id/respond",
            axum::routing::post(respond_inquiry),
        )
        // Marketing: clients + testimonials — see admin_marketing::router
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

    // Best-effort last_login_at update — non-fatal if it fails.
    let _ = sqlx::query("UPDATE admin_users SET last_login_at = now() WHERE id = $1")
        .bind(admin_id)
        .execute(&state.pool)
        .await;

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

async fn dashboard_charts(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<dashboard::DashboardQuery>,
) -> AppResult<Json<dashboard::DashboardCharts>> {
    let charts = dashboard::fetch_all(&state.pool, q).await?;
    Ok(Json(charts))
}

// ---- Admin "me" (profile) ----

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AdminMe {
    id: Uuid,
    username: String,
    full_name: Option<String>,
    email: Option<String>,
    role: String,
    is_active: bool,
    last_login_at: Option<chrono::DateTime<chrono::Utc>>,
    password_changed_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

async fn get_me(
    State(state): State<AppState>,
    RequireAdmin(claims): RequireAdmin,
) -> AppResult<Json<AdminMe>> {
    let id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    let row: Option<AdminMe> = sqlx::query_as(
        r#"SELECT id, username, full_name, email, role, is_active, last_login_at,
                  password_changed_at, created_at, updated_at
             FROM admin_users WHERE id = $1"#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    row.map(Json).ok_or(AppError::Unauthorized)
}

#[derive(Debug, Deserialize)]
struct UpdateMeRequest {
    full_name: Option<String>,
    email: Option<String>,
}

async fn update_me(
    State(state): State<AppState>,
    RequireAdmin(claims): RequireAdmin,
    Json(req): Json<UpdateMeRequest>,
) -> AppResult<Json<AdminMe>> {
    let id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    let full = req.full_name.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    let email = req.email.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    if let Some(ref e) = email {
        if !e.contains('@') {
            return Err(AppError::Validation("email tidak valid".into()));
        }
    }
    let row: AdminMe = sqlx::query_as(
        r#"UPDATE admin_users
              SET full_name = COALESCE($2, full_name),
                  email     = COALESCE($3, email),
                  updated_at = now()
            WHERE id = $1
        RETURNING id, username, full_name, email, role, is_active, last_login_at,
                  password_changed_at, created_at, updated_at"#,
    )
    .bind(id)
    .bind(full.as_deref())
    .bind(email.as_deref())
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(db) = &e {
            if db.constraint().is_some() {
                return AppError::Conflict("email sudah dipakai admin lain".into());
            }
        }
        AppError::Internal(anyhow::anyhow!("update_me: {e}"))
    })?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.sub,
            action: "admin_profile_updated",
            entity_type: "admin_user",
            entity_id: Some(id),
            metadata: None,
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(row))
}

#[derive(Debug, Deserialize)]
struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    RequireAdmin(claims): RequireAdmin,
    Json(req): Json<ChangePasswordRequest>,
) -> AppResult<StatusCode> {
    let id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    if req.new_password.len() < 8 {
        return Err(AppError::Validation("Password baru minimal 8 karakter".into()));
    }
    let row: Option<(String,)> =
        sqlx::query_as("SELECT password_hash FROM admin_users WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    let (current_hash,) = row.ok_or(AppError::Unauthorized)?;
    if !verify_password(&req.current_password, &current_hash)? {
        return Err(AppError::Unauthorized);
    }
    let new_hash = crate::auth::password::hash_password(&req.new_password)?;
    sqlx::query(
        "UPDATE admin_users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1",
    )
    .bind(id)
    .bind(new_hash)
    .execute(&state.pool)
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.sub,
            action: "admin_password_changed",
            entity_type: "admin_user",
            entity_id: Some(id),
            metadata: None,
            ip_address: None,
        },
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
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
    Query(fmt): Query<ListFormatQuery>,
) -> AppResult<Response> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    if fmt.is_csv() {
        let rows: Vec<RegistrationRow> = sqlx::query_as(
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
            "#,
        )
        .bind(&like)
        .bind(&status)
        .fetch_all(&state.pool)
        .await?;
        let body: Vec<Vec<String>> = rows
            .iter()
            .map(|r| {
                vec![
                    r.registration_no.clone(),
                    r.customer_name.clone(),
                    r.customer_email.clone(),
                    r.product.clone(),
                    r.sum_assured.to_string(),
                    r.coverage_term.to_string(),
                    r.status.clone(),
                    r.created_at.to_rfc3339(),
                ]
            })
            .collect();
        return Ok(csv_response(
            &[
                "registration_no",
                "customer_name",
                "customer_email",
                "product",
                "sum_assured",
                "coverage_term",
                "status",
                "created_at",
            ],
            body,
            "registrations",
        ));
    }


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
    }).into_response())
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
    pdf_path: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

async fn list_invoices(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
    Query(fmt): Query<ListFormatQuery>,
) -> AppResult<Response> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    if fmt.is_csv() {
        let rows: Vec<InvoiceRow> = sqlx::query_as(
            r#"
            SELECT i.id, i.invoice_no, r.registration_no, c.full_name AS customer_name,
                   i.premium_amount, i.due_date, i.status, i.paid_at, i.pdf_path, i.created_at
              FROM invoices i
              JOIN registrations r ON r.id = i.registration_id
              JOIN customers c     ON c.id = r.customer_id
             WHERE ($1 = '' OR i.invoice_no ILIKE $1
                              OR r.registration_no ILIKE $1
                              OR c.full_name       ILIKE $1
                              OR c.email           ILIKE $1)
               AND ($2 = '' OR i.status = $2)
             ORDER BY i.created_at DESC
            "#,
        )
        .bind(&like)
        .bind(&status)
        .fetch_all(&state.pool)
        .await?;
        let body: Vec<Vec<String>> = rows
            .iter()
            .map(|r| {
                vec![
                    r.invoice_no.clone(),
                    r.registration_no.clone(),
                    r.customer_name.clone(),
                    r.premium_amount.to_string(),
                    r.due_date.to_string(),
                    r.status.clone(),
                    r.paid_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
                    r.created_at.to_rfc3339(),
                ]
            })
            .collect();
        return Ok(csv_response(
            &[
                "invoice_no",
                "registration_no",
                "customer_name",
                "premium_amount",
                "due_date",
                "status",
                "paid_at",
                "created_at",
            ],
            body,
            "invoices",
        ));
    }


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
               i.premium_amount, i.due_date, i.status, i.paid_at, i.pdf_path, i.created_at
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
    }).into_response())
}

async fn get_invoice(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<InvoiceRow>> {
    let row: Option<InvoiceRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.invoice_no, r.registration_no, c.full_name AS customer_name,
               i.premium_amount, i.due_date, i.status, i.paid_at, i.pdf_path, i.created_at
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

async fn download_invoice_pdf(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Response> {
    let row: Option<(Option<String>, String)> =
        sqlx::query_as("SELECT pdf_path, invoice_no FROM invoices WHERE id = $1")
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
    let disp = format!("attachment; filename=\"{invoice_no}.pdf\"");
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disp).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("invalid content-disposition: {e}"))
        })?,
    );
    Ok((StatusCode::OK, headers, body).into_response())
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
    Query(fmt): Query<ListFormatQuery>,
) -> AppResult<Response> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    if fmt.is_csv() {
        let rows: Vec<PolicyRow> = sqlx::query_as(
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
            "#,
        )
        .bind(&like)
        .bind(&status)
        .fetch_all(&state.pool)
        .await?;
        let body: Vec<Vec<String>> = rows
            .iter()
            .map(|r| {
                vec![
                    r.policy_no.clone(),
                    r.registration_no.clone(),
                    r.customer_name.clone(),
                    r.product.clone(),
                    r.sum_assured.to_string(),
                    r.premium.to_string(),
                    r.effective_date.to_string(),
                    r.expiry_date.to_string(),
                    r.status.clone(),
                    r.created_at.to_rfc3339(),
                ]
            })
            .collect();
        return Ok(csv_response(
            &[
                "policy_no",
                "registration_no",
                "customer_name",
                "product",
                "sum_assured",
                "premium",
                "effective_date",
                "expiry_date",
                "status",
                "created_at",
            ],
            body,
            "policies",
        ));
    }


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
    }).into_response())
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
    Query(fmt): Query<ListFormatQuery>,
) -> AppResult<Response> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    if fmt.is_csv() {
        let rows: Vec<EmailLogRow> = sqlx::query_as(
            r#"
            SELECT id, recipient, email_type, subject, status, error_message, sent_at
              FROM email_logs
             WHERE ($1 = '' OR recipient ILIKE $1 OR subject ILIKE $1)
               AND ($2 = '' OR status = $2)
             ORDER BY id DESC
            "#,
        )
        .bind(&like)
        .bind(&status)
        .fetch_all(&state.pool)
        .await?;
        let body: Vec<Vec<String>> = rows
            .iter()
            .map(|r| {
                vec![
                    r.recipient.clone(),
                    r.email_type.clone(),
                    r.subject.clone(),
                    r.status.clone(),
                    r.error_message.clone().unwrap_or_default(),
                    r.sent_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
                ]
            })
            .collect();
        return Ok(csv_response(
            &[
                "recipient",
                "email_type",
                "subject",
                "status",
                "error_message",
                "sent_at",
            ],
            body,
            "email-logs",
        ));
    }


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
    }).into_response())
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
    Query(fmt): Query<ListFormatQuery>,
) -> AppResult<Response> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    if fmt.is_csv() {
        let rows: Vec<AuditLogRow> = sqlx::query_as(
            r#"
            SELECT id, actor, action, entity_type, entity_id, metadata, ip_address, created_at
              FROM audit_logs
             WHERE ($1 = '' OR actor ILIKE $1 OR action ILIKE $1 OR entity_type ILIKE $1)
               AND ($2 = '' OR entity_type = $2)
             ORDER BY created_at DESC
            "#,
        )
        .bind(&like)
        .bind(&status)
        .fetch_all(&state.pool)
        .await?;
        let body: Vec<Vec<String>> = rows
            .iter()
            .map(|r| {
                vec![
                    r.actor.clone(),
                    r.action.clone(),
                    r.entity_type.clone(),
                    r.entity_id.map(|u| u.to_string()).unwrap_or_default(),
                    r.metadata
                        .as_ref()
                        .map(|m| m.to_string())
                        .unwrap_or_default(),
                    r.ip_address.clone().unwrap_or_default(),
                    r.created_at.to_rfc3339(),
                ]
            })
            .collect();
        return Ok(csv_response(
            &[
                "actor",
                "action",
                "entity_type",
                "entity_id",
                "metadata",
                "ip_address",
                "created_at",
            ],
            body,
            "audit-logs",
        ));
    }


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
    }).into_response())
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
    Query(fmt): Query<ListFormatQuery>,
) -> AppResult<Response> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    if fmt.is_csv() {
        let rows: Vec<AdminClaimRow> = sqlx::query_as(
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
            "#,
        )
        .bind(&like)
        .bind(&status)
        .fetch_all(&state.pool)
        .await?;
        let body: Vec<Vec<String>> = rows
            .iter()
            .map(|r| {
                vec![
                    r.claim_no.clone(),
                    r.policy_no.clone(),
                    r.customer_name.clone(),
                    r.claim_type.clone(),
                    r.incident_date.to_string(),
                    r.claimed_amount.to_string(),
                    r.status.clone(),
                    r.decision_note.clone().unwrap_or_default(),
                    r.submitted_at.to_rfc3339(),
                    r.updated_at.to_rfc3339(),
                ]
            })
            .collect();
        return Ok(csv_response(
            &[
                "claim_no",
                "policy_no",
                "customer_name",
                "claim_type",
                "incident_date",
                "claimed_amount",
                "status",
                "decision_note",
                "submitted_at",
                "updated_at",
            ],
            body,
            "claims",
        ));
    }


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
    }).into_response())
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
        &*state.storage,
        &state.resend,
        crate::services::email::Email {
            email_type: crate::services::email::EmailType::ClaimStatusUpdate,
            recipient: &customer_email,
            subject: &format!("Klaim {} — Status Diperbarui", row.claim_no),
            body: &body,
            cta_text: None,
            cta_url: None,
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
    Query(fmt): Query<ListFormatQuery>,
) -> AppResult<Response> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    if fmt.is_csv() {
        let rows: Vec<AdminInquiryRow> = sqlx::query_as(
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
            "#,
        )
        .bind(&like)
        .bind(&status)
        .fetch_all(&state.pool)
        .await?;
        let body: Vec<Vec<String>> = rows
            .iter()
            .map(|r| {
                vec![
                    r.inquiry_no.clone(),
                    r.customer_name.clone(),
                    r.customer_email.clone(),
                    r.policy_no.clone().unwrap_or_default(),
                    r.subject.clone(),
                    r.message.clone(),
                    r.status.clone(),
                    r.response.clone().unwrap_or_default(),
                    r.created_at.to_rfc3339(),
                    r.responded_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
                ]
            })
            .collect();
        return Ok(csv_response(
            &[
                "inquiry_no",
                "customer_name",
                "customer_email",
                "policy_no",
                "subject",
                "message",
                "status",
                "response",
                "created_at",
                "responded_at",
            ],
            body,
            "inquiries",
        ));
    }


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
    }).into_response())
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
        &*state.storage,
        &state.resend,
        crate::services::email::Email {
            email_type: crate::services::email::EmailType::InquiryResponse,
            recipient: &row.customer_email,
            subject: &format!("Jawaban: {}", row.subject),
            body: &format!(
                "Halo,\n\n\
                 Tim InsureTrack sudah menjawab pertanyaan kamu (no. {}, \
                 subjek: \"{}\").\n\n\
                 Jawaban:\n{}\n\n\
                 Punya pertanyaan lanjutan? Balas email ini atau buat inquiry \
                 baru di portal.\n\n\
                 Salam,\n\
                 Tim InsureTrack",
                row.inquiry_no, row.subject, req.response
            ),
            cta_text: None,
            cta_url: None,
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
