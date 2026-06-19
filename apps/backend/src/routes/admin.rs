//! Admin endpoints (Admin JWT required). Spec §8.3.

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
use uuid::Uuid;

use crate::{
    auth::{password::verify_password, RequireAdmin, Role},
    dto::{DashboardStats, LoginRequest, LoginResponse},
    error::{AppError, AppResult},
    repo::{filters as filters_helper, Page, PageQuery},
    services::{
        audit::{write as audit_write, AuditEntry},
        dashboard,
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

#[cfg(test)]
mod csv_tests {
    use super::*;

    #[test]
    fn passes_through_plain_strings() {
        assert_eq!(csv_escape("hello"), "hello");
        assert_eq!(csv_escape("REG-202606-000001"), "REG-202606-000001");
        assert_eq!(csv_escape(""), "");
    }

    #[test]
    fn wraps_values_with_comma() {
        assert_eq!(csv_escape("Doe, John"), r#""Doe, John""#);
    }

    #[test]
    fn doubles_inner_quotes() {
        assert_eq!(csv_escape(r#"she said "hi""#), r#""she said ""hi""""#);
    }

    #[test]
    fn wraps_values_with_newlines() {
        assert_eq!(csv_escape("line1\nline2"), "\"line1\nline2\"");
        assert_eq!(csv_escape("line1\r\nline2"), "\"line1\r\nline2\"");
    }
}

/// Build a CSV download response. `headers` is the column labels; `rows`
/// is the cell text per row (Decimal / NaiveDate / Option<…> should be
/// pre-formatted to String before calling).
fn csv_response(headers: &[&str], rows: Vec<Vec<String>>, filename: &str) -> Response {
    let mut s = String::new();
    s.push_str(
        &headers
            .iter()
            .map(|h| csv_escape(h))
            .collect::<Vec<_>>()
            .join(","),
    );
    s.push_str("\r\n");
    for row in rows {
        s.push_str(
            &row.iter()
                .map(|c| csv_escape(c))
                .collect::<Vec<_>>()
                .join(","),
        );
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
        .route(
            "/claims/:id/payment-proof",
            axum::routing::post(upload_payment_proof),
        )
        .route("/inquiries", get(list_inquiries_admin))
        .route("/inquiries/:id", get(get_inquiry_admin))
        .route(
            "/inquiries/:id/messages",
            axum::routing::post(admin_inquiry_message),
        )
        .route(
            "/inquiries/:id/close",
            axum::routing::post(admin_inquiry_close),
        )
    // Marketing: clients + testimonials — see admin_marketing::router
}

async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    let row: Option<(Uuid, String, String, bool, bool)> = sqlx::query_as(
        "SELECT id, username, password_hash, is_active, is_super_admin \
           FROM admin_users WHERE username = $1",
    )
    .bind(&req.username)
    .fetch_optional(&state.pool)
    .await?;

    let (admin_id, admin_username, password_hash, is_active, is_super_admin) =
        row.ok_or(AppError::Unauthorized)?;

    // Block login untuk akun nonaktif. Pesan generic "akun nonaktif"
    // bukan "password salah" — admin perlu tahu akunnya disabled agar
    // hubungi super admin untuk reaktivasi.
    if !is_active {
        return Err(AppError::Validation("akun nonaktif".into()));
    }

    if !verify_password(&req.password, &password_hash)? {
        return Err(AppError::Unauthorized);
    }

    // Best-effort last_login_at update — non-fatal if it fails.
    let _ = sqlx::query("UPDATE admin_users SET last_login_at = now() WHERE id = $1")
        .bind(admin_id)
        .execute(&state.pool)
        .await;

    let token = state.tokens.issue(
        &admin_id.to_string(),
        Role::Admin,
        None,
        is_super_admin,
        60 * 60 * 8,
    )?;

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
        id: Some(admin_id),
        is_super_admin: Some(is_super_admin),
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
    is_super_admin: bool,
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
        r#"SELECT id, username, full_name, email, role, is_super_admin, is_active,
                  last_login_at, password_changed_at, created_at, updated_at
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
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    });
    let email = req.email.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
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
        RETURNING id, username, full_name, email, role, is_super_admin, is_active,
                  last_login_at, password_changed_at, created_at, updated_at"#,
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
        return Err(AppError::Validation(
            "Password baru minimal 8 karakter".into(),
        ));
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
    customer_mobile: String,
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
                   c.mobile_number AS customer_mobile,
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
                    r.customer_mobile.clone(),
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
                "customer_mobile",
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
               c.mobile_number AS customer_mobile,
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
    })
    .into_response())
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

    row.map(Json)
        .ok_or(AppError::NotFound("registration".into()))
}

#[derive(Serialize, sqlx::FromRow)]
struct InvoiceRow {
    id: Uuid,
    invoice_no: String,
    registration_no: String,
    customer_name: String,
    customer_email: String,
    customer_mobile: String,
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
    // ----- Shared filter inputs -----
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    // ----- New filter inputs (validated) -----
    // Date range: parse + reject bad ISO / inverted range.
    let (date_from, date_to) =
        filters_helper::parse_date_range(q.date_from.as_deref(), q.date_to.as_deref())?;
    // Date column: whitelist. Default = `created_at` (most common admin
    // question: "what invoices came in this period?").
    const INVOICE_DATE_FIELDS: &[&str] = &["created_at", "due_date", "paid_at"];
    let date_field =
        filters_helper::validate_date_field(q.date_field.as_deref(), INVOICE_DATE_FIELDS);
    // Sort column: whitelist. Default = `created_at` DESC.
    const INVOICE_SORT_COLS: &[&str] = &[
        "created_at",
        "due_date",
        "paid_at",
        "premium_amount",
        "customer_name",
    ];
    let sort_col = filters_helper::validate_sort(q.sort_by.as_deref(), INVOICE_SORT_COLS);
    let sort_dir = filters_helper::validate_sort_dir(q.sort_dir.as_deref());

