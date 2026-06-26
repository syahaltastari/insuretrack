//! Brand colors untuk semua PDF. Hex → RGB tuple. printpdf butuh (u8, u8, u8)
//! untuk `Color::Rgb`; konversi ke f32 dilakukan di `helpers::set_color`.
//!
//! Source of truth untuk palette ada di `packages/ui/src/styles/globals.css`
//! (Clay-inspired). Update kedua file bersamaan kalau brand color berubah.

pub const C_BLACK: (u8, u8, u8) = (0, 0, 0);
pub const C_WHITE: (u8, u8, u8) = (255, 255, 255);
pub const C_CREAM: (u8, u8, u8) = (250, 249, 247); // --warm-cream
pub const C_OAT_LIGHT: (u8, u8, u8) = (238, 233, 223); // --oat-light
pub const C_OAT_BORDER: (u8, u8, u8) = (218, 212, 200); // --oat-border
pub const C_MATCHA_300: (u8, u8, u8) = (132, 231, 165);
pub const C_POMEGRANATE: (u8, u8, u8) = (252, 121, 129);
pub const C_LEMON_400: (u8, u8, u8) = (248, 204, 101);
pub const C_CHARCOAL: (u8, u8, u8) = (85, 83, 78); // --warm-charcoal
pub const C_SILVER: (u8, u8, u8) = (159, 155, 147); // --warm-silver

/// Nama bulan Indonesia. Dipakai `format_date_id` untuk render tanggal
/// polis/invoice/payment dalam format "9 Juni 2026".
pub const ID_MONTHS: [&str; 12] = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
];
