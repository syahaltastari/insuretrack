// Dead code di-allow: setiap test file pakai subset berbeda dari
// helper (mis. `claims.rs` tidak butuh `admin_token`); semua di-publish
// dari satu common module untuk konsistensi.
#![allow(dead_code)]

//! Shared bootstrap & helpers untuk integration test.
//!
//! Setiap integration test file (`tests/payment_webhook.rs`, `tests/claims.rs`,
//! dll.) menggunakan `mod common;` lalu panggil `spawn_app()` untuk dapat
//! `TestApp` terisolasi — Postgres real (shared DB `insuretrack_test`,
//! di-truncate sebelum return), `LocalStorage` pointed ke `TempDir`,
//! `RecordingEmailSender` (mock HTTP Resend), router siap pakai via
//! `tower::ServiceExt::oneshot`.
//!
//! Dead code di-allow: setiap test file pakai subset helper yang berbeda
//! (mis. `claims.rs` tidak butuh `admin_token`), tapi semua di-publish
//! dari satu common module untuk konsistensi.
//!
//! ## Setup sekali (host lokal)
//!
//! ```bash
//! # Postgres 18 native (lihat hybrid-local-dev memory)
//! createdb -h localhost -p 5432 -U insurance_admin insuretrack_test
//! # default password: insurance_password
//! ```
//!
//! Override URL via `TEST_DATABASE_URL` env kalau perlu. Default:
//! `postgres://insurance_admin:insurance_password@localhost:5432/insuretrack_test`.
//!
//! ## Parallelism
//!
//! Test jalan **serial** (`#[serial_test::serial]` di tiap `#[tokio::test]`)
//! supaya truncate di `spawn_app()` tidak collide dengan test lain. Tradeoff:
//! lebih lambat dari parallel, tapi integration test DB sudah murah (no Docker).
//! Total ~6 integration test file × 1-3 test each → finish dalam <30 detik.

use std::sync::{Arc, Mutex};

use axum::{
    body::Body,
    http::{Request, Response, StatusCode},
    Router,
};
use chrono::{Duration, Utc};
use serde_json::Value;
use sqlx::PgPool;
use tempfile::TempDir;
use tower::ServiceExt;
use uuid::Uuid;

use insuretrack_backend::{
    auth::{jwt::Role, TokenService},
    config::Config,
    routes,
    services::{
        email::{EmailAttachment, EmailSender},
        storage::{LocalStorage, Storage},
    },
    state::AppState,
};

// ---- Re-exports supaya test file bisa langsung `use common::*` ----------

#[allow(unused_imports)]
pub use insuretrack_backend::services::email::EmailType;

// ---- TestApp --------------------------------------------------------------

/// Satu instance test app lengkap. Drop = cleanup TempDir otomatis.
pub struct TestApp {
    pub router: Router,
    pub pool: PgPool,
    pub storage: Arc<dyn Storage>,
    pub email: Arc<RecordingEmailSender>,
    pub tokens: Arc<TokenService>,
    pub config: Arc<Config>,
    /// Hold supaya TempDir tidak di-drop sebelum test selesai (LocalStorage
    /// pegang path ke folder ini; kalau di-drop, semua `read_bytes()` di
    /// tengah test akan return IO error).
    pub _tmp: TempDir,
}

impl TestApp {
    pub fn state(&self) -> AppState {
        AppState {
            pool: self.pool.clone(),
            config: self.config.clone(),
            tokens: self.tokens.clone(),
            storage: self.storage.clone(),
            email: self.email.clone(),
        }
    }
}

// ---- Email mock -----------------------------------------------------------

#[derive(Debug, Clone)]
pub struct RecordedEmail {
    pub to: String,
    pub subject: String,
    pub text: String,
    pub html: String,
    pub attachments: Vec<EmailAttachment>,
}

/// Mock `EmailSender` yang record semua panggilan ke internal Vec.
/// Return id statis `"recorded-<uuid>"` supaya test bisa assert di
/// `email_logs.resend_id` / audit log metadata.
#[derive(Default)]
pub struct RecordingEmailSender {
    pub sent: Mutex<Vec<RecordedEmail>>,
}

#[async_trait::async_trait]
impl EmailSender for RecordingEmailSender {
    async fn send(
        &self,
        to: &str,
        subject: &str,
        text: &str,
        html: &str,
        attachments: &[EmailAttachment],
    ) -> Result<String, insuretrack_backend::error::AppError> {
        self.sent.lock().unwrap().push(RecordedEmail {
            to: to.to_string(),
            subject: subject.to_string(),
            text: text.to_string(),
            html: html.to_string(),
            attachments: attachments.to_vec(),
        });
        Ok(format!("recorded-{}", Uuid::new_v4()))
    }
}

impl RecordingEmailSender {
    pub fn count(&self) -> usize {
        self.sent.lock().unwrap().len()
    }

    pub fn last(&self) -> Option<RecordedEmail> {
        self.sent.lock().unwrap().last().cloned()
    }

    pub fn all(&self) -> Vec<RecordedEmail> {
        self.sent.lock().unwrap().clone()
    }

