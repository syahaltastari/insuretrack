//! Public endpoints (no auth). Spec §8.1.
//!
//!   GET  /api/public/products
//!   POST /api/public/customers              (account creation, activation link via email)
//!   GET  /api/public/registrations/:regNo  (status lookup by registration number)
//!   POST /api/public/payment/webhook       (X-Webhook-Secret gated; triggers policy issuance)
//!   GET  /api/public/clients               (landing page corporate clients)
//!   GET  /api/public/testimonials           (landing page testimonials)
//!   GET  /api/public/uploads/*path          (serves local-stored media; path-traversal guarded)

use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::{hash_password, Role, TokenService},
    domain::identifier::{next_id, EntityType},
    dto::{
        find_plan, product_catalog, product_name_from_code, product_plan_catalog, ApplicantType,
        ParticipantData, ProductPlan, RegistrationData,
    },
    error::{AppError, AppResult},
    services::{
        audit::{write as audit_write, AuditEntry},
        email::{send as send_email, Email, EmailType},
        pdf::{render as render_pdf, PolicyPdfInput},
    },
    state::AppState,
};
use std::path::Path as StdPath;
use tokio::fs;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/products", get(list_products))
        .route("/customers", post(register_customer))
        .route("/registrations/:reg_no", get(get_registration))
        .route("/payment/webhook", post(payment_webhook))
        .route("/clients", get(list_clients_public))
        .route("/testimonials", get(list_testimonials_public))
        .route("/uploads/*path", get(serve_upload))
}

// ---- GET /products ----

async fn list_products() -> Json<serde_json::Value> {
    // Nested shape: { data: { products: [...], plans: [...] } }.
    // Frontend fetch sekali untuk render plan picker — single source of truth.
    Json(serde_json::json!({
        "data": {
            "products": product_catalog(),
            "plans": product_plan_catalog(),
        }
    }))
}


// ---- GET /registrations/{regNo} ----

#[derive(Debug, Serialize)]
struct RegistrationStatus {
    registration_no: String,
    status: String,
    invoice_status: String,
    policy_no: Option<String>,
}

// Shared insurance application data (dipakai oleh customer.rs handler).
// Definisi actual ada di `dto::registration::RegistrationData` setelah
// V3 group registration. Import path: `dto::RegistrationData` (via
// re-export di `dto/mod.rs`).
// Catatan historis: dulunya struct ini didefinisikan di sini, dipindah
// ke dto::registration saat group flow diperkenalkan agar tidak ada
// duplikasi tipe antara handler customer.rs dan validate_registration
// di public.rs.

async fn get_registration(
    State(state): State<AppState>,
    Path(reg_no): Path<String>,
) -> AppResult<Json<RegistrationStatus>> {
    let row: Option<(String, String, String, Option<String>)> = sqlx::query_as(
        r#"
        SELECT r.registration_no,
               r.status,
               COALESCE(i.status, 'UNPAID') AS invoice_status,
               p.policy_no
          FROM registrations r
          LEFT JOIN invoices i ON i.registration_id = r.id
          LEFT JOIN policies  p ON p.registration_id = r.id
         WHERE r.registration_no = $1
        "#,
    )
    .bind(&reg_no)
    .fetch_optional(&state.pool)
    .await?;

    let (registration_no, status, invoice_status, policy_no) =
        row.ok_or_else(|| AppError::NotFound(format!("registration {reg_no}")))?;
    Ok(Json(RegistrationStatus {
        registration_no,
        status,
        invoice_status,
        policy_no,
    }))
}

// ---- POST /payment/webhook ----

#[derive(Debug, Deserialize)]
struct WebhookBody {
    invoice_no: String,
    payment_status: String,
    #[serde(default)]
    payment_date: Option<chrono::NaiveDate>,
}

#[derive(Debug, Serialize)]
struct WebhookResponse {
    ok: bool,
    policy_no: Option<String>,
    replayed: bool,
}

