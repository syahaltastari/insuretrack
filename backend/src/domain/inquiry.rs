//! Inquiry state machine (spec §10.5).
//!   OPEN --admin responds--> ANSWERED --resolved--> CLOSED

pub fn can_transition(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("OPEN", "ANSWERED") | ("ANSWERED", "CLOSED") | ("OPEN", "CLOSED")
    )
}
