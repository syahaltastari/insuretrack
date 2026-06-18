//! Admin CRUD for admin user management (super_admin only).
//! Mounted at /api/admin/users.
//!
//! All handlers use `RequireSuperAdmin` — non-super_admin mendapat 403
//! bahkan untuk endpoint `GET /me` (yang pakai `RequireAdmin`).
//! Self-protection: tidak bisa deactivate/demote/reset-password diri sendiri
//! (lihat helper `ensure_not_self`). Untuk ganti password sendiri, user
//! pakai `POST /api/admin/me/password` yang require current password.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{generate_random_password, hash_password, RequireSuperAdmin},
    error::{AppError, AppResult},
    repo::{validate_sort, validate_sort_dir, Page, PageQuery},
    services::audit::{write as audit_write, AuditEntry},
    state::AppState,
};

const MIN_PASSWORD_LEN: usize = 8;
const GENERATED_PASSWORD_LEN: usize = 16;

/// Sort whitelist — kolom yang boleh di-sort via `?sort_by=`.
/// Lihat `repo::validate_sort` untuk alasan whitelist (anti-SQL-injection).
const USER_SORT_COLUMNS: &[&str] = &["created_at", "username", "full_name", "last_login_at"];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/users", get(list_users).post(create_user))
        .route("/users/:id", get(get_user).patch(update_user))
        .route("/users/:id/activate", post(activate_user))
        .route("/users/:id/deactivate", post(deactivate_user))
        .route("/users/:id/reset-password", post(reset_password))
}

// ============================================================
// Row + DTO
// ============================================================

