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

// ============================================================
// Customer management — mirror apps/backend/src/routes/admin_customers.rs
// Endpoint: /api/admin/customers/*.
// ============================================================

/** Wire shape untuk `GET /api/admin/customers` (list endpoint). */
export interface AdminCustomer {
  id: string;
  nik: string | null;
  full_name: string;
  email: string;
  mobile_number: string | null;
  portal_status: "PENDING" | "ACTIVE" | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

/** Wire shape untuk `GET /api/admin/customers/:id` (detail endpoint).
 *  Includes full profile + counts + recent activity + audit trail. */
export interface AdminCustomerDetail extends AdminCustomer {
  birth_place: string | null;
  birth_date: string | null;
  gender: string | null;
  address: string | null;
  rt_rw: string | null;
  village: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  id_card_path: string | null;
  password_changed_at: string | null;
  deactivated_at: string | null;
  updated_at: string;
  // Counts
  registrations_count: number;
  policies_count: number;
  claims_count: number;
  inquiries_count: number;
  // Recent (5 most recent per type)
  recent_registrations: AdminCustomerRecentRegistration[];
  recent_policies: AdminCustomerRecentPolicy[];
  recent_claims: AdminCustomerRecentClaim[];
  recent_inquiries: AdminCustomerRecentInquiry[];
  // Audit (10 most recent untuk customer ini)
  recent_audit: AdminCustomerAuditEntry[];
}

export interface AdminCustomerRecentRegistration {
  id: string;
  registration_no: string;
  product: string;
  status: string;
  created_at: string;
}

export interface AdminCustomerRecentPolicy {
  id: string;
  policy_no: string;
  product: string;
  status: string;
  effective_date: string;
  expiry_date: string;
}

export interface AdminCustomerRecentClaim {
  id: string;
  claim_no: string;
  claim_type: string;
  status: string;
  /** Decimal di-serialize sebagai string. Format IDR saat render. */
  claimed_amount: string;
  created_at: string;
}

export interface AdminCustomerRecentInquiry {
  id: string;
  inquiry_no: string;
  subject: string;
  status: string;
  created_at: string;
}

export interface AdminCustomerAuditEntry {
  id: string;
  actor: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Response dari `POST /api/admin/customers/:id/reset-password`.
 *  Plaintext di-generate backend, dikembalikan SEKALI. */
export interface AdminCustomerResetPasswordResponse {
  new_password: string;
}

/** Response dari `POST /api/admin/customers/:id/resend-activation`. */
export interface ResendActivationResponse {
  ok: true;
  email: string;
}

// ============================================================
// App settings — mirror apps/backend/src/routes/admin_settings.rs
// Endpoint: /api/admin/settings/claims.
// ============================================================

/** Wire shape untuk `GET/PUT /api/admin/settings/claims`.
 *  Saat ini hanya `claims.one_active_per_policy` yang di-expose — pattern
 *  generic: tambah field per-setting, backend handle via JSONB value. */
export interface ClaimsSettings {
  one_active_per_policy: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export interface UpdateClaimsSettingsRequest {
  one_active_per_policy: boolean;
}
