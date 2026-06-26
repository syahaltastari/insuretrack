# InsureTrack — Deployment Guide

**Tanggal:** 2026-06-10
**Status:** 📘 Guide — arsitektur tunggal, dua strategi biaya, satu cara jalan.

Dokumen ini menjelaskan cara deploy InsureTrack ke production. Arsitekturnya **sama** untuk semua strategi biaya — yang beda hanya di mana masing-masing komponen di-host. Bagian [§3](#3-strategi-biaya) membahas dua pilihan (full free tier vs VPS+Dokploy) dan bab [§5](#5-deploy-guide--dokploy) memberikan langkah end-to-end untuk skenario yang **paling umum** di tim kecil: **Dokploy di VPS**.

> **Untuk konteks**: `apps/backend` (Rust + Axum) handle issuance pipeline sesuai spec FS-01..FS-20. `apps/portal` & `apps/admin` (Next.js 15) adalah customer surface dan backoffice. Semua komunikasi service-to-service via **Docker internal network** (service name), bukan hostname publik. Browser → Traefik → service adalah satu-satunya jalur publik.

---

## Daftar Isi

1. [Overview](#1-overview)
2. [Arsitektur](#2-arsitektur)
3. [Strategi biaya](#3-strategi-biaya)
4. [Domain & DNS](#4-domain--dns)
5. [Deploy Guide — Dokploy](#5-deploy-guide--dokploy)
6. [Konfigurasi](#6-konfigurasi)
7. [Operations — Runbook](#7-operations--runbook)
8. [Backup & Disaster Recovery](#8-backup--disaster-recovery)
9. [Security](#9-security)
10. [Observability](#10-observability)
11. [Troubleshooting](#11-troubleshooting)
12. [Scripts reference](#12-scripts-reference)
13. [Appendices](#13-appendices)

---

## 1. Overview

InsureTrack adalah platform asuransi digital end-to-end dengan pipeline: **registrasi → invoice → payment webhook → e-policy PDF → portal activation**. Stack: Postgres 15, Rust + Axum (backend), Next.js 15 (portal & admin). Deploy unit: **satu Docker Compose stack** berisi 5 service (`db`, `db-backup`, `backend`, `portal`, `admin`) di belakang Traefik reverse-proxy.

Tiga prinsip yang membentuk arsitektur:

- **Internal ≠ public.** Service komunikasi pakai service name (`db`, `backend`) di dalam Docker network. Public hanya untuk apa yang diakses browser (`portal.${DOMAIN}`, `admin.${DOMAIN}`, `api.${DOMAIN}`). Traefik adalah satu-satunya ingress publik.
- **Satu compose, banyak instance.** Setiap app service jalan **2 instance** (configurable) untuk HA + zero-downtime deploy. Traefik load-balance + auto-failover.
- **Backup harian otomatis + retention 1 tahun.** `db-backup` service jalan tiap hari, simpan ke host dir + opsional rclone ke Azure Blob. Restore procedure ada di [§8.2](#82-restore-procedure).

Target pembaca: developer yang sudah familiar dengan Docker & Linux dasar. Tidak butuh pengalaman Kubernetes atau cloud platform spesifik.

---

## 2. Arsitektur

### 2.1 Komponen

```
┌──────────────────────────────────────────────────────────────────┐
│  Internet (browser user)                                          │
└──────────────────────────────────────────────────────────────────┘
                              │ HTTPS (443)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Traefik (reverse proxy, di Dokploy host)                         │
│  - Let's Encrypt auto-issue cert                                  │
│  - Route by Host header:                                          │
│      portal.${DOMAIN}   → portal:3000                            │
│      admin.${DOMAIN}    → admin:3001                             │
│      api.${DOMAIN}      → backend:8080                           │
└──────────────────────────────────────────────────────────────────┘
                              │ (Docker network "insuretrack")
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  App services (1 compose stack)                                   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ portal (×2)  │  │ admin (×2)   │  │ backend (×2) │            │
│  │ Next.js 15   │  │ Next.js 15   │  │ Rust + Axum  │            │
│  │ port 3000    │  │ port 3001    │  │ port 8080    │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│         │                  │                  │                   │
│         └──────── SSR fetch: http://backend:8080/api ───────┘    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐                              │
│  │ db           │  │ db-backup    │                              │
│  │ postgres:15  │  │ daily cron   │                              │
│  │ port 5432    │  │ → ./backups/ │                              │
│  └──────────────┘  └──────────────┘                              │
│         ▲                  │                                      │
│         │ postgres://db:5432                                     │
│         └────────────────┘                                      │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Persistent volumes (Docker named volumes + bind mounts)          │
│    pgdata            — Postgres data (NEVER delete!)             │
│    backend_uploads   — KTP, claim docs, e-policy PDF              │
│    ./backups/        — local backup output (gitignored)          │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (opsional, offsite)
┌──────────────────────────────────────────────────────────────────┐
│  Azure Blob Storage / S3 — rclone target (BACKUP_OFFSITE_TARGET) │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Network model — internal vs public

| Arah komunikasi | Mekanisme | Contoh |
|---|---|---|
| Browser → Portal | HTTPS via Traefik | `https://portal.insuretrack.id/` |
| Browser → API | HTTPS via Traefik | `https://api.insuretrack.id/api/public/products` |
| Portal (SSR) → Backend | Internal Docker DNS, port 8080 | `http://backend:8080` (dari container portal) |
| Backend → DB | Internal Docker DNS, port 5432 | `postgres://db:5432/...` (dari container backend) |
| Backend → Portal (email link) | URL public di-bake | `https://portal.insuretrack.id/set-password?token=...` |
| External (payment gateway) → Backend | HTTPS via Traefik | `POST https://api.insuretrack.id/api/public/payment/webhook` |

**Tidak ada** port yang di-publish ke host kecuali `db` untuk local dev (di-bind ke `127.0.0.1` saja, tidak public). Untuk Dokploy production, bahkan `db` pun tidak punya port mapping — backend akses via service name di Docker network internal.

### 2.3 Zero-downtime deploy — cara kerjanya

Saat `scripts/deploy.sh portal` (atau Dokploy auto-redeploy via webhook):

1. **Build** image baru dengan code terbaru. Image lama tetap running.
2. **Scale up** dari 2 → 3 instance. Instance ke-3 start dengan image baru.
3. **Health check** tunggu instance ke-3 jawab `200` di `/health` (atau root untuk Next.js).
4. **Scale down** kembali ke 2. Compose drop instance **terlama** (image lama).
5. Total blip ke user: **0 detik** selama phase 3, karena Traefik otomatis skip instance yang unhealthy dan route ke yang sehat.

Pattern ini diotomasi di `scripts/deploy.sh` (lihat [§12](#12-scripts-reference)).

---

## 3. Strategi biaya

Arsitektur sama untuk semua strategi. Yang beda: **di mana setiap komponen di-host**. Pilih satu yang match budget + kontrol yang Anda mau.

### 3.1 Opsi 1 — Full Free (managed services)

Stack: Vercel (portal+admin) · Render (backend) · Neon (Postgres) · Cloudflare R2 (storage) · Resend (email)

| Service | Free tier limit | Trade-off |
|---|---|---|
| **Vercel** (portal, admin) | 100 GB bandwidth/bulan, 100 GB-hr function | Next.js zero-config deploy, edge cache |
| **Render** (backend) | 512 MB RAM, cold start 30-60 detik | Free instance sleep setelah 15 menit inaktif — perlu keep-alive cron |
| **Neon** (Postgres) | 0.5 GB storage, auto-pause setelah 7 hari inactive | Cold start ~1-2 detik saat wake |
| **Cloudflare R2** (KTP, PDF) | 10 GB storage, 1M reads/bulan | Egress gratis (vs S3 yang charge) |
| **Resend** (email) | 100 email/hari | 1 domain verify |

**Total: $0/bulan** (syarat: punya kartu kredit untuk verifikasi R2, tidak di-charge).

Cocok untuk: demo, portfolio, side project, low-traffic production.

Tidak cocok untuk: data sensitif (NIK/PII) yang perlu kontrol lokasi server, atau traffic >10k page-view/bulan.

Setup detail: lihat commit history atau [dokumentasi Opsi 1 versi lama](https://github.com/syahaltastari/insuretrack/blob/9a4905f/document/DEPLOYMENT.md) — fokus dokumen ini selanjutnya adalah Opsi 2.

### 3.2 Opsi 2 — Self-hosted (VPS + Dokploy)

Stack: Azure VM (atau Hetzner / DO / Contabo / Oracle Cloud Free Tier) · Dokploy (PaaS UI) · Traefik (built-in) · Postgres (di dalam Dokploy) · Cloudflare R2 + Resend (managed)

| VPS | Specs | Biaya | Catatan |
|---|---|---|---|
| **Azure B1ms** (recommended) | 2 vCPU, 2 GB RAM, 30 GB SSD | ~$15-19/bulan | Azure for Students: $100 credit (~5-6 bulan) |
| Azure B2s | 2 vCPU, 4 GB RAM, 30 GB SSD | ~$30/bulan | Untuk +replicas + Phase 2 observability |
| Hetzner CX22 | 2 vCPU, 4 GB RAM, 40 GB SSD | €4.5/bulan (~$5) | Best value, datacenter di EU |
| Oracle Cloud Free Tier | 1 vCPU, 1 GB RAM (selamanya) | $0 | Selalu-free ARM instance, signup agresif |
| DO Basic | 1 vCPU, 1 GB RAM, 25 GB SSD | $6/bulan | Reliable, banyak region |
| Contabo VPS S | 4 vCPU, 8 GB RAM, 50 GB SSD | €5.99/bulan (~$6.5) | Banyak RAM, harga agresif |

**Total: $5-19/bulan** (atau $0 pakai Oracle free tier).

Cocok untuk: production ringan-menengah, kontrol penuh, compliance-friendly (data di server sendiri), latihan DevOps.

Setup detail: lihat [§5](#5-deploy-guide--dokploy) untuk langkah end-to-end.

### 3.3 Rekomendasi

| Skenario | Pilih |
|---|---|
| Demo untuk client / tugas akhir | Opsi 1 (cepat jalan, $0) |
| Side project, traffic <1000/bulan | Opsi 1 |
| Produksi dengan data PII (NIK, KTP) | **Opsi 2** (kontrol server) |
| Latihan DevOps / Kube experience | Opsi 2 (Compose + Traefik sudah banyak pattern Kube) |
| Budget <$5/bulan | Opsi 2 (Hetzner) atau Oracle free tier |
| Audit compliance (OJK, bank partner) | Opsi 2 dengan single-tenant VPS + backup offsite |

---

## 4. Domain & DNS

### 4.1 Real domain (production)

Beli domain (mis. `insuretrack.id` dari IDwebhost ~Rp 150rb/tahun), pointing A record:

| Subdomain | Type | Value |
|---|---|---|
| `api.insuretrack.id` | A | `<IP-VPS>` |
| `portal.insuretrack.id` | A | `<IP-VPS>` |
| `admin.insuretrack.id` | A | `<IP-VPS>` |
| (opsional) `*.insuretrack.id` | A | `<IP-VPS>` (catch-all) |

Set `DOMAIN=insuretrack.id` di `.env` — Traefik akan auto-issue Let's Encrypt cert.

**Wildcard LE cert** (`*.insuretrack.id`) butuh DNS-01 challenge (Cloudflare / Hetzner DNS API). Single cert per subdomain (default Traefik) lebih simpel — pakai pendekatan A record per subdomain di atas.

### 4.2 sslip.io (dev / demo, no real domain)

Format: `<anything>-<ip-dengan-dash>.<DOMAIN>.sslip.io` resolve ke `<ip>`. Contoh untuk VPS IP `20.189.121.230`:

```
DOMAIN=20-189-121-230.sslip.io
# → api.20-189-121-230.sslip.io    resolve ke 20.189.121.230
# → portal.20-189-121-230.sslip.io resolve ke 20.189.121.230
# → admin.20-189-121-230.sslip.io  resolve ke 20.189.121.230
```

Bagus untuk: cek deploy cepat, demo ke tim, development tanpa beli domain.

**Trade-off penting**: Let's Encrypt **gagal** issue cert untuk `*.sslip.io` (LE butuh kontrol DNS). Traefik fallback ke self-signed cert → browser tampilkan warning `NET::ERR_CERT_AUTHORITY_INVALID`.

Workaround dev-only:
- Klik **Advanced → Proceed to ... (unsafe)** di Chrome
- Pakai `curl -k` dari terminal (skip cert check)
- Tambah `traefik.http.routers.<svc>.tls=false` di label compose (HTTP-only, no encryption)

### 4.3 Traefik + Let's Encrypt behavior

Traefik auto-issue cert LE untuk setiap `Host()` rule yang match. Cert di-renew otomatis 30 hari sebelum expiry. Kalau renewal gagal (rate limit, DNS issue), Traefik log error tapi tidak stop service — page dilayani dengan cert lama (atau self-signed fallback).

Cek cert:
```bash
# Dari VPS
docker logs dokploy-traefik 2>&1 | grep -E "(certificate|ACME)" | tail -20

# Atau dari browser, klik padlock icon → certificate info
```

### 4.4 DNS records table

Untuk production dengan real domain, contoh record lengkap:

| Host | Type | TTL | Value | Purpose |
|---|---|---|---|---|
| `insuretrack.id` | A | 300 | `<IP-VPS>` | (opsional) redirect ke www atau portal |
| `api.insuretrack.id` | A | 300 | `<IP-VPS>` | Backend API |
| `portal.insuretrack.id` | A | 300 | `<IP-VPS>` | Customer portal |
| `admin.insuretrack.id` | A | 300 | `<IP-VPS>` | Admin backoffice |
| (opsional) `status.insuretrack.id` | A | 300 | `<IP-VPS>` | Uptime monitoring (Phase 2) |

Tambahkan CAA record untuk limit siapa yang boleh issue cert:
```
insuretrack.id.  IN  CAA  0 issue "letsencrypt.org"
```

---

## 5. Deploy Guide — Dokploy

Dokploy adalah self-hosted PaaS (Heroku-like) dengan UI web. Install di VPS, point ke repo GitHub, push → auto deploy.

### 5.1 Provision VPS

**Azure** (recommended untuk Mahasiswa):

1. https://portal.azure.com → **Create a virtual machine**
2. Image: **Ubuntu Server 22.04 LTS** (atau 24.04 LTS)
3. Size: **B1ms** (2 vCPU, 2 GB RAM) atau **B2s** (4 GB RAM) — lihat [§3.2](#32-opsi-2--self-hosted-vps--dokploy) untuk sizing
4. Auth: **SSH public key** (recommended) atau password
5. **Disks**: OS disk 30-64 GB Standard SSD
6. **Networking**:
   - Public IP: static (bukan dynamic)
   - NSG: allow SSH (22) inbound — defaultnya sudah open
   - **NANTI** (step 5.3): tambahkan rule untuk HTTP (80) dan HTTPS (443)
7. Review + Create. Tunggu 2-3 menit.
8. Catat **Public IP address** dari output.

**Hetzner / DO / Contabo**: kurang lebih sama, biasanya lebih cepat setup.

### 5.2 Install Dokploy

SSH ke VPS:

```bash
ssh azureuser@<IP-VPS>
```

Update dan install prerequisites:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ufw fail2ban
```

Set up basic firewall (host-level). NSG Azure sudah handle external, UFW host handle internal:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Install Dokploy (official installer):

```bash
curl -sSL https://dokploy.com/install.sh | sudo bash
```

Tunggu 2-5 menit. Setelah selesai, Dokploy panel accessible di `http://<IP-VPS>:3000`.

**Hardening Dokploy panel** (penting! Dokploy panel punya akses Docker root):

1. Buka `http://<IP-VPS>:3000` dari browser lokal
2. Buat admin account (username + password kuat)
3. Settings → Security → aktifkan 2FA (TOTP)
4. (Opsional) Batasi akses panel via SSH tunnel — buka [§10.4](#104-ssh-tunnel-untuk-akses-panel)

### 5.3 NSG / cloud firewall — buka port 80 & 443

**Azure NSG** (penting — UFW host sudah allow 80/443, tapi Azure NSG cloud-level masih block):

1. Azure Portal → cari VM `<nama-vm>` → klik
2. Sidebar kiri → **Networking** → tab **Inbound port rules** → **Add inbound port rule**:

| Setting | HTTP rule | HTTPS rule |
|---|---|---|
| Source | `Any` | `Any` |
| Source port ranges | `*` | `*` |
| Destination | `Any` | `Any` |
| Service | `HTTP` | `HTTPS` |
| Destination port ranges | `80` | `443` |
| Protocol | `TCP` | `TCP` |
| Action | **Allow** | **Allow** |
| Priority | `100` | `110` |
| Name | `allow-http-80` | `allow-https-443` |

3. Save. Propagation ~30 detik.

Verifikasi dari Windows PowerShell lokal:
```powershell
Test-NetConnection -ComputerName <IP-VPS> -Port 80
Test-NetConnection -ComputerName <IP-VPS> -Port 443
# TcpTestSucceeded: True → NSG open
```

### 5.4 Import InsureTrack repo

1. Di Dokploy panel (`http://<IP-VPS>:3000`):
2. **Projects** → buat project baru, mis. **InsureTrack Production**
3. Di project → **Services** → **+ Create Service** → pilih **Application** (sementara)
4. **Source**:
   - Provider: **GitHub**
   - Repository: `syahaltastari/insuretrack` (atau fork)
   - Branch: `main`
   - Build path: kosongkan (default root)

**NANTI** (setelah compose ready) — convert ke **Compose** mode. Lanjut dulu setup.

### 5.5 Setup database

1. Di Dokploy project → **Database** → **+ Create Database**
2. Type: **PostgreSQL** (Dokploy punya template)
3. Name: `insuretrack-db`
4. Database name, user, password — **generate yang kuat**:
   ```bash
   openssl rand -hex 24
   ```
5. Save. Catat connection string: `postgres://<user>:<password>@<dokploy-host>:5432/<dbname>`

**Catatan**: untuk hardened stack (yang kita pakai), kita **tidak** pakai Dokploy DB — kita bikin DB sebagai service di compose stack (lihat [§5.6](#56-import-compose-file)). Alasannya: service yang sama di network yang sama dengan backend = `db:5432` langsung resolve. Skip Dokploy DB.

### 5.6 Import compose file

1. **Services** → **+ Create Service** → **Compose**
2. **Source**:
   - Provider: **GitHub**
   - Repository: `syahaltastari/insuretrack`
   - Branch: `main`
   - **Docker Compose File Location**: `docker-compose.yml` (default)
3. **Base Directory**: `.` (titik, root) — **PENTING**, kalau kosong Dokploy treat Dockerfile parent dir sebagai context
4. **Save** → trigger **Deploy**

Dokploy akan:
- Clone repo
- Build semua 5 service image
- Apply Traefik labels
- Start containers

### 5.7 Configure env vars (Dokploy Secrets + Environment)

Ada 2 kategori: **Secrets** (tidak boleh kelihatan di runtime logs / `docker inspect`) dan **Environment** (aman di-bake ke image runtime). Dokploy UI pisahkan jadi 2 tab.

#### Step 1 — Generate .env dengan script

Jalankan `scripts/generate-env.sh` (bisa di lokal Windows via Git Bash / WSL, atau di VPS):

```bash
# Production: real domain
scripts/generate-env.sh --domain=insuretrack.id --from-email=noreply@insuretrack.id

# Dev/demo: sslip.io
scripts/generate-env.sh --slip=20.189.121.230 --from-email=noreply@example.com

# Simpan langsung ke .env file (untuk Dokploy "Import .env" atau local dev)
scripts/generate-env.sh --domain=insuretrack.id > .env
```

Output: lengkap `.env` dengan secret yang sudah di-generate (`POSTGRES_PASSWORD`, `JWT_SECRET`, `PAYMENT_WEBHOOK_SECRET`). `RESEND_API_KEY` masih placeholder — isi manual dari [dashboard Resend](https://resend.com/api-keys).

#### Step 2 — Copy ke Dokploy **Secrets** tab

Di service Compose → tab **Environment** → section **Secrets** (bukan "Environment"):

```env
POSTGRES_USER=insurance_admin
POSTGRES_PASSWORD=<tempel dari output generate-env.sh>
POSTGRES_DB=digital_insurance
DATABASE_URL=postgres://insurance_admin:<sama dengan POSTGRES_PASSWORD>@db:5432/digital_insurance
JWT_SECRET=<tempel dari output generate-env.sh>
PAYMENT_WEBHOOK_SECRET=<tempel dari output generate-env.sh>
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@insuretrack.id
APP_BASE_URL=https://portal.insuretrack.id
MEDIA_BASE_URL=https://api.insuretrack.id
DOMAIN=insuretrack.id
REPLICAS=2
RUST_LOG=info,insuretrack_backend=debug
```

> Replace `<tempel dari output generate-env.sh>` dengan nilai dari script output.
> `RESEND_API_KEY` ambil dari https://resend.com/api-keys (format: `re_...`).
> `DOMAIN` = base domain saja (tanpa `api.` / `portal.` prefix).

#### Step 3 — Copy ke Dokploy **Environment** tab (non-secret)

Tab **Environment** (aman di-expose, di-bake ke Next.js client bundle):

```env
NEXT_PUBLIC_API_URL=https://api.insuretrack.id
```

`NEXT_PUBLIC_*` di-bake ke client JS saat build, browser bisa baca — tapi tidak masalah karena URL API memang publik. Yang **rahasia** (JWT_SECRET, password, API key private) selalu di tab Secrets.

#### Reference table (untuk cek ulang)

| Var | Kategori | Sumber / cara dapat |
|---|---|---|
| `POSTGRES_USER` | Secret | Manual: `insurance_admin` |
| `POSTGRES_PASSWORD` | Secret | `openssl rand -hex 24` (auto via script) |
| `POSTGRES_DB` | Secret | Manual: `digital_insurance` |
| `DATABASE_URL` | Secret | Auto-generate dari `POSTGRES_*` |
| `JWT_SECRET` | Secret | `openssl rand -hex 64` (auto via script) |
| `PAYMENT_WEBHOOK_SECRET` | Secret | `openssl rand -hex 32` (auto via script) |
| `RESEND_API_KEY` | Secret | https://resend.com/api-keys |
| `RESEND_FROM_EMAIL` | Secret | Domain yang sudah verify di Resend |
| `APP_BASE_URL` | Secret | `https://portal.${DOMAIN}` (auto-derive) |
| `MEDIA_BASE_URL` | Secret | `https://api.${DOMAIN}` (auto-derive) |
| `DOMAIN` | Secret | Real domain atau sslip.io form |
| `REPLICAS` | Secret | `2` (production), `1` (dev) |
| `RUST_LOG` | Secret | `info,insuretrack_backend=debug` |
| `NEXT_PUBLIC_API_URL` | Environment | `https://api.${DOMAIN}` |
| `ADMIN_SESSION_COOKIE_NAME` | Environment | Default `insuretrack_admin_session` (jarang di-override) |
| `ADMIN_CSRF_COOKIE_NAME` | Environment | Default `insuretrack_admin_csrf` (jarang di-override) |
| `CUSTOMER_SESSION_COOKIE_NAME` | Environment | Default `insuretrack_customer_session` (jarang di-override) |
| `CUSTOMER_CSRF_COOKIE_NAME` | Environment | Default `insuretrack_customer_csrf` (jarang di-override) |
| `COOKIE_DOMAIN` | Environment | Parent domain untuk cookie share di subdomain. Production: `.${DOMAIN}` (mis. `.insuretrack.id`). Dev: kosongkan (host-only). |
| `COOKIE_SECURE` | Environment | `true` di HTTPS prod, `false` di localhost HTTP dev. |
| `CORS_ALLOWED_ORIGINS` | Environment | Comma-separated FE origins. Prod: `https://portal.${DOMAIN},https://admin.${DOMAIN}`. Dev: kosong = fallback `http://localhost:3000,http://localhost:3001`. |

#### Manual fallback (tanpa script)

Kalau tidak bisa jalankan script (mis. Windows tanpa WSL / Git Bash), generate secret satu per satu:

```bash
# Generate satu per satu (jalankan di Git Bash / WSL / Mac / Linux)
openssl rand -hex 24    # → POSTGRES_PASSWORD (48 char hex)
openssl rand -hex 64    # → JWT_SECRET (128 char hex)
openssl rand -hex 32    # → PAYMENT_WEBHOOK_SECRET (64 char hex)
```

Copy output ke clipboard, paste manual di Dokploy Secrets tab.

### 5.8 Configure domains

Di service Compose → tab **Domains**:

| Domain | Service | HTTPS |
|---|---|---|
| `api.${DOMAIN}` | backend | ✅ Enable |
| `portal.${DOMAIN}` | portal | ✅ Enable |
| `admin.${DOMAIN}` | admin | ✅ Enable |

Centang **Generate SSL** (LE) untuk setiap. Traefik akan issue cert saat request pertama masuk.

**Untuk sslip.io**: Generate SSL akan GAGAL. Pilihan:
- (a) Centang "Force HTTPS" tapi uncheck "Generate SSL" → cert self-signed, browser warning
- (b) Untuk test internal pakai `curl -k` dari VPS

### 5.9 Verify & smoke test

Dari VPS, cek container:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
# Harus ada: insuretrack_db, insuretrack_db_backup, backend (×2), portal (×2), admin (×2)

docker compose ps
# Semua harus (healthy) kecuali db-backup
```

Cek health endpoints:

```bash
# Dari dalam VPS
curl -s http://localhost:8080/health
# {"status":"ok","service":"insuretrack-backend","version":"0.1.0"}

# Test Traefik routing (dari lokal)
curl -k -H "Host: portal.${DOMAIN}" https://<IP-VPS>/
# Should return HTML
```

Dari browser lokal:
- `https://portal.${DOMAIN}/` (atau `http://portal.${DOMAIN}` untuk sslip.io)
- `https://admin.${DOMAIN}/admin/login`
- `https://api.${DOMAIN}/api/public/products` (should return JSON)

Cek logs untuk error:
```bash
docker compose logs --tail 50 backend
docker compose logs --tail 50 portal | grep -i error
```

### 5.10 Update workflow

Setelah deploy pertama, ada 2 cara update:

**A. Auto-deploy via GitHub webhook**:

1. Di service Dokploy → tab **Webhooks** → copy URL
2. GitHub repo → Settings → Webhooks → Add webhook
3. Paste URL, content-type JSON, event: "Just the push event"
4. Sekarang setiap `git push` ke branch yang di-monitor → auto rebuild + redeploy

**B. Manual via Dokploy UI**:

1. Push code ke GitHub seperti biasa
2. Di Dokploy panel → service → klik **Redeploy**
3. Image di-rebuild, container di-recreate

**C. Manual via SSH** (kalau tidak pakai webhook, atau untuk testing):

```bash
ssh azureuser@<IP-VPS>
cd /etc/dokploy/applications/<service-name>/code
git pull
docker compose build backend   # atau portal/admin
docker compose up -d --no-deps backend
```

Atau pakai `scripts/deploy.sh` di VPS (lihat [§12](#12-scripts-reference)).

---

## 6. Konfigurasi

### 6.1 Environment variables

Lokasi: `.env` di root repo (untuk local dev) atau tab **Secrets** di Dokploy UI (untuk production).

| Var | Required | Default | Purpose |
|---|---|---|---|
| `DOMAIN` | ✅ | `insuretrack.example.com` | Base domain, dipakai Traefik labels |
| `POSTGRES_USER` | ✅ | `insurance_admin` | DB user |
| `POSTGRES_PASSWORD` | ✅ | `insurance_password` | DB password — **WAJIB ganti prod** |
| `POSTGRES_DB` | ✅ | `digital_insurance` | DB name |
| `DATABASE_URL` | ✅ | `postgres://...@db:5432/...` | Backend → DB connection string |
| `JWT_SECRET` | ✅ | dev placeholder | **WAJIB ganti prod**, min 32 char |
| `PAYMENT_WEBHOOK_SECRET` | ✅ | dev placeholder | **WAJIB ganti prod** |
| `RESEND_API_KEY` | ✅ | placeholder | Resend API key |
| `RESEND_FROM_EMAIL` | ✅ | `noreply@insuretrack.example` | From address (domain harus verified di Resend) |
| `APP_BASE_URL` | ✅ | `https://portal.${DOMAIN}` | Untuk link di email |
| `MEDIA_BASE_URL` | ✅ | `https://api.${DOMAIN}` | Untuk serve uploaded files |
| `NEXT_PUBLIC_API_URL` | ✅ | `https://api.${DOMAIN}` | Di-bake ke Next.js client bundle |
| `REPLICAS` | ❌ | `2` | Jumlah instance per app service |
| `STORAGE_BACKEND` | ❌ | `local` | `local` atau `r2` |
| `R2_*` | Kalau `STORAGE_BACKEND=r2` | — | Cloudflare R2 credentials (lihat `document/deployment/R2_SETUP.md`) |
| `INQUIRY_AUTO_CLOSE_DAYS` | ❌ | `7` | Auto-close inquiry setelah N hari tanpa balasan |
| `BACKUP_CRON_SCHEDULE` | ❌ | `@daily` | Cron schedule db-backup |
| `BACKUP_KEEP_DAYS` | ❌ | `7` | Retensi harian |
| `BACKUP_KEEP_WEEKS` | ❌ | `4` | Retensi mingguan |
| `BACKUP_KEEP_MONTHS` | ❌ | `6` | Retensi bulanan |
| `BACKUP_KEEP_YEARS` | ❌ | `1` | Retensi tahunan (compliance UU PDP) |
| `BACKUP_OFFSITE_TARGET` | ❌ | kosong | rclone target (mis. `azureblob:bucket/db`) |
| `RUST_LOG` | ❌ | `info,insuretrack_backend=debug` | Backend log level |
| `INQUIRY_AUTO_CLOSE_DAYS` | ❌ | `7` | Auto-close inquiry N hari tanpa balasan |

### 6.2 Traefik routing rules

Setiap app service punya label Traefik yang define routing:

```yaml
# Backend
- "traefik.http.routers.backend.rule=Host(`api.${DOMAIN}`)"
- "traefik.http.routers.backend.entrypoints=websecure"
- "traefik.http.routers.backend.tls.certresolver=letsencrypt"
- "traefik.http.services.backend.loadbalancer.server.port=8080"
- "traefik.http.services.backend.loadbalancer.healthcheck.path=/health"

# Portal
- "traefik.http.routers.portal.rule=Host(`portal.${DOMAIN}`)"
- "traefik.http.routers.portal.entrypoints=websecure"
- "traefik.http.routers.portal.tls.certresolver=letsencrypt"
- "traefik.http.services.portal.loadbalancer.server.port=3000"

# Admin (sama dengan portal, port 3001, host admin.${DOMAIN})
```

Traefik auto-detect semua container dengan label ini di Docker network `insuretrack`. Load-balance ke semua instance (replicas). Health probe setiap 10s — instance unhealthy di-skip dari LB pool.

### 6.3 Resource sizing

Default `deploy.resources` per service:

| Service | CPU limit | Memory limit | Reservation |
|---|---|---|---|
| `db` | unlimited (Postgres) | 1 GB (compose) / unlimited (image) | 256 MB |
| `backend` | 1.0 | 1 GB | 256 MB |
| `portal` | 0.5 | 768 MB | 256 MB |
| `admin` | 0.5 | 768 MB | 256 MB |
| `db-backup` | unlimited | unlimited (cron) | 128 MB |

**Total per replica**: ~3.2 GB. Dengan `REPLICAS=2` (backend+portal+admin) → ~5 GB peak.

Sizing rekomendasi:

| VM | Specs | REPLICAS=1 fit? | REPLICAS=2 fit? |
|---|---|---|---|
| B1ms (2 GB) | 2 vCPU, 2 GB RAM | ✅ (tight) | ❌ |
| B2s (4 GB) | 2 vCPU, 4 GB RAM | ✅ | ✅ (recommended) |
| B2ms (8 GB) | 2 vCPU, 8 GB RAM | ✅ | ✅ (comfortable) |
| Hetzner CX22 (4 GB) | 2 vCPU, 4 GB RAM | ✅ | ✅ |

### 6.4 Backup retention policy

`db-backup` (image: `prodrigestivill/postgres-backup-local`) simpan backup di `./backups/` dengan retensi:

| Jenis | Retensi | File per jenis |
|---|---|---|
| Harian | 7 hari | 7 |
| Mingguan | 4 minggu | 4 |
| Bulanan | 6 bulan | 6 |
| Tahunan | 1 tahun | 1 |
| **Total max** | | **~18 file** |

Untuk compliance UU PDP, JANGAN kurangi `BACKUP_KEEP_YEARS` di bawah 1. Jika perlu offsite backup (recommended untuk production), set `BACKUP_OFFSITE_TARGET` ke rclone remote. Lihat [§8.3](#83-offsite-backup-optional) untuk setup rclone.

---

## 7. Operations — Runbook

### 7.1 Service down (portal/admin/backend)

**Gejala**: Traefik return 502, atau `/health` timeout.

**Diagnosa**:
```bash
ssh azureuser@<IP-VPS>
docker compose ps                                    # cek status semua service
docker compose logs --tail 100 <service>             # cek log
docker compose ps <service> --format json | jq .Health
```

**Akar penyebab umum & fix**:

| Penyebab | Fix |
|---|---|
| OOM (memory habis) | `docker stats` cek memory. Naikkan limit di compose atau kurangi REPLICAS |
| Image lama corrupt | `docker compose pull <service> && docker compose up -d --no-deps <service>` |
| Backend DB connection fail | `docker compose logs backend` — lihat error DB. Restart db dulu, baru backend |
| Config error (.env salah) | Cek tab Secrets Dokploy, fix var, redeploy |

### 7.2 DB down / connection refused

**Gejala**: Backend log penuh dengan `connection refused` ke `db:5432`, `pg_isready` fail.

**Diagnosa**:
```bash
docker compose ps db
docker compose logs --tail 50 db
docker compose exec db pg_isready -U $POSTGRES_USER
```

**Fix cepat**: `docker compose restart db`. Tunggu 30 detik, lalu `docker compose restart backend`.

**Kalau masih fail**: cek disk penuh (lihat [§7.4](#74-disk-full)) atau pgdata corrupt (lihat [§8.2](#82-restore-procedure) untuk restore dari backup).

### 7.3 Backup failed

**Gejala**: `ls ./backups/` tidak ada file baru dalam 2 hari, atau log db-backup ada error.

**Diagnosa**:
```bash
docker compose logs --tail 50 db-backup
ls -la ./backups/
docker compose exec db-backup ls -la /backups/
```

**Fix**:
1. Kalau permission error: `sudo chown -R 1000:1000 ./backups` (match UID app user)
2. Kalau disk penuh: lihat [§7.4](#74-disk-full)
3. Kalau DB tidak reachable: restart db dulu (`docker compose restart db`)
4. Manual trigger: `scripts/backup-now.sh`

### 7.4 Disk full

**Gejala**: Backup gagal, container restart loop, atau `docker compose up` fail dengan "no space left".

**Diagnosa**:
```bash
df -h /                       # disk usage
du -sh /var/lib/docker/       # docker usage
du -sh ./backups/             # backup size
docker system df              # docker image/container/volume size
```

**Fix**:
```bash
# Bersihkan image lama (yang tidak dipakai container manapun)
docker image prune -a --filter "until=72h"

# Bersihkan container stopped + network tak terpakai
docker container prune
docker network prune

# Bersihkan volume tak terpakai (HATI-HATI: cek dulu yang mana)
docker volume ls                # list
docker volume rm <nama-volume>  # hanya yang yakin
```

Kalau `pgdata` penuh: hapus file log Postgres di dalam container, atau restore dari backup lalu vacuum. Untuk jaga-jaga, set up alerting (lihat [§10](#10-observability)).

### 7.5 Memory pressure / OOM

**Gejala**: Container kill + restart, log OOMKilled di `dmesg` atau `journalctl`.

**Diagnosa**:
```bash
docker stats --no-stream
dmesg | grep -i "killed process" | tail -5
```

**Fix cepat**:
1. `docker compose up -d --scale <svc>=1` — kurangi replicas
2. Naikkan memory limit di compose untuk service yang OOM
3. Cek leak di app (long-running query, cache yang tidak bounded)

### 7.6 SSL cert renewal failed

**Gejala**: Browser tampilkan "cert expired" atau "issuer not trusted", padahal Traefik log tidak ada error.

**Diagnosa**:
```bash
docker logs dokploy-traefik 2>&1 | grep -E "(error|ACME|letsencrypt)" | tail -20
```

**Fix umum**:
| Penyebab | Fix |
|---|---|
| Rate limit LE (50 cert/domain/week) | Tunggu atau pindah ke cert alternatif |
| DNS A record berubah/tidak ada | Verify DNS resolve: `dig portal.${DOMAIN}` |
| Port 80 block (LE pakai HTTP-01) | Cek NSG Azure, UFW, dan cloud firewall |
| Domain pakai sslip.io | LE tidak support — pakai cert self-signed atau real domain |
| Traefik `acme.json` corrupt | `docker exec dokploy-traefik rm /acme.json && docker restart dokploy-traefik` |

### 7.7 Traefik 502 (no healthy upstream)

**Gejala**: Browser dapat "502 Bad Gateway" dari Traefik.

**Diagnosa**:
```bash
docker logs dokploy-traefik 2>&1 | tail -30
docker compose ps                              # cek health semua service
docker compose ps <svc> | grep -v "(healthy)"  # cari yang unhealthy
```

**Fix**:
1. Cek service target (portal/admin/backend) healthy atau tidak
2. Kalau unhealthy → restart: `docker compose restart <svc>`
3. Kalau baru deploy dan blm ready: tunggu 30-60 detik, Traefik akan detect healthy otomatis

### 7.8 Dokploy panel unreachable

**Gejala**: Browser tidak bisa akses `http://<IP-VPS>:3000`.

**Diagnosa** (via SSH):
```bash
docker ps | grep dokploy
curl -I http://localhost:3000
```

**Fix**:
1. Kalau container stopped: `docker start dokploy`
2. Kalau error di log: `docker logs dokploy` — fix sesuai error
3. Kalau network issue: cek UFW allow 3000 (biasanya default Dokploy install sudah open)
4. **Darurat**: SSH tunnel untuk akses (lihat [§10.4](#104-ssh-tunnel-untuk-akses-panel))

### 7.9 VM reboot / host failure

**Gejala**: Semua container down setelah VM restart.

**Auto-recovery**: Dokploy auto-start semua container saat host boot (systemd service). Tunggu 2-5 menit, cek `docker ps`.

**Kalau ada container tidak start**:
1. `docker ps -a` — lihat yang exit
2. `docker logs <container>` — fix sesuai error
3. `docker compose up -d <service>` — manual start

**Kalau Postgres corrupt setelah unclean shutdown**:
1. `docker compose stop db`
2. `docker compose start db` — Postgres auto-recovery dari WAL
3. Kalau masih fail: `docker compose exec db pg_isready` — kalau fail, restore dari backup (lihat [§8.2](#82-restore-procedure))

---

## 8. Backup & Disaster Recovery

### 8.1 Backup strategy

`db-backup` service otomatis backup harian. Backup disimpan di `./backups/` di host. Format: `pg_dump` custom (binary, compressed, partial-restore capable).

**Apa yang dibackup**:
- ✅ Full database dump (semua schema, semua row)
- ❌ Bukan `backend_uploads/` (KTP, PDF) — itu di-mount sebagai Docker volume, tidak auto-backup
- ❌ Bukan `pgdata` (internal Postgres) — abstract lewat `pg_dump`

**Lokasi file backup** (default):
```
./backups/
├── daily-2026-06-10T02-30-00.dump      # format: custom (binary)
├── weekly-2026-06-07T02-30-00.dump     # mingguan (lebih lama)
├── monthly-2026-05-01T02-30-00.dump    # bulanan
└── yearly-2025-06-01T02-30-00.dump     # tahunan (1 file)
```

### 8.2 Restore procedure

**Tool**: `scripts/restore-db.sh`

```bash
ssh azureuser@<IP-VPS>
cd /etc/dokploy/applications/<service-name>/code
scripts/restore-db.sh                    # interactive — list backup, pilih
# atau
scripts/restore-db.sh backups/daily-2026-06-09T02-30-00.dump --no-confirm
```

**Apa yang terjadi**:
1. Stop `backend` dan `db-backup` (mencegah write concurrent)
2. Drop & recreate database
3. Restore dari file (decompress kalau perlu, `pg_restore` untuk custom format)
4. Verify (cek table count)
5. Restart `backend`, tunggu healthy

**Waktu restore**: 1-5 menit tergantung ukuran DB.

**Pre-restore checklist**:
- [ ] Backup state sekarang dulu: `scripts/backup-now.sh` (rollback safety)
- [ ] Confirm file backup exists dan size > 0
- [ ] Pilih backup yang **tepat** — cek timestamp

### 8.3 Offsite backup (optional)

Untuk DR-grade, backup ke cloud storage offsite. Setup rclone + Azure Blob (atau S3, GCS, B2).

**Setup sekali**:
```bash
# Install rclone di dalam container db-backup (atau di host)
docker compose exec db-backup sh -c "apk add rclone"  # kalau pakai alpine image
# Atau setup rclone config di host
rclone config  # interactive setup, pilih "Azure Blob Storage", masukkan kredensial
```

**Set env var**:
```bash
# Di .env atau Dokploy Secrets
BACKUP_OFFSITE_TARGET=azureblob:insuretrack-backups/db
```

**Trigger**:
```bash
scripts/backup-now.sh --offsite
# Backup lokal dulu, lalu rclone ke remote
```

**Atau** otomatis via cron: tambahkan ke `db-backup` image. Lihat `prodrigestivill/postgres-backup-local` docs untuk addons.

### 8.4 RTO / RPO targets

| Skenario | RPO (max data loss) | RTO (max downtime) |
|---|---|---|
| Single service down, infra OK | 0 | < 2 menit (auto-restart + health probe) |
| DB corrupt, perlu restore | < 24 jam (backup harian) | 5-10 menit (restore + restart) |
| VM hilang total | < 24 jam (kalau ada offsite) | 30-60 menit (provision VM baru + restore) |
| Region-wide disaster | < 24 jam (offsite) | 1-2 jam |

Untuk turunkan RPO: tambah frekuensi backup (`BACKUP_CRON_SCHEDULE=@hourly`).

### 8.5 DR test schedule

Wajib test restore **minimal 1x per quarter** untuk pastikan backup benar-benar bisa di-restore. Schedule di calendar:

```bash
# Q1 test restore
scripts/restore-db.sh backups/yearly-2025-06-01T02-30-00.dump
# Verifikasi data representative ada
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
    SELECT count(*) FROM customers;
    SELECT count(*) FROM policies;
    SELECT count(*) FROM claims;
"
```

Kalau ada baris yang hilang atau error: fix prosedur backup SEBELUM bencana beneran.

---

## 9. Security

### 9.1 Network model

**Public ingress**: hanya Traefik di port 80/443. Tidak ada service lain yang di-publish ke host.

**Internal network**: Docker network `insuretrack` (bridge). Service communicate via service name. Tidak ada internet egress default (kecuali db-backup untuk rclone opsional).

**NSG / cloud firewall**: hanya allow 22 (SSH), 80 (HTTP), 443 (HTTPS) dari internet. Port lain tertutup.

**Verifikasi**:
```bash
# Dari internet, port mana yang reachable?
nmap -Pn <IP-VPS>
# Should show: 22, 80, 443 open. 5432, 3000, 8080, 3001 closed.

# Cek internal: port mapping Docker
docker compose ps
# db, backend, portal, admin TIDAK boleh ada published port (kecuali 5432 ke 127.0.0.1)
```

### 9.2 Secret management

**Production**: pakai Dokploy tab **Secrets**, JANGAN tulis di `.env` file. Dokploy simpan encrypted di SQLite database, decrypt saat inject ke container runtime.

**Local dev**: `.env` di root, `chmod 600 .env` (owner-only read), tambahkan ke `.gitignore` (sudah default).

**Generate secret**:
```bash
openssl rand -hex 64    # JWT_SECRET (128 char hex)
openssl rand -hex 32    # PAYMENT_WEBHOOK_SECRET (64 char hex)
openssl rand -hex 24    # POSTGRES_PASSWORD (48 char hex)
```

**Rotasi**: setiap 6-12 bulan untuk production, atau segera jika ada indikasi compromise.

**JANGAN**:
- Commit `.env` ke git
- Log secret ke stdout / journal
- Pakai default secret di production (`dev_*_change_me`)
- Share `.env` lewat Slack/email (pakai password manager)

### 9.3 Container hardening

Setiap service di-compose punya:

- `init: true` — PID 1 init untuk reap zombie
- `security_opt: no-new-privileges:true` — tidak bisa escalate privilege
- `cap_drop: [ALL]` + `cap_add` minimal (Postgres butuh CHOWN/SETUID/SETGID/DAC_OVERRIDE)
- `read_only: true` untuk `db` — filesystem immutable, pakai tmpfs untuk runtime dirs
- Non-root user (`app` uid 1000 untuk backend, `nextjs` uid 1001-1002 untuk frontend)
- Resource limits (CPU + memory) — OOM container di-restart, bukan bunuh VM

**Verifikasi**:
```bash
# Cek container jalan sebagai non-root
docker exec backend id
# Output: uid=1000(app) gid=1000(app) groups=1000(app)

# Cek capabilities dropped
docker exec backend cat /proc/1/status | grep Cap
# CapInh/CapPrm/CapEff: 00000000 (no caps)

# Cek no-new-privileges
docker inspect backend | grep NoNewPrivileges
# "NoNewPrivileges": true
```

### 9.4 Database access

**Tidak ada port publik untuk DB**. Akses hanya:
- Dari dalam container backend (service name `db:5432`)
- Dari `db-backup` (untuk `pg_dump`)
- Dari host via SSH tunnel (untuk admin debugging manual)

**SSH tunnel** untuk admin DB:
```bash
ssh -L 5433:localhost:5432 azureuser@<IP-VPS>
# Lalu di terminal lokal
psql postgres://insurance_admin:<password>@localhost:5433/digital_insurance
```

`postgres.conf` Postgres sudah default reject koneksi tanpa password (lihat `pg_hba.conf`). Untuk extra hardening, set `pg_hba.conf` ke `md5` atau `scram-sha-256` (default 15-alpine sudah `scram-sha-256`).

### 9.5 PII handling

Sesuai UU PDP (Undang-Undang Perlindungan Data Pribadi), data PII butuh kontrol khusus:

**Apa yang PII**:
- `customers.nik` (16 digit NIK)
- `customers.email`, `mobile_number`
- KTP upload (`/var/uploads/ktp/*.jpg|png|pdf`)
- Claim documents (medical records, dll)

**Controls**:
- File upload di Docker volume `backend_uploads/`, **bukan** di public dir
- Serve file via authorized endpoint (`/api/public/uploads/*` di backend, dengan auth check)
- TLS 1.2+ di Traefik (default, tidak support TLS 1.0/1.1)
- DB password kuat + scram-sha-256 auth
- Audit log (sesuai spec FS-15) — `audit_logs` table mencatat akses ke data PII

**Retention**: tidak ada auto-delete. Backup retention 1 tahun (`BACKUP_KEEP_YEARS=1`). Sesuai UU PDP, user bisa request hapus data — operation harus manual via `DELETE FROM customers WHERE id = ?;` + hapus file upload.

### 9.6 Audit logs (FS-15)

Spec FS-15 require audit log untuk: admin login, customer login, registration created, invoice generated, payment received, policy issued, claim submitted, claim status changed, inquiry submitted, inquiry answered, email sent.

Backend sudah implementasi ini via `services/audit` (cek `apps/backend/src/services/audit/`). Tabel `audit_logs` (UUID PK, `actor`, `action`, `entity_type`, `entity_id`, `metadata` JSONB, `ip_address`, `created_at`).

**Cara baca**:
```bash
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
    SELECT created_at, actor, action, entity_type, ip_address
    FROM audit_logs
    WHERE created_at > NOW() - INTERVAL '1 day'
    ORDER BY created_at DESC
    LIMIT 20;
"
```

Atau via admin UI: `https://admin.${DOMAIN}/admin/audit-logs` (kalau ada dashboard — cek spec FS-15 untuk endpoint list).

### 9.7 Compliance checklist

| Control | Status | Lokasi |
|---|---|---|
| TLS 1.2+ untuk semua traffic | ✅ | Traefik default |
| DB password scram-sha-256 | ✅ | Postgres 15 default |
| Container non-root | ✅ | USER di Dockerfiles |
| Filesystem read-only (dimana aman) | ✅ | `read_only: true` di db |
| Resource limits | ✅ | `deploy.resources` |
| No capability escalation | ✅ | `no-new-privileges` |
| Secret di env file ter-encrypt | ⚠️ | Dokploy Secrets (encrypted), .env (plaintext — chmod 600) |
| Daily backup + offsite | ⚠️ | Lokal ✅, offsite ❌ default (set BACKUP_OFFSITE_TARGET) |
| Audit log | ✅ | audit_logs table |
| WAF / rate limiting | ❌ | Tambahkan Cloudflare atau rate-limit middleware |
| Vulnerability scan image | ❌ | Trivy / Snyk (Phase 2) |
| Penetration test | ❌ | Out of scope (butuh eksternal auditor) |

---

## 10. Observability

### 10.1 Logs

**Per-service logs** di Dokploy UI: tab **Logs** (real-time tail).

**Via SSH**:
```bash
docker compose logs -f --tail 100 backend       # follow
docker compose logs --since 1h backend          # 1 jam terakhir
docker compose logs --since 2026-06-10 backend  # sejak tanggal
```

**Log rotation**: sudah di-config di compose (10MB × 3 file = max 30MB per service). Default location: `/var/lib/docker/containers/<id>/<id>-json.log`.

**JSON structured logs** (untuk aggregation Phase 2): backend pakai `tracing_subscriber` dengan `json` layer — log sudah structured, tinggal kirim ke Loki/Elasticsearch.

### 10.2 Health endpoints

| Endpoint | Service | Cek apa |
|---|---|---|
| `GET /health` | backend (port 8080) | Proses hidup (tidak cek DB) |
| `GET /` | portal, admin (port 3000/3001) | Next.js serve root |

Backend `/health` saat ini liveness-only (tidak cek DB connection). Untuk production, tambahkan `/ready` (readiness, cek DB). Tracked sebagai enhancement (bukan blocker).

### 10.3 Manual metrics (sampling)

```bash
# Container resource usage real-time
docker stats

# Snapshot
docker stats --no-stream

# Disk usage
df -h /

# Backup size trend
du -sh ./backups/

# DB size
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
    SELECT pg_size_pretty(pg_database_size('$POSTGRES_DB'));
"
```

### 10.4 SSH tunnel untuk akses panel

Kalau Dokploy panel di-expose ke internet, **强烈推荐** untuk limit akses. Dua pola:

**Pola A: SSH tunnel saja (zero attack surface)**

1. Di VPS, edit Dokploy compose / config untuk listen hanya di `127.0.0.1:3000`
2. Akses dari lokal: `ssh -L 3000:localhost:3000 azureuser@<IP-VPS>`
3. Browser: `http://localhost:3000` → tunnel ke Dokploy

**Pola B: Cloudflare Tunnel (panel accessible dari mana saja, tapi lewat Cloudflare auth)**

1. Setup Cloudflare Tunnel di VPS (`cloudflared`)
2. Cloudflare Zero Trust → tambahkan policy (email OTP, OAuth, atau IP allowlist)
3. Akses: `https://dokploy.yourdomain.com` (protected)

### 10.5 (Phase 2) Prometheus + Grafana

Lihat backlog di `document/operations/DOCKER_SETUP.md` §10 — out of scope untuk hardened stack sekarang, planned untuk iterasi berikutnya.

---

## 11. Troubleshooting

### 11.1 Common error patterns

| Error message | Penyebab | Fix |
|---|---|---|
| `failed to compute cache key: ... not found` | Build context salah (parent dir dari Dockerfile) | Set **Base Directory** = `.` di Dokploy service |
| `failed to lookup address information: db` | Backend & db beda network | Pastikan `docker-compose.yml` dipakai (bukan service terpisah) |
| `connection refused` ke DB di log backend | DB belum ready | Tunggu 30s, atau restart backend setelah db healthy |
| `This site can't be reached` / `ERR_CONNECTION_TIMED_OUT` | NSG Azure block 80/443 | Tambah inbound rule di NSG untuk 80 & 443 (lihat [§5.3](#53-nsg--cloud-firewall--buka-port-80--443)) |
| `NET::ERR_CERT_AUTHORITY_INVALID` | Self-signed cert (Traefik fallback) | Pakai real domain + LE, atau klik "Proceed" untuk sslip.io dev |
| `502 Bad Gateway` | Upstream service unhealthy | Cek `docker compose ps` — restart service yang unhealthy |
| `permission denied` di script | File mode salah | `chmod +x scripts/*.sh` |
| `disk quota exceeded` saat backup | Disk penuh | Lihat [§7.4](#74-disk-full) |
| `database "digital_insurance" does not exist` | DB belum dibuat / volume pgdata fresh | `docker compose up -d db` dulu, tunggu 10s, baru backend |

### 11.2 Diagnostic commands cheat sheet

```bash
# Status semua container
docker compose ps
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Resource usage
docker stats --no-stream

# Health endpoint
curl -s http://localhost:8080/health
docker compose exec backend wget -qO- http://127.0.0.1:8080/health

# Log
docker compose logs --tail 100 backend
docker compose logs -f backend | grep -i error

# DB connection
docker compose exec db pg_isready -U $POSTGRES_USER
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\dt"

# Traefik routing
docker logs dokploy-traefik 2>&1 | tail -30

# Network inspect
docker network inspect insuretrack

# Test port host accessibility (dari Windows lokal)
Test-NetConnection -ComputerName <IP-VPS> -Port 80
Test-NetConnection -ComputerName <IP-VPS> -Port 443

# DNS resolve
nslookup portal.${DOMAIN}
dig +short api.${DOMAIN}
```

### 11.3 Komponen gagal, lainnya jalan — verifikasi isolation

Sesuai hardening yang kita terapkan, satu service failure **tidak boleh** menjatuhkan yang lain. Test:

```bash
# Sengaja break portal, deploy, verify backend/admin masih jalan
echo "BROKEN {{{" >> apps/portal/app/page.tsx
git add -A && git commit -m "test: break portal" && git push
# Tunggu Dokploy selesai build (akan error)

# Cek
docker ps                                # portal NOT present (build fail), backend OK
curl -s http://localhost:8080/health     # backend masih jawab OK
```

Kalau backend ikut down, ada masalah di compose (kemungkinan: `depends_on` salah atau healthcheck salah trigger).

---

## 12. Scripts reference

Semua script di `scripts/` direktori repo. Salin ke VPS (otomatis ada di working dir Dokploy) atau clone manual.

| Script | Purpose | Usage |
|---|---|---|
| `generate-env.sh` | Generate `.env` dengan secret (POSTGRES_PASSWORD, JWT_SECRET, dll.) | `scripts/generate-env.sh [--domain=X \| --slip=IP]` |
| `preflight.sh` | Pre-deploy checker (env, docker, disk, port, DNS) | `scripts/preflight.sh` atau `scripts/preflight.sh --strict` |
| `deploy.sh` | Selective blue-green deploy 1 service | `scripts/deploy.sh {portal\|admin\|backend\|all}` |
| `backup-now.sh` | Manual trigger DB backup | `scripts/backup-now.sh [--list\|--offsite]` |
| `restore-db.sh` | Restore DB dari backup file | `scripts/restore-db.sh [backup-file] [--no-confirm]` |
| `healthcheck-all.sh` | Status semua service + endpoint probe | `scripts/healthcheck-all.sh` |

**Kapan pakai yang mana**:

| Situasi | Script |
|---|---|
| Deploy pertama (siapkan env + secret) | `generate-env.sh` |
| Sebelum deploy pertama (verify environment) | `preflight.sh` |
| Sebelum update code | `preflight.sh` + `deploy.sh <svc>` |
| Sebelum risky operation (migrasi, schema change) | `backup-now.sh` |
| DB terasa lambat / data corrupt / accident delete | `restore-db.sh` |
| Cek status health (harian / saat incident) | `healthcheck-all.sh` |
| Setup CI/CD atau auto-deploy | `deploy.sh` di cron / webhook handler |

**Untuk Dokploy**: kebanyakan kasus pakai auto-deploy via webhook (lihat [§5.10](#510-update-workflow)). Script manual untuk SSH debugging atau restore.

---

## 13. Appendices

### A. Environment variables — canonical list

Lihat [§6.1](#61-environment-variables) untuk tabel lengkap. Plus `.env.example` di root repo — selalu sumber paling update.

### B. Useful commands

**Dokploy**:
```bash
# Lihat semua container (termasuk Dokploy internal)
docker ps

# Update Dokploy ke versi terbaru
sudo dokploy update

# Tail Traefik logs
docker logs dokploy-traefik -f --tail 100
```

**Docker compose**:
```bash
docker compose ps                  # service status
docker compose logs <svc>          # log satu service
docker compose restart <svc>       # restart satu service
docker compose pull                # pull image terbaru (kalau pakai image registry)
docker compose up -d --build       # rebuild + restart
docker compose down                # stop semua (volume tetap)
docker compose down -v             # stop + hapus volume (DATA HILANG!)
docker compose exec <svc> sh       # shell ke dalam container
```

**Postgres**:
```bash
# Backup manual (kalau db-backup rusak)
docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql

# Restore manual
cat backup.sql | docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB

# Vacuum (recovery space)
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "VACUUM FULL;"

# Lihat running query
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
    SELECT pid, state, query, age(clock_timestamp(), query_start) as duration
    FROM pg_stat_activity
    WHERE state != 'idle' ORDER BY duration DESC;
"
```

**Network**:
```bash
# Test Traefik routing (override Host header)
curl -k -H "Host: portal.${DOMAIN}" http://<IP-VPS>/

# DNS check
dig +short portal.${DOMAIN}

# Port scan host (verify NSG)
nmap -Pn <IP-VPS>
```

### C. Migration dari 3 Dokploy service ke 1 Compose

Anda saat ini mungkin punya 3 Dokploy Application service terpisah (portal, admin, backend) yang jalan. Untuk migrasi ke hardened stack (1 Compose):

1. **Backup DB** sebelum apa-apa: `scripts/backup-now.sh`
2. **Buat Dokploy Compose service baru** (lihat [§5.6](#56-import-compose-file))
3. **Set env vars** (lihat [§5.7](#57-configure-env-vars-dokploy-secrets))
4. **Set domains** (lihat [§5.8](#58-configure-domains))
5. **Deploy** — service baru up, semua 5 container (db, db-backup, backend, portal, admin) jalan
6. **Test akses** ke `portal.${DOMAIN}`, `admin.${DOMAIN}`, `api.${DOMAIN}/health`
7. **Verifikasi data**:
   ```bash
   docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
       SELECT count(*) FROM customers;
       SELECT count(*) FROM policies;
   "
   ```
8. **Setelah stabil** (1-2 hari monitoring): archive 3 service lama
9. **Catatan**: kalau ada service lama pakai `pgdata` Docker volume berbeda dari yang baru, Anda harus copy data (lihat [Dokploy migration guide](https://docs.dokploy.com/docs/core/migration))

### D. Glossary

| Istilah | Arti |
|---|---|
| **Compose** | Format file untuk define multi-container app (Docker Compose v2). Single source of truth. |
| **Traefik** | Reverse proxy + load balancer. Di Dokploy built-in. |
| **Let's Encrypt (LE)** | Certificate authority gratis, auto-issue TLS cert via ACME protocol. |
| **ACME challenge** | Cara LE verify Anda kontrol domain. HTTP-01: LE fetch URL di domain Anda. DNS-01: LE cek TXT record. |
| **Docker network** | Virtual network untuk container. Internal DNS resolve service name → IP container. |
| **Service name** | Nama service di compose (`db`, `backend`). Dipakai sebagai hostname antar service di network yang sama. |
| **Replica** | Jumlah instance container untuk satu service. Replicas=2 = 2 container dengan image & config sama. |
| **Healthcheck** | Probe Docker untuk cek service alive. Kalau fail, container marked unhealthy → Traefik skip dari LB. |
| **Resource limit** | CPU/memory cap per container. OOM container di-restart, tidak bunuh VM. |
| **Zero-downtime deploy** | Pattern deploy di mana tidak ada blip ke user. Compose + replicas + healthcheck. |
| **Rolling update** | Ganti instance satu per satu, bukan semua bareng. Standar di Kube, di Compose pakai scale up/down manual. |
| **RTO** | Recovery Time Objective — max downtime yang boleh. |
| **RPO** | Recovery Point Objective — max data loss yang boleh. |
| **PII** | Personally Identifiable Information. Data yang bisa identify individual (NIK, email, KTP). |
| **NSG** | Network Security Group. Azure cloud-level firewall. |
| **ACME** | Automatic Certificate Management Environment. Protokol LE untuk issue cert. |

### E. Referensi cepat

| Topik | URL |
|---|---|
| Dokploy docs | https://docs.dokploy.com |
| Docker Compose v2 reference | https://docs.docker.com/compose/compose-file/ |
| Traefik v3 docs | https://doc.traefik.io/traefik/ |
| Let's Encrypt docs | https://letsencrypt.org/docs/ |
| Azure NSG | https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview |
| Cloudflare R2 (untuk STORAGE_BACKEND=r2) | https://developers.cloudflare.com/r2/ |
| Resend (email) | https://resend.com/docs |
| UU PDP (Indonesia) | https://www.dpr.go.id/uu |

### F. Companion documents

- [`DOCKER_SETUP.md`](./../operations/DOCKER_SETUP.md) — Setup Docker untuk local development, troubleshooting umum
- [`R2_SETUP.md`](./R2_SETUP.md) — Konfigurasi Cloudflare R2 untuk storage backend
- [`CONTRIBUTING.md`](./../contributing/CONTRIBUTING.md) — Commit conventions, PR process
- [`DESIGN.md`](./../product/DESIGN.md) — UI/UX design system (Clay-inspired)
- [`USER_JOURNEYS.md`](./../product/USER_JOURNEYS.md) — User journey maps untuk test cases
- `Technical Specification Document Digital Insurance v1.2.pdf` — Canonical spec (FS-01..FS-20, identifier formats, state machines)

---

**Dokumen ini di-maintain oleh:** tim InsureTrack · **Update terakhir:** 2026-06-10 · **Versi:** 2.0 (full rewrite dari Opsi 1/Opsi 2 framing ke unified architecture)
