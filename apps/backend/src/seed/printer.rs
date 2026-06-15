//! Console output — ringkasan seeder run + 3 portal credentials.
//!
//! Format sengaja lebar dan berwarna-ish (pakai ASCII art) supaya
//! saat demo / onboarding, output-nya langsung informatif tanpa
//! harus scroll log.

use crate::seed::config::SeedConfig;

pub fn print_plan(cfg: &SeedConfig) {
    let mode = match cfg.mode {
        crate::seed::config::SeedMode::Demo => "Demo (realistic)",
        crate::seed::config::SeedMode::Load => "Load (high volume)",
    };

    println!();
    println!("================================================================");
    println!("  InsureTrack Seeder — DRY RUN (no DB writes)");
    println!("================================================================");
    println!("  Mode               : {}", mode);
    println!("  Reset              : {}", cfg.reset);
    println!("  Customers          : {}", cfg.counts.customers);
    println!("  Registrations      : {}", cfg.counts.registrations);
    println!("  Portal customers   : {}", cfg.counts.customers_with_portal);
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
    match cfg.mode {
        crate::seed::config::SeedMode::Demo => {
            println!("    * PDF policies & invoices di-render ke {}/policies dan {}/invoices",
                cfg.upload_dir, cfg.upload_dir);
        }
        crate::seed::config::SeedMode::Load => {
            println!("    * PDF di-SKIP (load mode) — pdf_path akan NULL");
        }
    }
    println!("================================================================");
    println!();
}

pub fn print_summary(
    customers: usize,
    portal_customers: usize,
    registrations: usize,
    invoices: usize,
    policies: usize,
    claims: usize,
    inquiries: usize,
    email_logs: usize,
    audit_logs: usize,
    pdf_files_written: usize,
    duration_ms: u128,
) {
    println!();
    println!("================================================================");
    println!("  InsureTrack Seeder — DONE in {}ms", duration_ms);
    println!("================================================================");
    println!("  Customers         : {:>5}  ({} with portal access)",
        customers, portal_customers);
    println!("  Registrations     : {:>5}", registrations);
    println!("  Invoices          : {:>5}", invoices);
    println!("  Policies          : {:>5}", policies);
    println!("  Claims            : {:>5}", claims);
    println!("  Inquiries         : {:>5}", inquiries);
    println!("  Email logs        : {:>5}", email_logs);
    println!("  Audit logs        : {:>5}", audit_logs);
    println!("  PDF files written : {:>5}", pdf_files_written);
    println!("================================================================");
    println!();
}

pub fn print_portal_credentials(creds: &[(String, String, String)]) {
    // Tuple: (email, password_plaintext, customer_name)
    if creds.is_empty() {
        return;
    }
    println!();
    println!("================================================================");
    println!("  PORTAL CUSTOMER CREDENTIALS (login ke http://localhost:3000)");
    println!("================================================================");
    for (i, (email, password, name)) in creds.iter().enumerate() {
        if i > 0 {
            println!("------------------------------------------------------------");
        }
        println!("  Email     : {}", email);
        println!("  Password  : {}", password);
        println!("  Name      : {}", name);
    }
    println!("================================================================");
    println!();
}
