//! Customer portal endpoints (Customer JWT required). Spec §8.2.
//!
//!   POST /api/customer/activate          (activation-purpose JWT, no prior auth)
//!   POST /api/customer/login
//!   POST /api/customer/password/reset
//!   POST /api/customer/password/reset/consume
//!   GET  /api/customer/me                 (dashboard summary)
//!   GET  /api/customer/policies           (own policies)
//!   GET  /api/customer/policies/:id
//!   GET  /api/customer/policies/:id/pdf
//!   POST /api/customer/claims            (multipart, claim form)
//!   GET  /api/customer/claims
//!   GET  /api/customer/claims/:id
//!   POST /api/customer/inquiries
//!   GET  /api/customer/inquiries
//!   GET  /api/customer/inquiries/:id

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{password::hash_password, password::verify_password, RequireCustomer, Role},
    domain::{
        claim::can_transition as claim_can_transition,
        identifier::{next_id, EntityType},
    },
    dto::{
        find_plan, product_name_from_code, ActivateRequest, LoginRequest, LoginResponse,
        PasswordResetConsumeRequest, PasswordResetRequest, RegistrationData,
    },
    error::{AppError, AppResult},
    repo::{Page, PageQuery},
    routes::public::{calculate_premium, validate_registration},
    services::{
        audit::{write as audit_write, AuditEntry},
        email::{send as send_email, Email, EmailType},
        pdf::{
            render_invoice as render_invoice_pdf, InvoicePdfInput,
            ParticipantSummary as PdfParticipant,
        },
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/activate", post(activate))
        .route("/login", post(login))
        .route("/password/reset", post(password_reset))
        .route("/password/reset/consume", post(password_reset_consume))
        .route("/me", get(me).patch(update_me))
        .route("/password/change", axum::routing::post(change_password))
        .route("/registrations", post(submit_insurance_application))
        .route("/policies", get(list_policies))
        .route("/policies/:id", get(get_policy))
        .route("/policies/:id/pdf", get(download_policy_pdf))
        .route("/invoices", get(list_invoices))
        .route("/invoices/:id", get(get_invoice))
        .route("/invoices/:id/pdf", get(download_invoice_pdf))
        .route("/invoices/:id/receipt", get(download_invoice_receipt))
        .route("/claims", get(list_claims).post(create_claim))
        .route("/claims/:id", get(get_claim))
        .route("/inquiries", get(list_inquiries).post(create_inquiry))
        .route("/inquiries/:id", get(get_inquiry))
        .route(
            "/inquiries/:id/messages",
            axum::routing::post(customer_inquiry_message),
        )
        .route(
            "/inquiries/:id/close",
            axum::routing::post(customer_inquiry_close),
        )
}

#[derive(sqlx::FromRow)]
struct CustomerCredRow {
    id: Uuid,
    email: String,
    full_name: String,
    password_hash: Option<String>,
    portal_status: Option<String>,
    /// `is_active = false` menandakan admin sudah menonaktifkan akun.
    /// Login handler menolak dengan Unauthorized agar customer tidak
    /// bisa bypass deactivate. Field ini ditambah di migration 0019.
    is_active: bool,
}

fn customer_id_from(claims: &crate::auth::Claims) -> AppResult<Uuid> {
    claims
        .sub
        .parse::<Uuid>()
        .map_err(|_| AppError::Unauthorized)
}

// ---- POST /activate ----

async fn activate(
    State(state): State<AppState>,
    Json(req): Json<ActivateRequest>,
) -> AppResult<Json<LoginResponse>> {
    let claims = state.tokens.verify(&req.token)?;
    if claims.purpose.as_deref() != Some("activation") || claims.role != Role::Customer {
        return Err(AppError::Unauthorized);
    }

    let customer_id: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    let row: Option<CustomerCredRow> = sqlx::query_as(
        r#"
        UPDATE customers
           SET portal_status = 'ACTIVE', updated_at = now()
         WHERE id = $1 AND portal_status = 'PENDING'
         RETURNING id, email, full_name, password_hash, portal_status, is_active
        "#,
    )
    .bind(customer_id)
    .fetch_optional(&state.pool)
    .await?;

    let customer = row.ok_or(AppError::NotFound(
        "customer (already active or not found)".into(),
    ))?;

    let token = state.tokens.issue(
        &customer.id.to_string(),
        Role::Customer,
        None,
        false,
        60 * 60 * 8,
    )?;
    Ok(Json(LoginResponse {
        token,
        role: "customer".to_string(),
        id: Some(customer.id),
        is_super_admin: None,
    }))
}

// ---- POST /login ----

async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    let row: Option<CustomerCredRow> = sqlx::query_as(
        r#"
        SELECT id, email, full_name, password_hash, portal_status, is_active
          FROM customers WHERE email = $1
        "#,
    )
    .bind(&req.username)
    .fetch_optional(&state.pool)
    .await?;

    let customer = row.ok_or(AppError::Unauthorized)?;
    // is_active = false → admin sudah menonaktifkan akun. Tolak login
    // dengan response yang sama dengan credential salah supaya tidak
    // bocorin info "akun ini ada tapi nonaktif" vs "akun tidak ada".
    if !customer.is_active {
        return Err(AppError::Unauthorized);
    }
    let stored_hash = customer
        .password_hash
        .as_deref()
        .ok_or(AppError::Unauthorized)?;

    if !verify_password(&req.password, stored_hash)? {
        return Err(AppError::Unauthorized);
    }
    // Login diizinkan untuk PENDING dan ACTIVE — user yang baru registrasi
    // perlu bisa login untuk lihat dashboard & profile walau belum aktivasi
    // email. Gate "wajib aktivasi" dipasang di endpoint aksi (mis.
    // submit_insurance_application) sehingga alur registrasi → aktivasi
    // → apply asuransi bisa dipandu step-by-step dari portal.

    let token = state.tokens.issue(
        &customer.id.to_string(),
        Role::Customer,
        None,
        false,
        60 * 60 * 8,
    )?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &customer.email,
            action: "customer_login",
            entity_type: "customer",
            entity_id: Some(customer.id),
            metadata: None,
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(LoginResponse {
        token,
        role: "customer".to_string(),
        id: Some(customer.id),
        is_super_admin: None,
    }))
}

// ---- POST /password/reset ----

async fn password_reset(
    State(state): State<AppState>,
    Json(req): Json<PasswordResetRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let row: Option<CustomerCredRow> = sqlx::query_as(
        "SELECT id, email, full_name, password_hash, portal_status, is_active FROM customers WHERE email = $1",
    )
    .bind(req.email.trim().to_lowercase())
    .fetch_optional(&state.pool)
    .await?;

    // Anti-enumeration: SELALU return ok:true supaya attacker tidak bisa
    // membedakan "email tidak ada" vs "email ada". Email & PENDING cases
    // skip kirim email tapi response tetap sama.
    let Some(customer) = row else {
        return Ok(Json(serde_json::json!({ "ok": true })));
    };
    if customer.portal_status.as_deref() != Some("ACTIVE") {
        return Ok(Json(serde_json::json!({ "ok": true })));
    }

    let reset_token = state.tokens.issue(
        &customer.id.to_string(),
        Role::Customer,
        Some("password_reset".to_string()),
        false,
        60 * 30,
    )?;
    let reset_url = format!(
        "{}/portal/reset?token={}",
        state.config.app_base_url.trim_end_matches('/'),
        reset_token
    );

    let body = format!(
        "Halo {},\n\n\
         Kami menerima permintaan untuk mengatur ulang password akun InsureTrack Anda. \
         Klik tombol di bawah untuk membuat password baru. Link ini berlaku selama 30 menit.\n\n\
         Jika Anda tidak merasa meminta reset password, abaikan email ini — \
         akun Anda tetap aman.\n\n\
         Salam,\n\
         Tim InsureTrack",
        customer.full_name.trim()
    );
    // Fire-and-forget — failure to send email TIDAK gagalkan response,
    // konsisten dengan activation email flow di register_customer.
    let _ = send_email(
        &state.pool,
        &*state.storage,
        &*state.email,
        Email {
            email_type: EmailType::PasswordReset,
            recipient: &customer.email,
            subject: "Reset Password InsureTrack Portal",
            body: &body,
            cta_text: Some("Reset Password Saya →"),
            cta_url: Some(&reset_url),
            related_entity_type: Some("customer"),
            related_entity_id: Some(customer.id),
            attachment_path: None,
        },
    )
    .await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn password_reset_consume(
    State(state): State<AppState>,
    Json(req): Json<PasswordResetConsumeRequest>,
) -> AppResult<Json<LoginResponse>> {
    if req.new_password.len() < 8 {
        return Err(AppError::Validation(
            "Password baru minimal 8 karakter".into(),
        ));
    }
    let claims = state.tokens.verify(&req.token)?;
    if claims.purpose.as_deref() != Some("password_reset") || claims.role != Role::Customer {
        return Err(AppError::Unauthorized);
    }
    let customer_id: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let new_hash = hash_password(&req.new_password)?;

    let row: Option<CustomerCredRow> = sqlx::query_as(
        r#"
        UPDATE customers
           SET password_hash = $1, updated_at = now()
         WHERE id = $2
        RETURNING id, email, full_name, password_hash, portal_status
        "#,
    )
    .bind(&new_hash)
    .bind(customer_id)
    .fetch_optional(&state.pool)
    .await?;
    let customer = row.ok_or(AppError::NotFound("customer".into()))?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &customer.email,
            action: "customer_password_reset",
            entity_type: "customer",
            entity_id: Some(customer.id),
            metadata: None,
            ip_address: None,
        },
    )
    .await?;

    // Issue a fresh login token so the user is signed in immediately.
    let token = state.tokens.issue(
        &customer.id.to_string(),
        Role::Customer,
        None,
        false,
        60 * 60 * 8,
    )?;
    Ok(Json(LoginResponse {
        token,
        role: "customer".to_string(),
        id: Some(customer.id),
        is_super_admin: None,
    }))
}

