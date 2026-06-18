// Wire DTOs untuk admin user management. Sesuai backend
// `apps/backend/src/routes/admin_users.rs`. Endpoint: `/api/admin/users/*`.
//
// `is_super_admin` menentukan akses ke menu Manajemen User — non-super_admin
// menerima 403 dari `RequireSuperAdmin` extractor di backend.

export interface AdminUser {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  /** Free-form VARCHAR di schema. Untuk saat ini selalu "admin" — kalau
   *  ke depan ada role lain, enum ini bisa di-tighten. */
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
  last_login_at: string | null;
  password_changed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAdminUserRequest {
  username: string;
  full_name: string;
  email?: string;
  /** Plaintext, min 8 char (enforced backend). */
  password: string;
  is_super_admin?: boolean;
}

export interface UpdateAdminUserRequest {
  full_name?: string;
  email?: string;
  is_super_admin?: boolean;
}

/** Response dari `POST /api/admin/users/:id/reset-password`. Plaintext
 *  password di-generate backend, dikembalikan SEKALI — FE harus tampilkan
 *  ke user dan minta user ganti di /me/password setelah login pertama. */
export interface ResetPasswordResponse {
  new_password: string;
}