    // Bind indices used in SQL are hard-coded. Layout (CSV path + JSON
    // path are mirrored):
    //   $1 = search ILIKE pattern  $2 = status
    //   $3 = date_from (nullable)  $4 = date_to (nullable)
    //   $5 = limit                 $6 = offset
    // date_from / date_to are bound directly as Option<NaiveDate>; the
    // SQL uses `$3::date IS NULL OR <col> >= $3::date` so a None value
    // short-circuits the comparison and the placeholder count stays
    // stable across requests with and without a date filter (prevents
    // sqlx prepared-statement cache collision that produced
    // "bind message supplies 4 parameters, but prepared statement
    // requires 6" before this fix).
    //
    // Table-qualified column for the date filter + sort. Safe:
    // `date_field` and `sort_col` come from a literal whitelist above.
    let date_col = format!("i.{date_field}");
    let sort_col_qualified = match sort_col {
        "customer_name" => "c.full_name".to_string(),
        // premium_amount ada di invoices (alias i), created_at/due_date/paid_at juga di i.
        other => format!("i.{other}"),
    };

    if fmt.is_csv() {
        // CSV export honours the same filters as the JSON path. Date
        // fragment is rendered as `$3 IS NULL OR <col> >= $3` so the
        // SQL text + placeholder count is stable whether or not a date
        // filter was applied — without this, sqlx's prepared-statement
        // cache reuses a stale statement with 4 placeholders for what is
        // logically a 6-placeholder query, causing a 500 bind error.
        let date_predicate = format!(
            " AND ($3::date IS NULL OR {date_col} >= $3::date) \
             AND ($4::date IS NULL OR {date_col} <= $4::date)"
        );
        let sql = format!(
            r#"
            SELECT i.id, i.invoice_no, r.registration_no, c.full_name AS customer_name,
                   c.email AS customer_email, c.mobile_number AS customer_mobile,
                   i.premium_amount, i.due_date, i.status, i.paid_at, i.pdf_path, i.created_at
              FROM invoices i
              JOIN registrations r ON r.id = i.registration_id
              JOIN customers c     ON c.id = r.customer_id
             WHERE ($1 = '' OR i.invoice_no ILIKE $1
                              OR r.registration_no ILIKE $1
                              OR c.full_name       ILIKE $1
                              OR c.email           ILIKE $1)
               AND ($2 = '' OR i.status = $2)
               {date_predicate}
             {order}
            "#,
            order = filters_helper::order_clause(&sort_col_qualified, sort_dir),
        );
        // Always bind 4 placeholders. df/dt are None when no date filter
        // is applied; the `$3::date IS NULL` short-circuits in SQL.
        let rows: Vec<InvoiceRow> = sqlx::query_as::<_, InvoiceRow>(&sql)
            .bind(&like)
            .bind(&status)
            .bind(date_from)
            .bind(date_to)
            .fetch_all(&state.pool)
            .await?;
        let body: Vec<Vec<String>> = rows
            .iter()
            .map(|r| {
                vec![
                    r.invoice_no.clone(),
                    r.registration_no.clone(),
                    r.customer_name.clone(),
                    r.customer_email.clone(),
                    r.customer_mobile.clone(),
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
                "customer_email",
                "customer_mobile",
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

    // ----- JSON path (paginated) -----
    // Date predicate uses `$3::date IS NULL OR <col> >= $3::date` so the
    // SQL text + placeholder count is stable across requests with and
    // without a date filter. df/dt are bound as NULL when no filter is
    // applied, short-circuiting the comparison in SQL.
    let date_predicate = format!(
        " AND ($3::date IS NULL OR {date_col} >= $3::date) \
         AND ($4::date IS NULL OR {date_col} <= $4::date)"
    );

    let count_sql = format!(
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
           {date_predicate}
        "#
    );
    let total: (i64,) = sqlx::query_as::<_, (i64,)>(&count_sql)
        .bind(&search)
        .bind(&status)
        .bind(date_from)
        .bind(date_to)
        .fetch_one(&state.pool)
        .await?;

    // Placeholder numbering for the data query: $1=search $2=status
    // $3=df $4=dt $5=limit $6=offset. Always bind 6 — df/dt may be NULL
    // when no date filter is applied.
    let data_sql = format!(
        r#"
        SELECT i.id, i.invoice_no, r.registration_no, c.full_name AS customer_name,
               c.email AS customer_email, c.mobile_number AS customer_mobile,
               i.premium_amount, i.due_date, i.status, i.paid_at, i.pdf_path, i.created_at
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
          JOIN customers c     ON c.id = r.customer_id
         WHERE ($1 = '' OR i.invoice_no ILIKE $1
                          OR r.registration_no ILIKE $1
                          OR c.full_name       ILIKE $1
                          OR c.email           ILIKE $1)
           AND ($2 = '' OR i.status = $2)
           {date_predicate}
         {order}
         LIMIT $5 OFFSET $6
        "#,
        order = filters_helper::order_clause(&sort_col_qualified, sort_dir),
    );
    let data: Vec<InvoiceRow> = sqlx::query_as::<_, InvoiceRow>(&data_sql)
        .bind(&like)
        .bind(&status)
        .bind(date_from)
        .bind(date_to)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    })
    .into_response())
}

async fn get_invoice(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<InvoiceRow>> {
    let row: Option<InvoiceRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.invoice_no, r.registration_no, c.full_name AS customer_name,
               c.email AS customer_email, c.mobile_number AS customer_mobile,
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

    let bytes = state.storage.read_bytes(&pdf_path).await?;
    let body = Body::from(bytes);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    let disp = format!("attachment; filename=\"{invoice_no}.pdf\"");
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disp)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid content-disposition: {e}")))?,
    );
    Ok((StatusCode::OK, headers, body).into_response())
}

