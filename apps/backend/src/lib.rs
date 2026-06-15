//! Library crate root untuk InsureTrack backend.
//!
//! File ini ada supaya `src/main.rs` (server) dan `src/bin/seed.rs`
//! (seeder) bisa share module declarations yang sama. Tanpa `lib.rs`,
//! modules yang di-`mod`-kan di main.rs hanya visible di main binary,
//! tidak bisa di-import dari `bin/seed.rs`.
//!
//! Pola: setiap module di-declare sebagai `pub mod` di sini. `main.rs`
//! dan `bin/seed.rs` cukup `use insuretrack_backend::*;` untuk akses
//! semua submodules.

pub mod auth;
pub mod config;
pub mod domain;
pub mod dto;
pub mod error;
pub mod repo;
pub mod routes;
pub mod seed;
pub mod services;
pub mod state;
