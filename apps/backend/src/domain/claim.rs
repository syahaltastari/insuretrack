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
