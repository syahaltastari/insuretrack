-- Migrasi 0004_seed.sql
-- Seed admin user default untuk development.
-- Username: admin
-- Password: admin123  (DEV ONLY — rotate sebelum deploy ke environment lain)
-- Hash argon2id dengan parameter default (m=65536, t=3, p=4).
-- Hash ini dihasilkan via `argon2` npm package dengan password 'admin123'.
-- Untuk rotate: generate ulang dengan library yang sama dan replace nilai
-- `password_hash` di bawah, ATAU hapus row ini dan biarkan Rust backend
-- membuat admin baru saat startup dengan helper seeder.

INSERT INTO admin_users (username, password_hash)
VALUES (
  'admin',
  '$argon2id$v=19$m=65536,t=3,p=4$tl628/yjPSkO1KW+0GRiqw$YA8YZhgdiJwfKJ965rNnl4vK646tje7stBYXVfNb5tg'
)
ON CONFLICT (username) DO NOTHING;