// ---- GET /me ----

#[derive(Serialize)]
struct MeSummary {
    customer_id: Uuid,
    email: String,
    full_name: String,
    /// Status aktivasi portal. PENDING = akun dibuat, belum klik link
    /// aktivasi email; ACTIVE = sudah aktivasi. Frontend pakai ini untuk
    /// tampilkan banner "aktivasi email" sebelum user mencoba submit
    /// form yang butuh akun aktif.
    portal_status: String,
    /// Nomor HP customer (diperlukan oleh form edit profil).
    mobile_number: String,
    // ---- Insurance fields (NULLable — di-prefill ke form registrasi
    // insurance kalau customer sudah pernah submit sebelumnya) ----
    /// NIK 16 digit. Null untuk customer yang baru registrasi akun dan
    /// belum pernah apply insurance.
    nik: Option<String>,
    birth_place: Option<String>,
    birth_date: Option<chrono::NaiveDate>,
    gender: Option<String>,
    address: Option<String>,
    rt_rw: Option<String>,
    village: Option<String>,
    district: Option<String>,
    city: Option<String>,
    province: Option<String>,
    postal_code: Option<String>,
    // ---- Stats ----
    active_policy_count: i64,
    total_sum_assured: Option<Decimal>,
    open_claim_count: i64,
    open_inquiry_count: i64,
}

async fn me(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
) -> AppResult<Json<MeSummary>> {
    let customer_id = customer_id_from(&claims)?;

    #[derive(sqlx::FromRow)]
    struct MeRow {
        id: Uuid,
        email: String,
        full_name: String,
        portal_status: String,
        mobile_number: String,
        nik: Option<String>,
        birth_place: Option<String>,
        birth_date: Option<chrono::NaiveDate>,
        gender: Option<String>,
        address: Option<String>,
        rt_rw: Option<String>,
        village: Option<String>,
        district: Option<String>,
        city: Option<String>,
        province: Option<String>,
        postal_code: Option<String>,
        active_policy_count: i64,
        total_sum_assured: Option<Decimal>,
        open_claim_count: i64,
        open_inquiry_count: i64,
    }

    let row: MeRow = sqlx::query_as(
        r#"
        SELECT c.id, c.email, c.full_name, c.portal_status, c.mobile_number,
               c.nik, c.birth_place, c.birth_date, c.gender,
               c.address, c.rt_rw, c.village, c.district, c.city, c.province, c.postal_code,
               (SELECT COUNT(*) FROM policies  p WHERE p.registration_id IN
                  (SELECT id FROM registrations WHERE customer_id = c.id) AND p.status = 'ACTIVE')
                 AS active_policy_count,
               (SELECT SUM(p.sum_assured) FROM policies p WHERE p.registration_id IN
                  (SELECT id FROM registrations WHERE customer_id = c.id) AND p.status = 'ACTIVE')
                 AS total_sum_assured,
               (SELECT COUNT(*) FROM claims   cl WHERE cl.customer_id = c.id
                  AND cl.status IN ('SUBMITTED','UNDER_REVIEW')) AS open_claim_count,
               (SELECT COUNT(*) FROM inquiries iq WHERE iq.customer_id = c.id
                  AND iq.status = 'OPEN') AS open_inquiry_count
          FROM customers c
         WHERE c.id = $1
        "#,
    )
    .bind(customer_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(MeSummary {
        customer_id: row.id,
        email: row.email,
        full_name: row.full_name,
        portal_status: row.portal_status,
        mobile_number: row.mobile_number,
        nik: row.nik,
        birth_place: row.birth_place,
        birth_date: row.birth_date,
        gender: row.gender,
        address: row.address,
        rt_rw: row.rt_rw,
        village: row.village,
        district: row.district,
        city: row.city,
        province: row.province,
        postal_code: row.postal_code,
        active_policy_count: row.active_policy_count,
        total_sum_assured: row.total_sum_assured,
        open_claim_count: row.open_claim_count,
        open_inquiry_count: row.open_inquiry_count,
    }))
}

// ---- PATCH /me ----
//
// Update basic profile fields. Saat ini hanya 3 field yang boleh
// diubah dari portal: full_name, email, mobile_number. Field lain
// (NIK, birth_date, address, dll.) terkunci setelah registrasi
// aplikasi asuransi untuk konsistensi dengan data polis/klaim.

#[derive(Debug, Deserialize)]
struct UpdateMeRequest {
    full_name: Option<String>,
    email: Option<String>,
    mobile_number: Option<String>,
}

#[derive(Serialize)]
struct UpdateMeResponse {
    customer_id: Uuid,
    full_name: String,
    email: String,
    mobile_number: String,
}

async fn update_me(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Json(req): Json<UpdateMeRequest>,
) -> AppResult<Json<UpdateMeResponse>> {
    let customer_id = customer_id_from(&claims)?;

    // Normalisasi & validasi per-field. Kalau field None, biarkan
    // nilai existing (tidak di-overwrite). Kalau Some("") ditolak.
    let full = req
        .full_name
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let email = req
        .email
        .as_deref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());
    let mobile = req
        .mobile_number
        .as_deref()
        .map(|s| {
            s.chars()
                .filter(|c| c.is_ascii_digit() || *c == '+')
                .collect::<String>()
        })
        .filter(|s: &String| (10..=15).contains(&s.len()));

    // Validasi format kalau user supply nilai baru.
    if let Some(ref e) = email {
        if !e.contains('@') || !e.contains('.') {
            return Err(AppError::Validation("format email tidak valid".into()));
        }
    }
    if let Some(ref m) = mobile {
        let digit_count = m.chars().filter(|c| c.is_ascii_digit()).count();
        if !(10..=15).contains(&digit_count) {
            return Err(AppError::Validation("nomor HP harus 10-15 digit".into()));
        }
    }
    if let Some(ref f) = full {
        if f.chars().count() < 3 {
            return Err(AppError::Validation("nama minimal 3 karakter".into()));
        }
    }

    // Cek konflik email kalau diubah.
    if let Some(ref e) = email {
        let conflict: Option<(Uuid,)> =
            sqlx::query_as("SELECT id FROM customers WHERE email = $1 AND id <> $2")
                .bind(e)
                .bind(customer_id)
                .fetch_optional(&state.pool)
                .await?;
        if conflict.is_some() {
            return Err(AppError::Conflict(
                "email sudah dipakai customer lain".into(),
            ));
        }
    }

    let row: (Uuid, String, String, String) = sqlx::query_as(
        r#"
        UPDATE customers
           SET full_name     = COALESCE($2, full_name),
               email         = COALESCE($3, email),
               mobile_number = COALESCE($4, mobile_number),
               updated_at    = now()
         WHERE id = $1
        RETURNING id, full_name, email, mobile_number
        "#,
    )
    .bind(customer_id)
    .bind(full)
    .bind(email)
    .bind(mobile)
    .fetch_one(&state.pool)
    .await?;

    // Audit (FS-15) — best-effort, jangan fail request kalau audit error.
    let fields_changed: Vec<&str> = [
        req.full_name.as_ref().map(|_| "full_name" as &str),
        req.email.as_ref().map(|_| "email" as &str),
        req.mobile_number.as_ref().map(|_| "mobile_number" as &str),
    ]
    .into_iter()
    .flatten()
    .collect();
    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.sub,
            action: "customer_profile_updated",
            entity_type: "customer",
            entity_id: Some(customer_id),
            metadata: Some(serde_json::json!({ "fields_changed": fields_changed })),
            ip_address: None,
        },
    )
    .await;

    Ok(Json(UpdateMeResponse {
        customer_id: row.0,
        full_name: row.1,
        email: row.2,
        mobile_number: row.3,
    }))
}

// ---- POST /password/change ----
//
// Change password while logged in. User harus supply current password
// (autentikasi ulang) sebelum password baru di-set. Tidak ada token
// email — kalau user lupa password, pakai /password/reset flow
// (lihat routes/customer.rs::password_reset).

