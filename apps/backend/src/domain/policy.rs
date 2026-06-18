//! Policy state machine (spec §10.3).
//!   ACTIVE --premium not maintained--> LAPSED
//!   ACTIVE --term ends--> EXPIRED

pub fn can_transition(from: &str, to: &str) -> bool {
    matches!((from, to), ("ACTIVE", "LAPSED") | ("ACTIVE", "EXPIRED"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legal_transitions_from_active() {
        assert!(can_transition("ACTIVE", "LAPSED"));
        assert!(can_transition("ACTIVE", "EXPIRED"));
    }

    #[test]
    fn terminal_states_have_no_outgoing_transitions() {
        for from in ["LAPSED", "EXPIRED"] {
            for to in ["ACTIVE", "LAPSED", "EXPIRED"] {
                assert!(
                    !can_transition(from, to),
                    "expected {from}→{to} to be rejected"
                );
            }
        }
    }
}
