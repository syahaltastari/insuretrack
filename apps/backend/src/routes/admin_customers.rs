//! Admin endpoints untuk customer management. Mounted at /api/admin/customers.
//!
//! Spec §8.3 v1.2 tidak mendaftarkan endpoint customers — ini extension
//! yang mandatory untuk support / call-center ops. Pola: mirror
//! `admin_users.rs` (admin manages user lain) tapi gate-nya `RequireAdmin`
//! (bukan `RequireSuperAdmin`) karena operasi customer setingkat
//! klaim/inquiry. Setiap mutasi tetap di-audit ke `audit_logs`.
//!
//! Endpoints:
//!   GET    /api/admin/customers
//!          ?q=&status=PENDING|ACTIVE&active=true|false
//!          &date_from=&date_to=&date_field=created_at|last_login_at
//!          &sort_by=&sort_dir=&page=&page_size=&format=csv
//!   GET    /api/admin/customers/:id
//!   POST   /api/admin/customers/:id/activate
//!   POST   /api/admin/customers/:id/deactivate
//!   POST   /api/admin/customers/:id/reset-password
//!   POST   /api/admin/customers/:id/resend-activation

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::{generate_random_password, hash_password, RequireAdmin, Role},
    error::{AppError, AppResult},
    repo::{
        filters as filters_helper, validate_date_field, validate_sort, validate_sort_dir, Page,
        PageQuery,
    },
    routes::util::{csv_response, ListFormatQuery},
    services::{
        audit::{write as audit_write, AuditEntry},
        email::{send as send_email, Email, EmailType},
    },
    state::AppState,
};

const GENERATED_PASSWORD_LEN: usize = 16;

/// Sort whitelist. Lihat `validate_sort` untuk alasan whitelist.
const CUSTOMER_SORT_COLUMNS: &[&str] = &[
    "created_at",
    "email",
    "full_name",
    "last_login_at",
    "is_active",
];

/// Date field whitelist (untuk `?date_field=created_at|last_login_at`).
const CUSTOMER_DATE_FIELDS: &[&str] = &["created_at", "last_login_at"];

/// Extra query param untuk filter `is_active`. PageQuery tidak punya
/// field ini — pakai extractor Query terpisah agar tidak mengubah
/// shared `PageQuery` struct.
#[derive(Debug, Deserialize, Default)]
struct ActiveFilter {
    #[serde(default)]
    active: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/customers", get(list_customers))
        .route("/customers/:id", get(get_customer))
        .route("/customers/:id/activate", post(activate_customer))
        .route("/customers/:id/deactivate", post(deactivate_customer))
        .route(
            "/customers/:id/reset-password",
            post(reset_customer_password),
        )
        .route("/customers/:id/resend-activation", post(resend_activation))
}

// ============================================================
// Row + DTO
// ============================================================