#[derive(Serialize, sqlx::FromRow)]
struct PolicyRow {
    id: Uuid,
    policy_no: String,
    registration_no: String,
    customer_name: String,
    customer_email: String,
    customer_mobile: String,
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
    // ----- Shared filter inputs -----
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    // ----- New filter inputs -----
    let (date_from, date_to) =
        filters_helper::parse_date_range(q.date_from.as_deref(), q.date_to.as_deref())?;
    const POLICY_DATE_FIELDS: &[&str] = &["created_at", "effective_date", "expiry_date"];
    let date_field =
        filters_helper::validate_date_field(q.date_field.as_deref(), POLICY_DATE_FIELDS);
    const POLICY_SORT_COLS: &[&str] = &[
        "created_at",
        "effective_date",
        "expiry_date",
        "sum_assured",
        "premium",
        "customer_name",
        "product",
    ];
    let sort_col = filters_helper::validate_sort(q.sort_by.as_deref(), POLICY_SORT_COLS);
    let sort_dir = filters_helper::validate_sort_dir(q.sort_dir.as_deref());
    // Product filter: validated against closed set; 400 on bad value.
    let product = filters_helper::parse_product(q.product.as_deref())?;

    let df = date_from.unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(1970, 1, 1).unwrap());
    let dt = date_to.unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(9999, 12, 31).unwrap());
    let has_date = date_from.is_some() || date_to.is_some();

    let date_col = format!("p.{date_field}");
    let sort_col_qualified = match sort_col {
        "customer_name" => "c.full_name".to_string(),
        other => format!("p.{other}"),
    };

    // SQL placeholder layout (mirrored in CSV + JSON path):
    //   $1=search $2=status $3=df $4=dt $5=product $6=limit $7=offset
    // We always bind df/dt/product — when has_date/product is false, we
    // pass sentinel values (1970..9999 range, empty string) that the
    // boolean `has_*` flags short-circuit in SQL. This keeps placeholder
    // numbering stable across requests.
    if fmt.is_csv() {
        let date_predicate = if has_date {
            format!(" AND {date_col} >= $3 AND {date_col} <= $4")
        } else {
            String::new()
        };
        let product_predicate = match product.as_deref() {
            Some(_) => " AND p.product = $5",
            None => "",
        };
        let sql = format!(
            r#"
            SELECT p.id, p.policy_no, r.registration_no, c.full_name AS customer_name,
                   c.email AS customer_email, c.mobile_number AS customer_mobile,
                   p.product, p.sum_assured, p.premium,
                   p.effective_date, p.expiry_date, p.status, p.pdf_path, p.created_at
              FROM policies p
              JOIN registrations r ON r.id = p.registration_id
              JOIN customers c     ON c.id = r.customer_id
             WHERE ($1 = '' OR p.policy_no ILIKE $1
                              OR r.registration_no ILIKE $1
                              OR c.full_name       ILIKE $1)
               AND ($2 = '' OR p.status = $2)
               {date_predicate}
               {product_predicate}
             {order}
            "#,
            order = filters_helper::order_clause(&sort_col_qualified, sort_dir),
        );
        let q_builder = sqlx::query_as::<_, PolicyRow>(&sql)
            .bind(&like)
            .bind(&status)
            .bind(df)
            .bind(dt)
            .bind(product.as_deref().unwrap_or(""));
        let rows: Vec<PolicyRow> = q_builder.fetch_all(&state.pool).await?;
        let body: Vec<Vec<String>> = rows
            .iter()
            .map(|r| {
                vec![
                    r.policy_no.clone(),
                    r.registration_no.clone(),
                    r.customer_name.clone(),
                    r.customer_email.clone(),
                    r.customer_mobile.clone(),
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
                "customer_email",
                "customer_mobile",
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

    // ----- JSON path -----
    let date_predicate = if has_date {
        format!(" AND {date_col} >= $3 AND {date_col} <= $4")
    } else {
        String::new()
    };
    let product_predicate = match product.as_deref() {
        Some(_) => " AND p.product = $5",
        None => "",
    };

    let count_sql = format!(
        r#"
        SELECT COUNT(*)
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
          JOIN customers c     ON c.id = r.customer_id
         WHERE ($1 = '' OR p.policy_no ILIKE $1
                          OR r.registration_no ILIKE $1
                          OR c.full_name       ILIKE $1)
           AND ($2 = '' OR p.status = $2)
           {date_predicate}
           {product_predicate}
        "#
    );
    let count_q = sqlx::query_as::<_, (i64,)>(&count_sql)
        .bind(&search)
        .bind(&status)
        .bind(df)
        .bind(dt)
        .bind(product.as_deref().unwrap_or(""));
    let total: (i64,) = count_q.fetch_one(&state.pool).await?;

    let data_sql = format!(
        r#"
        SELECT p.id, p.policy_no, r.registration_no, c.full_name AS customer_name,
               c.email AS customer_email, c.mobile_number AS customer_mobile,
               p.product, p.sum_assured, p.premium,
               p.effective_date, p.expiry_date, p.status, p.pdf_path, p.created_at
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
          JOIN customers c     ON c.id = r.customer_id
         WHERE ($1 = '' OR p.policy_no ILIKE $1
                          OR r.registration_no ILIKE $1
                          OR c.full_name       ILIKE $1)
           AND ($2 = '' OR p.status = $2)
           {date_predicate}
           {product_predicate}
         {order}
         LIMIT $6 OFFSET $7
        "#,
        order = filters_helper::order_clause(&sort_col_qualified, sort_dir),
    );
    let data_q = sqlx::query_as::<_, PolicyRow>(&data_sql)
        .bind(&like)
        .bind(&status)
        .bind(df)
        .bind(dt)
        .bind(product.as_deref().unwrap_or(""))
        .bind(limit)
        .bind(offset);
    let data: Vec<PolicyRow> = data_q.fetch_all(&state.pool).await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    })
    .into_response())
}

