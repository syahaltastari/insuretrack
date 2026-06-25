//! Public underwriting endpoints (no auth, customer-facing).
//!
//! Mounted at /api/public/underwriting. Spec §8.1 (extension).
//!
//!   GET  /api/public/underwriting/:product_code/config
//!     → Returns config (enabled + required fields + ranges).
//!       Customer hits this to know which fields to show in questionnaire.
//!       Returns 404 kalau underwriting disabled (product not in table
//!       OR enabled = FALSE).
//!
//!   POST /api/public/underwriting/:reg_no/submit
//!     → Customer submits questionnaire responses. Backend runs risk
//!       engine, returns assessment result (tier + multiplier + reason).
//!       Updates registrations.underwriting_status accordingly.

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::str::FromStr;
use uuid::Uuid;

use crate::{
    domain::underwriting::{AutoDecision, LoadingTier, ProductUnderwritingConfig},
    error::{AppError, AppResult},
    services::{
        audit::{write as audit_write, AuditEntry},
        underwriting as risk_engine,
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/underwriting/:product_code/config",
            get(get_config),
        )
        .route(
            "/underwriting/:reg_no/submit",
            post(submit_responses),
        )
}

// ============================================================
// GET /api/public/underwriting/{productCode}/config
// ============================================================
//
// Return shape: enabled flag + fields needed. Kalau disabled → 404
// (treat as "tidak ada underwriting untuk product ini").

#[derive(Debug, Serialize)]
struct ConfigResponse {
    product_code: String,
    enabled: bool,
    age_min: i16,
    age_max: i16,
    require_bmi: bool,
    bmi_min: Option<f64>,
    bmi_max: Option<f64>,
    require_smoker: bool,
    require_preexisting: bool,
}

async fn get_config(
    State(state): State<AppState>,
    Path(product_code): Path<String>,
) -> AppResult<Json<ConfigResponse>> {
    let row: Option<(Uuid, String, bool, i16, i16, bool, Option<Decimal>, Option<Decimal>, bool, bool)> =
        sqlx::query_as(
            r#"
            SELECT id, product_code, enabled, age_min, age_max,
                   require_bmi, bmi_min, bmi_max,
                   require_smoker, require_preexisting
              FROM product_underwriting_configs
             WHERE product_code = $1
            "#,
        )
        .bind(&product_code)
        .fetch_optional(&state.pool)
        .await?;

    let (_, _, enabled, age_min, age_max, require_bmi, bmi_min, bmi_max, require_smoker, require_preexisting) =
        row.ok_or_else(|| AppError::NotFound(format!("no underwriting config for product {product_code}")))?;

    if !enabled {
        // 404 by convention — caller treats as "product tidak butuh underwriting".
        return Err(AppError::NotFound(format!("underwriting disabled for product {product_code}")));
    }

    Ok(Json(ConfigResponse {
        product_code,
        enabled,
        age_min,
        age_max,
        require_bmi,
        bmi_min: bmi_min.and_then(|d| f64::from_str(&d.to_string()).ok()),
        bmi_max: bmi_max.and_then(|d| f64::from_str(&d.to_string()).ok()),
        require_smoker,
        require_preexisting,
    }))
}

// ============================================================
// POST /api/public/underwriting/{regNo}/submit
// ============================================================
//
// Submit questionnaire. Backend computes BMI, evaluates tier, returns
// assessment. Updates registrations.underwriting_status + writes
// underwriting_responses row.

#[derive(Debug, Deserialize)]
struct SubmitRequest {
    age: i16,
    /// Required kalau config.require_bmi = TRUE (cm).
    height_cm: Option<f64>,
    weight_kg: Option<f64>,
    is_smoker: Option<bool>,
    has_preexisting: Option<bool>,
}

#[derive(Debug, Serialize)]
struct AssessmentResponse {
    risk_tier: String,
    premium_multiplier: f64,
    decision: String,
    decision_reason: String,
    bmi: Option<f64>,
    /// Echo back ke customer untuk display — multiplier × base price.
    /// Base price calculation ada di frontend (product plan cost).
    /// Backend tidak hitung base price karena plan-specific.
    assessment_id: Uuid,
}

