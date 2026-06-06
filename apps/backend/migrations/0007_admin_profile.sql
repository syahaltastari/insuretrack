-- Migration 0007: Admin profile & audit columns.
-- Adds the fields needed by the profile menu (full_name, email, is_active,
-- last_login_at, password_changed_at, updated_at) and a trigger to keep
-- updated_at fresh on UPDATE.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS full_name            VARCHAR(120),
  ADD COLUMN IF NOT EXISTS email                VARCHAR(160) UNIQUE,
  ADD COLUMN IF NOT EXISTS is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_changed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT now();

-- Trigger: auto-update updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION trg_admin_users_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_users_set_updated_at ON admin_users;
CREATE TRIGGER admin_users_set_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION trg_admin_users_set_updated_at();

-- Backfill full_name for the seed admin (idempotent).
UPDATE admin_users
   SET full_name = 'Administrator'
 WHERE username = 'admin'
   AND full_name IS NULL;