async fn get_policy(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<PolicyRow>> {
    let row: Option<PolicyRow> = sqlx::query_as(
        r#"
        SELECT p.id, p.policy_no, r.registration_no, c.full_name AS customer_name,
               c.email AS customer_email, c.mobile_number AS customer_mobile,
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
    // Select policy_no juga agar bisa di-set sebagai filename di
    // Content-Disposition (UX: file di folder Download = POL-...pdf,
    // bukan UUID acak). Pattern sama dengan download_invoice_pdf.
    let row: Option<(Option<String>, String)> =
        sqlx::query_as("SELECT pdf_path, policy_no FROM policies WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    let (pdf_path_opt, policy_no) = row.ok_or(AppError::NotFound("policy".into()))?;
    let pdf_path = pdf_path_opt.ok_or(AppError::NotFound("policy pdf".into()))?;

    let bytes = state.storage.read_bytes(&pdf_path).await?;
    let body = Body::from(bytes);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    // Set filename seperti invoice PDF (lihat download_invoice_pdf di bawah).
    // Tanpa filename, browser save dengan nama UUID random.
    let disposition = format!("attachment; filename=\"{policy_no}.pdf\"");
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disposition)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid disposition: {e}")))?,
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
    })
    .into_response())
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
    // Filter `entity_type` column (audit_logs tidak punya kolom `status`).
    // Bind ke `q.entity_type` bukan `q.status` agar tidak tertukar dengan
    // endpoint list lain yang memfilter kolom `status`.
    let entity_type = q.entity_type.clone().unwrap_or_default();
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
        .bind(&entity_type)
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
    .bind(&entity_type)
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
    .bind(&entity_type)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    })
    .into_response())
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
    /// Storage key bukti pembayaran (lihat kolom `claims.payment_proof_path`).
    /// NULL untuk klaim yang belum berstatus PAID atau yang di-issued
    /// sebelum fitur ini ada (backward-compatible).
    payment_proof_path: Option<String>,
    submitted_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

async fn list_claims_admin(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
    Query(fmt): Query<ListFormatQuery>,
) -> AppResult<Response> {
    // ----- Shared filter inputs -----
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    // ----- New filter inputs -----
    let (date_from, date_to) =
        filters_helper::parse_date_range(q.date_from.as_deref(), q.date_to.as_deref())?;
    const CLAIM_DATE_FIELDS: &[&str] = &["submitted_at", "incident_date", "updated_at"];
    let date_field =
        filters_helper::validate_date_field(q.date_field.as_deref(), CLAIM_DATE_FIELDS);
    const CLAIM_SORT_COLS: &[&str] = &[
        "submitted_at",
        "incident_date",
        "updated_at",
        "claimed_amount",
        "customer_name",
    ];
    let sort_col = filters_helper::validate_sort(q.sort_by.as_deref(), CLAIM_SORT_COLS);
    let sort_dir = filters_helper::validate_sort_dir(q.sort_dir.as_deref());
    let product = filters_helper::parse_product(q.product.as_deref())?;
    let claim_type = filters_helper::parse_claim_type(q.claim_type.as_deref())?;

    let df = date_from.unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(1970, 1, 1).unwrap());
    let dt = date_to.unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(9999, 12, 31).unwrap());
    let has_date = date_from.is_some() || date_to.is_some();

    let date_col = format!("cl.{date_field}");
    let sort_col_qualified = match sort_col {
        "customer_name" => "c.full_name".to_string(),
        other => format!("cl.{other}"),
    };

    // Placeholder layout (mirrored in CSV + JSON path):
    //   $1=search $2=status $3=df $4=dt $5=product $6=claim_type
    //   $7=limit $8=offset
    if fmt.is_csv() {
        let date_predicate = if has_date {
            format!(" AND {date_col} >= $3 AND {date_col} <= $4")
        } else {
            String::new()
        };
        let product_predicate = match product.as_deref() {
            Some(_) => " AND p.product = $5",
            None => "",
        };
        let claim_type_predicate = match claim_type.as_deref() {
            Some(_) => " AND cl.claim_type = $6",
            None => "",
        };
        let sql = format!(
            r#"
            SELECT cl.id, cl.claim_no, p.policy_no, c.full_name AS customer_name,
                   cl.claim_type, cl.incident_date, cl.claimed_amount,
                   cl.status, cl.decision_note, cl.payment_proof_path, cl.submitted_at, cl.updated_at
              FROM claims cl
              JOIN policies p ON p.id = cl.policy_id
              JOIN customers c ON c.id = cl.customer_id
             WHERE ($1 = '' OR cl.claim_no ILIKE $1 OR c.full_name ILIKE $1)
               AND ($2 = '' OR cl.status = $2)
               {date_predicate}
               {product_predicate}
               {claim_type_predicate}
             {order}
            "#,
            order = filters_helper::order_clause(&sort_col_qualified, sort_dir),
        );
        let q_builder = sqlx::query_as::<_, AdminClaimRow>(&sql)
            .bind(&like)
            .bind(&status)
            .bind(df)
            .bind(dt)
            .bind(product.as_deref().unwrap_or(""))
            .bind(claim_type.as_deref().unwrap_or(""));
        let rows: Vec<AdminClaimRow> = q_builder.fetch_all(&state.pool).await?;
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

    // ----- JSON path -----
    let date_predicate = if has_date {
        format!(" AND {date_col} >= $3 AND {date_col} <= $4")
    } else {
        String::new()
    };
    let product_predicate = match product.as_deref() {
        Some(_) => " AND p.product = $5",
        None => "",
    };
    let claim_type_predicate = match claim_type.as_deref() {
        Some(_) => " AND cl.claim_type = $6",
        None => "",
    };

    let count_sql = format!(
        r#"
        SELECT COUNT(*)
          FROM claims cl
          JOIN policies p ON p.id = cl.policy_id
          JOIN customers c ON c.id = cl.customer_id
         WHERE ($1 = '' OR cl.claim_no ILIKE $1 OR c.full_name ILIKE $1)
           AND ($2 = '' OR cl.status = $2)
           {date_predicate}
           {product_predicate}
           {claim_type_predicate}
        "#
    );
    let count_q = sqlx::query_as::<_, (i64,)>(&count_sql)
        .bind(&search)
        .bind(&status)
        .bind(df)
        .bind(dt)
        .bind(product.as_deref().unwrap_or(""))
        .bind(claim_type.as_deref().unwrap_or(""));
    let total: (i64,) = count_q.fetch_one(&state.pool).await?;

    let data_sql = format!(
        r#"
        SELECT cl.id, cl.claim_no, p.policy_no, c.full_name AS customer_name,
               cl.claim_type, cl.incident_date, cl.claimed_amount,
               cl.status, cl.decision_note, cl.payment_proof_path,
               cl.submitted_at, cl.updated_at
          FROM claims cl
          JOIN policies p ON p.id = cl.policy_id
          JOIN customers c ON c.id = cl.customer_id
         WHERE ($1 = '' OR cl.claim_no ILIKE $1 OR c.full_name ILIKE $1)
           AND ($2 = '' OR cl.status = $2)
           {date_predicate}
           {product_predicate}
           {claim_type_predicate}
         {order}
         LIMIT $7 OFFSET $8
        "#,
        order = filters_helper::order_clause(&sort_col_qualified, sort_dir),
    );
    let data_q = sqlx::query_as::<_, AdminClaimRow>(&data_sql)
        .bind(&like)
        .bind(&status)
        .bind(df)
        .bind(dt)
        .bind(product.as_deref().unwrap_or(""))
        .bind(claim_type.as_deref().unwrap_or(""))
        .bind(limit)
        .bind(offset);
    let data: Vec<AdminClaimRow> = data_q.fetch_all(&state.pool).await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    })
    .into_response())
}

