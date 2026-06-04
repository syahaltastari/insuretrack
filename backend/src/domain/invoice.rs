//! Invoice state machine (spec §10.1).
//!   UNPAID --payment confirmed--> PAID
//!   UNPAID --due date passed--> EXPIRED
//!   UNPAID --voided--> CANCELLED

pub fn can_transition(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("UNPAID", "PAID")
            | ("UNPAID", "EXPIRED")
            | ("UNPAID", "CANCELLED")
    )
}
