//! Console output — ringkasan seeder run + 3 portal credentials.
//!
//! Format sengaja lebar dan berwarna-ish (pakai ASCII art) supaya
//! saat demo / onboarding, output-nya langsung informatif tanpa
//! harus scroll log.

use crate::seed::config::SeedConfig;

pub(crate) fn print_plan(cfg: &SeedConfig) {
    let mode = match cfg.mode {
        crate::seed::config::SeedMode::Demo => "Demo (realistic)",
        crate::seed::config::SeedMode::Load => "Load (high volume)",
    };

    // Estimasi peserta & group registrations.
    let expected_group =
        (cfg.counts.registrations as f32 * cfg.counts.group_ratio).round() as usize;
    let avg_participants = (cfg.counts.min_participants + cfg.counts.max_participants) as f32 / 2.0;
    let expected_participants = (expected_group as f32 * avg_participants).round() as usize;
    let expected_policies = (cfg.counts.registrations - expected_group) + expected_participants;

    println!();
    println!("================================================================");
    println!("  InsureTrack Seeder — DRY RUN (no DB writes)");
    println!("================================================================");
    println!("  Mode               : {}", mode);
    println!("  Reset              : {}", cfg.reset);
    println!("  Customers          : {}", cfg.counts.customers);
    println!("  Registrations      : {}", cfg.counts.registrations);
    println!(
        "  Portal customers   : {}",
        cfg.counts.customers_with_portal
    );
    println!(
        "  Group ratio        : {:.0}%  (≈{} Instansi dari {} regs)",
        cfg.counts.group_ratio * 100.0,
        expected_group,
        cfg.counts.registrations
    );
    println!(
        "  Participants/group : {}–{}  (≈{} total peserta, {} policies)",
        cfg.counts.min_participants,
        cfg.counts.max_participants,
        expected_participants,
        expected_policies
    );
    println!("  Months back        : {}", cfg.months_back);
    println!("  Claims ratio       : {:.0}%", cfg.claims_ratio * 100.0);
    println!("  Upload dir         : {}", cfg.upload_dir);
    println!("----------------------------------------------------------------");
    println!("  Expected output:");
    println!("    * Identifier prefix berbeda per bulan (REG-YYYYMM-NNNNNN)");
    println!("    * Semua status state machine terwakili:");
    println!("        - registration: PENDING, PAID, ISSUED, CANCELLED");
    println!("        - invoice     : UNPAID, PAID, EXPIRED, CANCELLED");
    println!("        - policy      : ACTIVE, LAPSED, EXPIRED");
    println!("        - claim       : SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, PAID");
    println!("        - inquiry     : OPEN, ANSWERED, CLOSED");
    println!("    * Applicant type mix: INDIVIDU (1 peserta) + INSTANSI (5-20 peserta)");
    match cfg.mode {
        crate::seed::config::SeedMode::Demo => {
            println!(
                "    * PDF policies & invoices di-render ke {}/policies dan {}/invoices",
                cfg.upload_dir, cfg.upload_dir
            );
            println!("    * Instansi: 1 PDF per group (sample), bukan per peserta");
        }
        crate::seed::config::SeedMode::Load => {
            println!("    * PDF di-SKIP (load mode) — pdf_path akan NULL");
        }
    }
    println!("================================================================");
    println!();
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn print_summary(
    customers: usize,
    portal_customers: usize,
    registrations: usize,
    group_registrations: usize,
    participants: usize,
    expired_invoices: usize,
    invoices: usize,
    policies: usize,
    claims: usize,
    inquiries: usize,
    email_logs: usize,
    audit_logs: usize,
    pdf_files_written: usize,
    duration_ms: u128,
) {
    let individual = registrations - group_registrations;
    println!();
    println!("================================================================");
    println!("  InsureTrack Seeder — DONE in {}ms", duration_ms);
    println!("================================================================");
    println!(
        "  Customers         : {:>5}  ({} with portal access)",
        customers, portal_customers
    );
    println!(
        "  Registrations     : {:>5}  ({} Individu + {} Instansi)",
        registrations, individual, group_registrations
    );
    if group_registrations > 0 {
        println!(
            "  Participants      : {:>5}  (di registration_members, identitas di customers)",
            participants
        );
    }
    println!(
        "  Invoices          : {:>5}  ({} EXPIRED)",
        invoices, expired_invoices
    );
    println!("  Policies          : {:>5}", policies);
    println!("  Claims            : {:>5}", claims);
    println!("  Inquiries         : {:>5}", inquiries);
    println!("  Email logs        : {:>5}", email_logs);
    println!("  Audit logs        : {:>5}", audit_logs);
    println!("  PDF files written : {:>5}", pdf_files_written);
    println!("================================================================");
    println!();
}

/// 1 portal customer + daftar tag applicant_type untuk registrations
/// yang dia miliki. Dipakai `print_portal_credentials` untuk nandai
/// akun mana yang relevan untuk demo flow Individual vs Instansi.
pub(crate) struct PortalCredWithTags {
    pub(crate) email: String,
    pub(crate) password: String,
    pub(crate) full_name: String,
    /// Distinct applicant_types dari registrations customer ini,
    /// lowercase: `"individu"`, `"instansi"`. Bisa kosong kalau customer
    /// tidak punya registration (kasus edge: portal account tanpa polis).
    pub(crate) tags: Vec<String>,
}

pub(crate) fn print_portal_credentials(creds: &[PortalCredWithTags]) {
    if creds.is_empty() {
        return;
    }
    println!();
    println!("================================================================");
    println!("  PORTAL CUSTOMER CREDENTIALS (login ke http://localhost:3000)");
    println!("  Tag penjelasan:");
    println!("    [Individu] = customer ini punya registration INDIVIDU");
    println!("    [Instansi] = customer ini punya registration INSTANSI");
    println!("================================================================");
    for (i, c) in creds.iter().enumerate() {
        if i > 0 {
            println!("------------------------------------------------------------");
        }
        println!("  Email     : {}", c.email);
        println!("  Password  : {}", c.password);
        println!("  Name      : {}", c.full_name);
        if c.tags.is_empty() {
            println!("  Tags      : (no registration yet)");
        } else {
            // Capitalize first letter untuk display.
            let pretty: Vec<String> = c
                .tags
                .iter()
                .map(|t| {
                    let mut chars: Vec<char> = t.chars().collect();
                    if let Some(c) = chars.first_mut() {
                        *c = c.to_ascii_uppercase();
                    }
                    chars.into_iter().collect()
                })
                .collect();
            println!("  Tags      : [{}]", pretty.join(", "));
        }
    }
    println!("================================================================");
    println!();
}