#[derive(serde::Deserialize)]
struct PatchClaimBody {
    status: String,
    #[serde(default)]
    decision_note: Option<String>,
    /// Admin override untuk system-determined claim_type. Dipakai
    /// untuk edge case (mis. polis LIFE dengan klaim MATURITY atau
    /// SURRENDER, di mana default auto-set DEATH tidak tepat).
    /// Kalau None, claim_type di-DB tidak diubah.
    #[serde(default)]
    claim_type: Option<String>,
}

async fn patch_claim(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    Path(id): Path<Uuid>,
    Json(req): Json<PatchClaimBody>,
) -> AppResult<Json<AdminClaimRow>> {
    use crate::domain::claim::can_transition as claim_can_transition;

    // Validate claim_type override kalau diberikan. Empty string ditolak
    // (kalau mau "tidak diubah", kirim `null` atau omit field-nya).
    if let Some(ref ct) = req.claim_type {
        if !crate::domain::claim::is_valid_claim_type(ct) {
            return Err(AppError::Validation(format!(
                "invalid claim_type '{ct}'; must be one of DEATH|ACCIDENT|HOSPITALIZATION|MATURITY|SURRENDER"
            )));
        }
    }

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

    // Bangun SQL dinamis: claim_type di-update hanya kalau admin override.
    // Status & decision_note selalu di-update.
    if let Some(ref ct) = req.claim_type {
        sqlx::query(
            "UPDATE claims SET status = $1, decision_note = $2, claim_type = $3, updated_at = now() WHERE id = $4",
        )
        .bind(&req.status)
        .bind(req.decision_note.as_deref())
        .bind(ct)
        .bind(id)
        .execute(&state.pool)
        .await?;
    } else {
        sqlx::query(
            "UPDATE claims SET status = $1, decision_note = $2, updated_at = now() WHERE id = $3",
        )
        .bind(&req.status)
        .bind(req.decision_note.as_deref())
        .bind(id)
        .execute(&state.pool)
        .await?;
    }

    let row: AdminClaimRow = sqlx::query_as(
        r#"
        SELECT cl.id, cl.claim_no, p.policy_no, c.full_name AS customer_name,
               cl.claim_type, cl.incident_date, cl.claimed_amount,
               cl.status, cl.decision_note, cl.payment_proof_path,
               cl.submitted_at, cl.updated_at
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
        &*state.email,
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
                // `claim_type_override` di-include hanya kalau admin
                // benar-benar override (None → field absent).
                "claim_type_override": req.claim_type,
            })),
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(row))
}

// ---- POST /claims/:id/payment-proof ----------------------------------------
//
// Admin upload bukti pembayaran klaim (transfer ke rekening tertanggung).
// Dipakai saat transisi APPROVED → PAID; file disimpan di storage dengan
// key prefix `payment_proofs/{claim_id}/…` dan path-nya di-kan ke kolom
// `claims.payment_proof_path`. Endpoint terpisah dari PATCH status karena
// (1) PATCH saat ini JSON-only, dan (2) decoupling memungkinkan upload
// dilakukan sebelum/sesudah perubahan status tanpa mengubah signature PATCH.
//
// Multipart contract:
//   - field "proof"  — file (JPG/PNG/PDF, max 5 MB — lihat services/storage.rs).
//
// Response: AdminClaimRow updated (mengandung payment_proof_path baru).
async fn upload_payment_proof(
    State(state): State<AppState>,
    RequireAdmin(admin_user): RequireAdmin,
    Path(id): Path<Uuid>,
    mut multipart: Multipart,
) -> AppResult<Json<AdminClaimRow>> {
    // 1. Verify claim exists (404 kalau tidak).
    let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM claims WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound(format!("claim {id}")));
    }

    // 2. Parse multipart — expect exactly one "proof" field.
    let mut file_name: Option<String> = None;
    let mut content_type: Option<String> = None;
    let mut bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Validation(format!("multipart: {e}")))?
    {
        if field.name() == Some("proof") {
            file_name = field.file_name().map(|s| s.to_string());
            content_type = field
                .content_type()
                .map(|s| s.to_string())
                .or_else(|| Some("application/octet-stream".to_string()));
            let b = field
                .bytes()
                .await
                .map_err(|e| AppError::Validation(format!("proof bytes: {e}")))?;
            bytes = Some(b.to_vec());
        }
    }
    let (fname, mime_t, b) = (
        file_name.ok_or_else(|| AppError::Validation("missing 'proof' field".into()))?,
        content_type.ok_or_else(|| AppError::Validation("missing proof content-type".into()))?,
        bytes.ok_or_else(|| AppError::Validation("empty 'proof' field".into()))?,
    );

    // 3. Save to storage (validates mime + size internally).
    let stored = state
        .storage
        .save_payment_proof(id, &fname, &mime_t, &b)
        .await?;

    // 4. Persist path ke kolom klaim.
    sqlx::query("UPDATE claims SET payment_proof_path = $1, updated_at = now() WHERE id = $2")
        .bind(&stored.key)
        .bind(id)
        .execute(&state.pool)
        .await?;

    // 5. Audit.
    audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_user.sub,
            action: "claim_payment_proof_uploaded",
            entity_type: "claim",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({
                "key": stored.key,
                "filename": fname,
                "size_bytes": b.len(),
                "content_type": mime_t,
            })),
            ip_address: None,
        },
    )
    .await?;

    // 6. Return updated row.
    let row: AdminClaimRow = sqlx::query_as(
        r#"
        SELECT cl.id, cl.claim_no, p.policy_no, c.full_name AS customer_name,
               cl.claim_type, cl.incident_date, cl.claimed_amount,
               cl.status, cl.decision_note, cl.payment_proof_path, cl.submitted_at, cl.updated_at
          FROM claims cl
          JOIN policies p ON p.id = cl.policy_id
          JOIN customers c ON c.id = cl.customer_id
         WHERE cl.id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(row))
}

