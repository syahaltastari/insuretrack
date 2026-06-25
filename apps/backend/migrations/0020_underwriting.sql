-- Migration 0020: Soft underwriting (MVP).
--
-- Scope: tambah 3 tabel underwriting + alter registrations untuk track
-- status questionnaire. Auto-decide (no manual review queue) per
-- diskusi product — admin hanya setup rules & loading tiers via UI,
-- override individual application via admin panel.
--
-- design rationale: lihat `document/spec/...` (FS-XX underwriting) dan
-- services/underwriting.rs (risk engine). Tiga-tier loading
-- (standard | loaded | heavily_loaded | declined) adalah default MVP
-- — extensible ke lebih banyak tier tanpa schema change (JSONB criteria).
--
-- Why JSONB untuk criteria: admin config tier trigger via flexible
-- rules (age range, BMI range, smoker boolean, pre-existing boolean).
-- Schema-strict akan force migration setiap ada rule baru — JSONB cukup.
--
-- product_code pakai closed set existing dari registrations.product
-- (LIFE | PERSONAL_ACCIDENT | HEALTH) per migration 0003 constraint.
-- Tidak menambah product baru di migration ini.

-- ============================================================
-- 1. product_underwriting_configs — per-product rule template.
-- ============================================================
-- Satu row per product_code. Admin enable/disable + setup threshold.
-- Field-field di sini adalah "what to ask" (require_* booleans) dan
-- "what's the safe range" (age_min/max, bmi_min/max). Decision logic
-- (loaded vs declined) di service layer baca tier criteria JSONB.

CREATE TABLE product_underwriting_configs (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_code    VARCHAR(50)  NOT NULL UNIQUE,
  enabled         BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Demographics check.
  age_min         SMALLINT     NOT NULL,
  age_max         SMALLINT     NOT NULL,
  -- BMI check (nullable kalau product tidak butuh — mis. PA traditional
  -- tidak pakai BMI). Pakai NUMERIC(4,1) — range realistic 10.0-50.0.
  require_bmi     BOOLEAN      NOT NULL DEFAULT FALSE,
  bmi_min         NUMERIC(4,1),
  bmi_max         NUMERIC(4,1),
  -- Smoker & pre-existing conditions checkbox. Pakai BOOLEAN (yes/no).
  -- Kalau di-disable, field tidak di-show di questionnaire form.
  require_smoker       BOOLEAN NOT NULL DEFAULT FALSE,
  require_preexisting BOOLEAN NOT NULL DEFAULT FALSE,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Sanity: age_min <= age_max. BMI bounds nullable kalau require_bmi FALSE.
  CONSTRAINT puwc_age_range CHECK (age_min <= age_max),
  CONSTRAINT puwc_bmi_required CHECK (
    (require_bmi = FALSE) OR (bmi_min IS NOT NULL AND bmi_max IS NOT NULL)
  ),
  CONSTRAINT puwc_bmi_range CHECK (
    bmi_min IS NULL OR bmi_max IS NULL OR bmi_min <= bmi_max
  )
);

COMMENT ON TABLE product_underwriting_configs IS
  'Per-product underwriting rule template. Admin-configured via UI. Satu row per product_code.';
COMMENT ON COLUMN product_underwriting_configs.enabled IS
  'Master toggle. FALSE = auto-accept (existing behavior). TRUE = questionnaire required sebelum invoice.';
COMMENT ON COLUMN product_underwriting_configs.require_bmi IS
  'Kalau TRUE, customer wajib isi height+weight, BMI auto-computed di service layer.';


-- ============================================================
-- 2. underwriting_loading_tiers — multiplier per risk tier.
-- ============================================================
-- Multiple rows per product (one per tier). Criteria JSONB berisi rule
-- trigger — di service layer di-evaluate against underwriting response.
-- Contoh criteria:
--   { "kind": "standard", "always_match": true }
--   { "kind": "loaded", "conditions": [
--       { "field": "bmi", "op": "between", "min": 27.0, "max": 30.0 },
--       { "field": "age", "op": "between", "min": 60, "max": 65 }
--     ], "match_mode": "any" }
--   { "kind": "declined", "conditions": [
--       { "field": "bmi", "op": "gt", "value": 40.0 }
--     ] }
--
-- Tiers diurutkan dari paling restrict ke paling lenient (declined
-- di-evaluate duluan). Kalau tidak ada yang match, fallback ke tier
-- dengan always_match=true (standard). Lihat services/underwriting.rs
-- untuk evaluator.

