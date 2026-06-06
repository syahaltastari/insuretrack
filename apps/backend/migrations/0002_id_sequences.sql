-- Migrasi 0002_id_sequences.sql
-- Counter atomic per-bulan untuk identifier REG/INV/POL/CLM/INQ (spec §9).
-- Sequence allocation: row-level lock via UPDATE ... RETURNING agar
-- concurrent request tidak pernah mendapat nomor yang sama dalam bulan
-- yang sama. Reset otomatis tiap bulan (key komposit entity_type+year_month).

CREATE TABLE id_sequences (
  entity_type VARCHAR(8) NOT NULL CHECK (entity_type IN ('REG', 'INV', 'POL', 'CLM', 'INQ')),
  year_month  CHAR(6)    NOT NULL, -- format YYYYMM
  last_value  INTEGER    NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_type, year_month)
);

-- Insert baris 0 untuk bulan ini agar siap dipakai sejak hari pertama.
-- (Backfill di-handle service layer saat generator dipanggil; ini hanya
-- opsional agar row-nya ada untuk inspeksi.)
INSERT INTO id_sequences (entity_type, year_month, last_value)
VALUES
  ('REG', to_char(now(), 'YYYYMM'), 0),
  ('INV', to_char(now(), 'YYYYMM'), 0),
  ('POL', to_char(now(), 'YYYYMM'), 0),
  ('CLM', to_char(now(), 'YYYYMM'), 0),
  ('INQ', to_char(now(), 'YYYYMM'), 0)
ON CONFLICT (entity_type, year_month) DO NOTHING;
