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
    dto::{find_plan, product_catalog, product_name_from_code, product_plan_catalog, ProductPlan},
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
// `pub` supaya customer.rs bisa deserialize request yang sama shape-nya.
#[derive(Debug, Deserialize)]
pub struct RegistrationData {
    pub nik: String,
    pub full_name: String,
    pub birth_place: String,
    pub birth_date: chrono::NaiveDate,
    pub gender: String,
    pub address: String,
    pub rt_rw: String,
    pub village: String,
    pub district: String,
    pub city: String,
    pub province: String,
    pub postal_code: String,
    pub email: String,
    pub mobile_number: String,
    /// Kode plan yang dipilih customer (mis. "LIFE_BASIC"). Backend lookup
    /// untuk derive `product` & `sum_assured` saat INSERT ke `registrations`
    /// — schema DB tidak berubah, hanya request shape.
    pub plan_code: String,
    pub coverage_term: i32,
}

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
               c.email
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
    ) = reg_row;

    // Issue policy
    let policy_no = next_id(&mut tx, EntityType::Policy).await?;
    let policy_id = Uuid::new_v4();
    let effective_date = body.payment_date.unwrap_or_else(|| Utc::now().date_naive());
    let expiry_date = effective_date + Duration::days(365 * coverage_term as i64);

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

    // Update registration to ISSUED
    sqlx::query("UPDATE registrations SET status = 'ISSUED' WHERE id = $1")
        .bind(registration_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    // Render PDF + save
    let product_name = product_name_from_code(&product);
    let pdf_bytes = render_pdf(&PolicyPdfInput {
        policy_no: &policy_no,
        registration_no: &registration_no,
        effective_date,
        expiry_date,
        customer_nik: &nik,
        customer_name: &full_name,
        customer_birth_date: birth_date,
        customer_address: &address,
        product_name,
        sum_assured,
        premium,
    })?;
    let pdf_ref = state
        .storage
        .save_policy_pdf(policy_id, &pdf_bytes)
        .await?;
    let pdf_path = pdf_ref.key;

    // Save pdf_path to policy row (separate update; idempotent).
    sqlx::query("UPDATE policies SET pdf_path = $1 WHERE id = $2")
        .bind(&pdf_path)
        .bind(policy_id)
        .execute(&state.pool)
        .await?;

    // Queue emails
    send_email(
        &state.pool,
        &*state.storage,
        &state.resend,
        Email {
            email_type: EmailType::PaymentSuccess,
            recipient: &email,
            subject: "Pembayaran Diterima — Polis Segera Terbit",
            body: &format!(
                "Halo,\n\n\
                 Pembayaran untuk invoice {} telah kami terima. Polis {} sedang \
                 dalam proses penerbitan — e-policy PDF akan kami kirim di \
                 email terpisah dalam hitungan menit.\n\n\
                 Terima kasih sudah mempercayakan perlindungan Anda ke InsureTrack.\n\n\
                 Salam,\n\
                 Tim InsureTrack",
                body.invoice_no, policy_no
            ),
            cta_text: None,
            cta_url: None,
            related_entity_type: Some("policy"),
            related_entity_id: Some(policy_id),
            attachment_path: None,
        },
    )
    .await?;

    send_email(
        &state.pool,
        &*state.storage,
        &state.resend,
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
            related_entity_id: Some(policy_id),
            attachment_path: Some(pdf_path.clone()),
        },
    )
    .await?;

    // Activation email sudah dikirim saat customer registrasi akun
    // (POST /api/public/customers), bukan di sini. Jadi tidak kirim
    // ulang saat payment webhook fire. Lihat register_customer untuk
    // activation flow.

    audit_write(
        &state.pool,
        AuditEntry {
            actor: "system",
            action: "policy_issued",
            entity_type: "policy",
            entity_id: Some(policy_id),
            metadata: Some(json!({
                "policy_no": policy_no,
                "registration_id": registration_id,
            })),
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(WebhookResponse {
        ok: true,
        policy_no: Some(policy_no),
        replayed: false,
    }))
}

// ---- helpers ----

pub fn validate_registration(d: &RegistrationData) -> Result<(), AppError> {
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
    // Plan_code adalah source of truth untuk product + sum_assured.
    // Lookup sekali di sini — handler `submit_insurance_application` di
    // customer.rs reuse hasil lookup yang sama.
    if find_plan(&d.plan_code).is_none() {
        return Err(AppError::Validation(format!(
            "invalid plan_code: {}",
            d.plan_code
        )));
    }
    if d.coverage_term < 1 {
        return Err(AppError::Validation("coverage_term must be >= 1".into()));
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
        &state.resend,
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
