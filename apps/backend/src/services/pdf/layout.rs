//! Konstanta layout: dimensi halaman A4, margin, dan posisi table peserta.
//!
//! Semua koordinat PDF dalam milimeter. Origin bottom-left (sesuai
//! konvensi printpdf). y = 0 di bawah halaman, y = 297 di atas.

// ---- Page dimensions (A4 portrait) ------------------------------------------
//
// PAGE_W / PAGE_H / MARGIN_X* di-comment dulu — dipakai oleh section structs
// yang akan di-extract iteratif. Suppress warning dengan `#[allow(dead_code)]`.

#[allow(dead_code)]
pub const PAGE_W: f32 = 210.0;
#[allow(dead_code)]
pub const PAGE_H: f32 = 297.0;

// ---- Default margin (kiri/kanan content, top/bottom safe area) ---------------

#[allow(dead_code)]
pub const MARGIN_X: f32 = 20.0;
#[allow(dead_code)]
pub const MARGIN_X_RIGHT: f32 = 190.0;

// ---- Lampiran "DAFTAR PESERTA" ----------------------------------------------
//
// Layout kolom tabel peserta (mm). Total content 170mm — muat A4 portrait
// dengan margin 20mm kiri-kanan. X = posisi kiri kolom; lebar kolom
// diturunkan dari gap antar-x (No 10 + NIK 28 + Nama 50 + TTL 40 + JK
// 12 + Beneficiary 30 = 170).

pub const PARTICIPANT_COL_X: [f32; 6] = [20.0, 30.0, 58.0, 108.0, 148.0, 160.0];
pub const PARTICIPANT_HEADERS: [&str; 6] = [
    "No",
    "NIK",
    "Nama Lengkap",
    "Tempat, Tgl Lahir",
    "JK",
    "Beneficiary",
];
pub const PARTICIPANT_ROWS_PER_PAGE: usize = 32;
pub const PARTICIPANT_ROW_HEIGHT: f32 = 6.0;
pub const PARTICIPANT_TABLE_LEFT: f32 = 20.0;
pub const PARTICIPANT_TABLE_RIGHT: f32 = 190.0;
