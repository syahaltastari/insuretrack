//! Seeder binary — entry point untuk `cargo run --bin seed`.
//!
//! Parse CLI dengan clap, load .env, build pool, dispatch ke
//! `seed::run()`.

use std::time::Duration;

use clap::Parser;
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use insuretrack_backend::{
    config::Config,
    seed::{self, config::SeedMode},
};

#[derive(Parser, Debug)]
#[command(
    name = "seed",
    about = "Seed dummy data untuk InsureTrack dev database",
    long_about = "Tambahkan dummy data ke database dev InsureTrack. Default: --reset aktif, mode Demo. \
                  Gunakan --load untuk high-volume tanpa PDF. Gunakan --dry-run untuk preview tanpa nulis DB."
)]
struct Cli {
    /// Truncate semua tabel dev dulu sebelum seed (preserve admin_users).
    #[arg(long, default_value_t = true)]
    reset: bool,

    /// Mode load-test: 1000 regs / 600 customers, PDF di-skip.
    #[arg(long, default_value_t = false)]
    load: bool,

    /// Print rencana tanpa nulis ke DB.
    #[arg(long, default_value_t = false)]
    dry_run: bool,

    /// Jumlah registration yang akan di-generate (mode Demo saja).
    #[arg(long, default_value_t = 50)]
    registrations: usize,

    /// Jumlah customer yang akan di-generate (mode Demo saja).
    #[arg(long, default_value_t = 30)]
    customers: usize,

    /// Jumlah customer yang punya akses portal + password (mode Demo saja).
    #[arg(long, default_value_t = 3)]
    customers_with_portal: usize,

    /// Berapa bulan ke belakang data di-spread (untuk identifier prefix).
    #[arg(long, default_value_t = 4)]
    months_back: i32,

    /// Rasio policy yang punya minimal 1 claim (0.0..=1.0).
    #[arg(long, default_value_t = 0.4)]
    claims_ratio: f32,

    /// Override UPLOAD_DIR (default: env var, fallback `./uploads`).
    /// Pakai ini kalau `.env` set `UPLOAD_DIR=/var/uploads` (container)
    /// tapi Anda run seeder di host Windows.
    #[arg(long)]
    upload_dir: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();

    let cli = Cli::parse();
    let mode = if cli.load {
        SeedMode::Load
    } else {
        SeedMode::Demo
    };

    if !cli.dry_run && cli.reset {
        println!("================================================================");
        println!("  WARNING: --reset aktif. Semua data dev (kecuali admin_users)");
        println!("  akan di-TRUNCATE sebelum seed. Backend HARUS tidak running.");
        println!("================================================================");
        println!();
    }

    let cfg = Config::from_env()?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&cfg.database_url)
        .await?;

    let seed_cfg = seed::config::build_config(
        mode,
        cli.reset,
        cli.dry_run,
        cli.customers,
        cli.registrations,
        cli.customers_with_portal,
        cli.months_back,
        cli.claims_ratio,
        cli.upload_dir,
    );

    let report = seed::run(seed_cfg, &pool).await?;
    tracing::info!("seed finished: {:?}", report);

    Ok(())
}
