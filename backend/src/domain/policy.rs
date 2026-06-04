//! Policy state machine (spec §10.3).
//!   ACTIVE --premium not maintained--> LAPSED
//!   ACTIVE --term ends--> EXPIRED

pub fn can_transition(from: &str, to: &str) -> bool {
    matches!((from, to), ("ACTIVE", "LAPSED") | ("ACTIVE", "EXPIRED"))
}
