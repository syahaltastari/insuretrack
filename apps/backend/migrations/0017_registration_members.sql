-- Migrasi 0017_registration_members.sql
-- Ganti pendekatan identitas peserta INSTANSI: dari "copy data" di
-- registration_participants menjadi "rujuk customers" via registration_members.
--
-- Masalah yang dibenerin: registration_participants menyimpan identitas
-- (NIK, nama, dst.) terpisah dari customers, tanpa unique constraint global
-- pada NIK (hanya unique per registration_id). Akibatnya sistem tidak tahu
-- kalau NIK yang sama muncul lagi sebagai customer individu atau sebagai
-- peserta di registrasi instansi lain — tidak ada satu sumber kebenaran
-- untuk "siapa orang ini".
--
-- Fix: `customers` jadi satu-satunya tabel identitas orang (sudah didesain
-- begitu sejak 0008_relax_customer_for_split.sql — field personal nullable,
-- portal_status/password_hash NULL sampai akses portal diprovisi). Peserta
-- instansi yang belum punya akun cukup jadi row customers tanpa kredensial;
-- `customers.nik UNIQUE` otomatis mencegah duplikasi identitas tanpa perlu
-- logic dedup manual. `registration_members` cuma nyimpen relasi "customer
-- mana jadi peserta di registration mana", bukan identitas lagi.
--
-- Aman dilakukan clean cut (drop + create) karena belum ada data produksi
-- yang bergantung pada registration_participants.

-- ============================================================
-- customers.email: relax jadi nullable.
-- Peserta instansi kolektif sering tidak punya email individual
-- (lihat komentar lama di 0013). UNIQUE index Postgres tetap berlaku
-- untuk nilai non-NULL; banyak NULL diperbolehkan berdampingan.
-- ============================================================
ALTER TABLE customers
  ALTER COLUMN email DROP NOT NULL;

-- ============================================================
-- Bongkar struktur lama: policies.participant_id + registration_participants
-- ============================================================
ALTER TABLE policies DROP COLUMN participant_id;
DROP TABLE registration_participants;

-- ============================================================
-- Tabel baru: registration_members
-- 1 row per peserta INSTANSI, merujuk ke customers (identitas) +
-- registrations (grup mana). Untuk INDIVIDU, tabel ini tetap kosong
-- (sama seperti registration_participants dulu).
-- ============================================================
CREATE TABLE registration_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  -- RESTRICT: customer yang sudah jadi peserta di suatu registrasi tidak
  -- boleh terhapus diam-diam (konsisten dengan policies vs registrations).
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  -- Beneficiary per peserta (WAJIB untuk produk LIFE, NULL untuk PA/HEALTH).
  beneficiary_name VARCHAR(120),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- 1 customer cuma boleh jadi peserta sekali per registration yang sama.
  UNIQUE (registration_id, customer_id)
);

CREATE INDEX idx_registration_members_registration
  ON registration_members(registration_id);
CREATE INDEX idx_registration_members_customer
  ON registration_members(customer_id);

-- ============================================================
-- Policies: ganti participant_id → member_id (rujuk registration_members,
-- bukan lagi registration_participants).
-- ============================================================
ALTER TABLE policies
  ADD COLUMN member_id UUID REFERENCES registration_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN policies.member_id IS
  'Untuk INSTANSI: link ke registration_members (peserta) yang dicakup polis ini. NULL untuk INDIVIDU.';

CREATE INDEX idx_policies_member ON policies(member_id);