async fn payment_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<WebhookBody>,
) -> AppResult<Json<WebhookResponse>> {
    // Verify shared secret.
    let provided = headers
        .get("x-webhook-secret")
        .and_then(|h| h.to_str().ok())
        .ok_or(AppError::Unauthorized)?;
    if provided != state.config.payment_webhook_secret {
        return Err(AppError::Unauthorized);
    }
    if body.payment_status != "PAID" {
        return Err(AppError::Validation(format!(
            "unsupported payment_status: {} (only PAID handled in MVP)",
            body.payment_status
        )));
    }

    // Idempotency: read invoice status first; if already PAID, return success no-op.
    let invoice_row: Option<(Uuid, String, Uuid)> = sqlx::query_as(
        "SELECT id, status, registration_id FROM invoices WHERE invoice_no = $1",
    )
    .bind(&body.invoice_no)
    .fetch_optional(&state.pool)
    .await?;

    let (invoice_id, invoice_status, registration_id) =
        invoice_row.ok_or_else(|| AppError::NotFound(format!("invoice {}", body.invoice_no)))?;

    if invoice_status == "PAID" {
        return Ok(Json(WebhookResponse {
            ok: true,
            policy_no: None,
            replayed: true,
        }));
    }

    // Pipeline: invoice→PAID, reg→PAID, issue policy, render PDF, save, queue emails, audit.
    let mut tx = state.pool.begin().await?;

    // Update invoice
    sqlx::query(
        "UPDATE invoices SET status = 'PAID', paid_at = now() WHERE id = $1 AND status = 'UNPAID'",
    )
    .bind(invoice_id)
    .execute(&mut *tx)
    .await?;

    // Update registration
    sqlx::query("UPDATE registrations SET status = 'PAID' WHERE id = $1")
        .bind(registration_id)
        .execute(&mut *tx)
        .await?;

    // Read registration + customer info to render PDF
    let reg_row: (
        String,
        String,
        Decimal,
        Decimal,
        i32,
        String,
        String,
        String,
        chrono::NaiveDate,
        String,
        String,
    ) = sqlx::query_as(
        r#"
        SELECT r.registration_no,
               r.product,
               r.sum_assured,
               i.premium_amount,
               r.coverage_term,
               c.full_name,
               c.nik,
               c.address,
               c.birth_date,
               c.email,
               r.applicant_type
          FROM registrations r
          JOIN invoices i ON i.registration_id = r.id
          JOIN customers c ON c.id = r.customer_id
         WHERE r.id = $1
        "#,
    )
    .bind(registration_id)
    .fetch_one(&mut *tx)
    .await?;

    let (
        registration_no,
        product,
        sum_assured,
        premium,
        coverage_term,
        full_name,
        nik,
        address,
        birth_date,
        email,
        applicant_type,
    ): (
        String,
        String,
        Decimal,
        Decimal,
        i32,
        String,
        String,
        String,
        chrono::NaiveDate,
        String,
        String,
    ) = reg_row;

    let effective_date = body.payment_date.unwrap_or_else(|| Utc::now().date_naive());
    let expiry_date = effective_date + Duration::days(365 * coverage_term as i64);

    // Per-participant premium (untuk INDIVIDU = total; untuk INSTANSI =
    // total/N). Invoice menyimpan total; per-policy premium = total/N
    // supaya e-policy PDF tiap peserta konsisten dengan kalkulator
    // publik di product-details.ts.
    let per_participant_premium = if applicant_type == "INSTANSI" {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM registration_participants WHERE registration_id = $1",
        )
        .bind(registration_id)
        .fetch_one(&mut *tx)
        .await?;
        if count == 0 {
            return Err(AppError::Internal(anyhow::anyhow!(
                "INSTANSI registration {} has no participants",
                registration_id
            )));
        }
        premium / rust_decimal::Decimal::from(count)
    } else {
        premium
    };

    // Issue policy/policies. INDIVIDU → 1 policy. INSTANSI → N policies
    // (1 per participant, masing-masing dengan policy_no sendiri & link
    // ke participant_id).
    let mut issued_policies: Vec<(Uuid, String, Uuid, String, String, chrono::NaiveDate, String)> =
        Vec::new(); // (policy_id, policy_no, participant_id, participant_nik, participant_name, participant_birth_date, participant_address)

    if applicant_type == "INSTANSI" {
        // Fetch all participants
        #[derive(sqlx::FromRow)]
        struct Participant {
            id: Uuid,
            nik: String,
            full_name: String,
            birth_date: chrono::NaiveDate,
            address: String,
            rt_rw: String,
            village: String,
            district: String,
            city: String,
            province: String,
            postal_code: String,
        }
        let participants: Vec<Participant> = sqlx::query_as(
            r#"
            SELECT id, nik, full_name, birth_date, address, rt_rw, village,
                   district, city, province, postal_code
              FROM registration_participants
             WHERE registration_id = $1
             ORDER BY created_at ASC
            "#,
        )
        .bind(registration_id)
        .fetch_all(&mut *tx)
        .await?;

        for p in participants {
            let policy_no = next_id(&mut tx, EntityType::Policy).await?;
            let policy_id = Uuid::new_v4();
            sqlx::query(
                r#"
                INSERT INTO policies
                  (id, policy_no, registration_id, product, sum_assured, premium,
                   effective_date, expiry_date, status, participant_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9)
                "#,
            )
            .bind(policy_id)
            .bind(&policy_no)
            .bind(registration_id)
            .bind(&product)
            .bind(sum_assured)
            .bind(per_participant_premium)
            .bind(effective_date)
            .bind(expiry_date)
            .bind(p.id)
            .execute(&mut *tx)
            .await?;
            let full_address = format!(
                "{}\nRT/RW {}\n{}, {}\n{}, {} {}",
                p.address.trim(),
                p.rt_rw.trim(),
                p.village.trim(),
                p.district.trim(),
                p.city.trim(),
                p.province.trim(),
                p.postal_code.trim(),
            );
            issued_policies.push((
                policy_id,
                policy_no,
                p.id,
                p.nik,
                p.full_name,
                p.birth_date,
                full_address,
            ));
        }
    } else {
        // INDIVIDU: existing 1-policy flow
        let policy_no = next_id(&mut tx, EntityType::Policy).await?;
        let policy_id = Uuid::new_v4();
        sqlx::query(
            r#"
            INSERT INTO policies
              (id, policy_no, registration_id, product, sum_assured, premium,
               effective_date, expiry_date, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE')
            "#,
        )
        .bind(policy_id)
        .bind(&policy_no)
        .bind(registration_id)
        .bind(&product)
        .bind(sum_assured)
        .bind(premium)
        .bind(effective_date)
        .bind(expiry_date)
        .execute(&mut *tx)
        .await?;
        issued_policies.push((
            policy_id,
            policy_no,
            Uuid::nil(),
            nik.clone(),
            full_name.clone(),
            birth_date,
            address.clone(),
        ));
    }

    // Update registration to ISSUED
    sqlx::query("UPDATE registrations SET status = 'ISSUED' WHERE id = $1")
        .bind(registration_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    // Render PDFs + save (di luar tx — mirror pattern invoice PDF).
    let product_name = product_name_from_code(&product);
    for (policy_id, policy_no, _participant_id, p_nik, p_name, p_birth_date, p_address) in
        &issued_policies
    {
        let pdf_bytes = render_pdf(&PolicyPdfInput {
            policy_no,
            registration_no: &registration_no,
            effective_date,
            expiry_date,
            customer_nik: p_nik,
            customer_name: p_name,
            customer_birth_date: *p_birth_date,
            customer_address: p_address,
            product_name: &product_name,
            sum_assured,
            premium: if applicant_type == "INSTANSI" {
                per_participant_premium
            } else {
                premium
            },
        })?;
        let pdf_ref = state.storage.save_policy_pdf(*policy_id, &pdf_bytes).await?;
        let pdf_path = pdf_ref.key;

        sqlx::query("UPDATE policies SET pdf_path = $1 WHERE id = $2")
            .bind(&pdf_path)
            .bind(policy_id)
            .execute(&state.pool)
            .await?;
    }

    // Email konfirmasi ke representative. Untuk INSTANSI, 1 email summary
    // (tidak attach N PDF — N bisa besar). Untuk INDIVIDU, 1 email +
    // 1 email e-policy dengan PDF.
    let total_policies = issued_policies.len();
    let payment_subject = if applicant_type == "INSTANSI" {
        format!(
            "Pembayaran Diterima — {} Polis Sedang Diterbitkan",
            total_policies
        )
    } else {
        "Pembayaran Diterima — Polis Segera Terbit".to_string()
    };
    send_email(
        &state.pool,
        &*state.storage,
        &*state.email,
        Email {
            email_type: EmailType::PaymentSuccess,
            recipient: &email,
            subject: &payment_subject,
            body: &format!(
                "Halo,\n\n\
                 Pembayaran untuk invoice {} telah kami terima. {} sedang \
                 dalam proses penerbitan — bisa di-download dari portal customer \
                 dalam hitungan menit.\n\n\
                 Terima kasih sudah mempercayakan perlindungan Anda ke InsureTrack.\n\n\
                 Salam,\n\
                 Tim InsureTrack",
                body.invoice_no,
                if applicant_type == "INSTANSI" {
                    format!("{} polis untuk peserta grup Anda", total_policies)
                } else {
                    format!("Polis {}", issued_policies[0].1)
                }
            ),
            cta_text: None,
            cta_url: None,
            related_entity_type: Some("policy"),
            related_entity_id: Some(issued_policies[0].0),
            attachment_path: None,
        },
    )
    .await?;

    // Email e-policy delivery. Untuk INSTANSI, kirim 1 email summary
    // (PDF bisa di-download dari portal per polis). Untuk INDIVIDU,
    // kirim e-policy PDF sebagai attachment.
    if applicant_type == "INSTANSI" {
        let group_subject = format!(
            "E-Policy Group Terbit — {} polis untuk {}",
            total_policies,
            registration_no
        );
        send_email(
            &state.pool,
            &*state.storage,
            &*state.email,
            Email {
                email_type: EmailType::EPolicyDelivery,
                recipient: &email,
                subject: &group_subject,
                body: &format!(
                    "Halo,\n\n\
                     Selamat! {} polis untuk grup Anda telah resmi terbit. \
                     Login ke portal customer untuk mendownload e-policy PDF \
                     per peserta (tersedia di menu Policies).\n\n\
                     Salam,\n\
                     Tim InsureTrack",
                    total_policies
                ),
                cta_text: Some("Lihat di Portal →"),
                cta_url: Some(&format!(
                    "{}/portal/policies",
                    state.config.app_base_url.trim_end_matches('/')
                )),
                related_entity_type: Some("registration"),
                related_entity_id: Some(registration_id),
                attachment_path: None,
            },
        )
        .await?;
    } else {
        // INDIVIDU: 1 email dengan PDF attached
        let (policy_id, policy_no, _, _, _, _, _) = &issued_policies[0];
        // Re-fetch pdf_path for this single policy
        let pdf_path: String = sqlx::query_scalar(
            "SELECT pdf_path FROM policies WHERE id = $1",
        )
        .bind(policy_id)
        .fetch_one(&state.pool)
        .await?;
        send_email(
            &state.pool,
            &*state.storage,
            &*state.email,
            Email {
                email_type: EmailType::EPolicyDelivery,
                recipient: &email,
                subject: &format!("E-Policy {} — Polis Anda Telah Terbit", policy_no),
                body: &format!(
                    "Halo,\n\n\
                     Selamat! Polis {} Anda telah resmi terbit. E-policy PDF \
                     terlampir di email ini — bisa langsung di-download, di-print, \
                     atau disimpan di perangkat Anda.\n\n\
                     Login ke portal kapan saja untuk melihat semua polis, ajukan \
                     klaim, atau cek status pengajuan Anda.\n\n\
                     Salam,\n\
                     Tim InsureTrack",
                    policy_no
                ),
                cta_text: None,
                cta_url: None,
                related_entity_type: Some("policy"),
                related_entity_id: Some(*policy_id),
                attachment_path: Some(pdf_path),
            },
        )
        .await?;
    }

    // Activation email sudah dikirim saat customer registrasi akun
    // (POST /api/public/customers), bukan di sini. Jadi tidak kirim
    // ulang saat payment webhook fire. Lihat register_customer untuk
    // activation flow.

    // Audit: 1 entry per policy issued. Untuk INSTANSI dengan N policies,
    // tulis N entries (each with participant_id) supaya per-participant
    // activity traceable.
    for (policy_id, policy_no, participant_id, _, _, _, _) in &issued_policies {
        audit_write(
            &state.pool,
            AuditEntry {
                actor: "system",
                action: "policy_issued",
                entity_type: "policy",
                entity_id: Some(*policy_id),
                metadata: Some(json!({
                    "policy_no": policy_no,
                    "registration_id": registration_id,
                    "applicant_type": applicant_type,
                    "participant_id": if participant_id.is_nil() {
                        None
                    } else {
                        Some(participant_id.to_string())
                    },
                })),
                ip_address: None,
            },
        )
        .await?;
    }

    let first_policy_no = issued_policies[0].1.clone();
    Ok(Json(WebhookResponse {
        ok: true,
        policy_no: Some(first_policy_no),
        replayed: false,
    }))
}

// ---- helpers ----

pub fn validate_registration(d: &RegistrationData) -> Result<(), AppError> {
    // Plan_code adalah source of truth untuk product + sum_assured.
    // Lookup sekali di sini — handler `submit_insurance_application` di
    // customer.rs reuse hasil lookup yang sama.
    let plan = find_plan(&d.plan_code).ok_or_else(|| {
        AppError::Validation(format!("invalid plan_code: {}", d.plan_code))
    })?;

    match d.applicant_type {
        ApplicantType::Individu => validate_individu(d, plan)?,
        ApplicantType::Instansi => validate_instansi(d, plan)?,
    }
    Ok(())
}

/// Validasi bagian single-participant (Individu flow). Field di root
/// struct dipakai sebagai data peserta.
fn validate_individu(d: &RegistrationData, plan: &ProductPlan) -> Result<(), AppError> {
    if !is_16_digits(&d.nik) {
        return Err(AppError::Validation("nik must be exactly 16 digits".into()));
    }
    if d.full_name.trim().is_empty() {
        return Err(AppError::Validation("full_name required".into()));
    }
    if d.birth_date > Utc::now().date_naive() {
        return Err(AppError::Validation("birth_date cannot be in the future".into()));
    }
    if !matches!(d.gender.as_str(), "MALE" | "FEMALE") {
        return Err(AppError::Validation("gender must be MALE or FEMALE".into()));
    }
    if !is_email_valid(&d.email) {
        return Err(AppError::Validation("email format invalid".into()));
    }
    let digit_count = d.mobile_number.chars().filter(|c| c.is_ascii_digit()).count();
    if !(10..=15).contains(&digit_count) || d.mobile_number.chars().any(|c| !c.is_ascii_digit()) {
        return Err(AppError::Validation(
            "mobile_number must be 10-15 digits, digits only".into(),
        ));
    }
    if d.coverage_term < 1 {
        return Err(AppError::Validation("coverage_term must be >= 1".into()));
    }
    // Beneficiary wajib untuk produk LIFE (sesuai benefit list "Ahli Waris
    // Fleksibel" di product-details.ts). PA & HEALTH tidak butuh.
    if plan.product_code == "LIFE" {
        match d.beneficiary_name.as_deref().map(str::trim) {
            Some(n) if (1..=120).contains(&n.len()) => {}
            _ => {
                return Err(AppError::Validation(
                    "Nama ahli waris wajib diisi untuk Asuransi Jiwa".into(),
                ));
            }
        }
    }
    Ok(())
}

/// Validasi Instansi (group) flow. Field root (nik/full_name/email/etc.)
/// tetap dipakai sebagai **data representative** (yang login & submit).
/// Data peserta ada di `d.participants`. Plan/term shared by all peserta.
fn validate_instansi(d: &RegistrationData, plan: &ProductPlan) -> Result<(), AppError> {
    // Institution info wajib
    match d.company_name.as_deref().map(str::trim) {
        Some(n) if (1..=200).contains(&n.len()) => {}
        _ => {
            return Err(AppError::Validation(
                "company_name wajib diisi untuk pendaftaran Instansi".into(),
            ));
        }
    }
    // Representative data (yang login & submit) tetap divalidasi — pastikan
    // NIK/email/mobile valid meskipun tidak masuk tabel customers update
    // untuk Instansi flow.
    if !is_16_digits(&d.nik) {
        return Err(AppError::Validation(
            "NIK representative harus 16 digit".into(),
        ));
    }
    if d.full_name.trim().is_empty() {
        return Err(AppError::Validation(
            "Nama representative wajib diisi".into(),
        ));
    }
    if !is_email_valid(&d.email) {
        return Err(AppError::Validation(
            "Email representative tidak valid".into(),
        ));
    }
    let digit_count = d.mobile_number.chars().filter(|c| c.is_ascii_digit()).count();
    if !(10..=15).contains(&digit_count) || d.mobile_number.chars().any(|c| !c.is_ascii_digit()) {
        return Err(AppError::Validation(
            "No HP representative harus 10-15 digit".into(),
        ));
    }
    if d.coverage_term < 1 {
        return Err(AppError::Validation("coverage_term must be >= 1".into()));
    }
    // Minimal 1 peserta
    if d.participants.is_empty() {
        return Err(AppError::Validation(
            "Minimal 1 peserta untuk pendaftaran Instansi".into(),
        ));
    }
    // Max 500 peserta — safety limit. Group insurance biasanya max ratusan
    // (HR enrolling karyawan). Kalau butuh lebih, naikkan limit & review
    // performance INSERT batch.
    if d.participants.len() > 500 {
        return Err(AppError::Validation(
            "Maksimal 500 peserta per registrasi".into(),
        ));
    }
    // Validate setiap peserta
    for (i, p) in d.participants.iter().enumerate() {
        validate_participant(p, plan.product_code).map_err(|e| {
            AppError::Validation(format!("Peserta #{}: {}", i + 1, e))
        })?;
    }
    Ok(())
}

/// Validasi 1 peserta. Field identik dengan validate_individu kecuali
/// tidak ada email/mobile/beneficiary_name requirement (kecuali untuk LIFE).
fn validate_participant(p: &ParticipantData, product_code: &str) -> Result<(), AppError> {
    if !is_16_digits(&p.nik) {
        return Err(AppError::Validation(format!("NIK harus 16 digit ({})", p.nik)));
    }
    if p.full_name.trim().is_empty() {
        return Err(AppError::Validation("Nama lengkap wajib diisi".into()));
    }
    if p.birth_place.trim().is_empty() {
        return Err(AppError::Validation("Tempat lahir wajib diisi".into()));
    }
    if p.birth_date > Utc::now().date_naive() {
        return Err(AppError::Validation(
            "Tanggal lahir tidak boleh di masa depan".into(),
        ));
    }
    if !matches!(p.gender.as_str(), "MALE" | "FEMALE") {
        return Err(AppError::Validation("Gender harus MALE atau FEMALE".into()));
    }
    if p.address.trim().is_empty() {
        return Err(AppError::Validation("Alamat wajib diisi".into()));
    }
    if !p.rt_rw.contains('/') {
        return Err(AppError::Validation("RT/RW format: 001/002".into()));
    }
    if p.village.trim().is_empty()
        || p.district.trim().is_empty()
        || p.city.trim().is_empty()
        || p.province.trim().is_empty()
    {
        return Err(AppError::Validation(
            "Kelurahan/Kecamatan/Kota/Provinsi wajib diisi".into(),
        ));
    }
    if p.postal_code.len() != 5 || !p.postal_code.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::Validation("Kode pos 5 digit".into()));
    }
    // Beneficiary per peserta WAJIB untuk LIFE
    if product_code == "LIFE" {
        match p.beneficiary_name.as_deref().map(str::trim) {
            Some(n) if (1..=120).contains(&n.len()) => {}
            _ => {
                return Err(AppError::Validation(
                    "Nama ahli waris wajib diisi untuk Asuransi Jiwa".into(),
                ));
            }
        }
    }
    Ok(())
}