// ---- Inquiries (admin view & ticketing) ----
//
// Model ticketing sejak migrasi 0011: inquiry punya banyak messages di
// tabel `inquiry_messages` (thread). Status parent = state dari latest
// message (OPEN = latest by customer, ANSWERED = latest by admin).
//
// Admin bisa:
//   - GET   /admin/inquiries                       list dengan auto-close
//   - GET   /admin/inquiries/:id                   detail + messages
//   - POST  /admin/inquiries/:id/messages          reply (sender=ADMIN, status=ANSWERED)
//   - POST  /admin/inquiries/:id/close             close manual (optional note)

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
    /// Legacy: admin's first answer. Backward-compat — caller baru read
    /// dari `inquiry_messages`.
    response: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    responded_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Timestamp pesan terakhir di thread (auto-close check + list preview).
    last_message_at: Option<chrono::DateTime<chrono::Utc>>,
    last_sender_type: Option<String>,
    closed_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Snippet pesan terakhir (subquery `inquiry_messages`).
    last_message_preview: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
struct AdminMessageRow {
    id: Uuid,
    sender_type: String,
    sender_id: Option<Uuid>,
    sender_name: String,
    message: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
struct AdminInquiryDetailRow {
    #[serde(flatten)]
    inquiry: AdminInquiryRow,
    messages: Vec<AdminMessageRow>,
}

#[derive(serde::Deserialize)]
struct AdminCreateMessageJson {
    message: String,
}

#[derive(serde::Deserialize)]
struct AdminCloseInquiryJson {
    #[serde(default)]
    note: Option<String>,
}

async fn list_inquiries_admin(
    State(state): State<AppState>,
    _: RequireAdmin,
    Query(q): Query<PageQuery>,
    Query(fmt): Query<ListFormatQuery>,
) -> AppResult<Response> {
    // ----- Shared filter inputs -----
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let status = q.status.clone().unwrap_or_default();
    let like = format!("%{search}%");

    // ----- New filter inputs -----
    let (date_from, date_to) =
        filters_helper::parse_date_range(q.date_from.as_deref(), q.date_to.as_deref())?;
    const INQUIRY_DATE_FIELDS: &[&str] =
        &["created_at", "responded_at", "last_message_at", "closed_at"];
    let date_field =
        filters_helper::validate_date_field(q.date_field.as_deref(), INQUIRY_DATE_FIELDS);
    const INQUIRY_SORT_COLS: &[&str] = &[
        "created_at",
        "responded_at",
        "last_message_at",
        "closed_at",
        "customer_name",
    ];
    let sort_col = filters_helper::validate_sort(q.sort_by.as_deref(), INQUIRY_SORT_COLS);
    let sort_dir = filters_helper::validate_sort_dir(q.sort_dir.as_deref());

    // date_from / date_to are bound as Option<NaiveDate>; the SQL uses
    // `$3::date IS NULL OR <col> >= $3::date` so a None value
    // short-circuits the comparison and the placeholder count stays
    // stable across requests with and without a date filter (prevents
    // sqlx prepared-statement cache collision that produced
    // "bind message supplies 4 parameters, but prepared statement
    // requires 6" before this fix).
    let date_col = format!("i.{date_field}");
    let sort_col_qualified = match sort_col {
        "customer_name" => "c.full_name".to_string(),
        other => format!("i.{other}"),
    };

    if fmt.is_csv() {
        let date_predicate = format!(
            " AND ($3::date IS NULL OR {date_col} >= $3::date) \
             AND ($4::date IS NULL OR {date_col} <= $4::date)"
        );
        let sql = format!(
            r#"
            SELECT i.id, i.inquiry_no, c.full_name AS customer_name, c.email AS customer_email,
                   p.policy_no,
                   i.subject, i.message, i.status, i.response,
                   i.created_at, i.responded_at,
                   i.last_message_at, i.last_sender_type, i.closed_at,
                   (SELECT message FROM inquiry_messages
                     WHERE inquiry_id = i.id
                     ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
              FROM inquiries i
              JOIN customers c ON c.id = i.customer_id
              LEFT JOIN policies p ON p.id = i.policy_id
             WHERE ($1 = '' OR i.inquiry_no ILIKE $1 OR i.subject ILIKE $1 OR c.full_name ILIKE $1)
               AND ($2 = '' OR i.status = $2)
               {date_predicate}
             {order}
            "#,
            order = filters_helper::order_clause(&sort_col_qualified, sort_dir),
        );
        let rows: Vec<AdminInquiryRow> = sqlx::query_as::<_, AdminInquiryRow>(&sql)
            .bind(&like)
            .bind(&status)
            .bind(date_from)
            .bind(date_to)
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
                    r.last_message_at
                        .map(|d| d.to_rfc3339())
                        .unwrap_or_default(),
                    r.last_sender_type.clone().unwrap_or_default(),
                    r.closed_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
                    r.last_message_preview.clone().unwrap_or_default(),
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
                "last_message_at",
                "last_sender_type",
                "closed_at",
                "last_message_preview",
            ],
            body,
            "inquiries",
        ));
    }

    // ----- JSON path -----
    let date_predicate = format!(
        " AND ($3::date IS NULL OR {date_col} >= $3::date) \
         AND ($4::date IS NULL OR {date_col} <= $4::date)"
    );

    let count_sql = format!(
        r#"
        SELECT COUNT(*)
          FROM inquiries i
          JOIN customers c ON c.id = i.customer_id
         WHERE ($1 = '' OR i.inquiry_no ILIKE $1 OR i.subject ILIKE $1 OR c.full_name ILIKE $1)
           AND ($2 = '' OR i.status = $2)
           {date_predicate}
        "#
    );
    let total: (i64,) = sqlx::query_as::<_, (i64,)>(&count_sql)
        .bind(&search)
        .bind(&status)
        .bind(date_from)
        .bind(date_to)
        .fetch_one(&state.pool)
        .await?;

    let data_sql = format!(
        r#"
        SELECT i.id, i.inquiry_no, c.full_name AS customer_name, c.email AS customer_email,
               p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at,
               i.last_message_at, i.last_sender_type, i.closed_at,
               (SELECT message FROM inquiry_messages
                 WHERE inquiry_id = i.id
                 ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
          FROM inquiries i
          JOIN customers c ON c.id = i.customer_id
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE ($1 = '' OR i.inquiry_no ILIKE $1 OR i.subject ILIKE $1 OR c.full_name ILIKE $1)
           AND ($2 = '' OR i.status = $2)
           {date_predicate}
         {order}
         LIMIT $5 OFFSET $6
        "#,
        order = filters_helper::order_clause(&sort_col_qualified, sort_dir),
    );
    let data: Vec<AdminInquiryRow> = sqlx::query_as::<_, AdminInquiryRow>(&data_sql)
        .bind(&like)
        .bind(&status)
        .bind(date_from)
        .bind(date_to)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pool)
        .await?;

    // Lazy auto-close: sama dengan customer side — stale ANSWERED → CLOSED
    // + email `InquiryAutoClosed` ke customer. Update row di-place supaya
    // response akurat.
    let mut data = data;
    for row in data.iter_mut() {
        if row.status == "ANSWERED" {
            if let Some(closed) =
                crate::services::inquiry::try_auto_close_stale(&state, row.id).await?
            {
                row.status = "CLOSED".into();
                row.closed_at = Some(closed);
            }
        }
    }

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    })
    .into_response())
}

