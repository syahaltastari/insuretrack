# Seeder — Dummy Data Generator

Seeder untuk populate database dev InsureTrack dengan data realistis
atau volume besar untuk load test. Berupa binary Rust terpisah
(`cargo run --bin seed`), bukan migration SQL.

## Quick Start

```bash
# Default: --reset aktif, mode Demo, 30 customers + 50 registrations
cargo run --bin seed -- --upload-dir ./uploads

# Preview rencana tanpa nulis DB
cargo run --bin seed -- --dry-run --registrations 50

# High volume untuk pagination/load test
cargo run --bin seed -- --load

# Custom volume (mode Demo saja)
cargo run --bin seed -- --registrations 100 --customers 60
```

## Flags

| Flag | Default | Keterangan |
|---|---|---|
| `--reset` | `true` | TRUNCATE semua dev tables dulu (preserve `admin_users`) |
| `--load` | `false` | Mode load-test: 1000 regs, 600 customers, skip PDF |
| `--dry-run` | `false` | Print rencana, no DB writes |
| `--registrations` | `50` | Jumlah registration (Demo) |
| `--customers` | `30` | Jumlah customer (Demo) |
| `--customers-with-portal` | `3` | Customer dengan akses portal (Demo) |
| `--months-back` | `4` | Spread identifier prefix ke 4 bulan ke belakang |
| `--claims-ratio` | `0.4` | % policy yang punya ≥1 claim (0.0..=1.0) |
| `--upload-dir` | env `UPLOAD_DIR` / `./uploads` | Override path PDF & KTP files |

## Demo vs Load Mode

| | Demo (default) | Load |
|---|---|---|
| Registrations | 50 | 1000 |
| Customers | 30 | 600 |
| Portal customers | 3 | 5 |
| PDF rendering | ✅ Real PDF ke disk | ❌ Skipped (`pdf_path = NULL`) |
| Identifier spread | 4 bulan (Feb–Mei 2026) | 4 bulan |
| State machine variety | Lengkap | Minimal |
| Claims ratio | 40% | 40% |
| Email logs | ~5 per customer | ~5 per customer |
| Audit logs | ~250 | ~5000 |
| Total time | ~2.5s | ~20s |

## State Machine Coverage

Setiap status dari spec §10 muncul di data demo (cek via psql):

```sql
-- 1. registration (4 status)
SELECT status, count(*) FROM registrations GROUP BY status;
-- 2. invoice (4 status)
SELECT status, count(*) FROM invoices GROUP BY status;
-- 3. policy (3 status)
SELECT status, count(*) FROM policies GROUP BY status;
-- 4. claim (5 status)
SELECT status, count(*) FROM claims GROUP BY status;
-- 5. inquiry (3 status)
SELECT status, count(*) FROM inquiries GROUP BY status;
```

## Multi-Month Identifier Prefix

Identifier `REG-YYYYMM-NNNNNN` (spec §9) harus beda prefix per bulan.
Verify dengan:

```sql
SELECT substring(registration_no from 5 for 6) ym, count(*)
  FROM registrations GROUP BY ym ORDER BY ym;
-- Expect: 4 distinct months
```

## Portal Customer Credentials

3 customer dengan `portal_status='ACTIVE'` di Demo mode. Password
tetap `Demo1234!` (predictable untuk demo onboarding). Email di-print
ke console saat seeding selesai:

```
================================================================
  PORTAL CUSTOMER CREDENTIALS (login ke http://localhost:3000)
================================================================
  Email     : adi.lestari13@example.com
  Password  : Demo1234!
  Name      : Adi Lestari
------------------------------------------------------------
  ...
```

## Modul Structure

```
src/seed/
├── mod.rs          # Orchestrator + SeedReport
├── config.rs       # SeedConfig, SeedMode, build_config()
├── data.rs         # Indonesian name/city pool + Product table
├── reset.rs        # FK-safe TRUNCATE order
├── customers.rs    # Customer generator (3 portal + 27 pending)
├── registrations.rs # Registration + identifier backdate
├── invoices.rs     # Invoice 1:1 dengan reg
├── policies.rs     # Policy 1:1 dengan PAID/ISSUED reg
├── claims.rs       # 40% dari policies
├── inquiries.rs    # 30% dari customers
├── email_logs.rs   # 5-10 per customer
├── audit_logs.rs   # 1+ per business event
├── id_card.rs      # KTP file stub (1x1 PNG)
├── pdf_writer.rs   # e-Policy + invoice PDF rendering
└── printer.rs      # Console summary
```

## Troubleshooting

### "Backend masih running" — port 8080 conflict

`--reset` truncate tabel, tapi jika backend masih running dan sedang
memproses payment webhook, bisa race condition pada `id_sequences`.
**Fix:** stop backend dulu (Ctrl+C di window backend), baru run seeder.
Atau skip `--reset` (tidak ada flag untuk ini — by design, default ON
adalah yang aman).

### `--load` lama (>60s) atau OOM

- Load mode skip PDF, jadi OOM kecil kemungkinannya.
- Kalau lambat, cek apakah DB ada di slow disk / network mount.
- Bisa di-scale up `--load` parameters di `config::build_config`
  (saat ini hardcoded 1000/600/5).

### NIK atau email duplicate

NIK 16 digit punya 10⁴ ruang per kombinasi prov+kota+DDMMYY → untuk
30 customer tidak akan collision. Untuk 600 customer (load mode),
bisa collision; seeder retry dengan max 1000 attempts lalu panic.
**Fix:** tambah digit suffix atau kurangi `--customers`.

### PDF corrupt di admin download

Demo mode render PDF minimal (1 customer placeholder name/address).
Admin download tetap works, tapi content placeholder. **Fix M4:**
pass real customer NIK/name/address ke `pdf_writer::write_policy_pdf`.

## Default Admin (preserved saat reset)

`admin_users` table TIDAK di-truncate. User `admin` dari migration
`0004_seed.sql` selalu ada dengan password `admin123`. Rehash
di environment production (lihat `0004_seed.sql` header).
