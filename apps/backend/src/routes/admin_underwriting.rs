//! Admin endpoints untuk underwriting configuration + response review.
//!
//! Mounted at /api/admin/underwriting. Semua butuh RequireAdmin.
//!
//!   GET    /configs                       → list all product configs
//!   GET    /configs/:product_code         → get single config
//!   PUT    /configs/:product_code         → update config
//!   GET    /tiers/:product_code           → list loading tiers for product
//!   PUT    /tiers/:product_code           → replace all tiers for product
//!   GET    /responses                     → list all responses (paginated)
//!   GET    /responses/:id                 → get single response
//!   POST   /responses/:id/override        → admin override decision
//!
//! MVP scope (no manual review queue): override endpoint adalah escape
//! hatch untuk edge cases. Customer-side auto-decide sudah final
//! kecuali admin explicitly override via endpoint ini.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::RequireAdmin,
    domain::underwriting::RiskTier,
    error::{AppError, AppResult},
    repo::{Page, PageQuery},
    services::{
        audit::{write as audit_write, AuditEntry},
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/underwriting/configs", get(list_configs))
        .route("/underwriting/configs/:product_code", get(get_config).put(update_config))
        .route("/underwriting/tiers/:product_code", get(list_tiers).put(replace_tiers))
        .route("/underwriting/responses", get(list_responses))
        .route("/underwriting/responses/:id", get(get_response))
        .route("/underwriting/responses/:id/override", post(override_response))
}

// ============================================================
// Config CRUD
// ============================================================