fn is_16_digits(s: &str) -> bool {
    s.len() == 16 && s.chars().all(|c| c.is_ascii_digit())
}

fn is_email_valid(s: &str) -> bool {
    // Minimal: ada tepat satu '@' dan non-empty di kedua sisi, plus '.' di domain.
    if s.matches('@').count() != 1 {
        return false;
    }
    let parts: Vec<&str> = s.split('@').collect();
    let local = parts[0];
    let domain = parts[1];
    !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
}

pub fn calculate_premium(plan: &ProductPlan, coverage_term: i32) -> Decimal {
    // Pricing model: `premium = monthly_premium × 12 × coverage_term_years`.
    // Plan adalah source of truth — UP & rate sudah ter-bundle di plan.
    // Contoh: LIFE_BASIC (75rb/bulan) × 12 × 10 tahun = Rp 9.000.000.
    let years = Decimal::from(coverage_term);
    (plan.monthly_premium * Decimal::from(12) * years).round_dp(2)
}

async fn customer_id_from_registration(
    state: &AppState,
    registration_id: Uuid,
) -> Result<Uuid, AppError> {
    let row: (Uuid,) = sqlx::query_as("SELECT customer_id FROM registrations WHERE id = $1")
        .bind(registration_id)
        .fetch_one(&state.pool)
        .await?;
    Ok(row.0)
}

