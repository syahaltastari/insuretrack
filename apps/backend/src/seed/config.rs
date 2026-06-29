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
    /// Default ~50 registrations / 30 customers, 2-3s wall time.
    Demo,
    /// High volume, no PDFs, minimal variety.
    /// Default 1000 registrations / 600 customers, ~20s wall time
    /// (verified on Windows native Postgres 18 + WSL cargo build).
    /// Skips PDF rendering entirely to keep load-test cheap.
    Load,
}

#[derive(Debug, Clone)]
pub struct Counts {
    pub(crate) customers: usize,
    pub(crate) registrations: usize,
    pub(crate) customers_with_portal: usize,
    /// Proporsi registration yang berupa Instansi (group). 0.0..=1.0.
    /// Default 0.2 (20% Instansi, 80% Individu).
    pub(crate) group_ratio: f32,
    /// Minimum peserta per Instansi registration (inclusive).
    pub(crate) min_participants: usize,
    /// Maximum peserta per Instansi registration (inclusive).
    pub(crate) max_participants: usize,
}

#[derive(Debug, Clone)]
pub struct SeedConfig {
    pub(crate) mode: SeedMode,
    pub(crate) reset: bool,
    pub(crate) dry_run: bool,
    pub(crate) counts: Counts,
    pub(crate) months_back: i32,
    pub(crate) claims_ratio: f32,
    pub(crate) upload_dir: String,
}

/// Build config dari raw CLI values (dipakai `bin/seed.rs`).
///
/// `upload_dir_override` (dari CLI `--upload-dir`) menang dari env var
/// `UPLOAD_DIR`; kalau None, pakai env var, fallback ke `./uploads`.
/// Penting karena `.env` lokal set `UPLOAD_DIR=/var/uploads` (path
/// Linux container) yang tidak valid di Windows native dev.
///
/// Validate: `min_participants <= max_participants` (panic kalau
/// terbalik), `0.0 <= group_ratio <= 1.0` (clamp di luar range).
#[allow(clippy::too_many_arguments)]
pub fn build_config(
    mode: SeedMode,
    reset: bool,
    dry_run: bool,
    customers: usize,
    registrations: usize,
    customers_with_portal: usize,
    group_ratio: f32,
    min_participants: usize,
    max_participants: usize,
    months_back: i32,
    claims_ratio: f32,
    upload_dir_override: Option<String>,
) -> SeedConfig {
    if min_participants > max_participants {
        panic!(
            "--min-participants ({min_participants}) must be <= --max-participants ({max_participants})"
        );
    }
    // Clamp group_ratio ke [0.0, 1.0] — silent karena user mungkin
    // eksperimen dengan nilai out-of-range untuk lihat efeknya.
    let group_ratio = group_ratio.clamp(0.0, 1.0);

    let counts = match mode {
        SeedMode::Demo => Counts {
            customers,
            registrations,
            customers_with_portal: customers_with_portal.min(customers),
            group_ratio,
            min_participants,
            max_participants,
        },
        SeedMode::Load => Counts {
            customers: 600,
            registrations: 1000,
            customers_with_portal: 5,
            // Load mode pakai nilai yang sama — distribusi tetap representatif.
            group_ratio,
            min_participants,
            max_participants,
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
