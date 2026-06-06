//! Public endpoints (no auth). Spec §8.1.
//!
//!   GET  /api/public/products
//!   POST /api/public/registrations         (multipart, KTP upload)
//!   GET  /api/public/registrations/:regNo
//!   POST /api/public/payment/webhook

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
    domain::identifier::{next_id, EntityType},
    dto::product_catalog,
    error::{AppError, AppResult},
    services::{
        audit::{write as audit_write, AuditEntry},
        email::{send as send_email, Email, EmailType},
        pdf::{render as render_pdf, PolicyPdfInput},
        storage,
    },
    state::AppState,
};
use std::path::Path as StdPath;
use tokio::fs;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/products", get(list_products))
        .route("/registrations", post(create_registration))
        .route("/registrations/:reg_no", get(get_registration))
        .route("/payment/webhook", post(payment_webhook))
        .route("/clients", get(list_clients_public))
        .route("/testimonials", get(list_testimonials_public))
        .route("/uploads/*path", get(serve_upload))
}

// ---- GET /products ----

async fn list_products() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "data": product_catalog() }))
}

// ---- POST /registrations (multipart) ----

#[derive(Debug, Deserialize)]
struct RegistrationData {
    nik: String,
    full_name: String,
    birth_place: String,
    birth_date: chrono::NaiveDate,
    gender: String,
    address: String,
    rt_rw: String,
    village: String,
    district: String,
    city: String,
    province: String,
    postal_code: String,
    email: String,
    mobile_number: String,
    product: String,
    sum_assured: Decimal,
    coverage_term: i32,
}

#[derive(Debug, Serialize)]
struct CreateRegistrationResponse {
    registration_no: String,
    invoice_no: String,
    status: String,
}

async fn create_registration(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    // Parse multipart: form field `data` (JSON) + file field `id_card`.
    let mut data_field: Option<String> = None;
    let mut ktp_field: Option<(String, String, Vec<u8>)> = None; // (filename, content_type, bytes)

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Validation(format!("multipart: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "data" => {
                data_field = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::Validation(format!("data field: {e}")))?,
                );
            }
            "id_card" => {
                let file_name = field
                    .file_name()
                    .unwrap_or("ktp")
                    .to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::Validation(format!("id_card bytes: {e}")))?;
                ktp_field = Some((file_name, content_type, bytes.to_vec()));
            }
            _ => { /* ignore unknown fields */ }
        }
    }

    let data_json = data_field.ok_or_else(|| AppError::Validation("missing 'data' field".into()))?;
    let (ktp_name, ktp_ct, ktp_bytes) =
        ktp_field.ok_or_else(|| AppError::Validation("missing 'id_card' file".into()))?;

    let data: RegistrationData = serde_json::from_str(&data_json)
        .map_err(|e| AppError::Validation(format!("invalid data JSON: {e}")))?;
    validate_registration(&data)?;

    // Persist customer + registration + invoice atomically.
    let mut tx = state.pool.begin().await?;

    // 1. Save KTP file (outside txn is fine — but we want path stored).
    let customer_id = Uuid::new_v4();
    let ktp_path = storage::save_ktp(
        &state.config.upload_dir,
        customer_id,
        &ktp_name,
        &ktp_ct,
        &ktp_bytes,
    )
    .await?;

    // 2. INSERT customer
    sqlx::query(
        r#"
        INSERT INTO customers
          (id, nik, full_name, birth_place, birth_date, gender,
           address, rt_rw, village, district, city, province, postal_code,
           email, mobile_number, id_card_path, portal_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'PENDING')
        "#,
    )
    .bind(customer_id)
    .bind(&data.nik)
    .bind(&data.full_name)
    .bind(&data.birth_place)
    .bind(data.birth_date)
    .bind(&data.gender)
    .bind(&data.address)
    .bind(&data.rt_rw)
    .bind(&data.village)
    .bind(&data.district)
    .bind(&data.city)
    .bind(&data.province)
    .bind(&data.postal_code)
    .bind(&data.email)
    .bind(&data.mobile_number)
    .bind(&ktp_path)
    .execute(&mut *tx)
    .await?;

    // 3. Generate registration_no & create registration
    let registration_no = next_id(&mut tx, EntityType::Registration).await?;
    let premium_amount = calculate_premium(&data.product, data.sum_assured, data.coverage_term);
    let due_date = (Utc::now() + Duration::days(7)).date_naive();

    let reg_id: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO registrations
          (registration_no, customer_id, product, sum_assured, coverage_term, status)
        VALUES ($1, $2, $3, $4, $5, 'PENDING')
        RETURNING id
        "#,
    )
    .bind(&registration_no)
    .bind(customer_id)
    .bind(&data.product)
    .bind(data.sum_assured)
    .bind(data.coverage_term)
    .fetch_one(&mut *tx)
    .await?;

    // 4. Generate invoice_no & create invoice
    let invoice_no = next_id(&mut tx, EntityType::Invoice).await?;
    sqlx::query(
        r#"
        INSERT INTO invoices
          (invoice_no, registration_id, premium_amount, due_date, status)
        VALUES ($1, $2, $3, $4, 'UNPAID')
        "#,
    )
    .bind(&invoice_no)
    .bind(reg_id.0)
    .bind(premium_amount)
    .bind(due_date)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    // 5. Side effects outside txn (idempotent enqueue).
    send_email(
        &state.pool,
        Email {
            email_type: EmailType::RegistrationSuccess,
            recipient: &data.email,
            subject: "Registration Received",
            body: &format!(
                "Halo {}, pendaftaran Anda ({}) telah kami terima. Silakan lakukan pembayaran atas invoice {} sebelum {}.",
                data.full_name, registration_no, invoice_no, due_date
            ),
            related_entity_type: Some("registration"),
            related_entity_id: Some(reg_id.0),
            attachment_path: None,
        },
    )
    .await?;

    send_email(
        &state.pool,
        Email {
            email_type: EmailType::InvoiceNotification,
            recipient: &data.email,
            subject: "Invoice Notification",
            body: &format!(
                "Invoice {}: premi Rp {}, jatuh tempo {}. Bayar via portal payment gateway.",
                invoice_no, premium_amount, due_date
            ),
            related_entity_type: Some("invoice"),
            related_entity_id: None,
            attachment_path: None,
        },
    )
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &data.email,
            action: "registration_created",
            entity_type: "registration",
            entity_id: Some(reg_id.0),
            metadata: Some(json!({
                "registration_no": registration_no,
                "invoice_no": invoice_no,
                "product": data.product,
                "sum_assured": data.sum_assured,
                "premium": premium_amount,
            })),
            ip_address: None,
        },
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(CreateRegistrationResponse {
            registration_no,
            invoice_no,
            status: "PENDING".to_string(),
        }),
    ))
}

