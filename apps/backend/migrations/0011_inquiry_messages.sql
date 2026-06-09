-- Migrasi 0011_inquiry_messages.sql
-- Konversi inquiry dari model Q&A (satu pesan + satu balasan) menjadi tiket
-- ber-threads: setiap balasan (dari customer maupun admin) di-record di tabel
-- `inquiry_messages`, diurutkan kronologis.
--
-- Field legacy di `inquiries.response` / `responded_at` (admin's first
-- answer) tetap dipertahankan untuk backward-compat — tidak di-drop.
-- Frontend baru read dari `inquiry_messages`; field legacy bisa di-deprecate
-- di migrasi berikutnya setelah semua call site migrasi.
--
-- Status semantics (lihat juga domain/inquiry.rs):
--   OPEN      = latest message dari CUSTOMER (admin harus balas)
--   ANSWERED  = latest message dari ADMIN (customer harus balas/close)
--   CLOSED    = terminal (manual close oleh customer/admin ATAU auto-close
--               karena customer tidak balas dalam N hari)
--
-- Auto-close threshold: lihat backend config `INQUIRY_AUTO_CLOSE_DAYS`
-- (default 7). Di-check secara lazy di setiap GET handler — lihat
-- routes/{customer,admin}.rs::auto_close_if_stale.

-- ---- New table: inquiry_messages ------------------------------------------
-- Satu row per pesan di thread. sender_type membedakan CUSTOMER vs ADMIN;
-- sender_id adalah customer_id atau admin_users.id (nullable untuk
-- backward-compat jika admin di-delete); sender_name di-denormalize
-- supaya render thread tidak butuh JOIN ke customers/admin_users.
CREATE TABLE inquiry_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inquiry_id UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  sender_type VARCHAR NOT NULL CHECK (sender_type IN ('CUSTOMER', 'ADMIN')),
  sender_id UUID,
  sender_name VARCHAR NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for "ambil semua messages dari inquiry, urut waktu" — query paling
-- umum di detail endpoint.
CREATE INDEX idx_inquiry_messages_inquiry
  ON inquiry_messages(inquiry_id, created_at);

-- ---- New columns on inquiries ---------------------------------------------
-- `last_message_at` + `last_sender_type` di-cache di parent untuk query
-- list yang cepat (last message preview) dan auto-close check
-- (`last_message_at < now() - threshold`).
ALTER TABLE inquiries
  ADD COLUMN last_message_at TIMESTAMPTZ,
  ADD COLUMN last_sender_type VARCHAR CHECK (last_sender_type IN ('CUSTOMER', 'ADMIN')),
  ADD COLUMN closed_at TIMESTAMPTZ;

-- Backfill: untuk inquiry existing, anggap pesan pertama = pesan customer
-- (lihat kolom `inquiries.message` yang memang berisi pesan customer
-- pertama kali). created_at = last_message_at.
UPDATE inquiries SET
  last_message_at = created_at,
  last_sender_type = 'CUSTOMER'
WHERE last_message_at IS NULL;

-- Backfill thread dari kolom legacy:
-- - Pesan customer pertama (subject + message) → inquiry_messages
-- - Jawaban admin (response) → inquiry_messages kedua
-- Hanya untuk inquiry yang punya `responded_at` (artinya admin sudah balas).
-- Tandai admin sender_id sebagai NULL karena admin_users.id tidak tersedia
-- di sini (lookup terpisah saat render); sender_name pakai 'Tim InsureTrack'
-- sebagai placeholder yang aman.
INSERT INTO inquiry_messages (inquiry_id, sender_type, sender_id, sender_name, message, created_at)
SELECT
  i.id,
  'CUSTOMER',
  i.customer_id,
  c.full_name,
  i.message,
  i.created_at
FROM inquiries i
JOIN customers c ON c.id = i.customer_id
ON CONFLICT DO NOTHING;

INSERT INTO inquiry_messages (inquiry_id, sender_type, sender_id, sender_name, message, created_at)
SELECT
  i.id,
  'ADMIN',
  NULL,
  'Tim InsureTrack',
  i.response,
  i.responded_at
FROM inquiries i
WHERE i.response IS NOT NULL AND i.responded_at IS NOT NULL
ON CONFLICT DO NOTHING;
