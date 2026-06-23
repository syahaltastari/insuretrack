-- Migration 0019: Admin-side customer management.
--
-- Tambah kolom lifecycle ke customers supaya admin bisa:
-- 1. Menonaktifkan akun (is_active, deactivated_at) — tanpa DELETE CASCADE
--    ke registrations/policies/claims.
-- 2. Melihat last_login_at di list — pattern sama dengan admin_users.
-- 3. password_changed_at: fix bug laten — customer.rs:624 sudah menulis ke
--    kolom ini padahal belum ada di schema. Tanpa migration ini query
--    UPDATE akan error di Postgres. Sekarang formal di schema.
--
-- portal_status (PENDING|ACTIVE) tetap dipakai untuk flow aktivasi email
-- dan TIDAK diutak-atik di migration ini. Deactivate oleh admin dipisah
-- dari status aktivasi (lihat juga routes/admin_customers.rs).

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_at      TIMESTAMPTZ;

-- Index untuk pola query list admin (ORDER BY created_at DESC) +
-- composite (is_active, created_at) untuk filter "customer aktif/nonaktif".
-- created_at di DESC supaya index bisa serve langsung ORDER BY tanpa sort.
CREATE INDEX IF NOT EXISTS idx_customers_created_at
  ON customers (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customers_is_active_created_at
  ON customers (is_active, created_at DESC);