/// Wire shape untuk admin user. Sama dengan `AdminMe` di `admin.rs` plus
/// `is_super_admin` — kalau ke depan mau gabung, bisa di-extract ke
/// `dto/admin_user.rs`. Untuk sekarang duplikasi 1 field lebih sederhana
/// dari pada cross-module coupling.
#[derive(Debug, Serialize, sqlx::FromRow)]
struct AdminUserRow {
    id: Uuid,
    username: String,
    full_name: Option<String>,
    email: Option<String>,
    role: String,
    is_super_admin: bool,
    is_active: bool,
    last_login_at: Option<chrono::DateTime<chrono::Utc>>,
    password_changed_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

const ADMIN_USER_COLUMNS: &str = "id, username, full_name, email, role, is_super_admin, is_active, \
    last_login_at, password_changed_at, created_at, updated_at";

#[derive(Debug, Deserialize)]
struct CreateUserRequest {
    username: String,
    full_name: String,
    email: Option<String>,
    password: String,
    is_super_admin: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateUserRequest {
    full_name: Option<String>,
    email: Option<String>,
    is_super_admin: Option<bool>,
}

#[derive(Debug, Serialize)]
struct ResetPasswordResponse {
    new_password: String,
}

// ============================================================
// Helpers
// ============================================================

fn ensure_not_self(actor_id: Uuid, target_id: Uuid, action: &str) -> AppResult<()> {
    if actor_id == target_id {
        return Err(AppError::Validation(format!(
            "tidak bisa melakukan '{action}' pada akun sendiri"
        )));
    }
    Ok(())
}

// ============================================================
// Handlers
// ============================================================

async fn list_users(
    State(state): State<AppState>,
    _claims: RequireSuperAdmin,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Page<AdminUserRow>>> {
    let page = q.page();
    let page_size = q.page_size();
    let offset = q.offset();
    let limit = q.limit();
    let search = q.q.clone().unwrap_or_default();
    let like = format!("%{search}%");

    // Filter is_active. Konvensi: string "true"/"false" atau kosong (= no filter),
    // sama dengan list endpoint admin lainnya (lihat admin_marketing.rs).
    let is_active_filter = q.status.clone().unwrap_or_default();

    let sort_col = validate_sort(q.sort_by.as_deref(), USER_SORT_COLUMNS);
    let sort_dir = validate_sort_dir(q.sort_dir.as_deref());
    // Safe: sort_col berasal dari USER_SORT_COLUMNS whitelist.
    let order_clause = format!("ORDER BY {sort_col} {sort_dir}, created_at DESC");

    let total: (i64,) = sqlx::query_as(
        &format!(
            r#"
            SELECT COUNT(*) FROM admin_users
             WHERE ($1 = '' OR LOWER(username) LIKE LOWER($1)
                          OR LOWER(COALESCE(full_name, '')) LIKE LOWER($1))
               AND ($2 = '' OR is_active = ($2 = 'true'))
            "#
        ),
    )
    .bind(&search)
    .bind(&is_active_filter)
    .fetch_one(&state.pool)
    .await?;

    let data: Vec<AdminUserRow> = sqlx::query_as(&format!(
        r#"
        SELECT {ADMIN_USER_COLUMNS}
          FROM admin_users
         WHERE ($1 = '' OR LOWER(username) LIKE LOWER($1)
                      OR LOWER(COALESCE(full_name, '')) LIKE LOWER($1))
           AND ($2 = '' OR is_active = ($2 = 'true'))
         {order_clause}
         LIMIT $3 OFFSET $4
        "#
    ))
    .bind(&like)
    .bind(&is_active_filter)
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

async fn get_user(
    State(state): State<AppState>,
    _claims: RequireSuperAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<AdminUserRow>> {
    let row: Option<AdminUserRow> = sqlx::query_as(&format!(
        "SELECT {ADMIN_USER_COLUMNS} FROM admin_users WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    row.map(Json).ok_or(AppError::NotFound("admin user".into()))
}

async fn create_user(
    State(state): State<AppState>,
    claims: RequireSuperAdmin,
    Json(req): Json<CreateUserRequest>,
) -> AppResult<impl IntoResponse> {
    // Validasi dasar.
    let username = req.username.trim();
    if username.len() < 3 {
        return Err(AppError::Validation("username minimal 3 karakter".into()));
    }
    if username.len() > 64 {
        return Err(AppError::Validation("username maksimal 64 karakter".into()));
    }
    let full_name = req.full_name.trim();
    if full_name.is_empty() {
        return Err(AppError::Validation("full_name wajib diisi".into()));
    }
    if full_name.len() > 120 {
        return Err(AppError::Validation("full_name maksimal 120 karakter".into()));
    }
    if req.password.len() < MIN_PASSWORD_LEN {
        return Err(AppError::Validation(format!(
            "password minimal {MIN_PASSWORD_LEN} karakter"
        )));
    }
    let email = req
        .email
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(e) = email {
        if !e.contains('@') {
            return Err(AppError::Validation("email tidak valid".into()));
        }
    }

    let password_hash = hash_password(&req.password)?;
    let new_id = Uuid::new_v4();
    let is_super_admin = req.is_super_admin.unwrap_or(false);

    let row: AdminUserRow = sqlx::query_as(&format!(
        r#"
        INSERT INTO admin_users
          (id, username, password_hash, role, full_name, email, is_super_admin)
        VALUES ($1, $2, $3, 'admin', $4, $5, $6)
        RETURNING {ADMIN_USER_COLUMNS}
        "#
    ))
    .bind(new_id)
    .bind(username)
    .bind(&password_hash)
    .bind(full_name)
    .bind(email)
    .bind(is_super_admin)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        // Unique constraint: username atau email duplicate.
        if let sqlx::Error::Database(db) = &e {
            if let Some(c) = db.constraint() {
                let msg = match c {
                    "admin_users_username_key" => "username sudah dipakai",
                    "admin_users_email_key" => "email sudah dipakai admin lain",
                    _ => "data admin user duplikat",
                };
                return AppError::Conflict(msg.into());
            }
        }
        AppError::Internal(anyhow::anyhow!("create_user: {e}"))
    })?;

    let actor_id = Uuid::parse_str(&claims.0.sub).map_err(|_| AppError::Unauthorized)?;
    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.0.sub,
            action: "admin_user_created",
            entity_type: "admin_user",
            entity_id: Some(new_id),
            // Catat username + is_super_admin di metadata untuk audit trail.
            // JANGAN catat password_hash.
            metadata: Some(serde_json::json!({
                "username": username,
                "is_super_admin": is_super_admin,
                "actor_id": actor_id,
            })),
            ip_address: None,
        },
    )
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn update_user(
    State(state): State<AppState>,
    claims: RequireSuperAdmin,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateUserRequest>,
) -> AppResult<Json<AdminUserRow>> {
    let actor_id = Uuid::parse_str(&claims.0.sub).map_err(|_| AppError::Unauthorized)?;

    // Self-protection: admin tidak bisa demote diri sendiri dari super_admin.
    // Tolak request yang attempted untuk set is_super_admin=false pada self.
    if id == actor_id && matches!(req.is_super_admin, Some(false)) {
        return Err(AppError::Validation(
            "tidak bisa mengubah is_super_admin akun sendiri menjadi false".into(),
        ));
    }

    // Trim & validate (kalau di-supply). None = no change (COALESCE di SQL).
    let full_name: Option<&str> = req
        .full_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(f) = full_name {
        if f.len() > 120 {
            return Err(AppError::Validation("full_name maksimal 120 karakter".into()));
        }
    }
    let email: Option<&str> = req
        .email
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(e) = email {
        if !e.contains('@') {
            return Err(AppError::Validation("email tidak valid".into()));
        }
    }

    // Kalau tidak ada field yang di-supply, return existing row tanpa UPDATE
    // (no-op) — supaya audit log tidak misleading.
    let row: AdminUserRow = sqlx::query_as(&format!(
        r#"
        UPDATE admin_users SET
            full_name     = COALESCE($2, full_name),
            email         = COALESCE($3, email),
            is_super_admin = COALESCE($4, is_super_admin),
            updated_at    = now()
        WHERE id = $1
        RETURNING {ADMIN_USER_COLUMNS}
        "#
    ))
    .bind(id)
    .bind(full_name)
    .bind(email)
    .bind(req.is_super_admin)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(db) = &e {
            if db.constraint().is_some() {
                return AppError::Conflict("email sudah dipakai admin lain".into());
            }
        }
        AppError::Internal(anyhow::anyhow!("update_user: {e}"))
    })?
    .ok_or(AppError::NotFound("admin user".into()))?;

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.0.sub,
            action: "admin_user_updated",
            entity_type: "admin_user",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({
                "actor_id": actor_id,
                "updated_fields": {
                    "full_name": full_name.is_some(),
                    "email": email.is_some(),
                    "is_super_admin": req.is_super_admin.is_some(),
                },
            })),
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(row))
}

