# InsureTrack — VPS Dev Runbook (Dokploy + HTTP-only)

**Tanggal:** 2026-06-10
**Status:** 📘 Runbook — fokus ke deploy VPS Dev tanpa domain, pakai Dokploy + Traefik HTTP (no SSL).

> **Scope dokumen ini**: VPS Dev, single instance, HTTP-only, tanpa backup/HA/replicas. Untuk production (HTTPS, HA, backup harian, DR) baca [`DEPLOYMENT.md`](./DEPLOYMENT.md) — arsitektur sama, hanya tambah beberapa layer.
>
> **Asumsi**: VPS dengan IP publik statis (Azure B1ms / Hetzner CX22 / DO Basic / Oracle Free Tier), Docker sudah jalan, user familiar dengan SSH & command line dasar.

---

## Daftar Isi

1. [Overview](#1-overview)
2. [Prasyarat](#2-prasyarat)
3. [Bagian A — Validasi lokal](#3-bagian-a--validasi-lokal)
4. [Bagian B — Deploy ke VPS + Dokploy](#4-bagian-b--deploy-ke-vps--dokploy)
5. [Bagian C — Smoke test di VPS](#5-bagian-c--smoke-test-di-vps)
6. [Database — setup, koneksi, reset](#6-database--setup-koneksi-reset)
7. [Troubleshooting](#7-troubleshooting)
8. [Update workflow](#8-update-workflow)
9. [Kapan naik ke production](#9-kapan-naik-ke-production)

---

## 1. Overview

### Apa yang berbeda dari `DEPLOYMENT.md`

| Aspek | `DEPLOYMENT.md` (production) | `RUNBOOK_VPS_DEV.md` (ini) |
| --- | --- | --- |
| **Target** | Production traffic, compliance-ready | Dev/UAT/testing, single user |
| **HTTPS** | Let's Encrypt via Traefik | HTTP-only, no SSL |
| **Replicas** | 2 instance per app untuk HA | 1 instance per service |
| **Backup** | `db-backup` service harian + offsite | Tidak — backup dilakukan manual kalau perlu |
| **Domain** | Real domain (mis. `insuretrack.id`) | IP literal atau sslip.io |
| **Resource** | 4-8 GB RAM, rekomendasi B2s/CX22 | 2 GB RAM cukup (B1ms) |
| **Waktu setup** | 1-2 jam (DNS, SSL, secret, monitoring) | 20-30 menit (Dokploy + import compose) |

### Arsitektur

```
┌──────────────────────────────────────────────────┐
│  Browser (lokal)                                  │
└──────────────────────────────────────────────────┘
                      │ HTTP
                      ▼
┌──────────────────────────────────────────────────┐
│  VPS (Ubuntu 22.04+, Docker)                      │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  Dokploy (panel di :3000, internal)       │    │
│  │  ┌──────────────────────────────────────┐ │    │
│  │  │ Traefik (built-in Dokploy)           │ │    │
│  │  │ route by Host header ke service      │ │    │
│  │  └──────────────────────────────────────┘ │    │
│  │       │                                    │    │
│  │       ▼                                    │    │
│  │  ┌──────────────────────────────────────┐ │    │
│  │  │ docker-compose stack:                │ │    │
│  │  │  - db (postgres:15-alpine)           │ │    │
│  │  │  - backend (Rust + Axum) :8080       │ │    │
│  │  │  - portal (Next.js) :3000            │ │    │
│  │  │  - admin  (Next.js) :3001            │ │    │
│  │  └──────────────────────────────────────┘ │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  Volumes: pgdata, backend_uploads                 │
└──────────────────────────────────────────────────┘
```

**Akses publik**:
- `http://api.${DOMAIN}/...`     → backend
- `http://portal.${DOMAIN}/...`   → portal customer
- `http://admin.${DOMAIN}/...`    → admin backoffice

`${DOMAIN}` bisa berupa:
- **IP literal**: `20.189.121.230` → akses `http://20.189.121.230` (Traefik pilih default route)
- **sslip.io**: `20-189-121-230.sslip.io` → `http://portal.20-189-121-230.sslip.io` resolve ke IP, Traefik route by Host
- **Real domain** (nanti): `insuretrack.id` (perlu A record di DNS provider)

Untuk Dev, **sslip.io** paling fleksibel — tidak perlu setup DNS record.

---

## 2. Prasyarat

### 2.1 VPS

- **OS**: Ubuntu 22.04 LTS atau 24.04 LTS
- **Spesifikasi minimum**: 1 vCPU, 2 GB RAM, 20 GB SSD
- **IP publik statis** (catat IP-nya — akan dipakai di `DOMAIN`)
- **Port terbuka di cloud firewall**: 22 (SSH), 80 (HTTP), 443 (HTTPS — untuk future)
- **Akses root atau sudo**

### 2.2 Di lokal

- **Docker + Docker Compose** (Docker 23+ sudah include Compose v2)
- **Git** (untuk push code ke GitHub)
- **Repo InsureTrack sudah di GitHub** (Dokploy clone dari sini)

### 2.3 Akun layanan eksternal (optional di Dev)

- **Resend** untuk email (https://resend.com) — `RESEND_API_KEY`. Untuk Dev bisa pakai API key kosong, backend log warning tapi tidak crash.
- **Cloudflare R2** untuk storage (optional, default pakai local volume).

---

## 3. Bagian A — Validasi lokal

Sebelum ke VPS, pastikan stack jalan di lokal. Ini validasi bahwa Dockerfile + compose Anda tidak rusak.

### 3.1 Setup env

```bash
cd /path/to/insuretrack
cp .env.example .env
```

Edit `.env` (untuk lokal, default value sudah cukup — `JWT_SECRET` dev, `PAYMENT_WEBHOOK_SECRET` dev, `POSTGRES_PASSWORD` dev). Kalau mau strict, generate secret baru:

```bash
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 64)|" .env
sed -i "s|^PAYMENT_WEBHOOK_SECRET=.*|PAYMENT_WEBHOOK_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
```

`DOMAIN=localhost` di `.env.example` sudah cukup untuk lokal (Traefik labels inactive, port binding langsung dipakai).

### 3.2 Build & start

```bash
docker compose up -d --build
```

Tunggu 30-90 detik untuk build image (terutama portal/admin — download image, install deps, build Next.js).

### 3.3 Verifikasi

```bash
# Status semua service — harus (healthy)
docker compose ps

# Backend health
curl -s http://localhost:8080/health
# → {"service":"insuretrack-backend","status":"ok","version":"0.1.0"}

# Portal root (200 OK)
curl -sI http://localhost:3000/

# Admin login page (200 OK)
curl -sI http://localhost:3001/admin/login

# DB connection (cek tabel ada)
docker compose exec db psql -U insurance_admin -d digital_insurance -c "\dt"
```

### 3.4 Reset (kalau ada masalah)

```bash
# Stop, hapus container + network, JAGA volume
docker compose down

# Stop + HAPUS volume (data hilang!)
docker compose down -v
```

### 3.5 Common issues saat lokal

| Error | Fix |
| --- | --- |
| `ERROR: failed to solve: failed to compute cache key: ... not found` | Ada Dockerfile yang reference path salah. Cek `docker compose build portal` log. |
| `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` | `pnpm-workspace.yaml` atau `package.json` root tidak ke-COPY. Biasanya karena edit Dockerfile — revert dan re-build. |
| Build context > 100 MB | Root `.dockerignore` corrupt. Lihat `document/DOCKER_SETUP.md` §2. |
| Backend `unhealthy` terus | Image backend tidak punya `wget`. Rebuild: `docker compose build --no-cache backend`. |
| Port 3000/3001/8080 already in use | `lsof -i :3000` (Mac/Linux) atau `netstat -ano | findstr :3000` (Windows). Stop aplikasi yang konflik. |

Lihat [`DOCKER_SETUP.md`](./DOCKER_SETUP.md) §8 untuk troubleshooting lengkap.

---

## 4. Bagian B — Deploy ke VPS + Dokploy

### 4.1 Install Dokploy di VPS

SSH ke VPS:

```bash
ssh ubuntu@<IP-VPS>
```

Update dan install prerequisites:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ufw

# Firewall host (sementara allow 3000 untuk akses awal panel Dokploy)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp   # Dokploy panel
sudo ufw enable
```

Install Dokploy (official installer):

```bash
curl -sSL https://dokploy.com/install.sh | sudo bash
```

Tunggu 2-5 menit. Setelah selesai, Dokploy panel ada di `http://<IP-VPS>:3000`.

### 4.2 Buka port 80/443 di cloud firewall

**Azure NSG** (kalau pakai Azure):
1. Portal Azure → cari VM → **Networking** → **Inbound port rules** → **Add**:
   - HTTP: protocol TCP, port 80, action Allow, priority 100, name `allow-http-80`
   - HTTPS: protocol TCP, port 443, action Allow, priority 110, name `allow-https-443`
2. Save. Tunggu 30 detik propagasi.

**Hetzner / DO / Oracle**: biasanya default sudah allow HTTP/HTTPS. Cek lewat provider dashboard kalau perlu.

Verifikasi dari lokal:

```bash
# Windows PowerShell
Test-NetConnection -ComputerName <IP-VPS> -Port 80
Test-NetConnection -ComputerName <IP-VPS> -Port 443
# TcpTestSucceeded: True = port terbuka
```

### 4.3 Setup admin Dokploy

1. Browser → `http://<IP-VPS>:3000`
2. Buat akun admin (username + password kuat — simpan di password manager)
3. **Settings → Security** → aktifkan **2FA (TOTP)**
4. (Opsional) Settings → **Advanced** → set panel URL ke `http://<IP-VPS>:3000`

> **Hardening**: setelah setup awal, **tutup port 3000** di UFW (`sudo ufw delete allow 3000/tcp`) dan akses panel via SSH tunnel:
> ```bash
> ssh -L 3000:localhost:3000 ubuntu@<IP-VPS>
> # Lalu browser: http://localhost:3000
> ```

### 4.4 Buat Project + Service

Di Dokploy panel:

1. **Projects** → **+ Create Project** → nama: `InsureTrack Dev`
2. Di dalam project → **Services** → **+ Create Service** → **Compose**
3. **Source**:
   - Provider: **GitHub**
   - Repository: `syahaltastari/insuretrack` (atau fork Anda)
   - Branch: `main` (atau `dev` kalau Anda push ke sana dulu)
   - **Docker Compose File Location**: `docker-compose.yml`
   - **Base Directory**: `.` (titik) — **WAJIB**, kalau kosong Dokploy salah detect context

4. Klik **Save** (jangan Deploy dulu — set env dulu).

### 4.5 Set environment variables

Di service yang baru dibuat, buka tab **Environment**.

#### Tab **Secrets** (untuk var sensitif, encrypted)

Generate secret baru di lokal (atau langsung di VPS):

```bash
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 64   # JWT_SECRET
openssl rand -hex 32   # PAYMENT_WEBHOOK_SECRET
```

Paste ke tab Secrets Dokploy:

```env
# Database
POSTGRES_USER=insurance_admin
POSTGRES_PASSWORD=<paste hasil openssl rand -hex 24>
POSTGRES_DB=digital_insurance
DATABASE_URL=postgres://insurance_admin:<sama dengan POSTGRES_PASSWORD>@db:5432/digital_insurance

# Auth
JWT_SECRET=<paste hasil openssl rand -hex 64>
PAYMENT_WEBHOOK_SECRET=<paste hasil openssl rand -hex 32>

# Domain untuk Traefik routing
DOMAIN=20-189-121-230.sslip.io
# ↑ Ganti dengan IP VPS Anda, format sslip.io (dash, bukan dot).
# ↑ Contoh: kalau IP Anda 152.42.156.78 → DOMAIN=152-42-156-78.sslip.io
# ↑ Alternatif tanpa sslip.io: DOMAIN=152.42.156.78 (literal IP, Traefik pakai Host header)

# URLs publik
APP_BASE_URL=http://portal.${DOMAIN}
MEDIA_BASE_URL=http://api.${DOMAIN}

# BACKEND_URL: untuk Next.js SSR/RSC fetch dari dalam container.
# WAJIB pakai service name `backend` (Docker internal DNS), BUKAN
# `localhost` atau public URL (keduanya tidak resolve dari dalam network).
# Tanpa ini, halaman yang pakai SSR fetch (mis. landing page) akan load
# dengan data kosong — bug silent, tidak ada error di log.
BACKEND_URL=http://backend:8080

# Email (Resend) — optional di Dev, backend log warning kalau kosong
RESEND_API_KEY=re_replace_me
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Storage (default local)
STORAGE_BACKEND=local
UPLOAD_DIR=/var/uploads

# Logging
RUST_LOG=info,insuretrack_backend=debug
```

#### Tab **Environment** (untuk `NEXT_PUBLIC_*` — di-bake ke client bundle)

```env
NEXT_PUBLIC_API_URL=http://api.${DOMAIN}
```

> **PENTING**: `NEXT_PUBLIC_*` di-bake ke client JS saat build. URL API memang publik, jadi aman di-bake. Yang sensitif (JWT_SECRET, password, Resend API key) SELALU di tab Secrets.

#### Kenapa `BACKEND_URL` terpisah dari `NEXT_PUBLIC_API_URL`?

Frontend Next.js punya **dua konteks fetch**:
- **Browser** → pakai `NEXT_PUBLIC_API_URL` (public URL, lewat Traefik atau port mapping).
- **SSR/RSC server-side** (render awal halaman sebelum di-hydrate) → harus pakai `BACKEND_URL` (internal Docker service name).

Kalau SSR pakai public URL (`http://api.${DOMAIN}`), dari dalam container hostname `api.${DOMAIN}` tidak resolve (Traefik tidak ada di internal network). Fetch gagal → page render dengan data kosong tapi **tidak error** (try/catch di kode). Bug silent.

| Konteks | Env var | Value di lokal | Value di VPS Dev |
| --- | --- | --- | --- |
| Browser fetch | `NEXT_PUBLIC_API_URL` | `http://localhost:8080/api` | `http://api.${DOMAIN}/api` |
| SSR/RSC fetch (dari dalam container) | `BACKEND_URL` | `http://backend:8080` | `http://backend:8080` |

### 4.6 Set domains (HTTP-only)

Di service → tab **Domains** → **+ Add Domain**:

| Domain | HTTPS | Service Port |
| --- | --- | --- |
| `api.${DOMAIN}` | ❌ Uncheck **Generate SSL** | 8080 |
| `portal.${DOMAIN}` | ❌ Uncheck **Generate SSL** | 3000 |
| `admin.${DOMAIN}` | ❌ Uncheck **Generate SSL** | 3001 |

> Untuk Dev tanpa SSL: **jangan centang Generate SSL**. Traefik route by Host header ke port container internal. Browser akan akses `http://...` (bukan `https://`).

### 4.7 Deploy

Klik **Deploy** di service. Dokploy akan:
1. Clone repo dari GitHub
2. Build 4 image (db pakai image official postgres:15-alpine; backend/portal/admin pakai Dockerfile)
3. Start container dengan env yang sudah di-set
4. Traefik auto-detect label dan route `Host()` rules

Waktu build: 3-8 menit (tergantung kecepatan VPS dan ukuran image).

Pantau log di tab **Logs** atau via SSH:

```bash
ssh ubuntu@<IP-VPS>
docker ps   # 4 container harus Up
docker logs insuretrack_backend   # cek error
docker logs insuretrack_portal    # cek error
```

---

## 5. Bagian C — Smoke test di VPS

### 5.1 Cek container

```bash
ssh ubuntu@<IP-VPS>
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Output yang diharapkan (kurang lebih):
```
NAMES                  STATUS                    PORTS
insuretrack_db         Up X minutes (healthy)    127.0.0.1:5433->5432/tcp
insuretrack_backend    Up X minutes (healthy)    127.0.0.1:8080->8080/tcp
insuretrack_portal     Up X minutes (healthy)    127.0.0.1:3000->3000/tcp
insuretrack_admin      Up X minutes (healthy)    127.0.0.1:3001->3001/tcp
```

Kalau ada yang `(unhealthy)` atau restart loop, cek `docker logs <container>`.

### 5.2 Cek endpoint dari dalam VPS

```bash
# Backend health
curl -s http://localhost:8080/health
# → {"status":"ok",...}

# Traefik routing — test Host header ke portal
curl -H "Host: portal.${DOMAIN}" http://localhost/
# → HTML (Next.js response)

# API public
curl -H "Host: api.${DOMAIN}" http://localhost/api/public/products
# → JSON list produk
```

> Traefik listen di port 80 di host. `Host: ...` header pilih router mana yang handle.

### 5.3 Cek dari browser lokal

Buka:
- `http://<IP-VPS>` — kalau IP literal, Traefik mungkin return 404 (tidak ada default route). Test spesifik:
- `http://portal.${DOMAIN}` — portal customer
- `http://admin.${DOMAIN}/admin/login` — admin login
- `http://api.${DOMAIN}/api/public/products` — API response

Untuk sslip.io, pastikan format benar: `http://portal.20-189-121-230.sslip.io` (hostname, bukan path).

### 5.4 Cek log

```bash
# Real-time tail
docker logs -f insuretrack_backend
docker logs -f insuretrack_portal
docker logs -f insuretrack_admin

# Filter error
docker logs insuretrack_backend 2>&1 | grep -i error
```

### 5.5 Cek database

```bash
# DB ready?
docker compose exec db pg_isready -U $POSTGRES_USER

# Tabel ada?
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\dt"
# Harus ada 15 tabel — kalau kurang, backend belum apply migrations.
# Cek log backend: docker logs insuretrack_backend 2>&1 | grep -i migration

# Migrations applied (cek satu per satu)
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT version, description, success
FROM _sqlx_migrations
ORDER BY version;
"

# Initial admin user ada?
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT username, created_at FROM admin_users;
"
```

Detail lengkap (reset, koneksi SSH tunnel, ganti password) di [§6 Database](#6-database--setup-koneksi-reset).

---

## 6. Database — setup, koneksi, reset

### 6.1 Dari mana database-nya

DB adalah **service di compose yang sama** dengan backend/portal/admin — bukan Dokploy "Database" terpisah. Container `db` (PostgreSQL 15-alpine) start otomatis saat `docker compose up`, dapat env `POSTGRES_USER`/`PASSWORD`/`DB` dari tab Secrets, dan pakai Docker volume `pgdata` untuk persist data.

**Lokal**: `127.0.0.1:5433` di host machine (lihat port mapping di compose).
**VPS**: `127.0.0.1:5433` di host VPS — artinya port DB hanya listen di localhost VPS, **tidak** di-expose ke internet. Aman.

### 6.2 Migrations — auto-applied

Backend di-boot akan otomatis apply semua file SQL di `apps/backend/migrations/` (file `0001_*.sql` sampai yang terbaru, **11 file** saat ini) via `sqlx::migrate!()`. Tabel `_sqlx_migrations` di DB mencatat migration mana yang sudah applied.

Verifikasi migrations applied:

```bash
# Dari dalam container
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT version, description FROM _sqlx_migrations ORDER BY version;"

# Dari host (lokal) — pakai connection string yang sama dengan DATABASE_URL
psql "postgres://insurance_admin:insurance_password@localhost:5433/digital_insurance" -c "\dt"
# Harus ada 15 tabel: admin_users, audit_logs, claim_documents, claims, clients,
# customers, email_logs, id_sequences, inquiries, inquiry_messages, invoices,
# policies, registrations, testimonials, _sqlx_migrations
```

> **Tambah migration baru?** Taruh file SQL baru di `apps/backend/migrations/` dengan nomor urut berikutnya (mis. `0012_*.sql`). Backend startup akan auto-apply. **JANGAN edit migration yang sudah pernah applied** (lihat spec `CLAUDE.md`).

### 6.3 Initial admin user

Migration `0004_seed.sql` insert satu admin untuk testing awal:

| Field | Value |
| --- | --- |
| Username | `admin` |
| Password | `admin123` |
| Hash | argon2id (default params: m=65536, t=3, p=4) |

Login di `http://admin.${DOMAIN}/admin/login` atau langsung ke API `POST /api/admin/login` dengan `{"username": "admin", "password": "admin123"}`.

**Ganti password** (via API — backend punya endpoint `POST /api/admin/me/password` yang butuh current password, min 8 char):

```bash
# Login dulu untuk dapat token, lalu ganti password
TOKEN=$(curl -s -X POST http://localhost:8080/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r .data.token)

curl -X POST http://localhost:8080/api/admin/me/password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"admin123","new_password":"<password_baru_min_8_char>"}'
```

**Force reset (kalau lupa password)** — generate argon2 hash baru pakai tool eksternal (mis. `argon2-cli`, atau Rust `cargo install argon2-cli`), lalu `UPDATE` via psql:

```bash
# Generate hash (contoh pakai tool eksternal — implementasi bisa berbeda)
echo -n "password_baru" | argon2-cli hash -i
# Output: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>

# Update DB
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
  UPDATE admin_users
  SET password_hash = '\$argon2id\$v=19\$m=65536,t=3,p=4\$<salt>\$<hash>',
      password_changed_at = now(),
      updated_at = now()
  WHERE username = 'admin';
"
```

> Untuk Dev dengan single user, password `admin123` default sudah cukup. Treat sebagai shared dev credential, jangan pakai di production.

### 6.4 Konek via psql

**Lokal (host machine)**:

```bash
# Pakai port 5433 (mapping di compose)
psql "postgres://insurance_admin:insurance_password@localhost:5433/digital_insurance"

# Atau pakai container langsung
docker compose exec db psql -U insurance_admin -d digital_insurance
```

**VPS Dev**:

```bash
# Cara A: SSH tunnel (recommended — tidak expose DB)
ssh -L 5433:localhost:5433 ubuntu@<IP-VPS>
# Lalu di terminal lokal:
psql "postgres://insurance_admin:<password>@localhost:5433/digital_insurance"

# Cara B: langsung di container (tidak perlu port mapping, no tunnel)
ssh ubuntu@<IP-VPS>
cd /etc/dokploy/applications/<service-name>/code
docker compose exec db psql -U insurance_admin -d digital_insurance
```

**VPS via Dokploy terminal** (alternatif kalau SSH belum disetup):

1. Di Dokploy panel → service → tab **Logs** atau **Console** (kalau ada)
2. Pilih container `insuretrack_db`
3. Run `psql` command

### 6.5 Common DB operations

```bash
# List semua tabel
docker compose exec db psql -U insurance_admin -d digital_insurance -c "\dt"

# Lihat schema tabel
docker compose exec db psql -U insurance_admin -d digital_insurance -c "\d customers"

# Hitung baris per tabel
docker compose exec db psql -U insurance_admin -d digital_insurance -c "
SELECT 'customers' AS tbl, count(*) FROM customers
UNION ALL SELECT 'registrations', count(*) FROM registrations
UNION ALL SELECT 'invoices', count(*) FROM invoices
UNION ALL SELECT 'policies', count(*) FROM policies
UNION ALL SELECT 'claims', count(*) FROM claims
UNION ALL SELECT 'inquiries', count(*) FROM inquiries
ORDER BY tbl;
"

# Lihat DB size
docker compose exec db psql -U insurance_admin -d digital_insurance -c "SELECT pg_size_pretty(pg_database_size('digital_insurance'));"

# Lihat running query (kalau ada yang lambat)
docker compose exec db psql -U insurance_admin -d digital_insurance -c "
SELECT pid, state, age(clock_timestamp(), query_start) AS duration, query
FROM pg_stat_activity
WHERE state != 'idle' ORDER BY duration DESC;
"
```

### 6.6 Reset database (HAPUS semua data)

```bash
# Stop stack + hapus volume pgdata (DATA HILANG TOTAL)
docker compose down -v

# Start ulang — Postgres init DB kosong, backend apply migrations
docker compose up -d
```

Setelah reset, cek tabel:
```bash
docker compose exec db psql -U insurance_admin -d digital_insurance -c "\dt"
```

> **PENTING**: `down -v` menghapus **semua data customer, registration, invoice, policy, claim**. Hanya boleh di Dev. Untuk backup sebelum reset, lihat `DEPLOYMENT.md` §8.

### 6.7 Backup & restore (out of scope untuk Dev)

Dev runbook ini **tidak** include backup otomatis. Untuk setup backup harian (cron + rclone offsite), lihat `DEPLOYMENT.md` §6.4 dan §8 — service `db-backup` yang dimaksud ada di sana.

Manual backup kalau perlu sebelum risky operation:
```bash
docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup-$(date +%Y%m%d).sql
# Restore:
cat backup-20260610.sql | docker compose exec -T db psql -U $POSTGRES_USER $POSTGRES_DB
```

---

## 7. Troubleshooting

### 7.1 Build fail: `failed to compute cache key`

Build context salah detect. **Base Directory** di Dokploy service harus `.` (titik), bukan kosong.

### 7.2 Build hang di "Collecting build traces" (portal/admin)

Root `.dockerignore` corrupt atau hilang. Verifikasi di VPS:

```bash
ssh ubuntu@<IP-VPS>
cd /etc/dokploy/applications/<service-name>/code
cat .dockerignore | head -20
# Harus exclude node_modules, target, .next, dll.
```

Lihat `DOCKER_SETUP.md` §2 untuk isi `.dockerignore` yang benar.

### 7.3 Container restart loop

```bash
docker logs <container> 2>&1 | tail -30
```

Penyebab umum:
- **Backend**: `DATABASE_URL` salah / db belum ready. Cek `docker logs insuretrack_db` (harus `database system is ready to accept connections`).
- **Portal/Admin**: `NEXT_PUBLIC_API_URL` kosong. Build ulang image dengan arg yang benar.
- **Semua**: env var required kosong. Cek tab Secrets di Dokploy.

### 7.4 Traefik 502 Bad Gateway

Upstream service belum healthy. Cek:

```bash
docker ps   # semua harus (healthy)
docker logs dokploy-traefik 2>&1 | tail -30
```

Tunggu 30-60 detik, Traefik auto-retry.

### 7.5 DNS tidak resolve (sslip.io)

Test dari lokal:
```bash
nslookup portal.20-189-121-230.sslip.io
# Harus return IP VPS Anda
```

Kalau tidak resolve: cek apakah `20-189-121-230` format benar (dash, bukan dot). Format sslip.io: `<subdomain>-<ip-with-dash>.<DOMAIN>.sslip.io`.

### 7.6 `NET::ERR_CERT_AUTHORITY_INVALID` di browser

Anda akses pakai `https://...` tapi Dev belum setup SSL. Ganti ke `http://...` (tanpa **s**).

Atau kalau Anda **sengaja** mau HTTPS di Dev, lihat [`DEPLOYMENT.md` §5.8](./DEPLOYMENT.md#58-configure-domains) untuk setup Let's Encrypt (butuh real domain, bukan sslip.io — LE tidak support sslip.io).

### 7.7 Port 80 tidak reachable dari internet

Cloud firewall block. Cek NSG Azure / security group provider. Lihat §4.2.

### 7.8 Landing page render dengan data kosong (products/clients/testimonials hilang)

**Gejala**: Buka `http://portal.${DOMAIN}` — page load tapi section produk / klien / testimoni kosong atau tampil "Tidak bisa memuat produk (backend belum hidup?)".

**Penyebab**: Next.js SSR fetch dari dalam container pakai `NEXT_PUBLIC_API_URL` (public URL), yang tidak resolve dari dalam Docker network. Fix-nya sudah di-handle via env var `BACKEND_URL=http://backend:8080` di tab Secrets Dokploy (lihat §4.5). Kalau di lokal tidak ada env `BACKEND_URL`, tambahkan ke `.env`:

```env
BACKEND_URL=http://backend:8080
```

Verifikasi dari dalam container:
```bash
# Masuk ke container portal
docker compose exec portal sh
# Test fetch langsung ke backend (harus return JSON)
wget -qO- http://backend:8080/api/public/products
# Kalau "bad address" → BACKEND_URL tidak di-set atau salah
```

Setelah `BACKEND_URL` di-set, **harus redeploy** (image portal/admin tidak auto-reload env var runtime; build ulang image dengan env baru atau restart container).

---

## 8. Update workflow

### 8.1 Auto-deploy via GitHub webhook

1. Di Dokploy service → tab **Webhooks** → copy URL
2. GitHub repo → **Settings** → **Webhooks** → **Add webhook**
3. Paste URL, content-type `application/json`, event: **Just the push event**
4. Save. Sekarang setiap `git push` ke branch yang di-monitor → auto rebuild + redeploy.

### 8.2 Manual redeploy via UI

1. Push code ke GitHub seperti biasa
2. Di Dokploy panel → service → klik **Redeploy**
3. Image di-rebuild, container di-recreate

### 8.3 Manual via SSH (kalau ada masalah dengan auto-deploy)

```bash
ssh ubuntu@<IP-VPS>
cd /etc/dokploy/applications/<service-name>/code
git pull
docker compose build backend   # atau portal/admin
docker compose up -d --no-deps backend
```

> Folder `/etc/dokploy/applications/<service-name>/code` adalah working directory Dokploy untuk service Compose. Ganti `<service-name>` dengan ID service Anda (lihat di URL Dokploy panel).

---

## 9. Kapan naik ke production

Runbook ini cukup untuk Dev/UAT/low-traffic. Untuk production yang serius, Anda butuh:

| Tambahan | Kenapa | Lihat |
| --- | --- | --- |
| **Real domain + Let's Encrypt** | SSL/TLS wajib untuk data PII (NIK, KTP) | `DEPLOYMENT.md` §4-5 |
| **Replicas (2+ per service)** | Zero-downtime deploy + HA | `DEPLOYMENT.md` §2.3, §6.3 |
| **Daily backup + offsite** | DR-grade, compliance UU PDP | `DEPLOYMENT.md` §6.4, §8 |
| **Resource limits** | Lindungi VPS dari OOM | `DEPLOYMENT.md` §6.3 |
| **Monitoring** | Visibility saat incident | `DEPLOYMENT.md` §10 |
| **Secret rotation** | Hygiene kredensial | `DEPLOYMENT.md` §9.2 |

Cukup import compose yang sama — semua fitur di atas adalah layer tambahan (Traefik cert, replicas, db-backup service) yang tidak menyentuh Dockerfile atau business logic.

---

## Referensi cepat

| Topik | File |
| --- | --- |
| Docker setup & troubleshooting lengkap | [`DOCKER_SETUP.md`](./DOCKER_SETUP.md) |
| Production deployment (HTTPS, HA, backup) | [`DEPLOYMENT.md`](./DEPLOYMENT.md) |
| Cloudflare R2 storage | [`R2_SETUP.md`](./R2_SETUP.md) |
| Spec aplikasi | `Technical Specification Document Digital Insurance v1.2.pdf` |
| OpenAPI spec | [`openapi.yaml`](./openapi.yaml) |
| Dokploy docs | https://docs.dokploy.com |
| Traefik docs | https://doc.traefik.io/traefik/ |

---

**Maintainer**: tim InsureTrack · **Update terakhir**: 2026-06-10