CREATE TABLE underwriting_loading_tiers (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_code        VARCHAR(50)  NOT NULL,
  tier_code           VARCHAR(50)  NOT NULL,    -- 'standard' | 'loaded' | 'heavily_loaded' | 'declined'
  tier_name           VARCHAR(100) NOT NULL,    -- display label, mis. 'Standard Rate'
  premium_multiplier  NUMERIC(4,2) NOT NULL,    -- 1.00 (standard), 1.50 (loaded), 2.00 (heavy)
  criteria            JSONB        NOT NULL,    -- rule definition (see comment above)
  display_order       SMALLINT     NOT NULL,    -- evaluation order (lower first)
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uwt_product_tier_unique UNIQUE (product_code, tier_code),
  -- `>= 0` bukan `> 0` — declined tier pakai multiplier 0.00 sebagai
  -- sentinel "no coverage, no invoice generated" (lihat comment
  -- premium_multiplier di bawah). 0 bukan invalid, dia meaningful.
  CONSTRAINT uwt_multiplier_non_negative CHECK (premium_multiplier >= 0),
  CONSTRAINT uwt_tier_code_valid CHECK (
    tier_code IN ('standard', 'loaded', 'heavily_loaded', 'declined')
  )
);

CREATE INDEX idx_uwt_product ON underwriting_loading_tiers (product_code, display_order);

COMMENT ON TABLE underwriting_loading_tiers IS
  'Loading tier definitions per product. criteria JSONB menentukan kapan tier ini match dengan response customer.';
COMMENT ON COLUMN underwriting_loading_tiers.tier_code IS
  'Closed set: standard | loaded | heavily_loaded | declined. Backend service switch ke enum.';
COMMENT ON COLUMN underwriting_loading_tiers.premium_multiplier IS
  'Multiplier applied to base premium. Declined tier = 0.00 sebagai sentinel "no coverage, no invoice generated" — bukan invalid, meaningful value (CHECK >= 0).';


-- ============================================================
-- 3. underwriting_responses — per-application customer submission.
-- ============================================================
-- One row per registration. Captures raw responses + computed risk
-- + auto-decision. Audit-friendly: keputusan + reasoning disimpan
-- sebagai computed_at timestamp + reason text (untuk UI display).

CREATE TABLE underwriting_responses (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id       UUID         NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,

  -- Raw responses (validated by service layer against config.require_*).
  -- Field nullable kalau config.require_X = FALSE — service enforce ini.
  age                   SMALLINT,
  height_cm             NUMERIC(5,1),
  weight_kg             NUMERIC(5,1),
  bmi                   NUMERIC(4,1),  -- computed: weight / (height/100)^2
  is_smoker             BOOLEAN,
  has_preexisting       BOOLEAN,

  -- Computed risk.
  risk_tier             VARCHAR(50)  NOT NULL,
  premium_multiplier    NUMERIC(4,2) NOT NULL,
  -- Decision.
  decision              VARCHAR(50)  NOT NULL,  -- 'auto_approved' | 'auto_loaded' | 'auto_declined'
  -- Reason text (English) — untuk display di admin UI.
  -- Mis. "BMI 31 (overweight) + smoker" atau "Age 67 exceeds max 65".
  decision_reason       TEXT         NOT NULL,

  -- Admin override (optional). Kalau admin override, decision override
  -- jadi authoritative, auto-decision tetap di-retain untuk audit.
  overridden_by         UUID         REFERENCES admin_users(id),
  overridden_at         TIMESTAMPTZ,
  override_tier         VARCHAR(50),
  override_multiplier   NUMERIC(4,2),
  override_notes        TEXT,

  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT ur_decision_valid CHECK (
    decision IN ('auto_approved', 'auto_loaded', 'auto_declined')
  ),
  CONSTRAINT ur_tier_valid CHECK (
    risk_tier IN ('standard', 'loaded', 'heavily_loaded', 'declined')
  ),
  CONSTRAINT ur_override_tier_valid CHECK (
    override_tier IS NULL OR override_tier IN ('standard', 'loaded', 'heavily_loaded', 'declined')
  )
);

CREATE INDEX idx_ur_registration ON underwriting_responses (registration_id);
CREATE INDEX idx_ur_decision_created ON underwriting_responses (decision, created_at DESC);

COMMENT ON TABLE underwriting_responses IS
  'Customer underwriting questionnaire submission per registration. One row per registration. Computed risk_tier + multiplier saat submission.';
COMMENT ON COLUMN underwriting_responses.bmi IS
  'Computed from height_cm + weight_kg. Stored untuk query/display — tidak recompute on read.';


-- ============================================================
-- 4. ALTER registrations — track underwriting state per registration.
-- ============================================================
-- underwriting_status: lifecycle state (pending | approved | declined
-- | not_required). not_required = product disabled underwriting.
-- override_applied: shortcut untuk admin UI (avoid join on every list).

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS underwriting_status VARCHAR(50) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS underwriting_response_id UUID REFERENCES underwriting_responses(id),
  ADD COLUMN IF NOT EXISTS underwriting_override_applied BOOLEAN NOT NULL DEFAULT FALSE;

