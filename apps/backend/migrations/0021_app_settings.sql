-- Migrasi 0021_app_settings.sql
-- Generic key-value JSONB store untuk rules yang admin-toggleable tanpa
-- redeploy. First use case: claims.one_active_per_policy.
--
-- Akses pattern: SELECT WHERE key = $1 (cache-friendly, ~1 row).
-- Mutation: UPDATE WHERE key = $1 di-audit ke audit_logs dengan action
-- 'settings_updated'. Value shape divalidasi di service layer per-key.

CREATE TABLE IF NOT EXISTS app_settings (
  key         VARCHAR(64)  PRIMARY KEY,
  value       JSONB        NOT NULL,
  description TEXT,
  updated_by  UUID         REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_key_format CHECK (key ~ '^[a-z][a-z0-9_.-]{1,63}$')
);

COMMENT ON TABLE app_settings IS
  'Konfigurasi runtime yang admin-toggleable. Baca di service layer, mutate via admin UI.';

INSERT INTO app_settings (key, value, description) VALUES
  ('claims.one_active_per_policy', 'true'::jsonb,
   'Jika true, customer tidak boleh ajukan klaim baru untuk polis yang punya klaim aktif (SUBMITTED/UNDER_REVIEW).')
ON CONFLICT (key) DO NOTHING;
