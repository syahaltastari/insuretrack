//! Konfigurasi seeder — CLI args, mode selection, derived counts.
//!
//! Demo mode (default): data realistis Indonesia, PDF di-render,
//! volume sedang (50 regs / 30 customers). Cocok untuk demo klien
//! dan dev harian.
//!
//! Load mode (`--load`): volume besar (1000 regs / 600 customers),
//! PDF di-skip, variasi state machine minimal. Cocok untuk load
//! test dan pagination stress.

use std::env;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeedMode {
    /// Realistic data, rendered PDFs, moderate volume.
    Demo,
    /// High volume, no PDFs, minimal variety.
    Load,
}

#[derive(Debug, Clone)]
pub struct Counts {
    pub customers: usize,
    pub registrations: usize,
    pub customers_with_portal: usize,
}

#[derive(Debug, Clone)]
pub struct SeedConfig {
    pub mode: SeedMode,
    pub reset: bool,
    pub dry_run: bool,
    pub counts: Counts,
    pub months_back: i32,
    pub claims_ratio: f32,
    pub upload_dir: String,
}

/// Build config dari raw CLI values (dipakai `bin/seed.rs`).
///
/// `upload_dir_override` (dari CLI `--upload-dir`) menang dari env var
/// `UPLOAD_DIR`; kalau None, pakai env var, fallback ke `./uploads`.
/// Penting karena `.env` lokal set `UPLOAD_DIR=/var/uploads` (path
/// Linux container) yang tidak valid di Windows native dev.
pub fn build_config(
    mode: SeedMode,
    reset: bool,
    dry_run: bool,
    customers: usize,
    registrations: usize,
    customers_with_portal: usize,
    months_back: i32,
    claims_ratio: f32,
    upload_dir_override: Option<String>,
) -> SeedConfig {
    let counts = match mode {
        SeedMode::Demo => Counts {
            customers,
            registrations,
            customers_with_portal: customers_with_portal.min(customers),
        },
        SeedMode::Load => Counts {
            customers: 600,
            registrations: 1000,
            customers_with_portal: 5,
        },
    };

    let upload_dir = upload_dir_override
        .or_else(|| env::var("UPLOAD_DIR").ok())
        .unwrap_or_else(|| "./uploads".to_string());

    SeedConfig {
        mode,
        reset,
        dry_run,
        counts,
        months_back,
        claims_ratio,
        upload_dir,
    }
}