#[derive(Debug, Serialize, sqlx::FromRow)]
struct ConfigRow {
    id: Uuid,
    product_code: String,
    enabled: bool,
    age_min: i16,
    age_max: i16,
    require_bmi: bool,
    bmi_min: Option<Decimal>,
    bmi_max: Option<Decimal>,
    require_smoker: bool,
    require_preexisting: bool,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
struct ConfigResponse {
    id: Uuid,
    product_code: String,
    enabled: bool,
    age_min: i16,
    age_max: i16,
    require_bmi: bool,
    bmi_min: Option<f64>,
    bmi_max: Option<f64>,
    require_smoker: bool,
    require_preexisting: bool,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<ConfigRow> for ConfigResponse {
    fn from(r: ConfigRow) -> Self {
        Self {
            id: r.id,
            product_code: r.product_code,
            enabled: r.enabled,
            age_min: r.age_min,
            age_max: r.age_max,
            require_bmi: r.require_bmi,
            bmi_min: r.bmi_min.and_then(|d| d.to_string().parse::<f64>().ok()),
            bmi_max: r.bmi_max.and_then(|d| d.to_string().parse::<f64>().ok()),
            require_smoker: r.require_smoker,
            require_preexisting: r.require_preexisting,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

async fn list_configs(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<Vec<ConfigResponse>>> {
    let rows: Vec<ConfigRow> = sqlx::query_as(
        r#"
        SELECT id, product_code, enabled, age_min, age_max,
               require_bmi, bmi_min, bmi_max,
               require_smoker, require_preexisting,
               created_at, updated_at
          FROM product_underwriting_configs
         ORDER BY product_code
        "#,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

async fn get_config(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(product_code): Path<String>,
) -> AppResult<Json<ConfigResponse>> {
    let row: Option<ConfigRow> = sqlx::query_as(
        r#"
        SELECT id, product_code, enabled, age_min, age_max,
               require_bmi, bmi_min, bmi_max,
               require_smoker, require_preexisting,
               created_at, updated_at
          FROM product_underwriting_configs
         WHERE product_code = $1
        "#,
    )
    .bind(&product_code)
    .fetch_optional(&state.pool)
    .await?;
    let row = row.ok_or_else(|| AppError::NotFound(format!("config not found: {product_code}")))?;
    Ok(Json(row.into()))
}

#[derive(Debug, Deserialize)]
struct UpdateConfigRequest {
    enabled: Option<bool>,
    age_min: Option<i16>,
    age_max: Option<i16>,
    require_bmi: Option<bool>,
    bmi_min: Option<f64>,
    bmi_max: Option<f64>,
    require_smoker: Option<bool>,
    require_preexisting: Option<bool>,
}

async fn update_config(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(product_code): Path<String>,
    Json(req): Json<UpdateConfigRequest>,
) -> AppResult<Json<ConfigResponse>> {
    // Fetch existing first untuk merge fields.
    let existing: ConfigRow = sqlx::query_as(
        r#"
        SELECT id, product_code, enabled, age_min, age_max,
               require_bmi, bmi_min, bmi_max,
               require_smoker, require_preexisting,
               created_at, updated_at
          FROM product_underwriting_configs
         WHERE product_code = $1
        "#,
    )
    .bind(&product_code)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("config not found: {product_code}")))?;

    // Merge: PATCH semantics — kalau field None, keep existing.
    let enabled = req.enabled.unwrap_or(existing.enabled);
    let age_min = req.age_min.unwrap_or(existing.age_min);
    let age_max = req.age_max.unwrap_or(existing.age_max);
    let require_bmi = req.require_bmi.unwrap_or(existing.require_bmi);
    let bmi_min = req
        .bmi_min
        .map(|v| Decimal::from_f64(v).unwrap_or_default())
        .or(existing.bmi_min);
    let bmi_max = req
        .bmi_max
        .map(|v| Decimal::from_f64(v).unwrap_or_default())
        .or(existing.bmi_max);
    let require_smoker = req.require_smoker.unwrap_or(existing.require_smoker);
    let require_preexisting = req.require_preexisting.unwrap_or(existing.require_preexisting);

    // Sanity: age_min <= age_max.
    if age_min > age_max {
        return Err(AppError::Validation(format!(
            "age_min ({age_min}) > age_max ({age_max})"
        )));
    }
    // Sanity: kalau require_bmi, both bounds must be set.
    if require_bmi && (bmi_min.is_none() || bmi_max.is_none()) {
        return Err(AppError::Validation(
            "BMI bounds required when require_bmi is true".to_string(),
        ));
    }

    let row: ConfigRow = sqlx::query_as(
        r#"
        UPDATE product_underwriting_configs
           SET enabled = $1,
               age_min = $2,
               age_max = $3,
               require_bmi = $4,
               bmi_min = $5,
               bmi_max = $6,
               require_smoker = $7,
               require_preexisting = $8,
               updated_at = NOW()
         WHERE product_code = $9
        RETURNING id, product_code, enabled, age_min, age_max,
                  require_bmi, bmi_min, bmi_max,
                  require_smoker, require_preexisting,
                  created_at, updated_at
        "#,
    )
    .bind(enabled)
    .bind(age_min)
    .bind(age_max)
    .bind(require_bmi)
    .bind(bmi_min)
    .bind(bmi_max)
    .bind(require_smoker)
    .bind(require_preexisting)
    .bind(&product_code)
    .fetch_one(&state.pool)
    .await?;

    // Audit.
    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin.sub,
            action: "underwriting.config.update",
            entity_type: "product_underwriting_config",
            entity_id: Some(row.id),
            metadata: Some(serde_json::json!({
                "product_code": product_code,
                "enabled": enabled,
            })),
            ip_address: None,
        },
    )
    .await;

    Ok(Json(row.into()))
}

// ============================================================
// Tiers CRUD
// ============================================================

#[derive(Debug, sqlx::FromRow)]
struct TierRow {
    id: Uuid,
    product_code: String,
    tier_code: String,
    tier_name: String,
    premium_multiplier: Decimal,
    criteria: serde_json::Value,
    display_order: i16,
}

// `rust_decimal` di-konfigurasi `serde-with-str` (lihat Cargo.toml) supaya
// presisi terjaga melewati Postgres NUMERIC — tapi itu artinya Decimal
// serialize sebagai JSON string, bukan number. Frontend (`.toFixed()`)
// expect number, jadi convert eksplisit di response DTO.
#[derive(Debug, Serialize)]
struct TierResponse {
    id: Uuid,
    product_code: String,
    tier_code: String,
    tier_name: String,
    premium_multiplier: f64,
    criteria: serde_json::Value,
    display_order: i16,
}

impl From<TierRow> for TierResponse {
    fn from(r: TierRow) -> Self {
        Self {
            id: r.id,
            product_code: r.product_code,
            tier_code: r.tier_code,
            tier_name: r.tier_name,
            premium_multiplier: r.premium_multiplier.to_string().parse().unwrap_or(1.0),
            criteria: r.criteria,
            display_order: r.display_order,
        }
    }
}

async fn list_tiers(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(product_code): Path<String>,
) -> AppResult<Json<Vec<TierResponse>>> {
    let rows: Vec<TierRow> = sqlx::query_as(
        r#"
        SELECT id, product_code, tier_code, tier_name,
               premium_multiplier, criteria, display_order
          FROM underwriting_loading_tiers
         WHERE product_code = $1
         ORDER BY display_order ASC
        "#,
    )
    .bind(&product_code)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

#[derive(Debug, Deserialize)]
struct TierInput {
    tier_code: String,
    tier_name: String,
    premium_multiplier: f64,
    criteria: serde_json::Value,
    display_order: i16,
}

#[derive(Debug, Deserialize)]
struct ReplaceTiersRequest {
    tiers: Vec<TierInput>,
}

async fn replace_tiers(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(product_code): Path<String>,
    Json(req): Json<ReplaceTiersRequest>,
) -> AppResult<StatusCode> {
    // Validate inputs.
    if req.tiers.is_empty() {
        return Err(AppError::Validation("tiers array cannot be empty".to_string()));
    }
    for t in &req.tiers {
        if RiskTier::parse(&t.tier_code).is_none() {
            return Err(AppError::Validation(format!(
                "invalid tier_code: {} (must be standard|loaded|heavily_loaded|declined)",
                t.tier_code
            )));
        }
        if t.premium_multiplier <= 0.0 {
            return Err(AppError::Validation(format!(
                "premium_multiplier must be > 0 (tier {})",
                t.tier_code
            )));
        }
    }
    // Validate ada exactly 1 'standard' tier dengan always_match=true.
    let standard_count = req
        .tiers
        .iter()
        .filter(|t| t.tier_code == "standard")
        .count();
    if standard_count != 1 {
        return Err(AppError::Validation(
            "exactly one 'standard' tier required".to_string(),
        ));
    }

    // Replace atomic dalam transaction.
    let mut tx = state.pool.begin().await?;

    sqlx::query("DELETE FROM underwriting_loading_tiers WHERE product_code = $1")
        .bind(&product_code)
        .execute(&mut *tx)
        .await?;

    for t in &req.tiers {
        sqlx::query(
            r#"
            INSERT INTO underwriting_loading_tiers
              (product_code, tier_code, tier_name, premium_multiplier, criteria, display_order)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(&product_code)
        .bind(&t.tier_code)
        .bind(&t.tier_name)
        .bind(Decimal::from_f64(t.premium_multiplier).unwrap_or_default())
        .bind(&t.criteria)
        .bind(t.display_order)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin.sub,
            action: "underwriting.tiers.replace",
            entity_type: "product_underwriting_config",
            entity_id: None,
            metadata: Some(serde_json::json!({
                "product_code": product_code,
                "tier_count": req.tiers.len(),
            })),
            ip_address: None,
        },
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================
// Responses list + detail + override
// ============================================================

#[derive(Debug, sqlx::FromRow)]
struct ResponseRow {
    id: Uuid,
    registration_id: Uuid,
    registration_no: String,
    customer_name: Option<String>,
    product: String,
    age: Option<i16>,
    height_cm: Option<Decimal>,
    weight_kg: Option<Decimal>,
    bmi: Option<Decimal>,
    is_smoker: Option<bool>,
    has_preexisting: Option<bool>,
    risk_tier: String,
    premium_multiplier: Decimal,
    decision: String,
    decision_reason: String,
    overridden_by: Option<Uuid>,
    overridden_at: Option<chrono::DateTime<chrono::Utc>>,
    override_tier: Option<String>,
    override_multiplier: Option<Decimal>,
    override_notes: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

// Lihat komentar di `TierResponse` — Decimal serialize sebagai string
// dengan `serde-with-str`, frontend expect number (`.toFixed()`).
#[derive(Debug, Serialize)]
struct ResponseDto {
    id: Uuid,
    registration_id: Uuid,
    registration_no: String,
    customer_name: Option<String>,
    product: String,
    age: Option<i16>,
    height_cm: Option<f64>,
    weight_kg: Option<f64>,
    bmi: Option<f64>,
    is_smoker: Option<bool>,
    has_preexisting: Option<bool>,
    risk_tier: String,
    premium_multiplier: f64,
    decision: String,
    decision_reason: String,
    overridden_by: Option<Uuid>,
    overridden_at: Option<chrono::DateTime<chrono::Utc>>,
    override_tier: Option<String>,
    override_multiplier: Option<f64>,
    override_notes: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

fn decimal_to_f64(d: Decimal) -> f64 {
    d.to_string().parse().unwrap_or(0.0)
}

impl From<ResponseRow> for ResponseDto {
    fn from(r: ResponseRow) -> Self {
        Self {
            id: r.id,
            registration_id: r.registration_id,
            registration_no: r.registration_no,
            customer_name: r.customer_name,
            product: r.product,
            age: r.age,
            height_cm: r.height_cm.map(decimal_to_f64),
            weight_kg: r.weight_kg.map(decimal_to_f64),
            bmi: r.bmi.map(decimal_to_f64),
            is_smoker: r.is_smoker,
            has_preexisting: r.has_preexisting,
            risk_tier: r.risk_tier,
            premium_multiplier: decimal_to_f64(r.premium_multiplier),
            decision: r.decision,
            decision_reason: r.decision_reason,
            overridden_by: r.overridden_by,
            overridden_at: r.overridden_at,
            override_tier: r.override_tier,
            override_multiplier: r.override_multiplier.map(decimal_to_f64),
            override_notes: r.override_notes,
            created_at: r.created_at,
        }
    }
}

async fn list_responses(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<ResponseDto>>> {
    let product_filter = q.product.clone();
    let status_filter = q.status.clone();
    let offset = q.offset();
    let limit = q.limit();

    // Build query — dynamic WHERE based on filters.
    // Pakai COALESCE pattern untuk optional filter (NULL = no filter).
    let rows: Vec<ResponseRow> = sqlx::query_as(
        r#"
        SELECT ur.id, ur.registration_id, r.registration_no,
               c.full_name AS customer_name,
               r.product,
               ur.age, ur.height_cm, ur.weight_kg, ur.bmi,
               ur.is_smoker, ur.has_preexisting,
               ur.risk_tier, ur.premium_multiplier,
               ur.decision, ur.decision_reason,
               ur.overridden_by, ur.overridden_at,
               ur.override_tier, ur.override_multiplier, ur.override_notes,
               ur.created_at
          FROM underwriting_responses ur
          JOIN registrations r ON r.id = ur.registration_id
          LEFT JOIN customers c ON c.id = r.customer_id
         WHERE ($1::text IS NULL OR r.product = $1)
           AND ($2::text IS NULL OR ur.decision = $2)
         ORDER BY ur.created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&product_filter)
    .bind(&status_filter)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    // Count total.
    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)::bigint
          FROM underwriting_responses ur
          JOIN registrations r ON r.id = ur.registration_id
         WHERE ($1::text IS NULL OR r.product = $1)
           AND ($2::text IS NULL OR ur.decision = $2)
        "#,
    )
    .bind(&product_filter)
    .bind(&status_filter)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(Page {
        data: rows.into_iter().map(Into::into).collect(),
        page: q.page(),
        page_size: q.page_size(),
        total: total.0,
    }))
}

async fn get_response(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ResponseDto>> {
    let row: Option<ResponseRow> = sqlx::query_as(
        r#"
        SELECT ur.id, ur.registration_id, r.registration_no,
               c.full_name AS customer_name,
               r.product,
               ur.age, ur.height_cm, ur.weight_kg, ur.bmi,
               ur.is_smoker, ur.has_preexisting,
               ur.risk_tier, ur.premium_multiplier,
               ur.decision, ur.decision_reason,
               ur.overridden_by, ur.overridden_at,
               ur.override_tier, ur.override_multiplier, ur.override_notes,
               ur.created_at
          FROM underwriting_responses ur
          JOIN registrations r ON r.id = ur.registration_id
          LEFT JOIN customers c ON c.id = r.customer_id
         WHERE ur.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let row = row.ok_or_else(|| AppError::NotFound(format!("response not found: {id}")))?;
    Ok(Json(row.into()))
}

#[derive(Debug, Deserialize)]
struct OverrideRequest {
    /// Preset tier selector. Closed set: standard | loaded | heavily_loaded | declined.
    override_tier: String,
    override_notes: String,
}

#[derive(Debug, Serialize)]
struct OverrideResponse {
    id: Uuid,
    override_tier: String,
    override_multiplier: f64,
    override_notes: String,
    overridden_by: Uuid,
    overridden_at: chrono::DateTime<chrono::Utc>,
}

async fn override_response(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<Uuid>,
    Json(req): Json<OverrideRequest>,
) -> AppResult<Json<OverrideResponse>> {
    // Validate tier.
    let new_tier = RiskTier::parse(&req.override_tier)
        .ok_or_else(|| AppError::Validation(format!("invalid tier: {}", req.override_tier)))?;

    // Lookup response + original product untuk multiplier lookup.
    let row: Option<(Uuid, String, String)> = sqlx::query_as(
        r#"
        SELECT ur.id, r.product, ur.risk_tier
          FROM underwriting_responses ur
          JOIN registrations r ON r.id = ur.registration_id
         WHERE ur.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (_, product_code, _) = row.ok_or_else(|| AppError::NotFound(format!("response not found: {id}")))?;

    // Lookup multiplier dari tier definition (admin's preset tiers).
    let mult_dec: Option<Decimal> = sqlx::query_scalar(
        r#"
        SELECT premium_multiplier
          FROM underwriting_loading_tiers
         WHERE product_code = $1 AND tier_code = $2
        "#,
    )
    .bind(&product_code)
    .bind(req.override_tier.as_str())
    .fetch_optional(&state.pool)
    .await?;
    let mult_dec = mult_dec.ok_or_else(|| {
        AppError::Validation(format!(
            "tier '{}' not configured for product {}",
            req.override_tier, product_code
        ))
    })?;
    let mult_f = mult_dec.to_string().parse::<f64>().unwrap_or(1.0);

    // Update underwriting_responses + registrations.underwriting_status.
    let mut tx = state.pool.begin().await?;

    let now = chrono::Utc::now();
    let admin_uuid = Uuid::parse_str(&admin.sub).map_err(|_| AppError::Unauthorized)?;
    sqlx::query(
        r#"
        UPDATE underwriting_responses
           SET overridden_by = $1,
               overridden_at = $2,
               override_tier = $3,
               override_multiplier = $4,
               override_notes = $5
         WHERE id = $6
        "#,
    )
    .bind(admin_uuid)
    .bind(now)
    .bind(req.override_tier.as_str())
    .bind(mult_dec)
    .bind(&req.override_notes)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    let new_reg_status = match new_tier {
        RiskTier::Declined => "declined",
        _ => "approved",
    };
    sqlx::query(
        r#"
        UPDATE registrations
           SET underwriting_override_applied = TRUE,
               underwriting_status = $1
         WHERE underwriting_response_id = $2
        "#,
    )
    .bind(new_reg_status)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    // Audit.
    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &admin.sub,
            action: "underwriting.override",
            entity_type: "underwriting_response",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({
                "override_tier": req.override_tier,
                "override_multiplier": mult_f,
                "notes": req.override_notes,
            })),
            ip_address: None,
        },
    )
    .await;

    Ok(Json(OverrideResponse {
        id,
        override_tier: req.override_tier,
        override_multiplier: mult_f,
        override_notes: req.override_notes,
        overridden_by: admin_uuid,
        overridden_at: now,
    }))
}

// Force IntoResponse import — used indirectly via `Json(...)`.
#[allow(dead_code)]
fn _check_into_response<T: IntoResponse>(_: &T) {}