//! Sections — building block PDF yang bisa di-compose jadi satu halaman.
//!
//! Setiap section = struct/enum dengan `height()` + `render(layer, fonts, top_y) -> bottom_y`.
//! Pattern ini dibuat supaya orchestrator cukup track `y` cursor.

pub mod beneficiary_box;
pub mod benefit_list;
pub mod company_box;
pub mod coverage_table;
pub mod footer_bar;
pub mod footer_notice;
pub mod header_bar;
pub mod info_boxes;
pub mod participants_table;
pub mod terms_list;
pub mod title_status;
pub mod total_box;
pub mod two_column_card;
