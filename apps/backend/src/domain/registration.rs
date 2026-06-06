//! Registration state machine (spec §10.2).
//!   PENDING --invoice paid--> PAID --policy issued--> ISSUED
//!   PENDING --voided--> CANCELLED

pub fn can_transition(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("PENDING", "PAID")
            | ("PENDING", "CANCELLED")
            | ("PAID", "ISSUED")
    )
}
