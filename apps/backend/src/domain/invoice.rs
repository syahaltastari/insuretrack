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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legal_transitions_from_unpaid() {
        assert!(can_transition("UNPAID", "PAID"));
        assert!(can_transition("UNPAID", "EXPIRED"));
        assert!(can_transition("UNPAID", "CANCELLED"));
    }

    #[test]
    fn terminal_states_have_no_outgoing_transitions() {
        for from in ["PAID", "EXPIRED", "CANCELLED"] {
            for to in ["UNPAID", "PAID", "EXPIRED", "CANCELLED"] {
                assert!(
                    !can_transition(from, to),
                    "expected {from}→{to} to be rejected"
                );
            }
        }
    }

    #[test]
    fn self_transition_is_rejected() {
        // No-op transitions aren't in the spec — DB CHECK will allow same status,
        // but application layer should treat them as no-ops, not legal moves.
        assert!(!can_transition("UNPAID", "UNPAID"));
    }

    #[test]
    fn unknown_status_is_rejected() {
        assert!(!can_transition("UNKNOWN", "PAID"));
        assert!(!can_transition("UNPAID", "WHATEVER"));
    }
}