async fn get_inquiry_admin(
    State(state): State<AppState>,
    _: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<AdminInquiryDetailRow>> {
    // Lazy auto-close sebelum fetch — pastikan status akurat.
    let _ = crate::services::inquiry::try_auto_close_stale(&state, id).await?;

    let inquiry: Option<AdminInquiryRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, c.full_name AS customer_name, c.email AS customer_email,
               p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at,
               i.last_message_at, i.last_sender_type, i.closed_at,
               (SELECT message FROM inquiry_messages
                 WHERE inquiry_id = i.id
                 ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
          FROM inquiries i
          JOIN customers c ON c.id = i.customer_id
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE i.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let inquiry = inquiry.ok_or(AppError::NotFound("inquiry".into()))?;

    let messages: Vec<AdminMessageRow> = sqlx::query_as(
        r#"
        SELECT id, sender_type, sender_id, sender_name, message, created_at
          FROM inquiry_messages
         WHERE inquiry_id = $1
         ORDER BY created_at ASC, id ASC
        "#,
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(AdminInquiryDetailRow { inquiry, messages }))
}

/// Admin reply — insert message baru ke thread inquiry (sender=ADMIN).
///
/// Efek samping:
///   - INSERT ke `inquiry_messages` (sender_type=ADMIN)
///   - UPDATE parent: status=ANSWERED, last_message_at=now, last_sender_type=ADMIN
///   - Email customer (InquiryResponse) — best-effort
///   - Audit log
async fn admin_inquiry_message(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    Path(id): Path<Uuid>,
    Json(req): Json<AdminCreateMessageJson>,
) -> AppResult<Json<AdminInquiryDetailRow>> {
    use crate::domain::inquiry::can_transition;

    let message = req.message.trim();
    if message.is_empty() {
        return Err(AppError::Validation("message required".into()));
    }
    if message.len() > 5000 {
        return Err(AppError::Validation("message max 5000 chars".into()));
    }

    // Verify inquiry exists + get current status + customer email untuk email.
    let current: Option<(String, String, String)> = sqlx::query_as(
        r#"
        SELECT i.status, c.email, c.full_name
          FROM inquiries i JOIN customers c ON c.id = i.customer_id
         WHERE i.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (current_status, customer_email, _customer_name) =
        current.ok_or(AppError::NotFound("inquiry".into()))?;

    // CLOSED → terminal. Tolak reply.
    if !can_transition(&current_status, "ANSWERED") {
        return Err(AppError::Validation(format!(
            "inquiry dalam status {current_status}, tidak bisa menambah balasan"
        )));
    }

    // Lookup admin's name untuk denormalized sender_name di thread.
    let admin_id = Uuid::parse_str(&admin_claims.sub).map_err(|_| AppError::Unauthorized)?;
    let admin_name: String = sqlx::query_scalar(
        r#"SELECT COALESCE(NULLIF(full_name, ''), username) FROM admin_users WHERE id = $1"#,
    )
    .bind(admin_id)
    .fetch_one(&state.pool)
    .await?;

    let mut tx = state.pool.begin().await?;
    // 1. Insert message.
    sqlx::query(
        r#"
        INSERT INTO inquiry_messages
          (inquiry_id, sender_type, sender_id, sender_name, message)
        VALUES ($1, 'ADMIN', $2, $3, $4)
        "#,
    )
    .bind(id)
    .bind(admin_id)
    .bind(&admin_name)
    .bind(message)
    .execute(&mut *tx)
    .await?;
    // 2. Update parent: status=ANSWERED + last_message_at.
    sqlx::query(
        r#"
        UPDATE inquiries
           SET status = 'ANSWERED',
               last_message_at = now(),
               last_sender_type = 'ADMIN',
               responded_at = now()
         WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    // 3. Audit.
    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_claims.sub,
            action: "inquiry_message_sent",
            entity_type: "inquiry",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({
                "sender_type": "ADMIN",
                "message_length": message.len(),
            })),
            ip_address: None,
        },
    )
    .await;

    // 4. Email customer — best-effort.
    let inquiry_no: String = sqlx::query_scalar("SELECT inquiry_no FROM inquiries WHERE id = $1")
        .bind(id)
        .fetch_one(&state.pool)
        .await?;
    let subject_line: String = sqlx::query_scalar("SELECT subject FROM inquiries WHERE id = $1")
        .bind(id)
        .fetch_one(&state.pool)
        .await?;
    let body = format!(
        "Halo,\n\n\
         Tim InsureTrack sudah menjawab pertanyaan kamu (no. {inquiry_no}, \
         subjek: \"{subject_line}\").\n\n\
         Pesan dari admin:\n{message}\n\n\
         Punya pertanyaan lanjutan? Balas via portal di \
         {base}/portal/inquiries atau balas email ini.\n\n\
         Salam,\n\
         Tim InsureTrack",
        base = state.config.app_base_url.trim_end_matches('/'),
    );
    let _ = crate::services::email::send(
        &state.pool,
        &*state.storage,
        &*state.email,
        crate::services::email::Email {
            email_type: crate::services::email::EmailType::InquiryResponse,
            recipient: &customer_email,
            subject: &format!("[Inquiry {inquiry_no}] Balasan dari admin"),
            body: &body,
            cta_text: Some("Buka Portal"),
            cta_url: Some(&format!(
                "{}/portal/inquiries",
                state.config.app_base_url.trim_end_matches('/')
            )),
            related_entity_type: Some("inquiry"),
            related_entity_id: Some(id),
            attachment_path: None,
        },
    )
    .await;

    // 5. Return updated detail.
    let inquiry: AdminInquiryRow = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, c.full_name AS customer_name, c.email AS customer_email,
               p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at,
               i.last_message_at, i.last_sender_type, i.closed_at,
               (SELECT message FROM inquiry_messages
                 WHERE inquiry_id = i.id
                 ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
          FROM inquiries i
          JOIN customers c ON c.id = i.customer_id
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE i.id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    let messages: Vec<AdminMessageRow> = sqlx::query_as(
        r#"
        SELECT id, sender_type, sender_id, sender_name, message, created_at
          FROM inquiry_messages
         WHERE inquiry_id = $1
         ORDER BY created_at ASC, id ASC
        "#,
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(AdminInquiryDetailRow { inquiry, messages }))
}

/// Admin-initiated close. Inquiry ditutup dari sisi admin (mis. "sudah
/// selesai" — close manual). Optional note di-append sebagai message
/// terakhir (sender=ADMIN) sebelum close, sehingga thread history
/// konsisten.
async fn admin_inquiry_close(
    State(state): State<AppState>,
    RequireAdmin(admin_claims): RequireAdmin,
    Path(id): Path<Uuid>,
    Json(req): Json<AdminCloseInquiryJson>,
) -> AppResult<Json<AdminInquiryRow>> {
    use crate::domain::inquiry::can_transition;

    let current: Option<(String, String)> = sqlx::query_as(
        "SELECT i.status, c.email FROM inquiries i JOIN customers c ON c.id = i.customer_id WHERE i.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (current_status, customer_email) = current.ok_or(AppError::NotFound("inquiry".into()))?;
    if !can_transition(&current_status, "CLOSED") {
        return Err(AppError::Validation(format!(
            "cannot close from status {current_status}"
        )));
    }

    let admin_id = Uuid::parse_str(&admin_claims.sub).map_err(|_| AppError::Unauthorized)?;
    let admin_name: String = sqlx::query_scalar(
        r#"SELECT COALESCE(NULLIF(full_name, ''), username) FROM admin_users WHERE id = $1"#,
    )
    .bind(admin_id)
    .fetch_one(&state.pool)
    .await?;

    let mut tx = state.pool.begin().await?;
    if let Some(note) = req.note.as_deref().map(str::trim).filter(|n| !n.is_empty()) {
        sqlx::query(
            r#"
            INSERT INTO inquiry_messages
              (inquiry_id, sender_type, sender_id, sender_name, message)
            VALUES ($1, 'ADMIN', $2, $3, $4)
            "#,
        )
        .bind(id)
        .bind(admin_id)
        .bind(&admin_name)
        .bind(note)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        r#"
        UPDATE inquiries
           SET status = 'CLOSED',
               closed_at = now(),
               last_message_at = now(),
               last_sender_type = 'ADMIN'
         WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin_claims.sub,
            action: "inquiry_closed_by_admin",
            entity_type: "inquiry",
            entity_id: Some(id),
            metadata: None,
            ip_address: None,
        },
    )
    .await;

    // Email customer — best-effort, kasih tahu tiket ditutup.
    let inquiry_no: String = sqlx::query_scalar("SELECT inquiry_no FROM inquiries WHERE id = $1")
        .bind(id)
        .fetch_one(&state.pool)
        .await?;
    let subject_line: String = sqlx::query_scalar("SELECT subject FROM inquiries WHERE id = $1")
        .bind(id)
        .fetch_one(&state.pool)
        .await?;
    let body = format!(
        "Halo,\n\n\
         Inquiry kamu (no. {inquiry_no}, subjek: \"{subject_line}\") sudah \
         ditutup oleh tim InsureTrack. Balasan atau tiket baru bisa dibuat \
         kapan saja lewat portal.\n\n\
         Salam,\n\
         Tim InsureTrack"
    );
    let _ = crate::services::email::send(
        &state.pool,
        &*state.storage,
        &*state.email,
        crate::services::email::Email {
            email_type: crate::services::email::EmailType::InquiryResponse,
            recipient: &customer_email,
            subject: &format!("[Inquiry {inquiry_no}] Ditutup"),
            body: &body,
            cta_text: Some("Buka Portal"),
            cta_url: Some(&format!(
                "{}/portal/inquiries",
                state.config.app_base_url.trim_end_matches('/')
            )),
            related_entity_type: Some("inquiry"),
            related_entity_id: Some(id),
            attachment_path: None,
        },
    )
    .await;

    let row: AdminInquiryRow = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, c.full_name AS customer_name, c.email AS customer_email,
               p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at,
               i.last_message_at, i.last_sender_type, i.closed_at,
               (SELECT message FROM inquiry_messages
                 WHERE inquiry_id = i.id
                 ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
          FROM inquiries i
          JOIN customers c ON c.id = i.customer_id
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE i.id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row))
}
