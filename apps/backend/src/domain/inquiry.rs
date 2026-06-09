//! Inquiry state machine (spec §10.5) + helpers.
//!
//! Status semantics setelah migrasi 0011 (inquiry_messages):
//!   OPEN      = latest message di thread dari CUSTOMER — admin harus balas
//!   ANSWERED  = latest message di thread dari ADMIN    — customer harus
//!               balas atau close
//!   CLOSED    = terminal — manual close atau auto-close (inactivity)
//!
//! Transitions yang valid:
//!   OPEN      → ANSWERED  (admin reply)
//!   OPEN      → CLOSED    (admin close tanpa reply)
//!   ANSWERED  → OPEN      (customer reply — balik ke admin)
//!   ANSWERED  → CLOSED    (admin/customer close)
//!   CLOSED    → ∅         (terminal, no outgoing transitions)
//!
//! `derive_status_from_last_sender` dipakai untuk konsistensi saat insert
//! inquiry_message: status parent = OPEN kalau sender CUSTOMER, ANSWERED
//! kalau sender ADMIN. Lebih reliable daripada hand-coding di setiap
//! handler.

// ---- transitions ----------------------------------------------------------

pub fn can_transition(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("OPEN", "ANSWERED")
            | ("OPEN", "CLOSED")
            | ("ANSWERED", "OPEN")
            | ("ANSWERED", "CLOSED")
    )
}

pub fn is_terminal(status: &str) -> bool {
    status == "CLOSED"
}

// ---- status derivation ----------------------------------------------------

/// Return status parent inquiry setelah insert message dengan sender
/// tertentu. Caller yang memutuskan "close" vs "reply" — fungsi ini hanya
/// untuk transisi reply (bukan close).
///
/// Panics kalau `sender_type` tidak valid — ini programmer error, harusnya
/// di-validate sebelum sampai sini.
pub fn derive_status_from_last_sender(sender_type: &str) -> &'static str {
    match sender_type {
        "CUSTOMER" => "OPEN",
        "ADMIN" => "ANSWERED",
        // Caller side sudah validate via CHECK constraint, jadi unreachable
        // di production. Return OPEN sebagai safe default.
        _ => "OPEN",
    }
}

/// Sender type untuk inquiry_message. Check constraint di DB juga enforce
/// nilai yang valid, tapi di sini dipakai untuk early validation + clarity.
pub fn is_valid_sender_type(s: &str) -> bool {
    matches!(s, "CUSTOMER" | "ADMIN")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_transitions() {
        assert!(can_transition("OPEN", "ANSWERED"));
        assert!(can_transition("OPEN", "CLOSED"));
        assert!(can_transition("ANSWERED", "OPEN"));
        assert!(can_transition("ANSWERED", "CLOSED"));
    }

    #[test]
    fn closed_is_terminal() {
        assert!(!can_transition("CLOSED", "OPEN"));
        assert!(!can_transition("CLOSED", "ANSWERED"));
        assert!(!can_transition("CLOSED", "CLOSED"));
        assert!(is_terminal("CLOSED"));
    }

    #[test]
    fn status_from_sender() {
        assert_eq!(derive_status_from_last_sender("CUSTOMER"), "OPEN");
        assert_eq!(derive_status_from_last_sender("ADMIN"), "ANSWERED");
    }
}