/// Wire shape untuk list endpoint.
#[derive(Debug, Serialize, sqlx::FromRow)]
struct AdminCustomerRow {
    id: Uuid,
    nik: Option<String>,
    full_name: String,
    email: String,
    mobile_number: Option<String>,
    portal_status: Option<String>,
    is_active: bool,
    last_login_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

/// Subset untuk recent activity di detail page.
#[derive(Debug, Serialize, sqlx::FromRow)]
struct RecentRegistration {
    id: Uuid,
    registration_no: String,
    product: String,
    status: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct RecentPolicy {
    id: Uuid,
    policy_no: String,
    product: String,
    status: String,
    effective_date: NaiveDate,
    expiry_date: NaiveDate,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct RecentClaim {
    id: Uuid,
    claim_no: String,
    claim_type: String,
    status: String,
    claimed_amount: Decimal,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct RecentInquiry {
    id: Uuid,
    inquiry_no: String,
    subject: String,
    status: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AuditEntryRow {
    id: Uuid,
    actor: String,
    action: String,
    metadata: Option<serde_json::Value>,
    created_at: DateTime<Utc>,
}

/// Detail page wire shape — full profile + counts + recent 5 per type +
/// last 10 audit entries. Composite inline (bukan `extends`) supaya
/// FromRow derive sederhana.
#[derive(Debug, Serialize)]
struct AdminCustomerDetail {
    // Profil
    id: Uuid,
    nik: Option<String>,
    full_name: String,
    birth_place: Option<String>,
    birth_date: Option<NaiveDate>,
    gender: Option<String>,
    address: Option<String>,
    rt_rw: Option<String>,
    village: Option<String>,
    district: Option<String>,
    city: Option<String>,
    province: Option<String>,
    postal_code: Option<String>,
    email: String,
    mobile_number: Option<String>,
    id_card_path: Option<String>,
    portal_status: Option<String>,
    is_active: bool,
    last_login_at: Option<DateTime<Utc>>,
    password_changed_at: Option<DateTime<Utc>>,
    deactivated_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    // Counts
    registrations_count: i64,
    policies_count: i64,
    claims_count: i64,
    inquiries_count: i64,
    // Recent
    recent_registrations: Vec<RecentRegistration>,
    recent_policies: Vec<RecentPolicy>,
    recent_claims: Vec<RecentClaim>,
    recent_inquiries: Vec<RecentInquiry>,
    // Audit
    recent_audit: Vec<AuditEntryRow>,
}

#[derive(Debug, Serialize)]
struct ResetPasswordResponse {
    new_password: String,
}

#[derive(Debug, Serialize)]
struct ResendActivationResponse {
    ok: bool,
    email: String,
}

// ============================================================
// GET /customers — list with search + filter + sort + CSV
// ============================================================

async fn list_customers(
    State(state): State<AppState>,
    _claims: RequireAdmin,
    Query(q): Query<PageQuery>,
    Query(active_q): Query<ActiveFilter>,
    Query(fmt): Query<ListFormatQuery>,
) -> AppResult<Response> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let like = format!("%{search}%");
    // ?status= → portal_status (PENDING|ACTIVE|"")
    let portal_filter = q.status.clone().unwrap_or_default();
    // ?active=true|false → is_active (""|"true"|"false")
    let active_filter = active_q.active.unwrap_or_default();
    // Date range
    let (date_from, date_to) =
        filters_helper::parse_date_range(q.date_from.as_deref(), q.date_to.as_deref())?;
    let date_col = validate_date_field(q.date_field.as_deref(), CUSTOMER_DATE_FIELDS);
    // Sort
    let sort_col = validate_sort(q.sort_by.as_deref(), CUSTOMER_SORT_COLUMNS);
    let sort_dir = validate_sort_dir(q.sort_dir.as_deref());
    // safe: sort_col & date_col dari whitelist
    let order_clause = format!("ORDER BY {sort_col} {sort_dir}, created_at DESC");

    // Branch CSV: tidak paginasi, return semua row yang match filter.
    if fmt.is_csv() {
        let rows: Vec<AdminCustomerRow> = sqlx::query_as(&format!(
            r#"
            SELECT id, nik, full_name, email, mobile_number, portal_status,
                   is_active, last_login_at, created_at
              FROM customers
             WHERE ($1 = '' OR LOWER(full_name) LIKE LOWER($1)
                          OR LOWER(email) LIKE LOWER($1)
                          OR LOWER(COALESCE(mobile_number, '')) LIKE LOWER($1)
                          OR LOWER(COALESCE(nik, '')) LIKE LOWER($1))
               AND ($2 = '' OR portal_status = $2)
               AND ($3 = '' OR is_active = ($3 = 'true'))
               AND ($4::date IS NULL OR {date_col} >= $4)
               AND ($5::date IS NULL OR {date_col} <= $5)
             {order_clause}
            "#
        ))
        .bind(&like)
        .bind(&portal_filter)
        .bind(&active_filter)
        .bind(date_from)
        .bind(date_to)
        .fetch_all(&state.pool)
        .await?;
        return Ok(csv_response(
            &[
                "ID",
                "NIK",
                "Nama",
                "Email",
                "HP",
                "Portal",
                "Aktif",
                "Login Terakhir",
                "Dibuat",
            ],
            rows.into_iter()
                .map(|r| {
                    vec![
                        r.id.to_string(),
                        r.nik.unwrap_or_default(),
                        r.full_name,
                        r.email,
                        r.mobile_number.unwrap_or_default(),
                        r.portal_status.unwrap_or_default(),
                        if r.is_active { "ya" } else { "tidak" }.to_string(),
                        r.last_login_at
                            .map(|d| d.format("%Y-%m-%d %H:%M").to_string())
                            .unwrap_or_default(),
                        r.created_at.format("%Y-%m-%d %H:%M").to_string(),
                    ]
                })
                .collect(),
            "customers",
        ));
    }

    // Branch JSON: paginated
    let total: (i64,) = sqlx::query_as(&format!(
        r#"
        SELECT COUNT(*) FROM customers
         WHERE ($1 = '' OR LOWER(full_name) LIKE LOWER($1)
                      OR LOWER(email) LIKE LOWER($1)
                      OR LOWER(COALESCE(mobile_number, '')) LIKE LOWER($1)
                      OR LOWER(COALESCE(nik, '')) LIKE LOWER($1))
           AND ($2 = '' OR portal_status = $2)
           AND ($3 = '' OR is_active = ($3 = 'true'))
           AND ($4::date IS NULL OR {date_col} >= $4)
           AND ($5::date IS NULL OR {date_col} <= $5)
        "#
    ))
    .bind(&like)
    .bind(&portal_filter)
    .bind(&active_filter)
    .bind(date_from)
    .bind(date_to)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<AdminCustomerRow> = sqlx::query_as(&format!(
        r#"
        SELECT id, nik, full_name, email, mobile_number, portal_status,
               is_active, last_login_at, created_at
          FROM customers
         WHERE ($1 = '' OR LOWER(full_name) LIKE LOWER($1)
                      OR LOWER(email) LIKE LOWER($1)
                      OR LOWER(COALESCE(mobile_number, '')) LIKE LOWER($1)
                      OR LOWER(COALESCE(nik, '')) LIKE LOWER($1))
           AND ($2 = '' OR portal_status = $2)
           AND ($3 = '' OR is_active = ($3 = 'true'))
           AND ($4::date IS NULL OR {date_col} >= $4)
           AND ($5::date IS NULL OR {date_col} <= $5)
         {order_clause}
         LIMIT $6 OFFSET $7
        "#
    ))
    .bind(&like)
    .bind(&portal_filter)
    .bind(&active_filter)
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

// ============================================================
// GET /customers/:id — detail with counts + recent + audit
// ============================================================

async fn get_customer(
    State(state): State<AppState>,
    _claims: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<AdminCustomerDetail>> {
    // 1. Profil utama.
    #[derive(sqlx::FromRow)]
    struct CustomerProfile {
        id: Uuid,
        nik: Option<String>,
        full_name: String,
        birth_place: Option<String>,
        birth_date: Option<NaiveDate>,
        gender: Option<String>,
        address: Option<String>,
        rt_rw: Option<String>,
        village: Option<String>,
        district: Option<String>,
        city: Option<String>,
        province: Option<String>,
        postal_code: Option<String>,
        email: String,
        mobile_number: Option<String>,
        id_card_path: Option<String>,
        portal_status: Option<String>,
        is_active: bool,
        last_login_at: Option<DateTime<Utc>>,
        password_changed_at: Option<DateTime<Utc>>,
        deactivated_at: Option<DateTime<Utc>>,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
    }
    let profile: Option<CustomerProfile> = sqlx::query_as(
        r#"
        SELECT id, nik, full_name, birth_place, birth_date, gender,
               address, rt_rw, village, district, city, province, postal_code,
               email, mobile_number, id_card_path, portal_status, is_active,
               last_login_at, password_changed_at, deactivated_at,
               created_at, updated_at
          FROM customers WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let p = profile.ok_or(AppError::NotFound("customer".into()))?;

    // 2. Counts — 4 query sederhana. Tidak di-union karena masing-masing
    //    pakai WHERE berbeda (registrations.customer_id, claims.policy_id
    //    → customer_id, dll).
    let registrations_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM registrations WHERE customer_id = $1")
            .bind(id)
            .fetch_one(&state.pool)
            .await?;
    let policies_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM policies p \
         JOIN registrations r ON r.id = p.registration_id \
         WHERE r.customer_id = $1",
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    let claims_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM claims WHERE customer_id = $1")
        .bind(id)
        .fetch_one(&state.pool)
        .await?;
    let inquiries_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM inquiries WHERE customer_id = $1")
            .bind(id)
            .fetch_one(&state.pool)
            .await?;

    // 3. Recent 5 per type — di-sort created_at DESC.
    let recent_registrations: Vec<RecentRegistration> = sqlx::query_as(
        r#"
        SELECT id, registration_no, product, status, created_at
          FROM registrations
         WHERE customer_id = $1
         ORDER BY created_at DESC LIMIT 5
        "#,
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let recent_policies: Vec<RecentPolicy> = sqlx::query_as(
        r#"
        SELECT p.id, p.policy_no, p.product, p.status, p.effective_date, p.expiry_date
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
         WHERE r.customer_id = $1
         ORDER BY p.created_at DESC LIMIT 5
        "#,
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let recent_claims: Vec<RecentClaim> = sqlx::query_as(
        r#"
        SELECT id, claim_no, claim_type, status, claimed_amount, submitted_at AS created_at
          FROM claims
         WHERE customer_id = $1
         ORDER BY submitted_at DESC LIMIT 5
        "#,
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let recent_inquiries: Vec<RecentInquiry> = sqlx::query_as(
        r#"
        SELECT id, inquiry_no, subject, status, created_at
          FROM inquiries
         WHERE customer_id = $1
         ORDER BY created_at DESC LIMIT 5
        "#,
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    let recent_audit: Vec<AuditEntryRow> = sqlx::query_as(
        r#"
        SELECT id, actor, action, metadata, created_at
          FROM audit_logs
         WHERE entity_type = 'customer' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 10
        "#,
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(AdminCustomerDetail {
        id: p.id,
        nik: p.nik,
        full_name: p.full_name,
        birth_place: p.birth_place,
        birth_date: p.birth_date,
        gender: p.gender,
        address: p.address,
        rt_rw: p.rt_rw,
        village: p.village,
        district: p.district,
        city: p.city,
        province: p.province,
        postal_code: p.postal_code,
        email: p.email,
        mobile_number: p.mobile_number,
        id_card_path: p.id_card_path,
        portal_status: p.portal_status,
        is_active: p.is_active,
        last_login_at: p.last_login_at,
        password_changed_at: p.password_changed_at,
        deactivated_at: p.deactivated_at,
        created_at: p.created_at,
        updated_at: p.updated_at,
        registrations_count: registrations_count.0,
        policies_count: policies_count.0,
        claims_count: claims_count.0,
        inquiries_count: inquiries_count.0,
        recent_registrations,
        recent_policies,
        recent_claims,
        recent_inquiries,
        recent_audit,
    }))
}

// ============================================================
// POST /customers/:id/activate
// ============================================================

async fn activate_customer(
    State(state): State<AppState>,
    claims: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let actor_id = Uuid::parse_str(&claims.0.sub).map_err(|_| AppError::Unauthorized)?;
    let res = sqlx::query(
        r#"
        UPDATE customers
           SET is_active = TRUE, deactivated_at = NULL, updated_at = now()
         WHERE id = $1 AND is_active = FALSE
        "#,
    )
    .bind(id)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "customer not found or already active".into(),
        ));
    }
    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.0.sub,
            action: "customer_activated_by_admin",
            entity_type: "customer",
            entity_id: Some(id),
            metadata: Some(json!({ "actor_id": actor_id })),
            ip_address: None,
        },
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ============================================================
// POST /customers/:id/deactivate
// ============================================================

async fn deactivate_customer(
    State(state): State<AppState>,
    claims: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let actor_id = Uuid::parse_str(&claims.0.sub).map_err(|_| AppError::Unauthorized)?;
    // Set deactivated_at = now() + clear last_login_at? Tidak — biarkan
    // last_login_at sebagai historical record.
    let res = sqlx::query(
        r#"
        UPDATE customers
           SET is_active = FALSE, deactivated_at = now(), updated_at = now()
         WHERE id = $1 AND is_active = TRUE
        "#,
    )
    .bind(id)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "customer not found or already inactive".into(),
        ));
    }
    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.0.sub,
            action: "customer_deactivated_by_admin",
            entity_type: "customer",
            entity_id: Some(id),
            metadata: Some(json!({ "actor_id": actor_id })),
            ip_address: None,
        },
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ============================================================
// POST /customers/:id/reset-password
// ============================================================

async fn reset_customer_password(
    State(state): State<AppState>,
    claims: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ResetPasswordResponse>> {
    let actor_id = Uuid::parse_str(&claims.0.sub).map_err(|_| AppError::Unauthorized)?;
    let new_password = generate_random_password(GENERATED_PASSWORD_LEN);
    let new_hash = hash_password(&new_password)?;

    let res = sqlx::query(
        r#"
        UPDATE customers
           SET password_hash = $1, password_changed_at = now(), updated_at = now()
         WHERE id = $2
        "#,
    )
    .bind(&new_hash)
    .bind(id)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("customer".into()));
    }
    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.0.sub,
            action: "customer_password_reset_by_admin",
            entity_type: "customer",
            entity_id: Some(id),
            // Catat panjang, BUKAN plaintext. Plaintext hanya di
            // response — caller (FE) yang display ke admin.
            metadata: Some(json!({
                "actor_id": actor_id,
                "generated_password_length": GENERATED_PASSWORD_LEN,
            })),
            ip_address: None,
        },
    )
    .await?;
    Ok(Json(ResetPasswordResponse { new_password }))
}

// ============================================================
// POST /customers/:id/resend-activation
// ============================================================

async fn resend_activation(
    State(state): State<AppState>,
    claims: RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ResendActivationResponse>> {
    let actor_id = Uuid::parse_str(&claims.0.sub).map_err(|_| AppError::Unauthorized)?;

    // 1. Ambil data customer. Tolak kalau bukan PENDING.
    #[derive(sqlx::FromRow)]
    struct ActivationTarget {
        email: String,
        full_name: String,
        portal_status: Option<String>,
    }
    let target: Option<ActivationTarget> =
        sqlx::query_as("SELECT email, full_name, portal_status FROM customers WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    let target = target.ok_or(AppError::NotFound("customer".into()))?;
    if target.portal_status.as_deref() != Some("PENDING") {
        return Err(AppError::Validation(
            "customer sudah aktif, tidak perlu aktivasi ulang".into(),
        ));
    }

    // 2. Issue activation JWT (purpose="activation", 24h).
    let activation_token = state.tokens.issue(
        &id.to_string(),
        Role::Customer,
        Some("activation".to_string()),
        false,
        60 * 60 * 24,
    )?;
    let activation_url = format!(
        "{}/portal/activate?token={}",
        state.config.app_base_url.trim_end_matches('/'),
        activation_token
    );

    // 3. Kirim email — fire-and-forget (sama dengan password_reset dan
    //    activation flow di register_customer). Kegagalan email di-log
    //    di email_logs, tidak menggagalkan response.
    let body = format!(
        "Halo {},\n\n\
         Akun InsureTrack portal Anda belum diaktifkan. \
         Klik tombol Aktivasi pada email ini (link berlaku 24 jam) untuk \
         menyelesaikan aktivasi.\n\n\
         Kalau tombol tidak bisa diklik, salin link ini ke browser:\n\
         {}\n\n\
         Ada pertanyaan? Balas email ini — kami siap bantu.\n\n\
         Salam,\n\
         Tim InsureTrack",
        target.full_name.trim(),
        activation_url
    );
    let _ = send_email(
        &state.pool,
        &*state.storage,
        &*state.email,
        Email {
            email_type: EmailType::PortalActivation,
            recipient: &target.email,
            subject: "Aktivasi Akun InsureTrack Portal",
            body: &body,
            cta_text: Some("Aktifkan Akun Saya →"),
            cta_url: Some(&activation_url),
            related_entity_type: Some("customer"),
            related_entity_id: Some(id),
            attachment_path: None,
        },
    )
    .await;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.0.sub,
            action: "customer_activation_resent",
            entity_type: "customer",
            entity_id: Some(id),
            metadata: Some(json!({ "actor_id": actor_id })),
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(ResendActivationResponse {
        ok: true,
        email: target.email,
    }))
}