    pub fn clear(&self) {
        self.sent.lock().unwrap().clear();
    }
}

// ---- spawn_app ------------------------------------------------------------

const DEFAULT_TEST_DATABASE_URL: &str =
    "postgres://postgres:feralyth21@localhost:5432/insuretrack_test";

/// Bangun app baru + truncate DB. Aman dipanggil di awal tiap test.
pub async fn spawn_app() -> TestApp {
    let database_url = std::env::var("TEST_DATABASE_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_TEST_DATABASE_URL.to_string());

    let pool = PgPool::connect(&database_url)
        .await
        .expect("connect to test DB — pastikan `insuretrack_test` exists & Postgres 18 jalan");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("run migrations on test DB");

    truncate_all(&pool).await;

    let tmp = TempDir::new().expect("create tempdir");
    let upload_dir = tmp.path().to_str().unwrap().to_string();
    let storage: Arc<dyn Storage> = Arc::new(LocalStorage::new(upload_dir.clone()));

    let email = Arc::new(RecordingEmailSender::default());

    let config = Arc::new(test_config());
    // Sync upload_dir di Config dengan TempDir actual — supaya endpoint
    // `GET /api/public/uploads/*path` baca dari folder yang sama dengan
    // LocalStorage (lihat spawn_app()).
    let mut config = (*config).clone();
    config.upload_dir = upload_dir.clone();
    let config = Arc::new(config);
    let tokens = Arc::new(TokenService::new(&config.jwt_secret));

    let state = AppState::new(
        pool.clone(),
        (*config).clone(),
        storage.clone(),
        email.clone(),
    );
    let router = routes::build(state);

    TestApp {
        router,
        pool,
        storage,
        email,
        tokens,
        config,
        _tmp: tmp,
    }
}

fn test_config() -> Config {
    Config {
        database_url: "postgres://unused/test".into(),
        jwt_secret: "test-jwt-secret-only-for-integration-tests-32chars".into(),
        payment_webhook_secret: "test-webhook-secret".into(),
        app_base_url: "http://localhost:3000".into(),
        media_base_url: "http://localhost:8080".into(),
        storage_backend: "local".into(),
        upload_dir: "./uploads-test".into(),
        r2_account_id: None,
        r2_access_key_id: None,
        r2_secret_access_key: None,
        r2_bucket: None,
        r2_public_base_url: None,
        resend_api_key: "test-resend-key".into(),
        resend_from_email: "noreply@test.local".into(),
        resend_from_name: Some("InsureTrack Test".into()),
        admin_notification_email: Some("admin@test.local".into()),
        inquiry_auto_close_days: 7,
        port: 0,
    }
}

/// Truncate semua tabel + reset sequences. FK-safe order (children-first).
/// Idempotent — aman dipanggil多次.
async fn truncate_all(pool: &PgPool) {
    let tables = [
        // Children of FK chains first.
        "claim_documents",
        "inquiry_messages",
        "claims",
        "inquiries",
        "policies",
        "invoices",
        "registrations",
        "email_logs",
        "audit_logs",
        "customers",
        "admin_users",
        // Standalone / lookups.
        "id_sequences",
        "clients",
        "testimonials",
    ];
    for t in tables {
        // IF EXISTS supaya aman kalau tabel belum ada (mis. migration
        // partial apply saat development).
        let sql = format!("DELETE FROM {t}");
        if let Err(e) = sqlx::query(&sql).execute(pool).await {
            // 42P01 = undefined_table — diabaikan.
            if let Some(db_err) = e.as_database_error() {
                if db_err.code().as_deref() != Some("42P01") {
                    panic!("truncate {t} failed: {e}");
                }
            } else {
                panic!("truncate {t} failed: {e}");
            }
        }
    }
    // Reset sequences ke 1 supaya identifier tests deterministik (mis. test
    // assert "REG-202606-000001" dapat nilai pertama tanpa terpengaruh
    // run sebelumnya).
    let _ = sqlx::query("ALTER SEQUENCE IF EXISTS id_sequences_auto RESTART WITH 1")
        .execute(pool)
        .await;
}

// ---- JWT helpers ----------------------------------------------------------

pub async fn admin_token(app: &TestApp, role: Role, is_super_admin: bool) -> String {
    // Seed admin user supaya handler bisa lookup `full_name`/`username`
    // untuk inquiry_messages.sender_name (lihat admin_inquiry_message).
    let admin_id = seed_admin(&app.pool, "testadmin").await;
    app.tokens
        .issue(&admin_id.to_string(), role, None, is_super_admin, 3600)
        .expect("issue admin token")
}

pub fn customer_token(app: &TestApp, customer_id: Uuid) -> String {
    app.tokens
        .issue(&customer_id.to_string(), Role::Customer, None, false, 3600)
        .expect("issue customer token")
}

pub fn activation_token(app: &TestApp, customer_id: Uuid) -> String {
    app.tokens
        .issue(
            &customer_id.to_string(),
            Role::Customer,
            Some("activation".into()),
            false,
            3600,
        )
        .expect("issue activation token")
}

// ---- HTTP helpers ---------------------------------------------------------

/// Kirim request via in-memory router (no real port). Kembalikan response
/// + body bytes.
///
/// Default response tidak memuat body; pakai `response_bytes()` untuk extract.
pub async fn send(app: &TestApp, req: Request<Body>) -> Response<Body> {
    app.router
        .clone()
        .oneshot(req)
        .await
        .expect("router oneshot")
}

pub async fn response_json(resp: Response<Body>) -> (StatusCode, Value) {
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
        .await
        .expect("read body");
    let value: Value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, value)
}

