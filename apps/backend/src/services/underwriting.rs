//! Underwriting risk engine — pure logic, no IO.
//!
//! MVP flow (sesuai diskusi product):
//!   1. validate_responses(config, raw_responses) → Option<ValidationError>
//!   2. compute_bmi(height, weight) → f64
//!   3. evaluate_tier(tiers, computed_fields) → (RiskTier, multiplier, reason)
//!   4. compute_decision(tier) → AutoDecision
//!
//! Tier evaluation: iterate tiers by `display_order` ASC, return first
//! tier yang criteria-nya match dengan responses. Tier terakhir
//! (`always_match: true`) selalu jadi fallback kalau tidak ada match.
//!
//! criteria JSONB schema (defined di migration 0020 seed):
//!   { "always_match": true }                                  — catch-all
//!   { "conditions": [...], "match_mode": "any" | "all" }       — rule
//!
//! Condition schema:
//!   { "field": "age"|"bmi"|"is_smoker"|"has_preexisting",
//!     "op":    "eq"|"gt"|"lt"|"between",
//!     "value": <scalar>,            // for eq/gt/lt
//!     "min":   <scalar>, "max": <scalar>   // for between
//!   }
//!
//! Semua service functions pure (no DB, no async). DB access di
//! `routes/underwriting.rs` layer yang panggil service ini.

use crate::domain::underwriting::{
    ProductUnderwritingConfig, ResponseValidationError, RiskTier,
};

/// Compute BMI dari tinggi (cm) + berat (kg). Round ke 1 desimal.
///
/// Formula: BMI = weight_kg / (height_m)^2 = weight_kg / (height_cm / 100)^2
/// Return None kalau height <= 0 (avoid division by zero — caught by
/// validation upstream tapi defensive di sini juga).
pub fn compute_bmi(height_cm: f64, weight_kg: f64) -> Option<f64> {
    if height_cm <= 0.0 {
        return None;
    }
    let height_m = height_cm / 100.0;
    let bmi = weight_kg / (height_m * height_m);
    Some((bmi * 10.0).round() / 10.0)
}

/// Validate customer responses terhadap product config.
/// Return Some(error) kalau ada field invalid, None kalau semua OK.
pub fn validate_responses(
    config: &ProductUnderwritingConfig,
    age: Option<i16>,
    height_cm: Option<f64>,
    weight_kg: Option<f64>,
    is_smoker: Option<bool>,
    has_preexisting: Option<bool>,
) -> Option<ResponseValidationError> {
    // Age — required untuk semua product (config row enforces range).
    let age_val = age?;
    if age_val < config.age_min || age_val > config.age_max {
        return Some(ResponseValidationError::Age {
            value: age_val,
            min: config.age_min,
            max: config.age_max,
        });
    }

    // BMI fields — required kalau config.require_bmi = TRUE.
    if config.require_bmi {
        let h = height_cm?;
        let w = weight_kg?;
        if !(100.0..=250.0).contains(&h) {
            return Some(ResponseValidationError::Height {
                value: h,
                min: 100.0,
                max: 250.0,
            });
        }
        if !(30.0..=300.0).contains(&w) {
            return Some(ResponseValidationError::Weight {
                value: w,
                min: 30.0,
                max: 300.0,
            });
        }
        // Cross-check BMI against config range.
        if let (Some(bmi_min), Some(bmi_max)) = (config.bmi_min, config.bmi_max) {
            let bmi = compute_bmi(h, w)?;
            let min_f = bmi_min.to_string().parse::<f64>().ok()?;
            let max_f = bmi_max.to_string().parse::<f64>().ok()?;
            if bmi < min_f || bmi > max_f {
                return Some(ResponseValidationError::Bmi {
                    value: bmi,
                    min: min_f,
                    max: max_f,
                });
            }
        }
    }

    // Smoker status — required kalau config.require_smoker = TRUE.
    if config.require_smoker && is_smoker.is_none() {
        return Some(ResponseValidationError::SmokerRequired);
    }

    // Pre-existing — required kalau config.require_preexisting = TRUE.
    if config.require_preexisting && has_preexisting.is_none() {
        return Some(ResponseValidationError::PreexistingRequired);
    }

    None
}