// ---- GET /registrations/{regNo} ----

#[derive(Debug, Serialize)]
struct RegistrationStatus {
    registration_no: String,
    status: String,
    invoice_status: String,
    policy_no: Option<String>,
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
    let pdf_path = storage::save_policy_pdf(&state.config.upload_dir, policy_id, &pdf_bytes).await?;

    // Save pdf_path to policy row (separate update; idempotent).
    sqlx::query("UPDATE policies SET pdf_path = $1 WHERE id = $2")
        .bind(&pdf_path)
        .bind(policy_id)
        .execute(&state.pool)
        .await?;

    // Queue emails
    send_email(
        &state.pool,
        Email {
            email_type: EmailType::PaymentSuccess,
            recipient: &email,
            subject: "Payment Received",
            body: &format!(
                "Pembayaran untuk invoice {} telah diterima. Polis {} segera terbit.",
                body.invoice_no, policy_no
            ),
            related_entity_type: Some("policy"),
            related_entity_id: Some(policy_id),
            attachment_path: None,
        },
    )
    .await?;

    let _ = state.config.upload_dir.as_str(); // ensure import isn't dropped (pdf_path is the actual attachment reference)

    send_email(
        &state.pool,
        Email {
            email_type: EmailType::EPolicyDelivery,
            recipient: &email,
            subject: "E-Policy Delivery",
            body: &format!("E-Policy Anda ({}) terlampir.", policy_no),
            related_entity_type: Some("policy"),
            related_entity_id: Some(policy_id),
            attachment_path: Some(pdf_path.clone()),
        },
    )
    .await?;

    // Issue activation token (sent via PORTAL_ACTIVATION email).
    let activation_token = state.tokens.issue(
        &customer_id_from_registration(&state, registration_id).await?.to_string(),
        crate::auth::Role::Customer,
        Some("activation".to_string()),
        60 * 60 * 24, // 24 jam
    )?;
    let activation_url = format!(
        "{}/portal/activate?token={}",
        state.config.app_base_url, activation_token
    );
    send_email(
        &state.pool,
        Email {
            email_type: EmailType::PortalActivation,
            recipient: &email,
            subject: "Activate your Customer Portal",
            body: &format!(
                "Halo {}, polis {} telah aktif. Aktivasi portal Anda: {}",
                full_name, policy_no, activation_url
            ),
            related_entity_type: Some("customer"),
            related_entity_id: None,
            attachment_path: None,
        },
    )
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: "payment_gateway",
            action: "payment_received",
            entity_type: "invoice",
            entity_id: Some(invoice_id),
            metadata: Some(json!({ "invoice_no": body.invoice_no })),
            ip_address: None,
        },
    )
    .await?;
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

fn validate_registration(d: &RegistrationData) -> Result<(), AppError> {
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
    if !matches!(
        d.product.as_str(),
        "LIFE" | "PERSONAL_ACCIDENT" | "HEALTH"
    ) {
        return Err(AppError::Validation(format!(
            "invalid product: {} (allowed: LIFE, PERSONAL_ACCIDENT, HEALTH)",
            d.product
        )));
    }
    if d.sum_assured <= Decimal::ZERO {
        return Err(AppError::Validation("sum_assured must be > 0".into()));
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

fn calculate_premium(product: &str, sum_assured: Decimal, coverage_term: i32) -> Decimal {
    // Pricing rule (placeholder): LIFE = 1.0% per tahun, PA = 0.5% per tahun,
    // HEALTH = 1.5% per tahun dari sum_assured. Spec menyebut "configured pricing
    // rule" — di MVP, hard-coded; production: tabel `pricing_rules` atau config.
    let rate = match product {
        "LIFE" => Decimal::new(10, 3),             // 0.010
        "PERSONAL_ACCIDENT" => Decimal::new(5, 3), // 0.005
        "HEALTH" => Decimal::new(15, 3),           // 0.015
        _ => Decimal::new(10, 3),
    };
    let years = Decimal::from(coverage_term);
    (sum_assured * rate * years).round_dp(2)
}

fn product_name_from_code(code: &str) -> &str {
    match code {
        "LIFE" => "Life Insurance",
        "PERSONAL_ACCIDENT" => "Personal Accident Insurance",
        "HEALTH" => "Health Insurance",
        _ => "Insurance Product",
    }
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
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=3600"),
    );
    Ok(resp)
}
