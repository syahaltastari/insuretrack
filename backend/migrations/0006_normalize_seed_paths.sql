-- Migrasi 0006_normalize_seed_paths.sql
-- Seed 0005 menulis logo_path/photo_path dengan prefix absolut host
-- (`/var/uploads/...`) DAN tidak menyertakan file fisik di disk — sehingga
-- URL yang dihasilkan di landing page akan 404. Untuk MVP, bersihkan baris
-- seed klien (testimoni seed tetap dipertahankan karena tidak memiliki
-- photo_path sehingga tetap aman ditampilkan tanpa file).
-- Data klien nyata akan di-input via /admin/clients (upload logo asli).

DELETE FROM clients;
