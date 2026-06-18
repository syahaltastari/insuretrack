-- Migration 0015: Admin user management — kolom is_super_admin.
--
-- Tambah flag boolean untuk menandai akun admin yang punya hak mengelola
-- akun admin lain. Default FALSE; seed admin ('admin') di-promote.
-- DB-only gate — backend membacanya via kolom langsung di query login
-- dan /me, dan memasukkannya ke JWT claim agar RequireSuperAdmin
-- extractor bisa stateless.
--
-- idenya sederhana: satu kolom boolean, tanpa tabel/role/permission
-- baru. Kalau nanti butuh RBAC proper (beberapa role + permission
-- granular), flag ini bisa coexist atau di-migrate ke enum.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Promote seed admin ke super_admin (idempotent: kalau di-rerun,
-- WHERE clause skip row yang sudah TRUE).
UPDATE admin_users
   SET is_super_admin = TRUE
 WHERE username = 'admin'
   AND is_super_admin = FALSE;

-- Index untuk pola query list (filter is_active + sort by username)
-- dan pencarian case-insensitive pada kolom username.
-- LOWER() functional index supaya query `WHERE LOWER(username) LIKE ...`
-- yang dipakai list endpoint tidak seq scan.
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active
  ON admin_users(is_active);

CREATE INDEX IF NOT EXISTS idx_admin_users_username_lower
  ON admin_users(LOWER(username));

-- Index komposit (is_super_admin, is_active) untuk query
-- "berapa super admin yang aktif" — mendukung dashboard counter
-- dan audit listing di iterasi berikut tanpa seq scan.
CREATE INDEX IF NOT EXISTS idx_admin_users_super_active
  ON admin_users(is_super_admin, is_active)
  WHERE is_super_admin = TRUE;