/// Evaluate tier berdasarkan responses. Returns (tier_code, multiplier, reason).
///
/// Iteration: sort tiers by display_order ASC, return first match.
/// Tier dengan `always_match: true` jadi fallback kalau tidak ada match
/// (standard tier selalu punya always_match=true).
pub fn evaluate_tier(
    tiers: &[crate::domain::underwriting::LoadingTier],
    age: Option<i16>,
    bmi: Option<f64>,
    is_smoker: Option<bool>,
    has_preexisting: Option<bool>,
) -> (RiskTier, f64, String) {
    // Sort ascending by display_order (defensive — query mungkin tidak urut).
    let mut sorted: Vec<&crate::domain::underwriting::LoadingTier> = tiers.iter().collect();
    sorted.sort_by_key(|t| t.display_order);

    let mut fallback: Option<&crate::domain::underwriting::LoadingTier> = None;

    for tier in &sorted {
        // Parse criteria — kalau invalid, skip tier (defensive).
        let criteria = match tier.criteria.as_object() {
            Some(c) => c,
            None => continue,
        };

        // Check always_match first (catch-all fallback candidate).
        if criteria
            .get("always_match")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            if fallback.is_none() {
                fallback = Some(tier);
            }
            continue;
        }

        // Evaluate conditions.
        if matches_criteria(criteria, age, bmi, is_smoker, has_preexisting) {
            let tier_enum = RiskTier::parse(&tier.tier_code).unwrap_or(RiskTier::Standard);
            let mult = decimal_to_f64(&tier.premium_multiplier);
            let reason = build_reason(tier_enum, age, bmi, is_smoker);
            return (tier_enum, mult, reason);
        }
    }

    // No tier matched → use fallback (standard tier). Kalau somehow
    // tidak ada fallback (admin misconfig), return standard 1.0×.
    match fallback {
        Some(tier) => {
            let mult = decimal_to_f64(&tier.premium_multiplier);
            let reason = "Profil dalam batas standar".to_string();
            (RiskTier::Standard, mult, reason)
        }
        None => {
            // Admin misconfig — no always_match tier. Fail safe to standard.
            (
                RiskTier::Standard,
                1.0,
                "Konfigurasi underwriting belum lengkap (no fallback tier)".to_string(),
            )
        }
    }
}

/// Check apakah criteria object match dengan customer responses.
fn matches_criteria(
    criteria: &serde_json::Map<String, serde_json::Value>,
    age: Option<i16>,
    bmi: Option<f64>,
    is_smoker: Option<bool>,
    _has_preexisting: Option<bool>,
) -> bool {
    let conditions = match criteria.get("conditions").and_then(|v| v.as_array()) {
        Some(c) => c,
        None => return false,
    };

    let match_mode = criteria
        .get("match_mode")
        .and_then(|v| v.as_str())
        .unwrap_or("any");

    let mut any_match = false;
    let mut all_match = true;
    let mut any_evaluated = false;

    for cond in conditions {
        let cond_obj = match cond.as_object() {
            Some(c) => c,
            None => continue,
        };
        any_evaluated = true;

        let field = cond_obj.get("field").and_then(|v| v.as_str()).unwrap_or("");
        let op = cond_obj.get("op").and_then(|v| v.as_str()).unwrap_or("eq");

        let result = match (field, op) {
            ("age", "between") => {
                let min = cond_obj.get("min").and_then(|v| v.as_i64()).unwrap_or(0) as i16;
                let max = cond_obj.get("max").and_then(|v| v.as_i64()).unwrap_or(0) as i16;
                age.map(|a| a >= min && a <= max).unwrap_or(false)
            }
            ("age", "gt") => {
                let v = cond_obj.get("value").and_then(|v| v.as_i64()).unwrap_or(0) as i16;
                age.map(|a| a > v).unwrap_or(false)
            }
            ("age", "lt") => {
                let v = cond_obj.get("value").and_then(|v| v.as_i64()).unwrap_or(0) as i16;
                age.map(|a| a < v).unwrap_or(false)
            }
            ("bmi", "between") => {
                let min = cond_obj.get("min").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let max = cond_obj.get("max").and_then(|v| v.as_f64()).unwrap_or(0.0);
                bmi.map(|b| b >= min && b <= max).unwrap_or(false)
            }
            ("bmi", "gt") => {
                let v = cond_obj.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
                bmi.map(|b| b > v).unwrap_or(false)
            }
            ("bmi", "lt") => {
                let v = cond_obj.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
                bmi.map(|b| b < v).unwrap_or(false)
            }
            ("is_smoker", "eq") => {
                let v = cond_obj.get("value").and_then(|v| v.as_bool()).unwrap_or(false);
                is_smoker.map(|s| s == v).unwrap_or(false)
            }
            _ => false,
        };

        if result {
            any_match = true;
        } else {
            all_match = false;
        }
    }

    if !any_evaluated {
        return false;
    }

    match match_mode {
        "all" => all_match,
        _ => any_match,
    }
}

