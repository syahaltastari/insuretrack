//! PDF rendering untuk e-Policy, Invoice, Receipt.
//!
//! Submodule structure:
//! - `inputs` — 4 input structs (PolicyPdfInput, InvoicePdfInput, ReceiptPdfInput, ParticipantSummary)
//! - `theme` — color constants + ID_MONTHS (brand palette)
//! - `layout` — page dimensions + participant table positions
//! - `fonts` — Fonts bundle (Helvetica variants) loaded sekali per renderer
//! - `helpers` — drawing primitives + format_idr/format_date_id/truncate/wrap_text
//! - `sections` — composable section building blocks (HeaderBar, TotalBox, dll — extraction in progress)
//! - `policy`, `invoice`, `receipt` — 3 orchestrators
//!
//! Public API (re-exported untuk caller): 3 render functions + 4 input types.
//! Internal: helpers, sections, theme, layout, fonts — semua `pub(crate)` atau private.

mod fonts;
mod helpers;
mod inputs;
mod layout;
mod theme;

pub mod sections;

mod invoice;
mod policy;
mod receipt;

#[cfg(test)]
mod tests_fixtures;

pub use inputs::{InvoicePdfInput, ParticipantSummary, PolicyPdfInput, ReceiptPdfInput};
pub use invoice::render_invoice;
pub use policy::render;
pub use receipt::render_receipt;
