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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legal_transitions_from_pending() {
        assert!(can_transition("PENDING", "PAID"));
        assert!(can_transition("PENDING", "CANCELLED"));
    }

    #[test]
    fn legal_transition_from_paid() {
        assert!(can_transition("PAID", "ISSUED"));
    }

    #[test]
    fn terminal_states_have_no_outgoing_transitions() {
        // ISSUED & CANCELLED are terminal
        for from in ["ISSUED", "CANCELLED"] {
            for to in ["PENDING", "PAID", "ISSUED", "CANCELLED"] {
                assert!(
                    !can_transition(from, to),
                    "expected {from}→{to} to be rejected"
                );
            }
        }
    }

    #[test]
    fn cannot_skip_paid_stage() {
        // PENDING → ISSUED is illegal (must go through PAID first)
        assert!(!can_transition("PENDING", "ISSUED"));
        // PAID → CANCELLED is illegal (only voidable before payment)
        assert!(!can_transition("PAID", "CANCELLED"));
    }
}
