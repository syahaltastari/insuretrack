//! Domain types (entities + state transition helpers).
//!
//! State machines (spec §10) didefinisikan sebagai fungsi `can_transition`.
//! DB CHECK constraint hanya validasi keanggotaan himpunan status, BUKAN
//! legalitas transisi. Service layer wajib panggil validator ini sebelum
//! mengubah status.

pub mod claim;
pub mod identifier;
pub mod inquiry;
pub mod invoice;
pub mod policy;
pub mod registration;
pub mod underwriting;