// ---- GET /clients (public, untuk landing page) ----

#[derive(Serialize, sqlx::FromRow)]
struct PublicClient {
    id: Uuid,
    name: String,
    logo_path: String,
    industry: Option<String>,
    website: Option<String>,
    sort_order: i32,
}

async fn list_clients_public(
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let data: Vec<PublicClient> = sqlx::query_as(
        r#"
        SELECT id, name, logo_path, industry, website, sort_order
          FROM clients
         WHERE is_active = TRUE
         ORDER BY sort_order ASC, created_at DESC
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    // Build absolute URL for logo based on media_base_url (separate from app_base_url
    // so the <img> tag can hit the backend directly even when APP_BASE_URL points to
    // the frontend at a different port).
    let media_base = state.config.media_base_url.as_str();
    let upload_dir = state.config.upload_dir.as_str();
    let out: Vec<serde_json::Value> = data
        .into_iter()
        .map(|c| {
            let logo_url = to_public_upload_url(media_base, upload_dir, &c.logo_path);
            json!({
                "id": c.id,
                "name": c.name,
                "logo_url": logo_url,
                "logo_path": c.logo_path,
                "industry": c.industry,
                "website": c.website,
                "sort_order": c.sort_order,
            })
        })
        .collect();

    Ok(Json(json!({ "data": out })))
}

/// Bangun URL publik untuk path upload.
/// `path` di DB bisa berupa:
///   - path relatif: `clients/{uuid}/logo.svg` (produksi, dari `marketing::save_image`)
///   - path absolut host: `/var/uploads/clients/seed-...svg` (dari seed migration, host-specific)
/// Normalisasi: jika `path` di-prefix dengan `upload_dir` (absolute atau trim-slash),
/// strip prefix-nya agar URL jadi `${APP_BASE_URL}/api/public/uploads/{relatif}`.
fn to_public_upload_url(app_base_url: &str, upload_dir: &str, path: &str) -> String {
    let base = app_base_url.trim_end_matches('/');

    if path.starts_with("http://") || path.starts_with("https://") {
        return path.to_string();
    }

    let upload_dir_trim = upload_dir.trim_end_matches('/').trim_start_matches('/');
    let stripped = path
        .strip_prefix(upload_dir_trim)
        .or_else(|| path.strip_prefix(&format!("/{}", upload_dir_trim)))
        .unwrap_or(path);
    let rel = stripped.trim_start_matches('/');

    format!("{}/api/public/uploads/{}", base, rel)
}

#[derive(Serialize, sqlx::FromRow)]
struct PublicTestimonial {
    id: Uuid,
    customer_name: String,
    photo_path: Option<String>,
    rating: i32,
    review: String,
    role: Option<String>,
    company: Option<String>,
    policy_type: Option<String>,
    display_date: chrono::NaiveDate,
    is_featured: bool,
}

async fn list_testimonials_public(
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let data: Vec<PublicTestimonial> = sqlx::query_as(
        r#"
        SELECT id, customer_name, photo_path, rating, review, role, company,
               policy_type, display_date, is_featured
          FROM testimonials
         WHERE is_active = TRUE
         ORDER BY is_featured DESC, display_date DESC
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    let media_base = state.config.media_base_url.as_str();
    let upload_dir = state.config.upload_dir.as_str();
    let out: Vec<serde_json::Value> = data
        .into_iter()
        .map(|t| {
            let photo_url = t
                .photo_path
                .as_ref()
                .map(|p| to_public_upload_url(media_base, upload_dir, p));
            json!({
                "id": t.id,
                "customer_name": t.customer_name,
                "photo_url": photo_url,
                "photo_path": t.photo_path,
                "rating": t.rating,
                "review": t.review,
                "role": t.role,
                "company": t.company,
                "policy_type": t.policy_type,
                "display_date": t.display_date,
                "is_featured": t.is_featured,
            })
        })
        .collect();

    Ok(Json(json!({ "data": out })))
}

// ---- GET /uploads/*path (serve files statis: logo, foto) ----

async fn serve_upload(
    State(state): State<AppState>,
    Path(path): Path<String>,
) -> Result<Response, AppError> {
    // Security: tolak parent dir traversal.
    for component in StdPath::new(&path).components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(AppError::Validation("invalid path".into()));
        }
    }

    let upload_root = StdPath::new(&state.config.upload_dir);
    let absolute = upload_root.join(&path);
    let canonical_root = fs::canonicalize(upload_root)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("canonicalize upload_dir: {e}")))?;
    let canonical_file = fs::canonicalize(&absolute)
        .await
        .map_err(|_| AppError::NotFound(format!("upload {}", path)))?;
    if !canonical_file.starts_with(&canonical_root) {
        return Err(AppError::Validation("invalid path".into()));
    }

    let bytes = fs::read(&canonical_file)
        .await
        .map_err(|_| AppError::NotFound(format!("upload {}", path)))?;

    // Tentukan content type dari ekstensi
    let ext = canonical_file
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let ct = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "gif" => "image/gif",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    };

    let mut resp = Response::builder()
        .status(StatusCode::OK)
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("build response: {e}")))?;
    resp.headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(ct));
    // Content-Disposition: inline tells browser untuk display file di
    // tab (PDF viewer built-in) instead of triggering download. Tanpa
    // header ini, browser default ke 'attachment' untuk non-image
    // types seperti PDF, menyebabkan auto-download saat navigasi atau
    // <img src="...pdf"> di-load.
    resp.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("inline"),
    );
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=3600"),
    );
    Ok(resp)
}