async fn submit_responses(
    State(state): State<AppState>,
    Path(reg_no): Path<String>,
    Json(req): Json<SubmitRequest>,
) -> AppResult<Json<AssessmentResponse>> {
    // 1. Lookup registration + lock row (FOR UPDATE) supaya idempotent
    //    kalau customer double-submit.
    let reg_row: Option<(Uuid, String, String)> = sqlx::query_as(
        r#"
        SELECT id, product, underwriting_status
          FROM registrations
         WHERE registration_no = $1
         FOR UPDATE
        "#,
    )
    .bind(&reg_no)
    .fetch_optional(&state.pool)
    .await?;

    let (reg_id, product_code, current_status) = reg_row.ok_or_else(|| {
        AppError::NotFound(format!("registration {reg_no} not found"))
    })?;

    // Reject kalau underwriting udah selesai (avoid double-submit
    // accidental). Customer mau re-do harus contact admin.
    if matches!(current_status.as_str(), "approved" | "declined") {
        return Err(AppError::Conflict(format!(
            "underwriting sudah final untuk registration ini (status: {current_status})"
        )));
    }

    // 2. Load product config.
    let config = load_config(&state.pool, &product_code).await?;
    if !config.enabled {
        return Err(AppError::Validation(format!(
            "underwriting disabled untuk product {product_code}, tidak perlu submit questionnaire"
        )));
    }

    // 3. Validate responses (pure, no IO).
    if let Some(err) = risk_engine::validate_responses(
        &config,
        Some(req.age),
        req.height_cm,
        req.weight_kg,
        req.is_smoker,
        req.has_preexisting,
    ) {
        return Err(AppError::Validation(err.message()));
    }

    // 4. Compute BMI (kalau require_bmi).
    let bmi = if config.require_bmi {
        let h = req.height_cm.unwrap_or(0.0);
        let w = req.weight_kg.unwrap_or(0.0);
        risk_engine::compute_bmi(h, w)
    } else {
        None
    };

    // 5. Load product tiers (sorted by display_order).
    let tiers = load_tiers(&state.pool, &product_code).await?;

    // 6. Evaluate tier.
    let (tier, multiplier, reason) = risk_engine::evaluate_tier(
        &tiers,
        Some(req.age),
        bmi,
        req.is_smoker,
        req.has_preexisting,
    );
    let decision = AutoDecision::from_tier(tier);

    // 7. Persist underwriting_responses + update registration. Wrap in
    //    transaction supaya atomic (kalau salah satu fail, rollback).
    let mut tx = state.pool.begin().await?;

    // Convert multiplier ke Decimal untuk DB.
    let multiplier_dec = Decimal::from_f64(multiplier).unwrap_or(Decimal::from(1));

    let bmi_decimal = bmi.and_then(|b| Decimal::from_f64(b));

    let response_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO underwriting_responses
          (registration_id, age, height_cm, weight_kg, bmi,
           is_smoker, has_preexisting,
           risk_tier, premium_multiplier, decision, decision_reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (registration_id) DO UPDATE SET
          age = EXCLUDED.age,
          height_cm = EXCLUDED.height_cm,
          weight_kg = EXCLUDED.weight_kg,
          bmi = EXCLUDED.bmi,
          is_smoker = EXCLUDED.is_smoker,
          has_preexisting = EXCLUDED.has_preexisting,
          risk_tier = EXCLUDED.risk_tier,
          premium_multiplier = EXCLUDED.premium_multiplier,
          decision = EXCLUDED.decision,
          decision_reason = EXCLUDED.decision_reason
        RETURNING id
        "#,
    )
    .bind(reg_id)
    .bind(req.age)
    .bind(req.height_cm.and_then(|h| Decimal::from_f64(h)))
    .bind(req.weight_kg.and_then(|w| Decimal::from_f64(w)))
    .bind(bmi_decimal)
    .bind(req.is_smoker)
    .bind(req.has_preexisting)
    .bind(tier.as_str())
    .bind(multiplier_dec)
    .bind(decision_label(decision))
    .bind(&reason)
    .fetch_one(&mut *tx)
    .await?;

    // Update registration status.
    let new_status = match decision {
        AutoDecision::AutoApproved => "approved",
        AutoDecision::AutoDeclined => "declined",
    };
    sqlx::query(
        r#"
        UPDATE registrations
           SET underwriting_status = $1,
               underwriting_response_id = $2
         WHERE id = $3
        "#,
    )
    .bind(new_status)
    .bind(response_id)
    .bind(reg_id)
    .execute(&mut *tx)
    .await?;

    // Audit log (best-effort — tidak rollback kalau audit fail).
    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: "customer",
            action: "underwriting.submit",
            entity_type: "registration",
            entity_id: Some(reg_id),
            metadata: Some(serde_json::json!({
                "registration_no": reg_no,
                "product": product_code,
                "risk_tier": tier.as_str(),
                "decision": decision_label(decision),
                "reason": reason,
            })),
            ip_address: None,
        },
    )
    .await;

    tx.commit().await?;

    Ok(Json(AssessmentResponse {
        risk_tier: tier.as_str().to_string(),
        premium_multiplier: multiplier,
        decision: decision_label(decision).to_string(),
        decision_reason: reason,
        bmi,
        assessment_id: response_id,
    }))
}

