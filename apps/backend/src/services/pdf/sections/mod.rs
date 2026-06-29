//! Sections — building block PDF yang bisa di-compose jadi satu halaman.
//!
//! Setiap section = struct/enum dengan `height()` + `render(layer, fonts, top_y) -> bottom_y`.
//! Pattern ini dibuat supaya orchestrator cukup track `y` cursor.

pub(crate) mod beneficiary_box;
pub(crate) mod benefit_list;
pub(crate) mod company_box;
pub(crate) mod coverage_table;
pub(crate) mod footer_bar;
pub(crate) mod footer_notice;
pub(crate) mod header_bar;
pub(crate) mod info_boxes;
pub(crate) mod participants_table;
pub(crate) mod terms_list;
pub(crate) mod title_status;
pub(crate) mod total_box;
pub(crate) mod two_column_card;