// ---- POST /customers (account creation only, no insurance yet) ----

#[derive(Debug, Deserialize)]
pub struct RegisterCustomerRequest {
    pub email: String,
    pub password: String,
    pub full_name: String,
    pub mobile_number: String,
}

#[derive(Debug, Serialize)]
pub struct RegisterCustomerResponse {
    pub customer_id: Uuid,
    pub email: String,
    /// One-time activation link. Customer sets password via POST
    /// /api/customer/activate. Link expires in 24h.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activation_url: Option<String>,
}

async fn register_customer(
    State(state): State<AppState>,
    Json(req): Json<RegisterCustomerRequest>,
) -> AppResult<Json<RegisterCustomerResponse>> {
    // Validate
    let email = req.email.trim().to_lowercase();
    if !email.contains('@') {
        return Err(AppError::Validation("email tidak valid".into()));
    }
    if req.password.len() < 8 {
        return Err(AppError::Validation("password minimal 8 karakter".into()));
    }
    if req.full_name.trim().is_empty() {
        return Err(AppError::Validation("nama wajib diisi".into()));
    }
    let mobile_clean: String = req.mobile_number.chars().filter(|c| c.is_ascii_digit() || *c == '+').collect();
    if mobile_clean.len() < 10 || mobile_clean.len() > 15 {
        return Err(AppError::Validation("nomor HP tidak valid (10-15 digit)".into()));
    }

    // Check email uniqueness
    let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM customers WHERE email = $1")
        .bind(&email)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_some() {
        return Err(AppError::Conflict("email sudah terdaftar".into()));
    }

    // Create customer (PENDING, no insurance fields yet)
    let customer_id = Uuid::new_v4();
    let password_hash = hash_password(&req.password)?;
    sqlx::query(
        r#"
        INSERT INTO customers
          (id, full_name, email, mobile_number, password_hash, portal_status)
        VALUES ($1, $2, $3, $4, $5, 'PENDING')
        "#,
    )
    .bind(customer_id)
    .bind(req.full_name.trim())
    .bind(&email)
    .bind(&mobile_clean)
    .bind(&password_hash)
    .execute(&state.pool)
    .await?;

    // Audit
    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &email,
            action: "customer_registered",
            entity_type: "customer",
            entity_id: Some(customer_id),
            metadata: Some(json!({ "via": "public_endpoint" })),
            ip_address: None,
        },
    )
    .await;

    // Issue activation token (JWT, purpose="activation", 24h)
    let activation_token = state.tokens.issue(
        &customer_id.to_string(),
        Role::Customer,
        Some("activation".to_string()),
        false,
        60 * 60 * 24,
    )?;
    let activation_url = format!(
        "{}/portal/activate?token={}",
        state.config.app_base_url.trim_end_matches('/'),
        activation_token
    );

    // Activation email — fire-and-forget; status tracked in email_logs.
    // Body plain text dibaca email client yang tidak support HTML;
    // CTA "Aktifkan Akun Saya" dengan link aktivasi di-render jadi
    // button di HTML version.
    //
    // Password SUDAH di-set saat register (lihat handler ini di atas),
    // jadi activation flow ini cuma konfirmasi email + flip
    // portal_status ke ACTIVE. Tidak ada "set password" lagi.
    let body = format!(
        "Halo {},\n\n\
         Selamat! Akun InsureTrack portal kamu sudah berhasil dibuat. \
         Satu langkah lagi untuk mengaktifkannya.\n\n\
         Klik tombol Aktivasi pada email ini (link berlaku 24 jam). \
         Setelah aktif, kamu otomatis login dan bisa langsung apply \
         asuransi, lihat invoice, dan track status polis dari portal.\n\n\
         Kalau tombol tidak bisa diklik, salin link ini ke browser:\n\
         {}\n\n\
         Ada pertanyaan? Balas email ini — kami siap bantu.\n\n\
         Salam,\n\
         Tim InsureTrack",
        req.full_name.trim(),
        activation_url
    );
    let _ = send_email(
        &state.pool,
        &*state.storage,
        &*state.email,
        Email {
            email_type: EmailType::PortalActivation,
            recipient: &email,
            subject: "Aktivasi Akun InsureTrack Portal",
            body: &body,
            cta_text: Some("Aktifkan Akun Saya →"),
            cta_url: Some(&activation_url),
            related_entity_type: Some("customer"),
            related_entity_id: Some(customer_id),
            attachment_path: None,
        },
    )
    .await;

    Ok(Json(RegisterCustomerResponse {
        customer_id,
        email,
        activation_url: Some(activation_url),
    }))
}

