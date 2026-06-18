//! Claim state machine (spec §10.4).
//!   SUBMITTED --admin opens--> UNDER_REVIEW
//!   UNDER_REVIEW --accepted--> APPROVED --benefit paid--> PAID
//!   SUBMITTED | UNDER_REVIEW --declined--> REJECTED

pub fn can_transition(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("SUBMITTED", "UNDER_REVIEW")
            | ("UNDER_REVIEW", "APPROVED")
            | ("UNDER_REVIEW", "REJECTED")
            | ("SUBMITTED", "REJECTED")
            | ("APPROVED", "PAID")
    )
}

/// Map product code ke default claim type. Dipakai oleh customer flow
/// untuk auto-determine `claims.claim_type` saat submission, sehingga
/// user tidak perlu memilih (sesuai praktik industri — tipe klaim
/// biasanya ditentukan insurer, bukan customer).
///
/// Admin bisa override via PATCH /admin/claims/:id untuk edge case
/// (mis. polis LIFE dengan klaim MATURITY atau SURRENDER, di mana
/// default DEATH tidak tepat).
pub fn default_claim_type_for_product(product_code: &str) -> &'static str {
    match product_code {
        "LIFE" => "DEATH",
        "HEALTH" => "HOSPITALIZATION",
        "PERSONAL_ACCIDENT" => "ACCIDENT",
        // Fallback aman; admin akan override di review kalau salah.
        _ => "ACCIDENT",
    }
}

/// Closed set of valid `claim_type` values, dipakai untuk validasi
/// admin override (PATCH /admin/claims/:id).
pub fn is_valid_claim_type(s: &str) -> bool {
    matches!(
        s,
        "DEATH" | "ACCIDENT" | "HOSPITALIZATION" | "MATURITY" | "SURRENDER"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_transitions() {
        assert!(can_transition("SUBMITTED", "UNDER_REVIEW"));
        assert!(can_transition("SUBMITTED", "REJECTED"));
        assert!(can_transition("UNDER_REVIEW", "APPROVED"));
        assert!(can_transition("UNDER_REVIEW", "REJECTED"));
        assert!(can_transition("APPROVED", "PAID"));
    }

    #[test]
    fn illegal_transitions() {
        // Cannot skip UNDER_REVIEW (must open before approving)
        assert!(!can_transition("SUBMITTED", "APPROVED"));
        // Cannot skip UNDER_REVIEW (must open before rejecting from review)
        assert!(!can_transition("APPROVED", "REJECTED"));
        // Cannot un-pay a paid claim
        assert!(!can_transition("PAID", "APPROVED"));
        assert!(!can_transition("PAID", "REJECTED"));
        // Cannot revert to earlier stages
        assert!(!can_transition("UNDER_REVIEW", "SUBMITTED"));
        assert!(!can_transition("APPROVED", "UNDER_REVIEW"));
    }

    #[test]
    fn terminal_states_have_no_outgoing_transitions() {
        for from in ["REJECTED", "PAID"] {
            for to in ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PAID"] {
                assert!(
                    !can_transition(from, to),
                    "expected {from}→{to} to be rejected"
                );
            }
        }
    }

    #[test]
    fn unknown_status_is_rejected() {
        assert!(!can_transition("UNKNOWN", "UNDER_REVIEW"));
        assert!(!can_transition("SUBMITTED", "WHATEVER"));
    }

    #[test]
    fn default_claim_type_per_product() {
        assert_eq!(default_claim_type_for_product("LIFE"), "DEATH");
        assert_eq!(default_claim_type_for_product("HEALTH"), "HOSPITALIZATION");
        assert_eq!(default_claim_type_for_product("PERSONAL_ACCIDENT"), "ACCIDENT");
    }

    #[test]
    fn default_claim_type_falls_back_to_accident() {
        // Unknown product → ACCIDENT (admin can override in review).
        assert_eq!(default_claim_type_for_product("UNKNOWN"), "ACCIDENT");
        assert_eq!(default_claim_type_for_product(""), "ACCIDENT");
    }

    #[test]
    fn is_valid_claim_type_accepts_known_values() {
        for v in ["DEATH", "ACCIDENT", "HOSPITALIZATION", "MATURITY", "SURRENDER"] {
            assert!(is_valid_claim_type(v), "expected {v} to be valid");
        }
    }

    #[test]
    fn is_valid_claim_type_rejects_unknown() {
        assert!(!is_valid_claim_type("FIRE"));
        assert!(!is_valid_claim_type(""));
        assert!(!is_valid_claim_type("death")); // case-sensitive
    }
}
