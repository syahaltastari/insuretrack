-- Migrasi 0013_group_registration.sql
-- Dukungan pendaftaran Instansi (group) di samping Individu:
--   1. Registrasi bisa bertipe INDIVIDU (existing) atau INSTANSI (N peserta).
--   2. Tabel baru `registration_participants` menyimpan N peserta untuk 1 group
--      registration. Untuk INDIVIDU, tabel ini kosong (semua data peserta
--      tetap di customers.* — backward-compat).
--   3. Setelah payment, 1 group registration menghasilkan N policies (1 per
--      peserta) lewat `policies.participant_id`.
--
-- Backward-compat strategy:
--   - `applicant_type` di-set DEFAULT 'INDIVIDU' agar row existing tetap valid.
--   - `company_*` fields NULLABLE; validasi kondisional di Rust layer.
--   - `policies.participant_id` NULLABLE agar policy existing (Individu)
--     tetap valid tanpa backfill.

-- ============================================================
-- Registrasi: applicant_type + institution info
-- ============================================================
ALTER TABLE registrations
  ADD COLUMN applicant_type VARCHAR(10) NOT NULL DEFAULT 'INDIVIDU'
    CHECK (applicant_type IN ('INDIVIDU', 'INSTANSI')),
  ADD COLUMN company_name VARCHAR(200),
  ADD COLUMN company_npwp VARCHAR(20),
  ADD COLUMN company_industry VARCHAR(100);

COMMENT ON COLUMN registrations.applicant_type IS
  'INDIVIDU = 1 peserta (existing flow). INSTANSI = N peserta dari 1 group.';
COMMENT ON COLUMN registrations.company_name IS
  'Nama instansi/perusahaan. NULL untuk INDIVIDU. WAJIB untuk INSTANSI (enforced di Rust validate_registration).';
COMMENT ON COLUMN registrations.company_npwp IS
  'NPWP instansi (15-16 digit, format 99.999.999.9-999.999). NULLABLE. Validasi di Rust layer.';
COMMENT ON COLUMN registrations.company_industry IS
  'Bidang usaha instansi (free text). NULLABLE.';

-- Index untuk filter "list Instansi registrations di admin backoffice".
-- (Nanti di V2 ada filter UI per applicant_type.)
CREATE INDEX idx_registrations_applicant_type ON registrations(applicant_type);

-- ============================================================
-- Tabel baru: registration_participants
-- 1 row per peserta Instansi. Untuk INDIVIDU, tabel ini kosong.
-- ============================================================
CREATE TABLE registration_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  -- Identitas (sama shape dengan customers.* — tanpa FK ke customers
  -- karena peserta Instansi BUKAN customer dengan akun portal).
  nik VARCHAR(16) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  birth_place VARCHAR(80) NOT NULL,
  birth_date DATE NOT NULL CHECK (birth_date <= CURRENT_DATE),
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
  address VARCHAR(500) NOT NULL,
  rt_rw VARCHAR(20) NOT NULL,
  village VARCHAR(80) NOT NULL,
  district VARCHAR(80) NOT NULL,
  city VARCHAR(80) NOT NULL,
  province VARCHAR(80) NOT NULL,
  postal_code VARCHAR(5) NOT NULL,
  -- Kontak (opsional untuk peserta kolektif — banyak perusahaan tidak
  -- punya email/HP masing-masing karyawannya di awal)
  email VARCHAR(160),
  mobile_number VARCHAR(20),
  -- Beneficiary per peserta (WAJIB untuk produk LIFE, NULL untuk PA/HEALTH)
  beneficiary_name VARCHAR(120),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reg_participants_registration
  ON registration_participants(registration_id);

-- NIK unik per group — cegah duplikat accidental dalam 1 group
-- (tidak conflict dengan customers.nik karena tabel berbeda, dan
-- 1 peserta kolektif belum tentu punya akun portal).
CREATE UNIQUE INDEX uniq_reg_participants_nik_per_reg
  ON registration_participants(registration_id, nik);

-- ============================================================
-- Policies: tambah participant_id untuk N individual policies
-- dari 1 group registration. NULL untuk INDIVIDU.
-- ============================================================
ALTER TABLE policies
  ADD COLUMN participant_id UUID REFERENCES registration_participants(id) ON DELETE SET NULL;

COMMENT ON COLUMN policies.participant_id IS
  'Untuk INSTANSI: link ke peserta yang dicakup polis ini. NULL untuk INDIVIDU.';

CREATE INDEX idx_policies_participant ON policies(participant_id);
