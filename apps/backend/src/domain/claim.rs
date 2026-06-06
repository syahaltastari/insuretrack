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