// ---- Seed helpers ---------------------------------------------------------

pub async fn seed_customer(pool: &PgPool, email: &str, portal_status: &str) -> Uuid {
    // NIK = 16 digit random. UUID v4 hex (32 chars, ~50% digits) mungkin
    // punya <15 digit chars → pad ke 15 pakai '0' fallback.
    let u = Uuid::new_v4();
    let digits: String = u
        .simple()
        .to_string()
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect();
    // Pad kalau kependekan (UUID hex kadang cuma punya 8-12 digit).
    let body: String = if digits.len() >= 15 {
        digits.chars().take(15).collect()
    } else {
        format!("{:0>15}", digits) // left-pad dengan '0'
    };
    let nik = format!("3{body}");
    assert_eq!(
        nik.len(),
        16,
        "NIK must be exactly 16 chars, got {}: {nik}",
        nik.len()
    );

    sqlx::query_as::<_, (Uuid,)>(
        r#"
        INSERT INTO customers (
            nik, full_name, birth_place, birth_date, gender,
            address, rt_rw, village, district, city, province, postal_code,
            email, mobile_number, id_card_path, password_hash, portal_status
        ) VALUES (
            $1, 'Test User', 'Jakarta', '1990-01-01', 'MALE',
            'Jl. Test 1', '001/002', 'Kelurahan', 'Kecamatan',
            'Jakarta', 'DKI Jakarta', '12345',
            $2, '081234567890', '/uploads/ktp.jpg',
            'argon2id$placeholder', $3
        )
        RETURNING id
        "#,
    )
    .bind(nik)
    .bind(email)
    .bind(portal_status)
    .fetch_one(pool)
    .await
    .expect("seed customer")
    .0
}

pub async fn seed_admin(pool: &PgPool, username: &str) -> Uuid {
    // Idempotent — return existing id kalau username sudah ada, else insert.
    let row: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO admin_users (username, password_hash, role, email)
        VALUES ($1, 'argon2id$placeholder', 'admin', $2)
        ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
        RETURNING id
        "#,
    )
    .bind(username)
    .bind(format!("{username}@test.local"))
    .fetch_one(pool)
    .await
    .expect("seed admin");
    row.0
}

pub async fn seed_active_policy(
    pool: &PgPool,
    customer_id: Uuid,
    product: &str,
    claim_type_hint: &str,
) -> Uuid {
    // Insert minimal registration + invoice + policy. Spec-invariant:
    // claim_type_hint hanya label dokumentasi (tidak disimpan di policy).
    let mut tx = pool.begin().await.expect("begin tx");
    let now = Utc::now();
    let reg_no = format!("REG-{}-000001", now.format("%Y%m"));
    let inv_no = format!("INV-{}-000001", now.format("%Y%m"));
    let pol_no = format!("POL-{}-000001", now.format("%Y%m"));

    let (reg_id,): (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO registrations (
            registration_no, customer_id, product, sum_assured, coverage_term, status
        ) VALUES ($1, $2, $3, 100000000, 10, 'ISSUED')
        RETURNING id
        "#,
    )
    .bind(&reg_no)
    .bind(customer_id)
    .bind(product)
    .fetch_one(&mut *tx)
    .await
    .expect("seed registration");

    let _ = sqlx::query(
        r#"
        INSERT INTO invoices (invoice_no, registration_id, premium_amount, due_date, status, paid_at)
        VALUES ($1, $2, 9000000, now() + interval '7 days', 'PAID', now())
        "#,
    )
    .bind(&inv_no)
    .bind(reg_id)
    .execute(&mut *tx)
    .await
    .expect("seed invoice");

    let (pol_id,): (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO policies (
            policy_no, registration_id, product, sum_assured, premium,
            effective_date, expiry_date, status
        ) VALUES (
            $1, $2, $3, 100000000, 9000000,
            CURRENT_DATE, CURRENT_DATE + interval '10 years', 'ACTIVE'
        )
        RETURNING id
        "#,
    )
    .bind(&pol_no)
    .bind(reg_id)
    .bind(product)
    .fetch_one(&mut *tx)
    .await
    .expect("seed policy");

    tx.commit().await.expect("commit seed tx");
    let _ = claim_type_hint;
    pol_id
}

/// Helper: today + N days, ISO format. Untuk filter `date_from` / `date_to`.
pub fn iso_date(days_from_now: i64) -> String {
    (Utc::now() + Duration::days(days_from_now))
        .format("%Y-%m-%d")
        .to_string()
}