#[cfg(test)]
mod tests {
    //! Unit test untuk helper pure di file ini. Tidak butuh DB / HTTP —
    //! kalau bisa di-test sebagai pure function, taruh di sini (bukan di
    //! tests/ integration yang butuh `spawn_app()`).

    use rust_decimal::Decimal;

    use super::*;
    use crate::dto::ProductPlan;

    // ---- is_16_digits (NIK validator) ----

    #[test]
    fn is_16_digits_accepts_exact_16_digits() {
        assert!(is_16_digits("3201010101010001"));
        assert!(is_16_digits("0000000000000000"));
        assert!(is_16_digits("9999999999999999"));
    }

    #[test]
    fn is_16_digits_rejects_wrong_length() {
        assert!(!is_16_digits(""));
        assert!(!is_16_digits("1234567890")); // 10
        assert!(!is_16_digits("32010101010100010")); // 17
    }

    #[test]
    fn is_16_digits_rejects_non_digits() {
        assert!(!is_16_digits("320101010101000a"));
        assert!(!is_16_digits("3201-101-0101-0001"));
        assert!(!is_16_digits(" 3201010101010001"));
    }

    // ---- is_email_valid ----

    #[test]
    fn is_email_valid_accepts_basic_addresses() {
        assert!(is_email_valid("a@b.c"));
        assert!(is_email_valid("user@example.com"));
        assert!(is_email_valid("first.last@sub.example.co.id"));
    }

