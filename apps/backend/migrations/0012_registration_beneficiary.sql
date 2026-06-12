-- Tambah beneficiary_name untuk produk LIFE (ahli waris penerima manfaat).
-- Nullable: hanya relevan untuk LIFE, tapi tidak ada validasi per-product
-- di level DB; validasi kondisional ada di backend (validate_registration).
-- Lihat benefit list LIFE: 'Tunjuk keluarga, saudara, atau pihak ketiga
-- sebagai penerima'.

ALTER TABLE registrations
  ADD COLUMN beneficiary_name VARCHAR(120) NULL;

COMMENT ON COLUMN registrations.beneficiary_name IS
  'Nama ahli waris/penerima manfaat. Wajib untuk produk LIFE, opsional untuk PA/HEALTH (enforced di backend validate_registration).';
