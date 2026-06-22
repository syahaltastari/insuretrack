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
    /// Breakdown: jumlah registration dengan applicant_type='INSTANSI'.
    pub group_registrations: usize,
    /// Total baris di tabel `registration_participants`. `0` untuk
    /// semua-INDIVIDU run.
    pub participants: usize,
    /// Jumlah registration dengan invoice EXPIRED (lewat due_date,
    /// registration PENDING, tidak ada policy). Termasuk RegistrationOutcome::Expired
    /// customer (1 portal customer ke-4) + variasi random PENDING + idx%6==0.
    pub expired_invoices: usize,
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
        group_registrations: seeded_registrations
            .iter()
            .filter(|r| r.applicant_type == "INSTANSI")
            .count(),
        participants: seeded_registrations
            .iter()
            .map(|r| r.participants.len())
            .sum(),
        expired_invoices: seeded_invoices
            .iter()
            .filter(|i| i.status == "EXPIRED")
            .count(),
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
        report.group_registrations,
        report.participants,
        report.expired_invoices,
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
    // Tiap customer di-tag dengan applicant_type dari registration dia:
    //   - "individu": ada registration INDIVIDU
    //   - "instansi": ada registration INSTANSI (sebagai representative)
    // Customer bisa punya keduanya (multiple registrations). Distinct
    // sort supaya output stabil antar run.
    use std::collections::BTreeSet;
    let portal_creds: Vec<printer::PortalCredWithTags> = seeded_customers
        .iter()
        .filter_map(|c| {
            c.portal_password.as_ref().map(|pw| {
                // Kumpulkan distinct applicant_type dari registrations
                // yang customer ini buat. Urutkan deterministik (BTreeSet
                // → alphabetical) supaya output stabil.
                let mut tags = BTreeSet::new();
                for reg in &seeded_registrations {
                    if reg.customer_id == c.id {
                        tags.insert(reg.applicant_type.to_lowercase());
                    }
                }
                printer::PortalCredWithTags {
                    email: c.email.clone(),
                    password: pw.clone(),
                    full_name: c.full_name.clone(),
                    tags: tags.into_iter().collect(),
                }
            })
        })
        .collect();
    printer::print_portal_credentials(&portal_creds);

    Ok(report)
}