    #[test]
    fn is_email_valid_rejects_malformed() {
        assert!(!is_email_valid(""));
        assert!(!is_email_valid("no-at-sign"));
        assert!(!is_email_valid("@no-local.com"));
        assert!(!is_email_valid("no-domain@"));
        assert!(!is_email_valid("two@@signs.com"));
        assert!(!is_email_valid("no-dot@domain"));
        assert!(!is_email_valid("trailing-dot@domain."));
        assert!(!is_email_valid("leading-dot@.domain"));
    }

    // ---- calculate_premium ----

    fn plan_with(monthly: &str) -> ProductPlan {
        ProductPlan {
            code: "TEST",
            product_code: "LIFE",
            tier: "BASIC",
            name: "Test",
            sum_assured: Decimal::from(100_000_000),
            monthly_premium: Decimal::from_str_exact(monthly).unwrap(),
            description: "test",
        }
    }

    #[test]
    fn calculate_premium_life_basic_10_years() {
        // Contoh dari komentar spec: 75.000/bulan × 12 × 10 = 9.000.000
        let plan = plan_with("75000");
        let premium = calculate_premium(&plan, 10);
        assert_eq!(premium, Decimal::from(9_000_000));
    }

    #[test]
    fn calculate_premium_scales_linearly_with_term() {
        let plan = plan_with("100000");
        let p1 = calculate_premium(&plan, 1);
        let p5 = calculate_premium(&plan, 5);
        let p10 = calculate_premium(&plan, 10);
        // 5× lebih besar dari 1 tahun (kecuali rounding), 10× = 2 × 5 tahun.
        assert_eq!(p5, p1 * Decimal::from(5));
        assert_eq!(p10, p5 * Decimal::from(2));
    }

