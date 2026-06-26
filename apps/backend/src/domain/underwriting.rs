//! Underwriting domain types (spec §FS-XX underwriting).
//!
//! MVP scope (sesuai diskusi product 2026-06-25):
//!   - 3 tier: standard | loaded | heavily_loaded | declined
//!   - 5 questionnaire fields: age, height, weight, smoker, pre-existing
//!   - Per-product config (admin toggle)
//!   - Auto-decide only (no manual review queue)
//!   - Simple override: preset tier selector (no custom multiplier)
//!
//! Module ini pure types + validators — TIDAK ada IO. Risk evaluation
//! logic ada di `services/underwriting.rs`.

use serde::{Deserialize, Serialize};

/// Risk tier — closed set. Decimal value mapping:
///   standard       → 1.00× (no loading)
///   loaded         → 1.25-1.30× (mild risk)
///   heavily_loaded → 1.50-1.75× (significant risk)
///   declined       → 0.00× (no coverage — invoice NOT generated)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskTier {
    Standard,
    Loaded,
    HeavilyLoaded,
    Declined,
}

impl RiskTier {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Standard => "standard",
            Self::Loaded => "loaded",
            Self::HeavilyLoaded => "heavily_loaded",
            Self::Declined => "declined",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "standard" => Some(Self::Standard),
            "loaded" => Some(Self::Loaded),
            "heavily_loaded" => Some(Self::HeavilyLoaded),
            "declined" => Some(Self::Declined),
            _ => None,
        }
    }
}

/// Auto-decision result. Mirrors `risk_tier` kecuali declined selalu
/// punya decision `auto_declined` regardless of tier_code mapping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutoDecision {
    AutoApproved, // standard | loaded | heavily_loaded
    AutoDeclined,
}

impl AutoDecision {
    pub fn from_tier(tier: RiskTier) -> Self {
        match tier {
            RiskTier::Declined => Self::AutoDeclined,
            _ => Self::AutoApproved,
        }
    }
}

/// Product underwriting config — mirrors table `product_underwriting_configs`.
#[derive(Debug, Clone, Serialize)]
pub struct ProductUnderwritingConfig {
    pub id: uuid::Uuid,
    pub product_code: String,
    pub enabled: bool,
    pub age_min: i16,
    pub age_max: i16,
    pub require_bmi: bool,
    pub bmi_min: Option<sqlx::types::Decimal>,
    pub bmi_max: Option<sqlx::types::Decimal>,
    pub require_smoker: bool,
    pub require_preexisting: bool,
}

/// Loading tier — mirrors table `underwriting_loading_tiers`. `criteria`
/// adalah JSONB rule definition, di-evaluate oleh risk engine.
///
/// Schema fleksibel: criteria bisa punya `always_match: true` (catch-all)
/// ATAU `match_mode: any|all` + `conditions: [...]` array. Lihat
/// migration 0020 seed untuk contoh konkret.
#[derive(Debug, Clone, Serialize)]
pub struct LoadingTier {
    pub id: uuid::Uuid,
    pub product_code: String,
    pub tier_code: String,
    pub tier_name: String,
    pub premium_multiplier: sqlx::types::Decimal,
    pub criteria: serde_json::Value,
    pub display_order: i16,
}

/// Customer responses — mirrors table `underwriting_responses`.
/// Fields nullable sesuai config.require_* booleans (validated upstream).
#[derive(Debug, Clone, Serialize)]
pub struct UnderwritingResponse {
    pub id: uuid::Uuid,
    pub registration_id: uuid::Uuid,
    pub age: Option<i16>,
    pub height_cm: Option<sqlx::types::Decimal>,
    pub weight_kg: Option<sqlx::types::Decimal>,
    pub bmi: Option<sqlx::types::Decimal>,
    pub is_smoker: Option<bool>,
    pub has_preexisting: Option<bool>,
    pub risk_tier: String,
    pub premium_multiplier: sqlx::types::Decimal,
    pub decision: String,
    pub decision_reason: String,
    pub override_tier: Option<String>,
    pub override_multiplier: Option<sqlx::types::Decimal>,
    pub override_notes: Option<String>,
    pub overridden_by: Option<uuid::Uuid>,
    pub overridden_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Validation errors untuk questionnaire responses. Returned as 400
/// to customer via service layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "field", rename_all = "snake_case")]
pub enum ResponseValidationError {
    Age { value: i16, min: i16, max: i16 },
    Height { value: f64, min: f64, max: f64 },
    Weight { value: f64, min: f64, max: f64 },
    Bmi { value: f64, min: f64, max: f64 },
    SmokerRequired,
    PreexistingRequired,
}

impl ResponseValidationError {
    pub fn message(&self) -> String {
        match self {
            Self::Age { value, min, max } => {
                format!("usia {value} di luar rentang yang diizinkan ({min}-{max})")
            }
            Self::Height { value, min, max } => {
                format!("tinggi {value} cm di luar rentang realistis ({min}-{max} cm)")
            }
            Self::Weight { value, min, max } => {
                format!("berat {value} kg di luar rentang realistis ({min}-{max} kg)")
            }
            Self::Bmi { value, min, max } => {
                format!("BMI {value} di luar rentang yang diizinkan ({min}-{max})")
            }
            Self::SmokerRequired => "status perokok wajib diisi untuk produk ini".to_string(),
            Self::PreexistingRequired => {
                "kondisi pra-eksisting wajib dikonfirmasi untuk produk ini".to_string()
            }
        }
    }
}