#[derive(Debug, Deserialize)]
struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Json(req): Json<ChangePasswordRequest>,
) -> AppResult<StatusCode> {
    let customer_id = customer_id_from(&claims)?;

    if req.new_password.len() < 8 {
        return Err(AppError::Validation(
            "Password baru minimal 8 karakter".into(),
        ));
    }
    if req.new_password == req.current_password {
        return Err(AppError::Validation(
            "Password baru harus berbeda dari password lama".into(),
        ));
    }

    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT password_hash FROM customers WHERE id = $1")
            .bind(customer_id)
            .fetch_optional(&state.pool)
            .await?;
    let (current_hash_opt,) = row.ok_or(AppError::Unauthorized)?;
    let current_hash = current_hash_opt.as_deref().ok_or(AppError::Unauthorized)?;

    if !verify_password(&req.current_password, current_hash)? {
        return Err(AppError::Unauthorized);
    }

    let new_hash = hash_password(&req.new_password)?;
    sqlx::query(
        "UPDATE customers SET password_hash = $1, password_changed_at = now(), updated_at = now() WHERE id = $2",
    )
    .bind(&new_hash)
    .bind(customer_id)
    .execute(&state.pool)
    .await?;

    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.sub,
            action: "customer_password_changed",
            entity_type: "customer",
            entity_id: Some(customer_id),
            metadata: None,
            ip_address: None,
        },
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ---- /policies ----

/// Subset data customer (peserta INSTANSI) yang di-include di response
/// `GET /customer/policies` agar customer bisa lihat "polis ini untuk
/// peserta siapa" di daftar N polis hasil 1 group registration. Shape JSON
/// dipertahankan sama walau sumbernya sekarang `customers` (via
/// registration_members), bukan tabel registration_participants lama.
#[derive(Serialize, sqlx::FromRow, Clone)]
struct ParticipantSummary {
    id: Uuid,
    nik: String,
    full_name: String,
    birth_date: chrono::NaiveDate,
}

/// Internal: flat row dari SQL query, kemudian di-bundle ke PolicyRow.
#[derive(sqlx::FromRow)]
struct PolicyRowRaw {
    id: Uuid,
    policy_no: String,
    product: String,
    sum_assured: Decimal,
    premium: Decimal,
    effective_date: chrono::NaiveDate,
    expiry_date: chrono::NaiveDate,
    status: String,
    pdf_path: Option<String>,
    participant_id_flat: Option<Uuid>,
    participant_nik: Option<String>,
    participant_full_name: Option<String>,
    participant_birth_date: Option<chrono::NaiveDate>,
}

impl From<PolicyRowRaw> for PolicyRow {
    fn from(r: PolicyRowRaw) -> Self {
        let participant = r
            .participant_id_flat
            .zip(r.participant_nik)
            .zip(r.participant_full_name)
            .zip(r.participant_birth_date)
            .map(|(((id, nik), full_name), birth_date)| ParticipantSummary {
                id,
                nik,
                full_name,
                birth_date,
            });
        Self {
            id: r.id,
            policy_no: r.policy_no,
            product: r.product,
            sum_assured: r.sum_assured,
            premium: r.premium,
            effective_date: r.effective_date,
            expiry_date: r.expiry_date,
            status: r.status,
            pdf_path: r.pdf_path,
            participant,
        }
    }
}

#[derive(Serialize)]
struct PolicyRow {
    id: Uuid,
    policy_no: String,
    product: String,
    sum_assured: Decimal,
    premium: Decimal,
    effective_date: chrono::NaiveDate,
    expiry_date: chrono::NaiveDate,
    status: String,
    pdf_path: Option<String>,
    /// Untuk policy dari Instansi: info peserta yang dicakup.
    /// NULL untuk INDIVIDU flow.
    participant: Option<ParticipantSummary>,
}