/// Build human-readable reason text untuk UI display.
fn build_reason(tier: RiskTier, age: Option<i16>, bmi: Option<f64>, smoker: Option<bool>) -> String {
    let mut parts = Vec::new();
    match tier {
        RiskTier::Declined => parts.push("Profil di luar jangkauan yang dapat diasuransikan".to_string()),
        RiskTier::HeavilyLoaded => {
            if smoker == Some(true) {
                parts.push("perokok".to_string());
            }
            if let Some(b) = bmi {
                if b >= 30.0 {
                    parts.push(format!("BMI {b} (obesitas)"));
                }
            }
            if let Some(a) = age {
                if a >= 60 {
                    parts.push(format!("usia {a} tahun"));
                }
            }
        }
        RiskTier::Loaded => {
            if let Some(b) = bmi {
                if b >= 27.0 {
                    parts.push(format!("BMI {b} (kelebihan berat badan)"));
                }
            }
            if let Some(a) = age {
                if a >= 55 {
                    parts.push(format!("usia {a} tahun"));
                }
            }
        }
        RiskTier::Standard => {
            parts.push("Profil dalam batas standar".to_string());
        }
    }
    if parts.is_empty() {
        tier.as_str().to_string()
    } else {
        parts.join(" + ")
    }
}

/// Convert sqlx Decimal → f64 (untuk kalkulasi & display). Loss of
/// precision acceptable — multiplier punya 2 desimal cukup.
fn decimal_to_f64(d: &sqlx::types::Decimal) -> f64 {
    d.to_string().parse::<f64>().unwrap_or(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    fn config_default() -> ProductUnderwritingConfig {
        ProductUnderwritingConfig {
            id: uuid::Uuid::new_v4(),
            product_code: "LIFE".to_string(),
            enabled: true,
            age_min: 18,
            age_max: 65,
            require_bmi: true,
            bmi_min: Some(Decimal::new(185, 1)),  // 18.5
            bmi_max: Some(Decimal::new(300, 1)),  // 30.0
            require_smoker: true,
            require_preexisting: true,
        }
    }

    #[test]
    fn bmi_computation_normal() {
        let bmi = compute_bmi(170.0, 70.0).unwrap();
        assert!((bmi - 24.2).abs() < 0.1, "BMI for 170cm/70kg should be ~24.2, got {bmi}");
    }

    #[test]
    fn bmi_zero_height_returns_none() {
        assert!(compute_bmi(0.0, 70.0).is_none());
    }

    #[test]
    fn age_out_of_range_rejected() {
        let cfg = config_default();
        let err = validate_responses(&cfg, Some(70), Some(170.0), Some(70.0), Some(false), Some(false));
        assert!(matches!(err, Some(ResponseValidationError::Age { .. })));
    }

    #[test]
    fn all_valid_passes() {
        let cfg = config_default();
        let err = validate_responses(&cfg, Some(30), Some(170.0), Some(70.0), Some(false), Some(false));
        assert!(err.is_none(), "Expected None, got {:?}", err);
    }

    #[test]
    fn smoker_required_when_config_says_so() {
        let cfg = config_default();
        let err = validate_responses(&cfg, Some(30), Some(170.0), Some(70.0), None, Some(false));
        assert!(matches!(err, Some(ResponseValidationError::SmokerRequired)));
    }
}