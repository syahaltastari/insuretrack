//! Seeder orchestrator.
//!
//! Entry point: `pub async fn run(cfg, pool) -> Result<SeedReport>`.
//!
//! Skeleton step 3: dispatch via mode flag, print plan untuk dry-run,
//! return zero report untuk mode real. Entity seeders (customers,
//! registrations, dst.) akan di-wire di step 4-6.

use std::time::Instant;

use sqlx::PgPool;

use crate::seed::config::SeedConfig;

#[derive(Debug, Clone, Default)]
pub struct SeedReport {
    pub customers: usize,
    pub portal_customers: usize,
    pub registrations: usize,
    pub invoices: usize,
    pub policies: usize,
    pub claims: usize,
    pub inquiries: usize,
    pub email_logs: usize,
    pub audit_logs: usize,
    pub pdf_files_written: usize,
    pub duration_ms: u128,
}

pub mod audit_logs;
pub mod claims;
pub mod config;
pub mod customers;
pub mod data;
pub mod email_logs;
pub mod id_card;
pub mod inquiries;
pub mod invoices;
pub mod pdf_writer;
pub mod policies;
pub mod printer;
pub mod registrations;
pub mod reset;

pub async fn run(cfg: SeedConfig, pool: &PgPool) -> anyhow::Result<SeedReport> {
    let start = Instant::now();

    // Pastikan migrations sudah jalan (idempotent — no-op kalau sudah applied).
    // Path macro `sqlx::migrate!` resolve relatif terhadap CARGO_MANIFEST_DIR,
    // jadi cukup `./migrations` (1 level di bawah apps/backend/).
    sqlx::migrate!("./migrations").run(pool).await?;

    if cfg.dry_run {
        printer::print_plan(&cfg);
        return Ok(SeedReport {
            duration_ms: start.elapsed().as_millis(),
            ..Default::default()
        });
    }

    if cfg.reset {
        tracing::info!("resetting dev data tables");
        reset::reset_dev_data(pool).await?;
        // Bersihkan stub KTP di disk supaya tidak numpuk.
        id_card::clean_stubs(&cfg.upload_dir).await?;
    }

    let mut tx = pool.begin().await?;
    let seeded_customers = customers::seed_customers(&mut tx, &cfg).await?;
    let seeded_registrations =
        registrations::seed_registrations(&mut tx, &cfg, &seeded_customers).await?;
    let seeded_invoices = invoices::seed_invoices(&mut tx, &cfg, &seeded_registrations).await?;

    // Extract premium amounts per registration untuk policies.
    let premiums: Vec<rust_decimal::Decimal> = seeded_registrations
        .iter()
        .map(|reg| {
            seeded_invoices
                .iter()
                .find(|inv| inv.registration_id == reg.id)
                .map(|inv| inv.premium_amount)
                .unwrap_or(reg.sum_assured * rust_decimal::Decimal::new(5, 3)) // fallback
        })
        .collect();

    let seeded_policies =
        policies::seed_policies(&mut tx, &cfg, &seeded_registrations, &premiums).await?;
    let seeded_claims = claims::seed_claims(&mut tx, &cfg, &seeded_policies).await?;
    let seeded_inquiries =
        inquiries::seed_inquiries(&mut tx, &cfg, &seeded_customers, &seeded_policies).await?;
    let seeded_emails = email_logs::seed_email_logs(&mut tx, &cfg, &seeded_customers).await?;
    let seeded_audits = audit_logs::seed_audit_logs(
        &mut tx,
        &seeded_customers,
        &seeded_registrations,
        &seeded_invoices,
        &seeded_policies,
        &seeded_claims,
        &seeded_inquiries,
    )
    .await?;
    tx.commit().await?;

    let portal_count = seeded_customers
        .iter()
        .filter(|c| c.portal_password.is_some())
        .count();

    let report = SeedReport {
        customers: seeded_customers.len(),
        portal_customers: portal_count,
        registrations: seeded_registrations.len(),
        invoices: seeded_invoices.len(),
        policies: seeded_policies.len(),
        claims: seeded_claims.len(),
        inquiries: seeded_inquiries.len(),
        email_logs: seeded_emails.len(),
        audit_logs: seeded_audits.len(),
        pdf_files_written: seeded_policies
            .iter()
            .filter(|p| p.pdf_path.is_some())
            .count()
            + seeded_invoices
                .iter()
                .filter(|i| i.pdf_path.is_some())
                .count(),
        duration_ms: start.elapsed().as_millis(),
    };

    printer::print_summary(
        report.customers,
        report.portal_customers,
        report.registrations,
        report.invoices,
        report.policies,
        report.claims,
        report.inquiries,
        report.email_logs,
        report.audit_logs,
        report.pdf_files_written,
        report.duration_ms,
    );

    // Print portal credentials untuk customer dengan akses portal.
    let portal_creds: Vec<(String, String, String)> = seeded_customers
        .iter()
        .filter_map(|c| {
            c.portal_password
                .as_ref()
                .map(|pw| (c.email.clone(), pw.clone(), c.full_name.clone()))
        })
        .collect();
    printer::print_portal_credentials(&portal_creds);

    Ok(report)
}
