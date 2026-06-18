# InsureTrack — Deploy Demo (Quickstart)

**Target:** Setup deploy demo ke VPS via Dokploy, sekali klik push → auto-deploy.
**Asumsi:** VPS Ubuntu 22.04+ dengan Docker sudah jalan, IP publik statis, tidak ada domain (pakai sslip.io atau raw IP).
**Mode:** **Demo** — single env, HTTP-only optional, tidak ada backup/rate-limit/monitoring.

> Untuk production-ready setup (HTTPS, backup, monitoring, multi-env) → baca [`RUNBOOK_VPS_DEV.md`](./RUNBOOK_VPS_DEV.md) dan [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## Daftar Isi

1. [Overview Arsitektur](#1-overview-arsitektur)
2. [Prasyarat](#2-prasyarat)
3. [Setup Awal (sekali)](#3-setup-awal-sekali)
4. [Setup Dokploy (sekali per VPS)](#4-setup-dokploy-sekali-per-vps)
5. [Setup GitHub Secrets (sekali)](#5-setup-github-secrets-sekali)
6. [First Deploy](#6-first-deploy)
7. [Daily Workflow](#7-daily-workflow)
8. [Rollback](#8-rollback)
9. [Limitations & Kapan Upgrade](#9-limitations--kapan-upgrade)

---

## 1. Overview Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│  Developer (lokal)                                          │
│  pnpm dev / cargo run                                       │
└─────────────────────────────────────────────────────────────┘
                       │ git push origin main
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub                                                     │
│  • Run CI (cargo test, vitest, playwright)                  │
│  • If main branch → trigger Deploy workflow                │
└─────────────────────────────────────────────────────────────┘
                       │ HTTPS API call
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Dokploy (VPS, panel di :3000)                              │
│  • Pull latest commit                                       │
│  • docker compose build + up                                │
│  • Traefik route by Host header                             │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  4 service di compose stack:                                │
│  - db          (postgres:15-alpine)                         │
│  - backend     (Rust + Axum, :8080)                         │
│  - portal      (Next.js, :3000)                             │
│  - admin       (Next.js, :3001)                             │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼ Traefik routes by Host
   http://api-203-0-113-42.sslip.io        → backend
   http://portal-203-0-113-42.sslip.io     → portal
   http://admin-203-0-113-42.sslip.io      → admin
```

**Catatan:**
- `203-0-113-42` = IP VPS Anda, format sslip.io pakai dash (`-`) bukan dot (`.`)
- Tidak ada HTTPS di mode demo. Browser akses `http://` (bukan `https://`). Untuk HTTPS di demo, aktifkan **Generate SSL** di Dokploy domain settings (Let's Encrypt gratis untuk sslip.io).
- Single environment = demo. Tidak ada staging/prod separation.

---

## 2. Prasyarat

### 2.1 VPS
- Ubuntu 22.04 LTS atau 24.04 LTS
- Minimal: 1 vCPU, 2 GB RAM, 20 GB SSD
- IP publik statis (catat!)
- Port terbuka: 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (Dokploy panel — tutup setelah setup)
- Akses root atau sudo

### 2.2 Lokal
- Git
- SSH client (`ssh` di Linux/Mac/Git Bash; Windows: pakai Windows Terminal + OpenSSH bawaan)
- Akses GitHub ke repo InsureTrack (`syahaltastari/insuretrack` atau fork Anda)

### 2.3 Akun Layanan (optional untuk demo)
- **Resend** untuk email: `https://resend.com` — untuk demo bisa kosongin API key, email gagal tapi flow lain jalan
- **Cloudflare R2** untuk file upload: optional, default pakai local storage di VPS

---

## 3. Setup Awal (sekali)

### 3.1 Verifikasi stack jalan di lokal dulu

```bash
# Di lokal
cd /path/to/insuretrack
cp .env.example .env  # default value sudah cukup untuk lokal
docker compose up -d --build

# Verifikasi
curl -s http://localhost:8080/health
# → {"service":"insuretrack-backend","status":"ok","version":"0.1.0"}
curl -sI http://localhost:3000/  # → 200 OK

# Stop
docker compose down
```

> Kalau stack tidak jalan di lokal, **fix dulu** sebelum deploy. VPS akan lebih sulit di-debug.

### 3.2 (Optional) Test dengan IP/sslip.io lokal

Kalau Anda mau test dari device lain sebelum ke VPS:

```bash
# Cari IP publik Anda
curl ifconfig.me
# Mis. dapat 36.68.222.45

# Edit .env.local, set:
DOMAIN=36-68-222-45.sslip.io  # dash, bukan dot

# Build ulang
docker compose up -d --build

# Test dari browser/HP lain
# http://portal.36-68-222-45.sslip.io
```

> ⚠️ Ini akan expose local Docker ke internet. Matikan setelah selesai test.

---

## 4. Setup Dokploy (sekali per VPS)

### 4.1 SSH ke VPS & install Dokploy

```bash
# Dari lokal
ssh ubuntu@<IP-VPS>

# Di VPS
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ufw

# Firewall: allow SSH + HTTP/HTTPS + panel Dokploy
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp   # Dokploy panel — akan ditutup setelah setup
sudo ufw enable

# Install Dokploy
curl -sSL https://dokploy.com/install.sh | sudo bash
```

Tunggu 3-5 menit. Setelah selesai, Dokploy panel accessible di `http://<IP-VPS>:3000`.

### 4.2 Buka port di cloud firewall

Penting! `ufw` di VPS sudah allow, tapi cloud provider (Azure/Hetzner/DO) punya firewall sendiri.

**Azure:**
1. Portal Azure → VM → Networking → Inbound port rules → Add
2. HTTP: TCP 80, Allow, priority 100
3. HTTPS: TCP 443, Allow, priority 110

**Hetzner / DO / Oracle:** biasanya default sudah open. Cek lewat provider dashboard.

Verifikasi dari lokal:
```bash
# PowerShell
Test-NetConnection -ComputerName <IP-VPS> -Port 80
# TcpTestSucceeded: True = port terbuka
```

### 4.3 Setup admin Dokploy + 2FA

1. Browser → `http://<IP-VPS>:3000`
2. Buat akun admin (username + password kuat — simpan di password manager!)
3. **Settings → Security → 2FA (TOTP)** — pakai Google Authenticator / Authy
4. Generate API key: **Settings → Profile → API → Create API Key** → COPY (tidak akan ditampilkan lagi!)

### 4.4 Hardening: tutup port 3000 dari publik

Setelah Dokploy running, akses panel via SSH tunnel supaya tidak exposed ke internet:

```bash
# Tutup port 3000
sudo ufw delete allow 3000/tcp

# Sekarang akses panel via SSH tunnel (jalankan di lokal)
ssh -L 3000:localhost:3000 ubuntu@<IP-VPS>
# Lalu buka browser: http://localhost:3000
```

### 4.5 Buat Project + Compose Service

Di Dokploy panel (`http://<IP-VPS>:3000` via SSH tunnel):

1. **Projects → + Create Project** → nama: `insuretrack-demo`
2. Di dalam project → **+ Create Service** → **Compose**
3. **Source** tab:
   - Provider: **GitHub**
   - Repository: `syahaltastari/insuretrack` (atau fork Anda)
   - Branch: `main`
   - **Docker Compose File Location**: `docker-compose.yml`
   - **Base Directory**: `.` (titik — WAJIB, jangan kosong)
4. Klik **Save** (jangan Deploy dulu — set env dulu!)

### 4.6 Setup Environment Variables

Di service → tab **Environment**:

#### Tab **General** (env biasa — visible di container)

```env
# === Identitas deployment ===
DOMAIN=<IP-VPS-DASH-FORMAT>           # Mis. 203-0-113-42 (ssl prefix dihilangkan)
NEXT_PUBLIC_API_URL=http://api.${DOMAIN}.sslip.io

# === Database ===
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<generate-dengan-openssl>
POSTGRES_DB=insuretrack_demo
DATABASE_URL=postgres://postgres:<sama-dengan-password>@db:5432/insuretrack_demo

# === Auth secrets (generate openssl rand -hex 64/32) ===
JWT_SECRET=<generate>
PAYMENT_WEBHOOK_SECRET=<generate>

# === Public URLs (untuk link di email) ===
APP_BASE_URL=http://portal.${DOMAIN}.sslip.io
MEDIA_BASE_URL=http://api.${DOMAIN}.sslip.io

# === Backend URL (WAJIB — untuk Next.js SSR fetch internal) ===
BACKEND_URL=http://backend:8080

# === Email (kosong = email gagal tapi flow lain tetap jalan) ===
RESEND_API_KEY=
RESEND_FROM_EMAIL=demo@insuretrack.local
RESEND_FROM_NAME=InsureTrack Demo

# === Storage ===
STORAGE_BACKEND=local
UPLOAD_DIR=/var/uploads

# === Misc ===
INQUIRY_AUTO_CLOSE_DAYS=0
RUST_LOG=info,insuretrack_backend=debug
PORT=8080
```

**Generate secrets** (jalankan di lokal atau VPS):
```bash
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 64   # JWT_SECRET
openssl rand -hex 32   # PAYMENT_WEBHOOK_SECRET
```

#### Format `DOMAIN`:
- VPS IP = `203.0.113.42` → `DOMAIN=203-0-113-42` (ganti `.` jadi `-`)
- Traefik hostnames jadi: `api.203-0-113-42.sslip.io`, `portal.203-0-113-42.sslip.io`, dll

#### ⚠️ **WAJIB** set `BACKEND_URL`!

Tanpa `BACKEND_URL=http://backend:8080`:
- Landing page (portal) akan load tanpa data produk/klien/testimoni
- Bug SILENT — tidak ada error di log
- Next.js SSR pakai `NEXT_PUBLIC_API_URL` (public), yang tidak resolve dari dalam container

### 4.7 Setup Domains (HTTP atau HTTPS)

Di service → tab **Domains** → **+ Add Domain** untuk tiap service:

| Domain | Service Port | HTTPS? |
|---|---|---|
| `api.${DOMAIN}.sslip.io` | 8080 | Optional (recommended ON untuk demo profesional) |
| `portal.${DOMAIN}.sslip.io` | 3000 | Optional |
| `admin.${DOMAIN}.sslip.io` | 3001 | Optional |

**Mode Demo HTTPS (recommended):**
- ✅ Centang **Generate SSL** (Let's Encrypt otomatis untuk sslip.io)
- Hostname jadi `https://...` (browser trust SSL)
- Setup 1-2 menit, gratis

**Mode Demo HTTP-only:**
- ❌ Jangan centang Generate SSL
- Browser akan mixed-content warning kalau ada fetch HTTPS

### 4.8 Deploy pertama

Klik **Deploy** di Dokploy panel. Build 3-8 menit.

Pantau di tab **Logs** atau via SSH:
```bash
ssh ubuntu@<IP-VPS>
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs -f insuretrack_backend
```

Verifikasi (lihat §6 untuk detail):
```bash
curl -s https://api.203-0-113-42.sslip.io/health
# → {"service":"insuretrack-backend","status":"ok","version":"0.1.0"}
```

---

## 5. Setup GitHub Secrets (sekali)

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value | Catatan |
|---|---|---|
| `DOKPLOY_URL` | `http://203.0.113.42:3000` | URL panel Dokploy (IP VPS + port 3000) |
| `DOKPLOY_API_KEY` | API key dari §4.3 step 4 | Generate di Dokploy panel |
| `DOKPLOY_COMPOSE_ID` | Compose ID | Copy dari URL service di Dokploy (mis. `/project/insuretrack-demo/services/c-xyz123` → ID = `c-xyz123`) |
| `DEPLOY_HEALTH_URL` | `https://portal.203-0-113-42.sslip.io/api/health` | Wait — ini `/api/health` di frontend, atau backend health? **Pakai backend**: `https://api.203-0-113-42.sslip.io/health` |
| `API_URL` | `https://api.203-0-113-42.sslip.io` | Untuk smoke test |
| `PORTAL_URL` | `https://portal.203-0-113-42.sslip.io` | Untuk smoke test |
| `ADMIN_URL` | `https://admin.203-0-113-42.sslip.io` | Untuk smoke test |

> ⚠️ **Catatan keamanan:** `DOKPLOY_API_KEY` powerful — bisa trigger redeploy + modify service. Treat seperti password. Jangan pernah commit ke repo. Hanya di GitHub Secrets (encrypted at rest).

---

## 6. First Deploy

### 6.1 Test workflow di push pertama

```bash
# Di lokal
git checkout main
git pull
git commit --allow-empty -m "chore: trigger first deploy"
git push origin main
```

### 6.2 Monitor progress

1. GitHub repo → tab **Actions** → pilih workflow **Deploy Demo** → lihat progress
2. Workflow stages: `ci-gate` (tunggu CI pass) → `deploy` (call Dokploy API) → `verify` (health check)

Kalau ada error, lihat detail di tab **Actions**.

### 6.3 Monitor Dokploy

1. SSH tunnel ke panel: `ssh -L 3000:localhost:3000 ubuntu@<IP-VPS>`
2. Browser → `http://localhost:3000` → project `insuretrack-demo` → tab **Logs**

### 6.4 Smoke test dari browser

| URL yang di-test | Expected |
|---|---|
| `https://portal.203-0-113-42.sslip.io/` | Landing page dengan hero + 3 produk |
| `https://portal.203-0-113-42.sslip.io/register` | Form registrasi (3 plan LIFE/PA/HEALTH) |
| `https://admin.203-0-113-42.sslip.io/admin/login` | Login form |
| `https://api.203-0-113-42.sslip.io/api/public/products` | JSON list produk |

### 6.5 Login admin default

```
Username: admin
Password: admin123
```

⚠️ Ganti setelah login pertama! `POST /api/admin/me/password` atau via UI.

---

## 7. Daily Workflow

### 7.1 Push perubahan → auto-deploy

```bash
# Bekerja seperti biasa
git checkout -b feature/some-fix
# ... edit code ...
git add .
git commit -m "fix: customer login validation"
git push origin feature/some-fix

# Buat PR di GitHub → review → merge ke main
# Atau langsung push ke main (kalau Anda solo dev / demo)
git checkout main
git merge feature/some-fix
git push origin main

# → GitHub Actions otomatis:
#   1. Run CI (cargo test, vitest, playwright)
#   2. Kalau pass → trigger Dokploy redeploy
#   3. Health check post-deploy
```

### 7.2 Lihat status deployment

- **GitHub Actions:** repo → Actions tab → klik run terakhir
- **Dokploy panel:** SSH tunnel → `http://localhost:3000` → Logs tab
- **Direct SSH:** `docker logs -f insuretrack_backend`

### 7.3 Manual redeploy (kalau auto gagal)

```bash
# Opsi A: trigger ulang dari GitHub Actions UI
#   Repo → Actions → Deploy Demo → Run workflow → pilih main → Run

# Opsi B: trigger dari Dokploy UI
#   SSH tunnel → panel → service → klik Redeploy

# Opsi C: SSH manual
ssh ubuntu@<IP-VPS>
cd /etc/dokploy/applications/<service-name>/code
git pull
docker compose build
docker compose up -d
```

---

## 8. Rollback

### 8.1 Rollback ke commit sebelumnya (Dokploy)

1. SSH tunnel → Dokploy panel → service → tab **Deployments**
2. Pilih deployment sebelumnya yang working → klik **Redeploy**
3. Selesai — container di-recreate dengan commit lama

### 8.2 Rollback DB schema (jika migration baru bermasalah)

⚠️ **Destructive** — hanya untuk demo, jangan di production tanpa backup.

```bash
ssh ubuntu@<IP-VPS>
cd /etc/dokploy/applications/<service-name>/code

# 1. Stop backend (biar tidak apply migration lebih lanjut)
docker compose stop backend

# 2. Backup DB saat ini
docker compose exec db pg_dump -U postgres insuretrack_demo > backup-before-rollback.sql

# 3. Drop + recreate DB
docker compose exec db psql -U postgres -c "DROP DATABASE insuretrack_demo;"
docker compose exec db psql -U postgres -c "CREATE DATABASE insuretrack_demo;"

# 4. Restore dari backup
cat backup-before-rollback.sql | docker compose exec -T db psql -U postgres insuretrack_demo

# 5. Restart backend (akan apply migration sampai versi saat backup)
docker compose up -d backend
```

### 8.3 Nuclear option: full reset

```bash
ssh ubuntu@<IP-VPS>
cd /etc/dokploy/applications/<service-name>/code
docker compose down -v   # HAPUS semua data (volume pgdata + uploads)
docker compose up -d --build
# DB fresh, migrations re-applied dari awal
```

---

## 9. Limitations & Kapan Upgrade

Mode demo punya batasan yang tidak masalah untuk sekarang tapi akan penting nanti:

| Aspek | Demo | Kapan harus berubah |
|---|---|---|
| **HTTPS** | Optional via sslip.io | Wajib untuk payment processing |
| **Backup** | Tidak ada | Saat ada data yang sayang hilang |
| **Rate limiting** | Tidak ada | Saat traffic real dari publik |
| **Monitoring** | Tidak ada | Saat Anda perlu tahu kalau ada error di production |
| **Multiple admins** | 1 user (`admin/admin123`) | Saat ada tim |
| **Real Resend account** | Dikosongkan | Saat stakeholder minta demo email terkirim |
| **Real domain** | sslip.io | Saat branding butuh credibility |
| **CI/CD** | Auto-deploy on push ke main | Saat Anda perlu approval flow / staging branch |

Masing-masing butuh effort 1-4 jam, well-documented di [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## Referensi Cepat

| Topik | File |
|---|---|
| Production-grade deployment | [`DEPLOYMENT.md`](./DEPLOYMENT.md) |
| Dokploy + HTTP-only deep dive | [`RUNBOOK_VPS_DEV.md`](./RUNBOOK_VPS_DEV.md) |
| Docker troubleshooting | [`DOCKER_SETUP.md`](./DOCKER_SETUP.md) |
| Cloudflare R2 storage | [`R2_SETUP.md`](./R2_SETUP.md) |
| Application spec | `Technical Specification Document Digital Insurance v1.2.pdf` |
| OpenAPI | [`openapi.yaml`](./openapi.yaml) |
| Dokploy docs | https://docs.dokploy.com |
| Traefik docs | https://doc.traefik.io/traefik/ |

---

**Maintainer:** tim InsureTrack · **Update terakhir:** 2026-06-18