async fn activate_user(
    State(state): State<AppState>,
    claims: RequireSuperAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let actor_id = Uuid::parse_str(&claims.0.sub).map_err(|_| AppError::Unauthorized)?;
    let res = sqlx::query("UPDATE admin_users SET is_active = TRUE, updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("admin user".into()));
    }

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.0.sub,
            action: "admin_user_activated",
            entity_type: "admin_user",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({ "actor_id": actor_id })),
            ip_address: None,
        },
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn deactivate_user(
    State(state): State<AppState>,
    claims: RequireSuperAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let actor_id = Uuid::parse_str(&claims.0.sub).map_err(|_| AppError::Unauthorized)?;
    // Self-protection: admin tidak bisa nonaktifkan diri sendiri.
    ensure_not_self(actor_id, id, "deactivate")?;

    let res = sqlx::query("UPDATE admin_users SET is_active = FALSE, updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("admin user".into()));
    }

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.0.sub,
            action: "admin_user_deactivated",
            entity_type: "admin_user",
            entity_id: Some(id),
            metadata: Some(serde_json::json!({ "actor_id": actor_id })),
            ip_address: None,
        },
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn reset_password(
    State(state): State<AppState>,
    claims: RequireSuperAdmin,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ResetPasswordResponse>> {
    let actor_id = Uuid::parse_str(&claims.0.sub).map_err(|_| AppError::Unauthorized)?;
    // Self-protection: admin tidak bisa reset password sendiri via endpoint
    // ini. Gunakan `POST /api/admin/me/password` yang require current password.
    ensure_not_self(actor_id, id, "reset_password")?;

    // Generate random password, hash, update. Plaintext dikembalikan
    // SEKALI di response — caller (FE) harus tampilkan ke user
    // dan minta user ganti di /me/password saat login pertama.
    let new_password = generate_random_password(GENERATED_PASSWORD_LEN);
    let new_hash = hash_password(&new_password)?;

    let res = sqlx::query(
        "UPDATE admin_users SET password_hash = $1, password_changed_at = now(), updated_at = now() WHERE id = $2",
    )
    .bind(&new_hash)
    .bind(id)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("admin user".into()));
    }

    audit_write(
        &state.pool,
        AuditEntry {
            actor: &claims.0.sub,
            action: "admin_user_password_reset",
            entity_type: "admin_user",
            entity_id: Some(id),
            // Catat panjang password yang di-generate, BUKAN plaintext-nya.
            // (Plaintext sudah di response — tapi audit_log harus tetap
            // aman untuk di-export tanpa泄露 credentials.)
            metadata: Some(serde_json::json!({
                "actor_id": actor_id,
                "generated_password_length": GENERATED_PASSWORD_LEN,
            })),
            ip_address: None,
        },
    )
    .await?;

    Ok(Json(ResetPasswordResponse { new_password }))
}