async fn list_policies(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<PolicyRow>>> {
    let customer_id = customer_id_from(&claims)?;
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let status = q.status.clone().unwrap_or_default();

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
         WHERE r.customer_id = $1
           AND ($2 = '' OR p.status = $2)
        "#,
    )
    .bind(customer_id)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    // LEFT JOIN registration_members → customers — NULL member_id (Individu)
    // tetap dapat row, participant_* fields jadi NULL.
    let raw: Vec<PolicyRowRaw> = sqlx::query_as(
        r#"
        SELECT p.id, p.policy_no, p.product, p.sum_assured, p.premium,
               p.effective_date, p.expiry_date, p.status, p.pdf_path,
               pc.id AS participant_id_flat,
               pc.nik AS participant_nik,
               pc.full_name AS participant_full_name,
               pc.birth_date AS participant_birth_date
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
          LEFT JOIN registration_members rm ON rm.id = p.member_id
          LEFT JOIN customers pc ON pc.id = rm.customer_id
         WHERE r.customer_id = $1
           AND ($2 = '' OR p.status = $2)
         ORDER BY p.created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(customer_id)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;
    let data: Vec<PolicyRow> = raw.into_iter().map(Into::into).collect();

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

async fn get_policy(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Json<PolicyRow>> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<PolicyRowRaw> = sqlx::query_as(
        r#"
        SELECT p.id, p.policy_no, p.product, p.sum_assured, p.premium,
               p.effective_date, p.expiry_date, p.status, p.pdf_path,
               pc.id AS participant_id_flat,
               pc.nik AS participant_nik,
               pc.full_name AS participant_full_name,
               pc.birth_date AS participant_birth_date
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
          LEFT JOIN registration_members rm ON rm.id = p.member_id
          LEFT JOIN customers pc ON pc.id = rm.customer_id
         WHERE r.customer_id = $1 AND p.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    row.map(Into::into)
        .map(Json)
        .ok_or(AppError::NotFound("policy".into()))
}

async fn download_policy_pdf(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Response> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<(Option<String>,)> = sqlx::query_as(
        r#"
        SELECT p.pdf_path
          FROM policies p
          JOIN registrations r ON r.id = p.registration_id
         WHERE r.customer_id = $1 AND p.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (pdf_path_opt,) = row.ok_or(AppError::NotFound("policy".into()))?;
    let pdf_path = pdf_path_opt.ok_or(AppError::NotFound("policy pdf".into()))?;

    let bytes = state.storage.read_bytes(&pdf_path).await?;
    let body = Body::from(bytes);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment"),
    );
    Ok((StatusCode::OK, headers, body).into_response())
}

// ---- /claims ----

#[derive(Serialize, sqlx::FromRow)]
struct ClaimRow {
    id: Uuid,
    claim_no: String,
    policy_id: Uuid,
    policy_no: String,
    claim_type: String,
    incident_date: chrono::NaiveDate,
    claimed_amount: Decimal,
    description: String,
    status: String,
    decision_note: Option<String>,
    /// Bukti pembayaran yang di-upload admin saat transisi APPROVED → PAID.
    /// NULL untuk klaim yang belum paid atau yang di-issue sebelum fitur ini
    /// ada. Frontend render link download kalau status = PAID.
    payment_proof_path: Option<String>,
    submitted_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
struct CreateClaimJson {
    policy_id: Uuid,
    incident_date: chrono::NaiveDate,
    description: String,
    // `claim_type` & `claimed_amount` di-set server-side dari policy:
    //   claim_type      = default_claim_type_for_product(policy.product)
    //   claimed_amount  = policy.sum_assured
    // User tidak input — lihat create_claim handler di bawah. Admin
    // bisa override claim_type via PATCH /admin/claims/:id.
}

#[derive(Serialize)]
struct CreateClaimResponse {
    claim_no: String,
    status: String,
}

async fn list_claims(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<ClaimRow>>> {
    let customer_id = customer_id_from(&claims)?;
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let status = q.status.clone().unwrap_or_default();

    let total: (i64,) = sqlx::query_as(
        r#"SELECT COUNT(*) FROM claims WHERE customer_id = $1 AND ($2 = '' OR status = $2)"#,
    )
    .bind(customer_id)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<ClaimRow> = sqlx::query_as(
        r#"
        SELECT cl.id, cl.claim_no, cl.policy_id, p.policy_no,
               cl.claim_type, cl.incident_date, cl.claimed_amount, cl.description,
               cl.status, cl.decision_note, cl.payment_proof_path, cl.submitted_at, cl.updated_at
          FROM claims cl
          JOIN policies p ON p.id = cl.policy_id
         WHERE cl.customer_id = $1
           AND ($2 = '' OR cl.status = $2)
         ORDER BY cl.submitted_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(customer_id)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

async fn get_claim(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ClaimRow>> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<ClaimRow> = sqlx::query_as(
        r#"
        SELECT cl.id, cl.claim_no, cl.policy_id, p.policy_no,
               cl.claim_type, cl.incident_date, cl.claimed_amount, cl.description,
               cl.status, cl.decision_note, cl.payment_proof_path, cl.submitted_at, cl.updated_at
          FROM claims cl
          JOIN policies p ON p.id = cl.policy_id
         WHERE cl.customer_id = $1 AND cl.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    row.map(Json).ok_or(AppError::NotFound("claim".into()))
}

async fn create_claim(
    State(state): State<AppState>,
    RequireCustomer(customer_claims): RequireCustomer,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    let customer_id = customer_id_from(&customer_claims)?;

    let mut data_json: Option<String> = None;
    let mut doc_files: Vec<(String, String, Vec<u8>)> = Vec::new(); // (name, mime, bytes)

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Validation(format!("multipart: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "data" => {
                data_json = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::Validation(format!("data: {e}")))?,
                );
            }
            "documents" => {
                let file_name = field.file_name().unwrap_or("evidence").to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::Validation(format!("doc bytes: {e}")))?;
                doc_files.push((file_name, content_type, bytes.to_vec()));
            }
            _ => {}
        }
    }

    let data_str = data_json.ok_or_else(|| AppError::Validation("missing 'data' field".into()))?;
    let data: CreateClaimJson = serde_json::from_str(&data_str)
        .map_err(|e| AppError::Validation(format!("invalid data JSON: {e}")))?;

    // Validate: policy belongs to customer, ACTIVE, incident_date in coverage period.
    // `claim_type` & `claimed_amount` di-derive dari policy di bawah
    // (lihat komentar di CreateClaimJson).
    let policy: Option<(
        Uuid,
        String,
        String,
        Decimal,
        chrono::NaiveDate,
        chrono::NaiveDate,
    )> = sqlx::query_as(
        r#"
            SELECT p.id, p.status, p.product, p.sum_assured, p.effective_date, p.expiry_date
              FROM policies p
              JOIN registrations r ON r.id = p.registration_id
             WHERE p.id = $1 AND r.customer_id = $2
            "#,
    )
    .bind(data.policy_id)
    .bind(customer_id)
    .fetch_optional(&state.pool)
    .await?;
    let (pid, pstatus, product, sum_assured, eff, exp) =
        policy.ok_or(AppError::NotFound("policy not found or not owned".into()))?;
    if pstatus != "ACTIVE" {
        return Err(AppError::Validation(format!(
            "policy not active (status: {pstatus})"
        )));
    }
    // WIB (UTC+7), bukan Utc::now().date_naive() — kalender UTC lag 7 jam
    // dari WIB, jadi incident_date = hari ini bisa salah ke-reject sebagai
    // "masa depan" antara jam 00:00-06:59 WIB.
    let wib = chrono::FixedOffset::east_opt(7 * 3600).expect("valid offset");
    let today = Utc::now().with_timezone(&wib).date_naive();
    if data.incident_date > today {
        return Err(AppError::Validation(
            "incident_date cannot be in the future".into(),
        ));
    }
    if data.incident_date < eff || data.incident_date > exp {
        return Err(AppError::Validation(
            "incident_date outside policy coverage period".into(),
        ));
    }
    let _ = pid;

    // Auto-determine claim_type dari product. Admin bisa override via
    // PATCH /admin/claims/:id (lihat domain::claim::default_claim_type_for_product).
    let claim_type = crate::domain::claim::default_claim_type_for_product(&product);
    // Auto-set claimed_amount ke UP polis. Final amount ditentukan
    // admin di PATCH /admin/claims/:id (transisi APPROVED → PAID).
    let claimed_amount = sum_assured;

    // Save documents first so we can reference claim_id.
    let mut tx = state.pool.begin().await?;
    let claim_no = next_id(&mut tx, EntityType::Claim).await?;
    let claim_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO claims
          (id, claim_no, policy_id, customer_id, claim_type, incident_date,
           claimed_amount, description, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SUBMITTED')
        "#,
    )
    .bind(claim_id)
    .bind(&claim_no)
    .bind(data.policy_id)
    .bind(customer_id)
    .bind(claim_type)
    .bind(data.incident_date)
    .bind(claimed_amount)
    .bind(&data.description)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    for (fname, mime_t, bytes) in &doc_files {
        let doc_ref = state
            .storage
            .save_claim_doc(claim_id, fname, mime_t, bytes)
            .await?;
        let rel = doc_ref.key;
        sqlx::query(
            r#"INSERT INTO claim_documents (claim_id, file_name, file_path) VALUES ($1, $2, $3)"#,
        )
        .bind(claim_id)
        .bind(fname)
        .bind(rel)
        .execute(&state.pool)
        .await?;
    }

    // Email + audit
    let customer_email: String = sqlx::query_scalar("SELECT email FROM customers WHERE id = $1")
        .bind(customer_id)
        .fetch_one(&state.pool)
        .await?;

    send_email(
        &state.pool,
        &*state.storage,
        &*state.email,
        Email {
            email_type: EmailType::ClaimReceived,
            recipient: &customer_email,
            subject: &format!("Klaim {} Diterima — Dalam Peninjauan", claim_no),
            body: &format!(
                "Halo,\n\n\
                 Klaim {} untuk polis terkait telah kami terima dan sedang \
                 dalam antrian peninjauan tim kami. Kamu akan dapat notifikasi \
                 email begitu ada update status.\n\n\
                 Untuk lihat progress klaim kapan saja, login ke portal > menu Klaim.\n\n\
                 Salam,\n\
                 Tim InsureTrack",
                claim_no
            ),
            cta_text: None,
            cta_url: None,
            related_entity_type: Some("claim"),
            related_entity_id: Some(claim_id),
            attachment_path: None,
        },
    )
    .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &customer_email,
            action: "claim_submitted",
            entity_type: "claim",
            entity_id: Some(claim_id),
            metadata: Some(serde_json::json!({
                "claim_no": claim_no,
                "policy_id": data.policy_id,
                "claim_type_auto": claim_type,
                "claim_type_source": "derived_from_product",
                "claimed_amount_auto": claimed_amount.to_string(),
                "claimed_amount_source": "policy.sum_assured",
            })),
            ip_address: None,
        },
    )
    .await?;

    // Touch state machine helper so we know it's wired (no transition at submit; just import).
    let _ = claim_can_transition;

    Ok((
        StatusCode::CREATED,
        Json(CreateClaimResponse {
            claim_no,
            status: "SUBMITTED".to_string(),
        }),
    ))
}

// ---- /inquiries ----
//
// Model ticketing sejak migrasi 0011: inquiry punya banyak messages di
// tabel `inquiry_messages` (thread). Status parent = state dari latest
// message (OPEN = latest by customer, ANSWERED = latest by admin).
//
// Response shape:
//   - `InquiryRow`      — list view (inquiry + summary fields)
//   - `InquiryDetailRow` — detail view (inquiry + semua messages)
//   - `MessageRow`       — satu message di thread

#[derive(Serialize, sqlx::FromRow)]
struct InquiryRow {
    id: Uuid,
    inquiry_no: String,
    policy_id: Option<Uuid>,
    policy_no: Option<String>,
    subject: String,
    /// Pesan customer pertama (dipertahankan untuk backward-compat dengan
    /// inquiry lama). Pesan-pesan setelahnya ada di `inquiry_messages`.
    message: String,
    status: String,
    /// Legacy: admin's first answer. Backward-compat — caller baru read
    /// dari `inquiry_messages`.
    response: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    responded_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Timestamp pesan terakhir di thread (untuk auto-close check & list preview).
    last_message_at: Option<chrono::DateTime<chrono::Utc>>,
    last_sender_type: Option<String>,
    closed_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Snippet pesan terakhir di thread (subquery dari `inquiry_messages`).
    /// `None` untuk inquiry legacy yang belum punya thread (sangat jarang —
    /// biasanya backfill 0011 sudah cover semua).
    last_message_preview: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
struct MessageRow {
    id: Uuid,
    sender_type: String,
    sender_id: Option<Uuid>,
    sender_name: String,
    message: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
struct InquiryDetailRow {
    #[serde(flatten)]
    inquiry: InquiryRow,
    messages: Vec<MessageRow>,
}

#[derive(serde::Deserialize)]
struct CreateInquiryJson {
    policy_id: Option<Uuid>,
    subject: String,
    message: String,
}

#[derive(serde::Deserialize)]
struct CreateMessageJson {
    message: String,
}

#[derive(serde::Deserialize)]
struct CloseInquiryJson {
    /// Optional — kalau di-set, akan di-append sebagai pesan "system"
    /// terakhir sebelum close. Biasanya untuk customer/admin memberikan
    /// alasan close.
    #[serde(default)]
    note: Option<String>,
}

#[derive(Serialize)]
struct CreateInquiryResponse {
    id: Uuid,
    inquiry_no: String,
    status: String,
}

async fn list_inquiries(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<InquiryRow>>> {
    let customer_id = customer_id_from(&claims)?;
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let status = q.status.clone().unwrap_or_default();

    let total: (i64,) = sqlx::query_as(
        r#"SELECT COUNT(*) FROM inquiries WHERE customer_id = $1 AND ($2 = '' OR status = $2)"#,
    )
    .bind(customer_id)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<InquiryRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, i.policy_id, p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at,
               i.last_message_at, i.last_sender_type, i.closed_at,
               (SELECT message FROM inquiry_messages
                 WHERE inquiry_id = i.id
                 ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
          FROM inquiries i
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE i.customer_id = $1
           AND ($2 = '' OR i.status = $2)
         ORDER BY COALESCE(i.last_message_at, i.created_at) DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(customer_id)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    // Lazy auto-close: stale ANSWERED → CLOSED (idempotent). Lihat helper
    // `try_auto_close_stale`. Update row di-place supaya response ke
    // client reflect status baru tanpa round-trip tambahan.
    let mut data = data;
    for row in data.iter_mut() {
        if row.status == "ANSWERED" {
            if let Some(closed) =
                crate::services::inquiry::try_auto_close_stale(&state, row.id).await?
            {
                row.status = "CLOSED".into();
                row.closed_at = Some(closed);
            }
        }
    }

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

async fn get_inquiry(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Json<InquiryDetailRow>> {
    let customer_id = customer_id_from(&claims)?;

    // Lazy auto-close sebelum fetch — kalau stale, close dulu agar response
    // status akurat. Idempotent.
    let _ = crate::services::inquiry::try_auto_close_stale(&state, id).await?;

    let inquiry: Option<InquiryRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, i.policy_id, p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at,
               i.last_message_at, i.last_sender_type, i.closed_at,
               (SELECT message FROM inquiry_messages
                 WHERE inquiry_id = i.id
                 ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
          FROM inquiries i
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE i.customer_id = $1 AND i.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let inquiry = inquiry.ok_or(AppError::NotFound("inquiry".into()))?;

    // Thread messages (urut kronologis ascending — biar FE render top-to-bottom).
    let messages: Vec<MessageRow> = sqlx::query_as(
        r#"
        SELECT id, sender_type, sender_id, sender_name, message, created_at
          FROM inquiry_messages
         WHERE inquiry_id = $1
         ORDER BY created_at ASC, id ASC
        "#,
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(InquiryDetailRow { inquiry, messages }))
}

/// Customer reply — tambah message baru ke thread inquiry.
///
/// Efek samping:
///   - INSERT ke `inquiry_messages` (sender_type=CUSTOMER)
///   - UPDATE parent: status=OPEN (latest msg dari customer), last_message_at
///   - Email admin (InquiryCustomerReply) — best-effort
///   - Audit log
async fn customer_inquiry_message(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
    Json(req): Json<CreateMessageJson>,
) -> AppResult<Json<InquiryDetailRow>> {
    use crate::domain::inquiry::can_transition;

    let customer_id = customer_id_from(&claims)?;
    let message = req.message.trim();
    if message.is_empty() {
        return Err(AppError::Validation("message required".into()));
    }
    if message.len() > 5000 {
        return Err(AppError::Validation("message max 5000 chars".into()));
    }

    // Verify ownership + get current status.
    let current: Option<(String, Uuid, Option<Uuid>)> =
        sqlx::query_as(r#"SELECT status, customer_id, policy_id FROM inquiries WHERE id = $1"#)
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    let (current_status, owner_id, policy_id) =
        current.ok_or(AppError::NotFound("inquiry".into()))?;
    if owner_id != customer_id {
        return Err(AppError::NotFound("inquiry".into()));
    }

    // Kalau sudah CLOSED, tolak reply (terminal state).
    if !can_transition(&current_status, "OPEN") && current_status == "CLOSED" {
        return Err(AppError::Validation(
            "inquiry sudah ditutup, tidak bisa menambah balasan".into(),
        ));
    }

    // Lookup customer name untuk denormalized sender_name di thread.
    let customer_name: String = sqlx::query_scalar("SELECT full_name FROM customers WHERE id = $1")
        .bind(customer_id)
        .fetch_one(&state.pool)
        .await?;

    let mut tx = state.pool.begin().await?;
    // 1. Insert message.
    sqlx::query(
        r#"
        INSERT INTO inquiry_messages
          (inquiry_id, sender_type, sender_id, sender_name, message)
        VALUES ($1, 'CUSTOMER', $2, $3, $4)
        "#,
    )
    .bind(id)
    .bind(customer_id)
    .bind(&customer_name)
    .bind(message)
    .execute(&mut *tx)
    .await?;
    // 2. Update parent status ke OPEN + last_message_at.
    sqlx::query(
        r#"
        UPDATE inquiries
           SET status = 'OPEN',
               last_message_at = now(),
               last_sender_type = 'CUSTOMER'
         WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    // 3. Audit.
    let _ = audit_write(
        &state.pool,
        crate::services::audit::AuditEntry {
            actor: &customer_name,
            action: "inquiry_message_sent",
            entity_type: "inquiry",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({
                "sender_type": "CUSTOMER",
                "message_length": message.len(),
            })),
            ip_address: None,
        },
    )
    .await;

    // 4. Email admin — best-effort. Skip kalau no recipient configured.
    if let Some(admin_email) =
        crate::services::email::admin_notification_email(&state.pool, &state.config).await?
    {
        let inquiry_no: String =
            sqlx::query_scalar("SELECT inquiry_no FROM inquiries WHERE id = $1")
                .bind(id)
                .fetch_one(&state.pool)
                .await?;
        let subject_line: String =
            sqlx::query_scalar("SELECT subject FROM inquiries WHERE id = $1")
                .bind(id)
                .fetch_one(&state.pool)
                .await?;
        let policy_no: Option<String> = match policy_id {
            Some(pid) => {
                sqlx::query_scalar("SELECT policy_no FROM policies WHERE id = $1")
                    .bind(pid)
                    .fetch_optional(&state.pool)
                    .await?
            }
            None => None,
        };
        let body = format!(
            "Inquiry {inquiry_no} dapat balasan dari customer.\n\n\
             Subject: {subject_line}{policy_label}\n\
             Pengirim: {customer_name}\n\
             Pesan:\n{message}\n\n\
             Lihat thread lengkap dan balas di admin portal.\n",
            policy_label = policy_no
                .as_deref()
                .map(|p| format!("\nPolis: {p}"))
                .unwrap_or_default(),
        );
        let _ = crate::services::email::send(
            &state.pool,
            &*state.storage,
            &*state.email,
            crate::services::email::Email {
                email_type: crate::services::email::EmailType::InquiryCustomerReply,
                recipient: &admin_email,
                subject: &format!("[Inquiry {inquiry_no}] Balasan dari customer"),
                body: &body,
                cta_text: Some("Buka Admin Portal"),
                cta_url: Some(&format!(
                    "{}/admin/inquiries",
                    state.config.app_base_url.trim_end_matches('/')
                )),
                related_entity_type: Some("inquiry"),
                related_entity_id: Some(id),
                attachment_path: None,
            },
        )
        .await;
    }

    // 5. Return updated detail.
    let detail = build_inquiry_detail(&state, id).await?;
    Ok(Json(detail))
}

/// Customer-initiated close. Inquiry ditutup dari sisi customer (mis. "udah
/// kejawab, thanks" — close manual). Optional note di-append sebagai
/// system message terakhir.
async fn customer_inquiry_close(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
    Json(req): Json<CloseInquiryJson>,
) -> AppResult<Json<InquiryRow>> {
    use crate::domain::inquiry::can_transition;

    let customer_id = customer_id_from(&claims)?;
    let current: Option<(String, Uuid)> =
        sqlx::query_as("SELECT status, customer_id FROM inquiries WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    let (current_status, owner_id) = current.ok_or(AppError::NotFound("inquiry".into()))?;
    if owner_id != customer_id {
        return Err(AppError::NotFound("inquiry".into()));
    }
    if !can_transition(&current_status, "CLOSED") {
        return Err(AppError::Validation(format!(
            "cannot close from status {current_status}"
        )));
    }

    let mut tx = state.pool.begin().await?;
    if let Some(note) = req.note.as_deref().map(str::trim).filter(|n| !n.is_empty()) {
        let customer_name: String =
            sqlx::query_scalar("SELECT full_name FROM customers WHERE id = $1")
                .bind(customer_id)
                .fetch_one(&state.pool)
                .await?;
        sqlx::query(
            r#"
            INSERT INTO inquiry_messages
              (inquiry_id, sender_type, sender_id, sender_name, message)
            VALUES ($1, 'CUSTOMER', $2, $3, $4)
            "#,
        )
        .bind(id)
        .bind(customer_id)
        .bind(&customer_name)
        .bind(note)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        r#"
        UPDATE inquiries
           SET status = 'CLOSED',
               closed_at = now(),
               last_message_at = now(),
               last_sender_type = 'CUSTOMER'
         WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let _ = audit_write(
        &state.pool,
        crate::services::audit::AuditEntry {
            actor: &claims.sub,
            action: "inquiry_closed_by_customer",
            entity_type: "inquiry",
            entity_id: Some(id),
            metadata: None,
            ip_address: None,
        },
    )
    .await;

    let row: InquiryRow = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, i.policy_id, p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at,
               i.last_message_at, i.last_sender_type, i.closed_at,
               (SELECT message FROM inquiry_messages
                 WHERE inquiry_id = i.id
                 ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
          FROM inquiries i
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE i.id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row))
}

/// Helper: build detail row (inquiry + messages) — DRY untuk multiple handlers.
async fn build_inquiry_detail(state: &AppState, id: Uuid) -> AppResult<InquiryDetailRow> {
    let inquiry: InquiryRow = sqlx::query_as(
        r#"
        SELECT i.id, i.inquiry_no, i.policy_id, p.policy_no,
               i.subject, i.message, i.status, i.response,
               i.created_at, i.responded_at,
               i.last_message_at, i.last_sender_type, i.closed_at,
               (SELECT message FROM inquiry_messages
                 WHERE inquiry_id = i.id
                 ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
          FROM inquiries i
          LEFT JOIN policies p ON p.id = i.policy_id
         WHERE i.id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    let messages: Vec<MessageRow> = sqlx::query_as(
        r#"
        SELECT id, sender_type, sender_id, sender_name, message, created_at
          FROM inquiry_messages
         WHERE inquiry_id = $1
         ORDER BY created_at ASC, id ASC
        "#,
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    Ok(InquiryDetailRow { inquiry, messages })
}

async fn create_inquiry(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Json(req): Json<CreateInquiryJson>,
) -> AppResult<impl IntoResponse> {
    let customer_id = customer_id_from(&claims)?;

    if req.subject.trim().is_empty() {
        return Err(AppError::Validation("subject required".into()));
    }
    if req.message.trim().is_empty() {
        return Err(AppError::Validation("message required".into()));
    }

    // If policy_id is provided, verify ownership.
    if let Some(pid) = req.policy_id {
        let owned: Option<(Uuid,)> = sqlx::query_as(
            r#"
            SELECT p.id
              FROM policies p
              JOIN registrations r ON r.id = p.registration_id
             WHERE p.id = $1 AND r.customer_id = $2
            "#,
        )
        .bind(pid)
        .bind(customer_id)
        .fetch_optional(&state.pool)
        .await?;
        if owned.is_none() {
            return Err(AppError::NotFound("policy".into()));
        }
    }

    let mut tx = state.pool.begin().await?;
    let inquiry_no = next_id(&mut tx, EntityType::Inquiry).await?;
    let inquiry_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO inquiries
          (id, inquiry_no, customer_id, policy_id, subject, message, status,
           last_message_at, last_sender_type)
        VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', now(), 'CUSTOMER')
        "#,
    )
    .bind(inquiry_id)
    .bind(&inquiry_no)
    .bind(customer_id)
    .bind(req.policy_id)
    .bind(&req.subject)
    .bind(&req.message)
    .execute(&mut *tx)
    .await?;

    // Lookup customer name (untuk denormalized sender_name di thread).
    let customer_name: String = sqlx::query_scalar("SELECT full_name FROM customers WHERE id = $1")
        .bind(customer_id)
        .fetch_one(&mut *tx)
        .await?;

    // Insert pesan pertama ke thread (sender=CUSTOMER, created_at=now).
    sqlx::query(
        r#"
        INSERT INTO inquiry_messages
          (inquiry_id, sender_type, sender_id, sender_name, message)
        VALUES ($1, 'CUSTOMER', $2, $3, $4)
        "#,
    )
    .bind(inquiry_id)
    .bind(customer_id)
    .bind(&customer_name)
    .bind(&req.message)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let customer_email: String = sqlx::query_scalar("SELECT email FROM customers WHERE id = $1")
        .bind(customer_id)
        .fetch_one(&state.pool)
        .await?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &customer_email,
            action: "inquiry_submitted",
            entity_type: "inquiry",
            entity_id: Some(inquiry_id),
            metadata: Some(serde_json::json!({ "inquiry_no": inquiry_no })),
            ip_address: None,
        },
    )
    .await?;

    // Email admin (best-effort). Skip kalau no admin recipient configured.
    if let Some(admin_email) =
        crate::services::email::admin_notification_email(&state.pool, &state.config).await?
    {
        let policy_label = match req.policy_id {
            Some(pid) => {
                sqlx::query_scalar::<_, String>("SELECT policy_no FROM policies WHERE id = $1")
                    .bind(pid)
                    .fetch_optional(&state.pool)
                    .await?
                    .map(|p| format!("\nPolis: {p}"))
                    .unwrap_or_default()
            }
            None => String::new(),
        };
        let body = format!(
            "Inquiry baru dari customer.\n\n\
             No: {inquiry_no}\n\
             Subject: {subject}{policy_label}\n\
             Dari: {customer_name} ({customer_email})\n\n\
             Pesan:\n{message}\n\n\
             Balas di admin portal: {base}/admin/inquiries",
            subject = req.subject,
            message = req.message,
            base = state.config.app_base_url.trim_end_matches('/'),
        );
        let _ = crate::services::email::send(
            &state.pool,
            &*state.storage,
            &*state.email,
            crate::services::email::Email {
                email_type: crate::services::email::EmailType::InquiryNew,
                recipient: &admin_email,
                subject: &format!("[Inquiry Baru] {} — {}", inquiry_no, req.subject),
                body: &body,
                cta_text: Some("Buka Admin Portal"),
                cta_url: Some(&format!(
                    "{}/admin/inquiries",
                    state.config.app_base_url.trim_end_matches('/')
                )),
                related_entity_type: Some("inquiry"),
                related_entity_id: Some(inquiry_id),
                attachment_path: None,
            },
        )
        .await;
    }

    Ok((
        StatusCode::CREATED,
        Json(CreateInquiryResponse {
            id: inquiry_id,
            inquiry_no,
            status: "OPEN".to_string(),
        }),
    ))
}

/// Resolve peserta INSTANSI ke `customers` by NIK, atau buat row baru kalau
/// belum ada. Peserta yang dihasilkan TIDAK punya `password_hash`/`portal_status`
/// (NULL) — sama seperti customer hasil account-creation yang belum isi
/// formulir asuransi (lihat 0008_relax_customer_for_split.sql). Ini membuat
/// `customers.nik UNIQUE` jadi satu-satunya penjaga dedup identitas: kalau
/// NIK sudah pernah terdaftar (sebagai individu atau peserta instansi lain),
/// row yang ada langsung di-reuse, tidak ada copy data baru.
async fn resolve_or_create_member_customer(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    p: &crate::dto::ParticipantData,
) -> AppResult<Uuid> {
    if let Some(existing_id) =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM customers WHERE nik = $1")
            .bind(&p.nik)
            .fetch_optional(&mut **tx)
            .await?
    {
        return Ok(existing_id);
    }

    let new_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO customers
          (nik, full_name, birth_place, birth_date, gender, address, rt_rw,
           village, district, city, province, postal_code, email, mobile_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
        "#,
    )
    .bind(&p.nik)
    .bind(p.full_name.trim())
    .bind(p.birth_place.trim())
    .bind(p.birth_date)
    .bind(&p.gender)
    .bind(p.address.trim())
    .bind(p.rt_rw.trim())
    .bind(p.village.trim())
    .bind(p.district.trim())
    .bind(p.city.trim())
    .bind(p.province.trim())
    .bind(p.postal_code.trim())
    .bind(p.email.as_deref().map(str::trim))
    .bind(p.mobile_number.as_deref().map(str::trim))
    .fetch_one(&mut **tx)
    .await?;

    Ok(new_id)
}

// ---- POST /registrations (insurance application, requires customer auth) ----
//
// Setelah flow split, customer membuat akun via POST /api/public/customers
// (Task 3). Setelah aktivasi email + login, customer bisa submit
// aplikasi asuransi dari portal. Endpoint ini requires customer JWT.
//
// Behavior:
// - Customer ID dari JWT (bukan dari request body)
// - Multipart: data (JSON) + id_card (file KTP)
// - UPDATE customer record dengan field insurance-spesifik
//   (nik, ktp, address, dll.) — sebelumnya NULL setelah account creation
// - Create registration + invoice
// - Send RegistrationSuccess + InvoiceNotification emails

async fn submit_insurance_application(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    let customer_id = claims
        .sub
        .parse::<Uuid>()
        .map_err(|_| AppError::Unauthorized)?;

    // `claims.sub` adalah UUID (lihat auth::jwt::issue) — BUKAN email. Source
    // email dari DB agar Resend menerima `to` berformat `email@example.com`.
    // Sekaligus preload `portal_status` untuk gate aktivasi (lihat di bawah).
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT portal_status, email FROM customers WHERE id = $1")
            .bind(customer_id)
            .fetch_optional(&state.pool)
            .await?;
    let (portal_status, customer_email) = row.ok_or(AppError::NotFound("customer".into()))?;
    if portal_status != "ACTIVE" {
        // Frontend menampilkan banner aktivasi berdasarkan portal_status di
        // /me; error ini terjadi kalau user PENDING nyasar submit form.
        return Err(AppError::EmailNotActivated);
    }

    let mut data_field: Option<String> = None;
    let mut ktp_field: Option<(String, String, Vec<u8>)> = None;

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
                let file_name = field.file_name().unwrap_or("ktp").to_string();
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
            _ => {}
        }
    }

    let data_json =
        data_field.ok_or_else(|| AppError::Validation("missing 'data' field".into()))?;
    let data: RegistrationData = serde_json::from_str(&data_json)
        .map_err(|e| AppError::Validation(format!("invalid data JSON: {e}")))?;
    validate_registration(&data)?;
    // Plan lookup — `validate_registration` sudah pasti return Ok untuk
    // plan_code valid, jadi `expect` di sini aman. `ProductPlan` adalah
    // source of truth untuk product, sum_assured, dan pricing.
    let plan = find_plan(&data.plan_code).expect("plan_code validated above");

    let mut tx = state.pool.begin().await?;

    // id_card wajib untuk INDIVIDU; opsional untuk INSTANSI (KTP per
    // peserta belum di-upload di MVP). Parse data JSON dulu baru cek.
    let ktp_path_opt: Option<String> = match data.applicant_type {
        crate::dto::ApplicantType::Individu => {
            let (ktp_name, ktp_ct, ktp_bytes) =
                ktp_field.ok_or_else(|| AppError::Validation("missing 'id_card' file".into()))?;
            let ktp_ref = state
                .storage
                .save_ktp(customer_id, &ktp_name, &ktp_ct, &ktp_bytes)
                .await?;
            Some(ktp_ref.key)
        }
        crate::dto::ApplicantType::Instansi => {
            if let Some((ktp_name, ktp_ct, ktp_bytes)) = ktp_field {
                let ktp_ref = state
                    .storage
                    .save_ktp(customer_id, &ktp_name, &ktp_ct, &ktp_bytes)
                    .await?;
                Some(ktp_ref.key)
            } else {
                None
            }
        }
    };

    // UPDATE customers — INDIVIDU: update semua field personal + ktp_path.
    // INSTANSI: hanya update NIK + mobile_number (data personal lain
    // ada di participants; jangan overwrite dengan nilai kosong/dummy).
    match data.applicant_type {
        crate::dto::ApplicantType::Individu => {
            sqlx::query(
                r#"
                UPDATE customers
                   SET nik = $1, birth_place = $2, birth_date = $3, gender = $4,
                       address = $5, rt_rw = $6, village = $7, district = $8,
                       city = $9, province = $10, postal_code = $11, mobile_number = $12,
                       id_card_path = $13, updated_at = now()
                 WHERE id = $14
                "#,
            )
            .bind(&data.nik)
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
            .bind(&data.mobile_number)
            .bind(ktp_path_opt.as_deref())
            .bind(customer_id)
            .execute(&mut *tx)
            .await?;
        }
        crate::dto::ApplicantType::Instansi => {
            // COALESCE: pertahankan id_card_path lama kalau tidak ada upload baru.
            sqlx::query(
                r#"
                UPDATE customers
                   SET nik = $1, mobile_number = $2,
                       id_card_path = COALESCE($3, id_card_path), updated_at = now()
                 WHERE id = $4
                "#,
            )
            .bind(&data.nik)
            .bind(&data.mobile_number)
            .bind(ktp_path_opt.as_deref())
            .bind(customer_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    let registration_no = next_id(&mut tx, EntityType::Registration).await?;
    let per_participant_premium = calculate_premium(plan, data.coverage_term);
    let due_date = (Utc::now() + chrono::Duration::days(7)).date_naive();

    // Total premium:
    //   INDIVIDU → per_participant_premium (1 peserta)
    //   INSTANSI → per_participant_premium × N peserta
    let total_premium = match data.applicant_type {
        crate::dto::ApplicantType::Individu => per_participant_premium,
        crate::dto::ApplicantType::Instansi => {
            crate::dto::calculate_group_premium(per_participant_premium, data.participants.len())
        }
    };

    // Insert registration row. Untuk INSTANSI, sertakan applicant_type +
    // company_* fields. beneficiary_name hanya untuk INDIVIDU (peserta
    // Instansi punya beneficiary_name masing-masing di tabel participants).
    // plan_code (LIFE_BASIC, PA_STANDARD, dll) di-bind untuk semua — dipakai
    // oleh invoice/receipt/list-view untuk render plan tier (lihat
    // migration 0018).
    let reg_id: (Uuid,) = match data.applicant_type {
        crate::dto::ApplicantType::Individu => {
            sqlx::query_as(
                r#"
            INSERT INTO registrations
              (registration_no, customer_id, product, sum_assured, coverage_term,
               status, applicant_type, beneficiary_name, plan_code)
            VALUES ($1, $2, $3, $4, $5, 'PENDING', 'INDIVIDU', $6, $7)
            RETURNING id
            "#,
            )
            .bind(&registration_no)
            .bind(customer_id)
            .bind(plan.product_code)
            .bind(plan.sum_assured)
            .bind(data.coverage_term)
            .bind(data.beneficiary_name.as_deref().map(str::trim))
            .bind(&data.plan_code)
            .fetch_one(&mut *tx)
            .await?
        }
        crate::dto::ApplicantType::Instansi => {
            sqlx::query_as(
                r#"
            INSERT INTO registrations
              (registration_no, customer_id, product, sum_assured, coverage_term,
               status, applicant_type, company_name, company_npwp, company_industry, plan_code)
            VALUES ($1, $2, $3, $4, $5, 'PENDING', 'INSTANSI', $6, $7, $8, $9)
            RETURNING id
            "#,
            )
            .bind(&registration_no)
            .bind(customer_id)
            .bind(plan.product_code)
            .bind(plan.sum_assured)
            .bind(data.coverage_term)
            .bind(data.company_name.as_deref().map(str::trim))
            .bind(data.company_npwp.as_deref().map(str::trim))
            .bind(data.company_industry.as_deref().map(str::trim))
            .bind(&data.plan_code)
            .fetch_one(&mut *tx)
            .await?
        }
    };

    // Daftarkan peserta INSTANSI (batch — all-or-nothing dalam tx). Setiap
    // peserta di-resolve ke customers by NIK dulu (reuse identitas yang
    // sudah ada — misal orang yang sama jadi peserta di 2 instansi, atau
    // sudah punya akun individu) sebelum bikin row baru. `customers.nik
    // UNIQUE` jadi satu-satunya penjaga dedup identitas, bukan logic
    // manual — lihat 0017_registration_members.sql.
    if data.applicant_type == crate::dto::ApplicantType::Instansi {
        for p in &data.participants {
            let member_customer_id = resolve_or_create_member_customer(&mut tx, p).await?;
            sqlx::query(
                r#"
                INSERT INTO registration_members (registration_id, customer_id, beneficiary_name)
                VALUES ($1, $2, $3)
                "#,
            )
            .bind(reg_id.0)
            .bind(member_customer_id)
            .bind(p.beneficiary_name.as_deref().map(str::trim))
            .execute(&mut *tx)
            .await?;
        }
    }

    let invoice_no = next_id(&mut tx, EntityType::Invoice).await?;
    let invoice_id: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO invoices
          (invoice_no, registration_id, premium_amount, due_date, status)
        VALUES ($1, $2, $3, $4, 'UNPAID')
        RETURNING id
        "#,
    )
    .bind(&invoice_no)
    .bind(reg_id.0)
    .bind(total_premium)
    .bind(due_date)
    .fetch_one(&mut *tx)
    .await?;
    let invoice_id = invoice_id.0;

    tx.commit().await?;

    // Render invoice PDF + save ke storage. UPDATE pdf_path di luar tx
    // (mirror pattern payment_webhook di public.rs:292 — agar policy/invoice
    // row tetap exist kalau storage atau email gagal).
    let product_name = product_name_from_code(plan.product_code);
    // Applicant type sebagai &'static str — pattern sama dengan existing
    // struct field, source dari enum yang di-convert ke uppercase.
    let applicant_type_str: &'static str = match data.applicant_type {
        crate::dto::ApplicantType::Individu => "INDIVIDU",
        crate::dto::ApplicantType::Instansi => "INSTANSI",
    };
    // Beneficiary hanya di-render untuk produk LIFE (caller pre-filter,
    // lihat juga validasi di validate_registration). PA/HEALTH di-pass
    // None supaya layer PDF skip block-nya.
    let beneficiary_for_invoice: Option<String> = if plan.product_code == "LIFE" {
        data.beneficiary_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    } else {
        None
    };
    // Per-peserta premium (INSTANSI only) — dihitung sebagai total_premium
    // dibagi jumlah peserta. Untuk INDIVIDU, None.
    let per_participant_premium: Option<Decimal> = if data.applicant_type
        == crate::dto::ApplicantType::Instansi
        && !data.participants.is_empty()
    {
        Some(total_premium / Decimal::from(data.participants.len() as u64))
    } else {
        None
    };
    // Susun alamat lengkap multi-baris (PDF word-wraps di 38 char/line).
    // Order: jalan, RT/RW, kelurahan-kecamatan, kota-provinsi-kodepos.
    let customer_address = format!(
        "{}\nRT/RW {}\n{}, {}\n{}, {} {}",
        data.address.trim(),
        data.rt_rw.trim(),
        data.village.trim(),
        data.district.trim(),
        data.city.trim(),
        data.province.trim(),
        data.postal_code.trim(),
    );
    // Format gender: MALE/FEMALE → "Laki-laki"/"Perempuan" untuk display.
    let customer_gender = match data.gender.as_str() {
        "MALE" => "Laki-laki",
        "FEMALE" => "Perempuan",
        _ => "—",
    };
    // Peserta Instansi — di-pass ke invoice PDF untuk halaman lampiran
    // "DAFTAR PESERTA". Empty Vec untuk alur INDIVIDU (helper di pdf.rs
    // skip halaman lampiran kalau kosong).
    let participants: Vec<PdfParticipant> = data
        .participants
        .iter()
        .enumerate()
        .map(|(i, p)| PdfParticipant {
            no: (i + 1) as u32,
            nik: p.nik.clone(),
            full_name: p.full_name.clone(),
            birth_place: p.birth_place.clone(),
            birth_date: p.birth_date,
            gender: p.gender.clone(),
            beneficiary_name: p.beneficiary_name.clone(),
        })
        .collect();
    let pdf_bytes = render_invoice_pdf(&InvoicePdfInput {
        invoice_no: &invoice_no,
        registration_no: &registration_no,
        customer_nik: &data.nik,
        customer_name: &data.full_name,
        customer_birth_place: &data.birth_place,
        customer_birth_date: data.birth_date,
        customer_gender,
        customer_email: &data.email,
        customer_mobile: &data.mobile_number,
        customer_address: &customer_address,
        product_code: plan.product_code,
        product_name,
        plan_tier: Some(plan.tier.to_string()),
        sum_assured: plan.sum_assured,
        premium: total_premium,
        coverage_term_years: data.coverage_term,
        due_date,
        status: "UNPAID",
        created_at: Utc::now().date_naive(),
        applicant_type: applicant_type_str,
        company_name: data
            .company_name
            .as_deref()
            .map(str::trim)
            .map(str::to_string),
        company_npwp: data
            .company_npwp
            .as_deref()
            .map(str::trim)
            .map(str::to_string),
        beneficiary_name: beneficiary_for_invoice,
        per_participant_premium,
        participants,
    })?;
    let pdf_ref = state
        .storage
        .save_invoice_pdf(invoice_id, &pdf_bytes)
        .await?;
    let pdf_path = pdf_ref.key;

    sqlx::query("UPDATE invoices SET pdf_path = $1 WHERE id = $2")
        .bind(&pdf_path)
        .bind(invoice_id)
        .execute(&state.pool)
        .await?;

    let _ = send_email(
        &state.pool,
        &*state.storage,
        &*state.email,
        Email {
            email_type: EmailType::RegistrationSuccess,
            recipient: &customer_email,
            subject: &format!("Pendaftaran {} Diterima", registration_no),
            body: &format!(
                "Halo {},\n\n\
                 Pendaftaran asuransi kamu ({}) telah kami terima. Invoice \
                 untuk pembayaran premi sudah diterbitkan — kami kirim detail \
                 lengkapnya di email terpisah.\n\n\
                 Mohon selesaikan pembayaran sebelum jatuh tempo agar polis \
                 bisa langsung aktif.\n\n\
                 Salam,\n\
                 Tim InsureTrack",
                data.full_name, registration_no
            ),
            cta_text: None,
            cta_url: None,
            related_entity_type: Some("registration"),
            related_entity_id: Some(reg_id.0),
            attachment_path: None,
        },
    )
    .await?;

    let _ = send_email(
        &state.pool,
        &*state.storage,
        &*state.email,
        Email {
            email_type: EmailType::InvoiceNotification,
            recipient: &customer_email,
            subject: &format!("Invoice {} — Tagihan Premi", invoice_no),
            body: &format!(
                "Halo {},\n\n\
                 Berikut invoice untuk pendaftaran polis kamu:\n\n\
                 No. Invoice: {}\n\
                 Premi: Rp {}\n\
                 Jatuh tempo: {}\n\n\
                 Invoice PDF terlampir di email ini — bisa langsung di-download \
                 dari attachment di atas.\n\n\
                 Bayar via payment gateway di portal untuk mengaktifkan polis.\n\n\
                 Salam,\n\
                 Tim InsureTrack",
                data.full_name, invoice_no, total_premium, due_date
            ),
            cta_text: None,
            cta_url: None,
            related_entity_type: Some("invoice"),
            related_entity_id: Some(invoice_id),
            attachment_path: Some(pdf_path.clone()),
        },
    )
    .await?;

    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: &customer_email,
            action: "registration_created",
            entity_type: "registration",
            entity_id: Some(reg_id.0),
            metadata: Some(serde_json::json!({
                "registration_no": registration_no,
                "invoice_no": invoice_no,
                "invoice_id": invoice_id.to_string(),
                "plan_code": plan.code,
                "product": plan.product_code,
                "sum_assured": plan.sum_assured.to_string(),
                "monthly_premium": plan.monthly_premium.to_string(),
                "premium": total_premium.to_string(),
                "via": "customer_portal",
                "beneficiary_name": data.beneficiary_name.as_deref().map(str::trim),
            })),
            ip_address: None,
        },
    )
    .await;

    let _ = audit_write(
        &state.pool,
        AuditEntry {
            actor: "system",
            action: "invoice_generated",
            entity_type: "invoice",
            entity_id: Some(invoice_id),
            metadata: Some(serde_json::json!({
                "invoice_no": invoice_no,
                "registration_no": registration_no,
                "pdf_path": pdf_path,
            })),
            ip_address: None,
        },
    )
    .await;

    Ok(Json(serde_json::json!({
        "registration_no": registration_no,
        "invoice_no": invoice_no,
        "status": "PENDING",
    })))
}

// ---- /invoices (customer-owned) ----
//
// Customer dapat melihat daftar invoice miliknya dan re-download PDF.
// Ownership check via JOIN invoices -> registrations -> customers.customer_id.

#[derive(Serialize, sqlx::FromRow)]
struct InvoiceRow {
    id: Uuid,
    invoice_no: String,
    registration_no: String,
    premium_amount: Decimal,
    due_date: chrono::NaiveDate,
    status: String,
    paid_at: Option<chrono::DateTime<chrono::Utc>>,
    pdf_path: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    /// "INDIVIDU" | "INSTANSI" — sama seperti admin InvoiceRow.
    applicant_type: String,
    /// 1 untuk INDIVIDU, COUNT(registration_members) untuk INSTANSI.
    participant_count: i64,
    /// Kode produk (`"LIFE" | "PERSONAL_ACCIDENT" | "HEALTH"`) — untuk
    /// display "Produk" di list view (frontend resolve via productLabel).
    product: String,
    /// Composite plan code (mis. `"LIFE_BASIC"`) — nullable untuk rows
    /// lama (registrasi sebelum migration 0018).
    plan_code: Option<String>,
}

async fn list_invoices(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<InvoiceRow>>> {
    let customer_id = customer_id_from(&claims)?;
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let status = q.status.clone().unwrap_or_default();

    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
         WHERE r.customer_id = $1
           AND ($2 = '' OR i.status = $2)
        "#,
    )
    .bind(customer_id)
    .bind(&status)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<InvoiceRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.invoice_no, r.registration_no,
               i.premium_amount, i.due_date, i.status, i.paid_at,
               i.pdf_path, i.created_at,
               r.applicant_type,
               CASE r.applicant_type
                   WHEN 'INDIVIDU' THEN 1
                   ELSE (SELECT COUNT(*) FROM registration_members rm WHERE rm.registration_id = r.id)
               END AS participant_count,
               r.product,
               r.plan_code
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
         WHERE r.customer_id = $1
           AND ($2 = '' OR i.status = $2)
         ORDER BY i.due_date ASC, i.created_at DESC
         LIMIT $3 OFFSET $4
        "#,
    )
    .bind(customer_id)
    .bind(&status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Page {
        data,
        page,
        page_size,
        total: total.0,
    }))
}

async fn get_invoice(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Json<InvoiceRow>> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<InvoiceRow> = sqlx::query_as(
        r#"
        SELECT i.id, i.invoice_no, r.registration_no,
               i.premium_amount, i.due_date, i.status, i.paid_at,
               i.pdf_path, i.created_at,
               r.applicant_type,
               CASE r.applicant_type
                   WHEN 'INDIVIDU' THEN 1
                   ELSE (SELECT COUNT(*) FROM registration_members rm WHERE rm.registration_id = r.id)
               END AS participant_count,
               r.product,
               r.plan_code
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
         WHERE r.customer_id = $1 AND i.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    row.map(Json).ok_or(AppError::NotFound("invoice".into()))
}

async fn download_invoice_pdf(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Response> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<(Option<String>, String)> = sqlx::query_as(
        r#"
        SELECT i.pdf_path, i.invoice_no
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
         WHERE r.customer_id = $1 AND i.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (pdf_path_opt, invoice_no) = row.ok_or(AppError::NotFound("invoice".into()))?;
    let pdf_path = pdf_path_opt.ok_or(AppError::NotFound("invoice pdf".into()))?;

    let bytes = state.storage.read_bytes(&pdf_path).await?;
    let body = Body::from(bytes);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    // Gunakan filename dinamis `{invoice_no}.pdf` — lebih mudah ditemukan
    // di folder Download customer dibanding UUID.
    let disp = format!("attachment; filename=\"{invoice_no}.pdf\"");
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disp)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid content-disposition: {e}")))?,
    );
    Ok((StatusCode::OK, headers, body).into_response())
}

// ---- GET /invoices/:id/receipt ----

async fn download_invoice_receipt(
    State(state): State<AppState>,
    RequireCustomer(claims): RequireCustomer,
    Path(id): Path<Uuid>,
) -> AppResult<Response> {
    let customer_id = customer_id_from(&claims)?;
    let row: Option<(Option<String>, String)> = sqlx::query_as(
        r#"
        SELECT i.receipt_pdf_path, i.invoice_no
          FROM invoices i
          JOIN registrations r ON r.id = i.registration_id
         WHERE r.customer_id = $1 AND i.id = $2
        "#,
    )
    .bind(customer_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (receipt_path_opt, invoice_no) = row.ok_or(AppError::NotFound("invoice".into()))?;
    let receipt_path = receipt_path_opt.ok_or(AppError::NotFound(
        "payment receipt (belum ada — invoice mungkin belum dibayar)".into(),
    ))?;

    let bytes = state.storage.read_bytes(&receipt_path).await?;
    let body = Body::from(bytes);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    let disp = format!("attachment; filename=\"receipt-{invoice_no}.pdf\"");
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disp)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid content-disposition: {e}")))?,
    );
    Ok((StatusCode::OK, headers, body).into_response())
}