    #[test]
    fn calculate_premium_rounds_to_two_decimals() {
        // Monthly 33333.335 × 12 = 400000.02 → fractional digit valid (≤ 2dp).
        let plan = plan_with("33333.335");
        let premium = calculate_premium(&plan, 1);
        assert_eq!(premium, Decimal::new(40000002, 2));
        // scale(): max 2 fractional digits
        assert!(premium.scale() <= 2);
    }

    #[test]
    fn calculate_premium_one_year_term() {
        let plan = plan_with("100000");
        // 100.000 × 12 × 1 = 1.200.000
        assert_eq!(calculate_premium(&plan, 1), Decimal::from(1_200_000));
    }

    // ---- to_public_upload_url ----

    #[test]
    fn upload_url_passes_through_absolute_urls() {
        assert_eq!(
            to_public_upload_url("https://app.example.com", "/uploads", "https://cdn.example.com/logo.png"),
            "https://cdn.example.com/logo.png"
        );
    }

    #[test]
    fn upload_url_strips_upload_dir_prefix() {
        assert_eq!(
            to_public_upload_url("https://app.example.com", "/uploads", "/uploads/clients/x/logo.svg"),
            "https://app.example.com/api/public/uploads/clients/x/logo.svg"
        );
    }

    #[test]
    fn upload_url_handles_relative_path() {
        // Path tanpa prefix upload_dir → dipakai apa adanya (relatif).
        assert_eq!(
            to_public_upload_url("https://app.example.com", "uploads", "marketing/banner.jpg"),
            "https://app.example.com/api/public/uploads/marketing/banner.jpg"
        );
    }

    #[test]
    fn upload_url_trims_trailing_slash_from_base() {
        assert_eq!(
            to_public_upload_url("https://app.example.com/", "/uploads", "/uploads/x.png"),
            "https://app.example.com/api/public/uploads/x.png"
        );
    }
}