// ============================================================
// DB helpers
// ============================================================

async fn load_config(
    pool: &sqlx::PgPool,
    product_code: &str,
) -> AppResult<ProductUnderwritingConfig> {
    let row = sqlx::query(
        r#"
        SELECT id, product_code, enabled, age_min, age_max,
               require_bmi, bmi_min, bmi_max,
               require_smoker, require_preexisting
          FROM product_underwriting_configs
         WHERE product_code = $1
        "#,
    )
    .bind(product_code)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("config not found for {product_code}")))?;

    Ok(ProductUnderwritingConfig {
        id: row.try_get("id")?,
        product_code: row.try_get("product_code")?,
        enabled: row.try_get("enabled")?,
        age_min: row.try_get("age_min")?,
        age_max: row.try_get("age_max")?,
        require_bmi: row.try_get("require_bmi")?,
        bmi_min: row.try_get("bmi_min")?,
        bmi_max: row.try_get("bmi_max")?,
        require_smoker: row.try_get("require_smoker")?,
        require_preexisting: row.try_get("require_preexisting")?,
    })
}

async fn load_tiers(
    pool: &sqlx::PgPool,
    product_code: &str,
) -> AppResult<Vec<LoadingTier>> {
    let rows = sqlx::query(
        r#"
        SELECT id, product_code, tier_code, tier_name,
               premium_multiplier, criteria, display_order
          FROM underwriting_loading_tiers
         WHERE product_code = $1
         ORDER BY display_order ASC
        "#,
    )
    .bind(product_code)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| LoadingTier {
            id: row.try_get("id").unwrap_or_default(),
            product_code: row.try_get("product_code").unwrap_or_default(),
            tier_code: row.try_get("tier_code").unwrap_or_default(),
            tier_name: row.try_get("tier_name").unwrap_or_default(),
            premium_multiplier: row.try_get("premium_multiplier").unwrap_or(Decimal::from(1)),
            criteria: row.try_get("criteria").unwrap_or(serde_json::json!({})),
            display_order: row.try_get("display_order").unwrap_or(99),
        })
        .collect())
}

fn decision_label(d: AutoDecision) -> &'static str {
    match d {
        AutoDecision::AutoApproved => "auto_approved",
        AutoDecision::AutoDeclined => "auto_declined",
    }
}

// (No compile-time check needed — ResponseValidationError derives
// Serialize, verified via #[derive(Serialize)] di domain/underwriting.rs.)