-- Status convention:
--   'not_required'  — product underwriting disabled, skip questionnaire
--   'pending'       — registration created, awaiting questionnaire submit
--   'approved'      — auto-decision approved (standard | loaded | heavily_loaded)
--   'declined'      — auto-decision declined (tier_code = 'declined')
ALTER TABLE registrations
  ADD CONSTRAINT registrations_uw_status_check CHECK (
    underwriting_status IN ('not_required', 'pending', 'approved', 'declined')
  );

-- Index untuk admin list filter (by status) + join ke responses.
CREATE INDEX IF NOT EXISTS idx_registrations_uw_status
  ON registrations (underwriting_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_uw_response
  ON registrations (underwriting_response_id);


-- ============================================================
-- 5. Seed default config untuk 3 products (admin can edit later).
-- ============================================================
-- Conservative defaults: PA auto-accept, Life + Health dengan rule
-- moderate. Admin bisa adjust via UI setelah launch.

INSERT INTO product_underwriting_configs
  (product_code, enabled, age_min, age_max, require_bmi, bmi_min, bmi_max,
   require_smoker, require_preexisting)
VALUES
  -- Personal Accident: auto-accept (no underwriting). Sesuai diskusi
  -- MVP — low-risk product, no questionnaire.
  ('PERSONAL_ACCIDENT', FALSE, 18, 65, FALSE, NULL, NULL, FALSE, FALSE),
  -- Life: moderate underwriting. BMI 18.5-30 normal range, smoker
  -- status untuk kalkulasi loading.
  ('LIFE',              TRUE,  18, 65, TRUE,  18.5, 30.0, TRUE, TRUE),
  -- Health: same range as Life (product serupa profil risikonya).
  ('HEALTH',            TRUE,  18, 60, TRUE,  18.5, 30.0, TRUE, TRUE)
ON CONFLICT (product_code) DO NOTHING;


-- ============================================================
-- 6. Seed default loading tiers untuk Life & Health.
-- ============================================================
-- display_order: lower = evaluated first. Declined tier di paling akhir
-- sebagai fallback safety net (bukan primary filter).
--
-- Default criteria pattern:
--   declined:  BMI > 40 (ekstrem obesity) — auto-reject
--   heavy:     smoker + (BMI 30-35 atau age 60-65) — combined risk
--   loaded:    (BMI 27-30) OR (smoker saja) OR (age 60-65 saja)
--   standard:  always_match = true (catch-all)

INSERT INTO underwriting_loading_tiers
  (product_code, tier_code, tier_name, premium_multiplier, criteria, display_order)
VALUES
  -- Life tiers
  ('LIFE', 'declined',      'Tidak dapat diasuransikan', 0.00,
   '{"conditions": [{"field": "bmi", "op": "gt", "value": 40.0}]}'::jsonb,
   10),
  ('LIFE', 'heavily_loaded', 'Risiko tinggi (1.75×)', 1.75,
   '{"match_mode": "any", "conditions": [
     {"field": "bmi", "op": "between", "min": 30.0, "max": 35.0},
     {"field": "age", "op": "between", "min": 60, "max": 65},
     {"field": "is_smoker", "op": "eq", "value": true}
   ]}'::jsonb,
   20),
  ('LIFE', 'loaded',        'Risiko menengah (1.30×)', 1.30,
   '{"match_mode": "any", "conditions": [
     {"field": "bmi", "op": "between", "min": 27.0, "max": 30.0},
     {"field": "age", "op": "between", "min": 55, "max": 60}
   ]}'::jsonb,
   30),
  ('LIFE', 'standard',      'Standar (1.00×)', 1.00,
   '{"always_match": true}'::jsonb,
   99),

  -- Health tiers (sama dengan Life, multiplier sedikit beda)
  ('HEALTH', 'declined',      'Tidak dapat diasuransikan', 0.00,
   '{"conditions": [{"field": "bmi", "op": "gt", "value": 40.0}]}'::jsonb,
   10),
  ('HEALTH', 'heavily_loaded', 'Risiko tinggi (1.50×)', 1.50,
   '{"match_mode": "any", "conditions": [
     {"field": "bmi", "op": "between", "min": 30.0, "max": 35.0},
     {"field": "age", "op": "between", "min": 55, "max": 60},
     {"field": "is_smoker", "op": "eq", "value": true}
   ]}'::jsonb,
   20),
  ('HEALTH', 'loaded',        'Risiko menengah (1.25×)', 1.25,
   '{"match_mode": "any", "conditions": [
     {"field": "bmi", "op": "between", "min": 27.0, "max": 30.0}
   ]}'::jsonb,
   30),
  ('HEALTH', 'standard',      'Standar (1.00×)', 1.00,
   '{"always_match": true}'::jsonb,
   99)
ON CONFLICT (product_code, tier_code) DO NOTHING;
