# InsureTrack — Deployment Guide

**Tanggal:** 2026-06-09
**Status:** 📘 Guide — dua strategi deployment production-ready, masing-masing dengan langkah setup lengkap.

Dokumen ini menjelaskan cara deploy InsureTrack ke production dengan **dua strategi** yang berdiri sendiri-sendiri. Pilih salah satu sesuai budget & kebutuhan kontrol.

---

## TL;DR — Pilih strategi

| Strategi | Biaya bulanan | Cocok untuk | Trade-off utama |
| --- | --- | --- | --- |
| **Opsi 1: Full Free** (Vercel + Render + Neon + Cloudflare R2 + Resend) | **$0** | Demo, portfolio, low-traffic, belajar | Cold start di backend (Render), beberapa dashboard/secret tersebar, data tidur 7 hari di Neon kalau tidak di-ping |
| **Opsi 2: VPS + Dokploy** (Azure for Students) | **$0** (dari $100 student credit) | Production ringan, kontrol penuh, satu tempat untuk semua | Single point of failure (1 VPS), kamu urus backup & update sendiri |

**Rekomendasi singkat:**

- **Mahasiswa / tugas akhir / side project** → Opsi 1 (zero cost, cepat jalan).
- **Butuh environment mirip production / latih DevOps / mau dipakai tim kecil** → Opsi 2 dengan **Azure B1ms** ($15/bln, muat ~6 bln di credit).
- **Mau lebih murah dari Azure & tetap kontrol penuh** → Opsi 2 tapi di **Hetzner CX22** (€4.5/bln) — pakai Azure credit untuk hal lain.

---

## Overview: Apa yang perlu di-deploy

Stack dari `docker-compose.yml` + storage eksternal + email:

| # | Servis | Tech | Peran |
| --- | --- | --- | --- |
| 1 | **Database** | PostgreSQL 15 | Source of truth (customers, registrations, policies, claims, inquiries, audit_logs, email_logs) |
| 2 | **Backend** | Rust + Axum, port `8080` | REST API (public, customer, admin); render PDF e-policy |
| 3 | **Portal** | Next.js 15, port `3000` | Customer surface (landing, register, portal/*) |
| 4 | **Admin** | Next.js 15, port `3001` | Backoffice (admin/*) |
| 5 | **Object storage** | S3-compatible | KTP, claim docs, e-policy PDF, invoice PDF, logo klien, foto testimoni |
| 6 | **Email** | SMTP/HTTP API | 8 jenis email (spec FS-05) |
| 7 | **Domain + SSL** | DNS + cert | Public-facing URL |
| 8 | **CI/CD** | GitOps / webhook | Auto-deploy dari `main` branch |

Backend **wajib** ditulis ke storage persisten (R2) — kalau tidak, file KTP/PDF hilang saat container recreate. Lihat `document/R2_SETUP.md` untuk konfigurasi storage backend.

---

# Opsi 1 — Full Free (Modern Free Tiers)

## 1.1 Arsitektur

```
                          Internet
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
   ┌────────────────┐ ┌────────────┐ ┌──────────────┐
   │ Cloudflare     │ │ Vercel     │ │ Vercel       │
   │ DNS + Proxy    │ │ Portal     │ │ Admin        │
   │ (gratis)       │ │ portal.x.id │ │ admin.x.id  │
   └────────────────┘ └─────┬──────┘ └──────┬───────┘
                            │ HTTPS         │ HTTPS
                            ▼               ▼
                    ┌───────────────────────────┐
                    │  Render (free web service) │
                    │  Backend Rust + Axum       │
                    │  ⚠ sleep setelah 15 mnt    │
                    │  ⏰ keep-alive via cron     │
                    └──────┬─────────┬──────────┘
                           │         │
              ┌────────────▼─┐   ┌──▼──────────┐
              │ Neon         │   │ Cloudflare  │
              │ PostgreSQL   │   │ R2 (S3)     │
              │ (0.5 GB)     │   │ (10 GB)     │
              └──────────────┘   └─────────────┘

   Side-channels:
   • Resend  ──► email keluar (100/hari gratis)
   • GitHub Actions ──► CI/CD + keep-alive ping
```

Semua servis punya free tier permanen. **Total: $0/bln.** Trade-off: cold start, dashboard/secret tersebar di 5+ platform, dan beberapa batas resource yang harus dipantau.

## 1.2 Stack & batas free tier

| Layer | Layanan | Batas free tier | Cukup untuk InsureTrack? |
| --- | --- | --- | --- |
| Frontend (Portal) | **Vercel Hobby** | 100 GB bandwidth, unlimited projects, serverless functions 100 GB-h | ✅ |
| Frontend (Admin) | **Vercel Hobby** | sama | ✅ |
| Backend | **Render Free Web Service** | 750 jam/bulan, 512 MB RAM, **sleep setelah 15 mnt inaktif** | ✅ dengan keep-alive |
| Database | **Neon Free** | 0.5 GB storage, 191.9 compute hours/bulan, 1 project, branching | ✅ (database ringan) |
| Object storage | **Cloudflare R2 Free** | 10 GB storage, 10M read/bulan, **egress gratis** | ✅ |
| Email | **Resend Free** | 100 email/hari, 3.000/bulan, 1 custom domain | ✅ |
| DNS | **Cloudflare Free** | Unlimited records, free proxy, free SSL | ✅ |
| Keep-alive | **cron-job.org** | Unlimited jobs, min interval 1 menit | ✅ |
| CI/CD | **GitHub Actions** | 2.000 menit/bulan (public repo unlimited) | ✅ |
| Domain | **Namecheap** (via GitHub Student Pack) | 1 domain gratis 1 tahun | ✅ untuk `.me/.io` |

> **⚠ Catatan penting tentang Render Free:** Backend akan **tidur** setelah 15 menit tanpa request. Request pertama setelah tidur butuh **30–60 detik** untuk cold start. Untuk demo/portfolio ini OK, tapi untuk production serius pertimbangkan Opsi 2 atau Render **Starter** ($7/bln).

## 1.3 Prasyarat

- Akun **GitHub** (untuk repo + Actions + Student Pack kalau mahasiswa).
- Akun **Vercel** (sign up via GitHub).
- Akun **Render** (sign up via GitHub).
- Akun **Neon** (sign up via GitHub).
- Akun **Cloudflare** (sign up email; R2 butuh kartu kredit untuk aktivasi walau free — tidak di-charge).
- Akun **Resend** (sign up email; verify domain untuk from-address).
- **Domain** (opsional, tapi sangat disarankan). Gratis via:
  - **GitHub Student Developer Pack** → Namecheap free domain 1 tahun.
  - **Cloudflare Registrar** → harga at-cost untuk `.id`/`.com`/`.dev`.
  - **DuckDNS** → free subdomain `namamu.duckdns.org` (kurang profesional tapi 100% gratis).

## 1.4 Step-by-step setup

### Step 1 — Database (Neon)

1. Buka https://console.neon.tech → **Sign up with GitHub**.
2. Klik **Create project** → name: `insuretrack-prod`, region terdekat (Singapore untuk Asia Tenggara).
3. Copy **connection string** (branch `main`, role `neondb_owner`):
   ```
   postgres://neondb_owner:PASSWORD@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. **Jalankan migration** dari lokal (karena sqlx::migrate! di backend butuh DATABASE_URL):
   ```bash
   # dari root repo, pakai connection string Neon (production schema)
   cd apps/backend
   DATABASE_URL="postgres://neondb_owner:PASSWORD@ep-xxx.../neondb?sslmode=require" \
     cargo run --release
   # Tunggu sampai log "migrations applied", lalu Ctrl+C.
   ```
5. Alternatif: pakai `psql` untuk apply migrations manual:
   ```bash
   psql "postgres://neondb_owner:PASSWORD@ep-xxx.../neondb?sslmode=require" \
     -f apps/backend/migrations/0001_initial.sql
   # ulangi untuk 0002..0007
   ```
6. Simpan connection string di password manager — ini `DATABASE_URL` production.

> **Tip:** Neon mendukung **branching** (copy-on-write). Buat branch `staging` untuk testing sebelum push ke `main`.

### Step 2 — Object storage (Cloudflare R2)

Lihat `document/R2_SETUP.md` untuk step lengkap. Ringkasan:

1. Cloudflare Dashboard → **R2** → **Create bucket** → `insuretrack-prod`.
2. **Manage R2 API Tokens** → create token dengan scope object-read-write ke bucket.
3. Simpan: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`.
4. **Public bucket** (untuk serve file via URL): bucket Settings → Public access → **Connect domain** (pakai `cdn.yourdomain.id`) atau pakai default `pub-xxx.r2.dev`.
5. Set `R2_PUBLIC_BASE_URL` = URL publik bucket (untuk generate link di email).

### Step 3 — Email (Resend)

1. Sign up https://resend.com → **Add domain** (mis. `yourdomain.id`).
2. Tambahkan **DKIM/SPF/DMARC** records yang Resend给出 ke Cloudflare DNS.
3. Tunggu propagasi (beberapa menit).
4. **Create API key** dengan scope `Sending access`.
5. Simpan `RESEND_API_KEY` dan `RESEND_FROM_EMAIL` (mis. `noreply@yourdomain.id`).

### Step 4 — Backend (Render)

1. Sign in ke https://dashboard.render.com → **New +** → **Web Service**.
2. **Connect GitHub repo** `insuretrack`.
3. Konfigurasi:
   | Field | Value |
   | --- | --- |
   | Name | `insuretrack-backend` |
   | Region | Singapore (paling dekat dengan Neon) |
   | Branch | `main` |
   | Root Directory | `apps/backend` |
   | Runtime | **Docker** (Render detect Dockerfile otomatis) |
   | Instance Type | **Free** |
4. **Environment variables** (klik **Advanced** → **Add Environment Variable**):
   ```
   DATABASE_URL=postgres://neondb_owner:PASSWORD@ep-xxx.../neondb?sslmode=require
   JWT_SECRET=<openssl rand -hex 64>
   PAYMENT_WEBHOOK_SECRET=<openssl rand -hex 32>
   APP_BASE_URL=https://portal.yourdomain.id
   MEDIA_BASE_URL=https://pub-xxx.r2.dev
   RUST_LOG=info,insuretrack_backend=info
   PORT=8080
   STORAGE_BACKEND=r2
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=insuretrack-prod
   R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
   R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev
   RESEND_API_KEY=re_xxx
   RESEND_FROM_EMAIL=noreply@yourdomain.id
   RESEND_FROM_NAME=InsureTrack
   ```
5. Klik **Create Web Service**. Render build image (~5–10 menit, Rust compile pertama kali lama).
6. Catat URL backend: `https://insuretrack-backend.onrender.com`.

> **Build pertama lambat?** Rust cold compile 3–8 menit di Render free tier. Build berikutnya cepat karena Docker layer cache.

### Step 5 — Frontend Portal & Admin (Vercel)

#### Portal

1. Vercel Dashboard → **Add New Project** → Import `insuretrack` repo.
2. Konfigurasi:
   | Field | Value |
   | --- | --- |
   | Project Name | `insuretrack-portal` |
   | Framework Preset | Next.js (auto-detect) |
   | Root Directory | `apps/portal` |
   | Build Command | `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @insuretrack/portal... build` (atau default) |
   | Output Directory | `.next` (default) |
3. **Environment variables**:
   ```
   NEXT_PUBLIC_API_URL=https://insuretrack-backend.onrender.com/api
   ```
4. Klik **Deploy**. Build ~1–3 menit.
5. Catat URL: `https://insuretrack-portal.vercel.app`.

#### Admin

Ulangi step di atas dengan:
- Project Name: `insuretrack-admin`
- Root Directory: `apps/admin`
- Env: `NEXT_PUBLIC_API_URL=https://insuretrack-backend.onrender.com/api`

Catat URL: `https://insuretrack-admin.vercel.app`.

### Step 6 — Custom domain

Di Cloudflare (free plan, proxy aktif → gratis SSL + DDoS protection):

1. **Add site** → masukkan domain kamu → pilih **Free plan**.
2. Update nameserver di registrar domain kamu ke Cloudflare nameservers (mis. `anna.ns.cloudflare.com`).
3. Tunggu propagasi (beberapa menit – 24 jam).
4. **DNS records**:
   ```
   Type  Name              Content                                Proxy
   CNAME portal            insuretrack-portal.vercel.app           ✅
   CNAME admin             insuretrack-admin.vercel.app            ✅
   CNAME api               insuretrack-backend.onrender.com        ⚠ (proxy off, Render butuh direct)
   CNAME cdn               pub-xxx.r2.dev                         ✅
   ```
   > **Catatan Render:** Untuk custom domain, Render butuh TXT record `_render-challenge` dan CNAME `api` proxy **off** (grey cloud). Lebih simple: pakai Vercel serverless function sebagai proxy, atau pakai **Cloudflare Worker** free untuk reverse proxy. Untuk demo, default URL Render sudah cukup — skip custom domain untuk backend.

5. Di Vercel → Project Settings → **Domains** → add `portal.yourdomain.id` dan `admin.yourdomain.id`. Vercel auto-issue SSL via Let's Encrypt.

### Step 7 — Keep-alive (Render)

Agar backend **tidak tidur**, setup cron job gratis:

1. Sign up https://cron-job.org (free, unlimited jobs).
2. Create job:
   - Title: `keep-render-awake`
   - URL: `https://insuretrack-backend.onrender.com/health`
   - Interval: **every 14 minutes** (di bawah threshold 15 mnt).
3. Save & enable.

Alternatif: pakai **GitHub Actions** scheduled workflow:

```yaml
# .github/workflows/keep-alive.yml
name: Keep Render Awake
on:
  schedule:
    - cron: '*/14 * * * *'   # tiap 14 menit
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping backend
        run: curl -fsS https://insuretrack-backend.onrender.com/health
```

### Step 8 — CI/CD (GitHub Actions)

Workflow sudah ada di `.github/workflows/` (cek repo). Pastikan:
- Push ke `main` → Vercel auto-deploy (zero-config, karena Vercel connected to GitHub).
- Push ke `main` → Render auto-deploy (jika auto-deploy enabled di Render settings).

Tambahan opsional: **preview deployments** Vercel untuk setiap PR (otomatis aktif di Hobby plan).

## 1.5 Environment variables — reference

| Variable | Backend | Portal | Admin | Sumber |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | | | Neon |
| `JWT_SECRET` | ✅ | | | `openssl rand -hex 64` |
| `PAYMENT_WEBHOOK_SECRET` | ✅ | | | `openssl rand -hex 32` |
| `APP_BASE_URL` | ✅ | | | domain portal (untuk link email) |
| `MEDIA_BASE_URL` | ✅ | | | R2 public URL atau backend URL |
| `STORAGE_BACKEND` | ✅ | | | `r2` (production) |
| `R2_*` (5 vars) | ✅ | | | R2 token |
| `RESEND_API_KEY` | ✅ | | | Resend |
| `RESEND_FROM_EMAIL` | ✅ | | | Resend |
| `NEXT_PUBLIC_API_URL` | | ✅ | ✅ | URL backend + `/api` |

> **NEXT_PUBLIC_API_URL di-bake saat build** Next.js. Setiap ganti value, harus redeploy frontend (Vercel trigger otomatis kalau pakai Git integration).

## 1.6 Pros & Cons

| ✅ Pros | ❌ Cons |
| --- | --- |
| **$0/bulan** — zero biaya untuk 1 tahun | Cold start 30–60 dtk di backend setelah 15 mnt idle |
| Cepat setup (1–2 jam end-to-end) | Dashboard & secret tersebar di 5+ platform |
| Vercel zero-config Next.js, fastest DX | Render free instance: 512 MB RAM (tight untuk PDF rendering) |
| SSL gratis (Vercel + Cloudflare) | Neon free pause branch setelah 5 hari inaktif (selalu bisa di-unpause, tapi ada delay) |
| R2: **egress gratis** = hemat kalau traffic tinggi | Batas email 100/hari Resend — cukup untuk 100 registrasi/hari |
| Skala mudah (tinggal upgrade plan) | Tidak ada private network antar servis (pakai internet publik) |

---

# Opsi 2 — VPS + Dokploy (Azure for Students)

## 2.1 Kenapa Dokploy

**Dokploy** adalah PaaS open-source gratis yang bisa kamu install di VPS sendiri. Vercel/Netlify-like DX di infrastruktur kamu:

| Fitur | Built-in? |
| --- | --- |
| One-click deploy dari GitHub repo | ✅ |
| Auto-build Docker image | ✅ |
| **Auto SSL** via Let's Encrypt | ✅ |
| Database manager (Postgres, MySQL, MongoDB, Redis) | ✅ |
| Docker Compose support | ✅ (perfect untuk InsureTrack) |
| Environment variable management per service | ✅ |
| Real-time logs & monitoring | ✅ |
| Auto backup database ke S3-compatible | ✅ |
| Multi-server (cluster beberapa VPS) | ✅ |
| Biaya | **$0** (Dokploy gratis; kamu bayar VPS saja) |

Cocok untuk **InsureTrack** karena `docker-compose.yml` bisa langsung di-import.

## 2.2 Rekomendasi VPS

### 2.2.1 Azure (primary — pakai Azure for Students credit)

Azure for Students memberikan **$100 credit** untuk 12 bulan. Pilih VM seri **B** (burstable) — paling murah, cukup untuk workload rendah–sedang.

| VM SKU | vCPU | RAM | Storage | Harga/bln (Pay-as-you-go) | Durasi dari $100 | RAM cukup untuk InsureTrack? | Rekomendasi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **B1s** | 1 | 1 GB | tmp | ~$7.59 | ~13 bln | ⚠️ Tight — perlu swap 2 GB, PDF render bisa lambat | 🟡 Minimal viable |
| **B1ms** | 1 | 2 GB | tmp | ~$15.18 | ~6.5 bln | ✅ Nyaman, ada headroom | 🟢 **Paling pas** |
| **B2s** | 2 | 4 GB | tmp | ~$30.37 | ~3.3 bln | ✅✅ Overkill tapi leluasa | 🟢 Kalau ada credit lebih |
| **B2ms** | 2 | 8 GB | tmp | ~$60.74 | ~1.6 bln | ✅✅✅ | 🔴 Tidak worth pakai credit |

> **Storage ephemeral?** Tambah **Azure Managed Disk** (Standard SSD, ~$0.04/GB/bulan). 32 GB = ~$1.3/bln. **WAJIB** untuk Postgres production. Pilih **Standard HDD** (~$0.04/GB) untuk hemat, atau **Standard SSD** (~$0.10/GB) untuk perf.

**Rekomendasi utama: Azure B1ms + 32 GB Standard SSD** (~$16.5/bln, muat ~6 bulan di $100 credit). Ini sweet spot antara biaya, RAM, dan durasi.

**Cara hitung cost realistis B1ms (~$15.18/bln) + Disk (~$1.3/bln) + Bandwidth (~$0.5–2/bln untuk traffic ringan) = ~$17–19/bln.** Dari $100 credit → **~5–5.5 bulan** production-grade.

### 2.2.2 Alternatif non-Azure (lebih murah, tidak pakai credit)

Kalau tidak wajib Azure, opsi ini **jauh lebih murah**:

| Provider | Plan | Spec | Harga/bulan | Catatan |
| --- | --- | --- | --- | --- |
| **Hetzner Cloud** | CX22 | 2 vCPU, 4 GB, 40 GB SSD | **€4.50** (~$5) | Best value. Lokasi: Germany/Finland. Tukar USD/IDR jadi ~Rp 75rb/bln. |
| **Hetzner Cloud** | CPX21 | 3 vCPU, 4 GB, 80 GB SSD | **€7.90** (~$8.5) | AMD, lebih cepat dari CX |
| **Oracle Cloud** | ARM Ampere A1 | 4 vCPU, 24 GB (free tier) | **$0** (always free) | Limited availability; harus claim VM di region tertentu |
| **DigitalOcean** | Basic Droplet | 1 vCPU, 1 GB, 25 GB | $6 | DO + Dokploy + Postgres jalan |
| **Vultr** | Cloud Compute | 1 vCPU, 1 GB, 25 GB | $5 | Banyak region (Singapore, Tokyo) |
| **Contabo** | Cloud VPS S | 3 vCPU, 6 GB, 100 GB | **€4.99** (~$5.5) | Murah, storage besar, lokasi EU/US |

> **Rekomendasi di luar Azure:** Hetzner CX22 (€4.5/bln) untuk performa + harga terbaik. Kalau Oracle Cloud free tier available, pakai itu (24 GB RAM gratis!).

### 2.2.3 Bandwidth & storage — penting

- **Bandwidth masuk**: gratis di semua provider.
- **Bandwidth keluar**: Azure free 100 GB/bulan pertama, lalu ~$0.05–0.12/GB. Hetzner 20 TB/bulan free. Vultr/DO ~1–2 TB/bulan.
- **Backup** e-policy PDF & KTP: simpan **R2** (S3-compatible, egress gratis), bukan di disk VPS. VPS disk hanya untuk Postgres data + Docker images.

## 2.3 Arsitektur

```
                          Internet
                             │
                             ▼
              ┌──────────────────────────┐
              │ Cloudflare (free plan)   │
              │ DNS + Proxy + SSL        │
              │ DDoS protection          │
              └──────────┬───────────────┘
                         │ A/CNAME
              ┌──────────▼───────────────────────────────────────┐
              │ Azure B1ms (1 vCPU, 2 GB RAM, Ubuntu 22.04)     │
              │ ┌──────────────────────────────────────────────┐ │
              │ │  Dokploy  (control panel :80/:443)           │ │
              │ │  ├── Traefik (reverse proxy + auto-SSL)      │ │
              │ │  ├── Service: backend (Rust, port 8080)      │ │
              │ │  ├── Service: portal (Next.js, port 3000)    │ │
              │ │  ├── Service: admin  (Next.js, port 3001)    │ │
              │ │  └── Database: postgres (port 5432, internal)│ │
              │ └──────────────────────────────────────────────┘ │
              │                                                  │
              │ Disk: 32 GB Standard SSD (pgdata + uploads)      │
              └──────────┬───────────────────────────────────────┘
                         │ HTTPS
            ┌────────────┼────────────┐
            ▼            ▼            ▼
   ┌────────────┐ ┌──────────┐ ┌──────────┐
   │ Resend     │ │ Cloudflare│ │ User     │
   │ (email)    │ │ R2 (file) │ │ browser  │
   └────────────┘ └──────────┘ └──────────┘
```

Semua servis di belakang **Traefik** (built-in Dokploy) yang handle HTTPS + SSL otomatis. Internal network hanya antara container Docker (Postgres tidak expose ke internet).

## 2.4 Step-by-step setup

### Step 1 — Provision VPS Azure

1. Login ke https://portal.azure.com dengan akun student.
2. **Create a virtual machine**:
   - **Image**: `Ubuntu 22.04 LTS - x64 Gen 2`
   - **Size**: `Standard B1ms` (1 vCPU, 2 GB RAM)
   - **Region**: Southeast Asia (Singapore) — terdekat dengan user Indonesia.
   - **Authentication**: SSH public key (generate pakai `ssh-keygen -t ed25519`).
   - **Public inbound ports**: 22, 80, 443.
3. **Disks** → add data disk: 32 GB, Standard SSD, Empty.
4. **Networking** → buat NSG rule untuk 80, 443.
5. **Review + Create**. Catat **Public IP** (mis. `20.212.123.45`).
6. **Disassociate** Public IP setiap kali stop VM (opsional, hemat) — re-associate saat start lagi.
7. **Set DNS name label** (opsional): `insuretrack-vm.southeastasia.cloudapp.azure.com`.

### Step 2 — Setup awal VPS

SSH ke VM:
```bash
ssh azureuser@20.212.123.45
```

Update & install util dasar:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw fail2ban htop curl wget git unattended-upgrades
```

Setup firewall:
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
sudo ufw status
```

Setup swap (WAJIB untuk B1s, opsional tapi recommended untuk B1ms):
```bash
# 2 GB swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # verifikasi
```

Mount data disk (kalau pakai managed disk untuk pgdata):
```bash
# Lihat disk baru
lsblk

# Mis. /dev/sdc adalah disk baru
sudo mkfs.ext4 /dev/sdc
sudo mkdir -p /mnt/data
sudo mount /dev/sdc /mnt/data
echo '/dev/sdc /mnt/data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
```

Set hostname:
```bash
sudo hostnamectl set-hostname insuretrack-vm
```

### Step 3 — Install Docker & Dokploy

Dokploy butuh Docker. Install keduanya via script resmi:

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Install Dokploy
curl -sSL https://dokploy.com/install.sh | sudo bash
```

Tunggu ~3–5 menit. Setelah selesai, Dokploy running di port **80** (untuk akses awal sebelum SSL).

> **Akses panel:** Buka `http://20.212.123.45` di browser. Setup akun admin (username/password).

Dokploy akan otomatis:
- Setup **Traefik** sebagai reverse proxy.
- Provision **Let's Encrypt** SSL saat domain dipasang.
- Create local Docker network.

### Step 4 — Setup domain & DNS

1. Beli/gunakan domain sendiri (mis. `insuretrack.id`).
2. Di Cloudflare (free plan):
   - Add site → ganti nameserver di registrar.
   - DNS records:
     ```
     Type  Name    Content               Proxy
     A     @       20.212.123.45         ✅
     A     *       20.212.123.45         (wildcard, untuk subdomain)
     ```
3. **Verify domain di Dokploy**: Settings → **Server Domain** → set `insuretrack.id` (akan auto-provision wildcard cert).

### Step 5 — Create database

Di Dokploy panel:

1. **Projects** → Create project `insuretrack`.
2. **Services** → **+ Create Service** → **Database** → **PostgreSQL 15**.
3. Konfigurasi:
   | Field | Value |
   | --- | --- |
   | Name | `postgres` |
   | Image | `postgres:15-alpine` |
   | Database | `digital_insurance` |
   | Username | `insurance_admin` |
   | Password | (auto-generate, simpan!) |
   | Volume Mount | `/var/lib/postgresql/data` → `/mnt/data/pgdata` (persistent di data disk) |
4. **Advanced** → aktifkan **Backups** → set schedule (mis. daily 02:00) → destination **S3-compatible** (R2 bucket khusus backup).
5. Save. Database jalan di internal network `dokploy-network`, port 5432.

Dapatkan **internal connection string**: `postgres://insurance_admin:PASSWORD@postgres:5432/digital_insurance` (hostname `postgres` resolve via Docker DNS internal).

> **Run migrations**: Saat deploy backend pertama kali, sqlx::migrate! akan auto-apply semua file di `apps/backend/migrations/`. Lihat `docker-compose.yml` untuk detail.

### Step 6 — Deploy services

Untuk tiap service (backend, portal, admin):

#### Backend

1. **Services** → **+ Create Service** → **Application** → **Dockerfile**.
2. **Source**:
   - **Provider**: GitHub
   - **Repository**: `YOUR_USERNAME/insuretrack`
   - **Branch**: `main`
   - **Build Path**: `apps/backend` (path ke Dockerfile)
3. **General**:
   - Name: `backend`
   - Port: `8080`
4. **Domains**:
   - Host: `api.insuretrack.id`
   - HTTPS: ✅ (auto Let's Encrypt)
5. **Environment Variables** (add semua dari `.env.example`):
   ```
   DATABASE_URL=postgres://insurance_admin:PASSWORD@postgres:5432/digital_insurance
   JWT_SECRET=<openssl rand -hex 64>
   PAYMENT_WEBHOOK_SECRET=<openssl rand -hex 32>
   APP_BASE_URL=https://portal.insuretrack.id
   MEDIA_BASE_URL=https://cdn.insuretrack.id
   UPLOAD_DIR=/var/uploads
   RUST_LOG=info,insuretrack_backend=info
   PORT=8080
   STORAGE_BACKEND=r2
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=insuretrack-prod
   R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
   R2_PUBLIC_BASE_URL=https://cdn.insuretrack.id
   RESEND_API_KEY=re_xxx
   RESEND_FROM_EMAIL=noreply@insuretrack.id
   ```
6. **Volumes**:
   - `/var/uploads` → `/mnt/data/backend-uploads` (persistent)
7. **Deploy** → klik **Deploy**. Build pertama ~5–10 menit (Rust compile).

#### Portal

1. **Services** → **+ Create Service** → **Application** → **Dockerfile**.
2. **Source**: GitHub repo, branch `main`, **Build Path**: `apps/portal`.
3. **General**:
   - Name: `portal`
   - Port: `3000`
4. **Domains**: `portal.insuretrack.id`.
5. **Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://api.insuretrack.id/api
   ```
6. **Deploy**.

#### Admin

Ulangi seperti Portal dengan:
- Build Path: `apps/admin`
- Port: `3001`
- Domain: `admin.insuretrack.id`
- Env: `NEXT_PUBLIC_API_URL=https://api.insuretrack.id/api`

### Step 7 — Setup R2 & Email

1. **Cloudflare R2**: Lihat `document/R2_SETUP.md` untuk setup lengkap. Set `R2_PUBLIC_BASE_URL=https://cdn.insuretrack.id` (custom domain di R2 bucket, atau pakai default `pub-xxx.r2.dev`).
2. **Resend**: Add domain `insuretrack.id`, setup DNS records (DKIM/SPF/DMARC), buat API key, set di backend env vars.

### Step 8 — Backup strategy

| Komponen | Backup tool | Frekuensi | Destination |
| --- | --- | --- | --- |
| Postgres | Dokploy built-in (S3-compatible) | Daily 02:00 | R2 bucket `insuretrack-backups` |
| Backend uploads | rsync / rclone | Weekly | R2 bucket `insuretrack-uploads-archive` |
| Dokploy config | Dokploy backup | Weekly | Local + R2 |
| Dokploy database (panel) | Built-in | Daily | Local |

R2 free tier 10 GB cukup untuk 6–12 bulan backup Postgres InsureTrack.

### Step 9 — Monitoring & update

- **Logs**: Dokploy panel → Service → Logs (real-time).
- **Resource monitor**: Dokploy panel → dashboard CPU/RAM/disk.
- **Uptime monitor**: UptimeRobot (free, 50 monitor) → cek setiap 5 menit.
- **Dokploy update**: SSH ke VM, jalankan `sudo dokploy update` (ikuti release notes).
- **OS update**: `unattended-upgrades` sudah auto-install security patches.
- **Container update**: Push ke `main` → Dokploy auto-rebuild & deploy (kalau auto-deploy on).

## 2.5 Pros & Cons

| ✅ Pros | ❌ Cons |
| --- | --- |
| **Kontrol penuh** — semua di 1 VPS, mudah di-debug | Single point of failure — kalau VPS down, semua down |
| **Cold start tidak ada** — backend selalu hidup | RAM terbatas di Azure B1ms (2 GB) — perlu monitoring |
| **Auto SSL + reverse proxy** built-in Traefik | Update security OS & Dokploy manual (atau cronjob) |
| **Database backup otomatis** ke R2 | Setup awal lebih lama (~2–3 jam vs ~1 jam Opsi 1) |
| **Biaya $0 dari student credit** | Butuh pengetahuan Linux dasar (firewall, swap, SSH) |
| Single dashboard (Dokploy) | Bandwidth VPS terbatas (Azure 100 GB free tier) |
| **Bisa multi-service** — tambah service lain gratis | Scale vertikal only (kalau mau HA, perlu cluster) |

---

# Perbandingan Head-to-Head

| Aspek | Opsi 1 (Full Free) | Opsi 2 (VPS + Dokploy) |
| --- | --- | --- |
| **Biaya bulanan** | $0 | $0 (dari $100 student credit Azure) |
| **Durasi dari $100 credit** | tidak pakai (semua free) | ~5–5.5 bln (B1ms) atau ~13 bln (B1s tight) |
| **Cold start** | Ya (Render 30–60 dtk) | Tidak ada |
| **Setup time** | 1–2 jam | 2–3 jam |
| **SSL** | Auto (Vercel + Cloudflare) | Auto (Traefik + Let's Encrypt) |
| **Custom domain** | Perlu config DNS Vercel | Built-in Dokploy |
| **Database** | Neon (managed, auto-backup 7 hari) | Self-managed Postgres di container, backup ke R2 |
| **Storage** | R2 (S3-compatible) | R2 (S3-compatible) |
| **Email** | Resend | Resend |
| **Monitoring** | Tergantung platform (Vercel/Render dashboards) | Dokploy panel + UptimeRobot |
| **Scalability** | Easy (upgrade plan) | Vertikal only (resize VM) |
| **Skill DevOps yang dipelajari** | Sedikit | Banyak (Linux, Docker, backup, security) |
| **Cocok untuk** | Demo, portfolio, side project | Production kecil, belajar DevOps |
| **Single dashboard** | ❌ (5+ platform) | ✅ (Dokploy) |

---

# Rekomendasi Berdasarkan Skenario

| Kamu seorang... | Pilih |
| --- | --- |
| **Mahasiswa** yang butuh deploy tugas akhir / side project cepat, biaya $0, tidak mau urus server | **Opsi 1** |
| **Mahasiswa** yang ingin belajar DevOps (Docker, Linux, backup, monitoring) sambil deploy | **Opsi 2 dengan Azure B1ms** |
| **Mahasiswa** yang punya Azure for Students + GitHub Student Pack + ingin paling murah | **Opsi 2 dengan Hetzner CX22** (€4.5/bln, pakai Azure credit untuk hal lain) |
| **Mahasiswa** yang mendapat slot Oracle Cloud free tier | **Opsi 2 di Oracle Cloud** (24 GB RAM gratis!) |
| **Developer** yang deploy untuk client kecil (< 1000 user aktif) | **Opsi 2 dengan Azure B1ms atau B2s** |
| **Tim startup** yang butuh production-grade dengan budget terbatas | **Opsi 2 dengan Azure B2s** ($30/bln) atau upgrade ke managed services |
| **Belajar cloud-native** (Kubernetes, CI/CD, IaC) | **Opsi 1** dulu → pelajari konsep, lalu migrasi ke Opsi 2 |

---

# Appendix

## A. Environment variables reference

Lihat `.env.example` di root repo. Production checklist:

- [ ] `JWT_SECRET` di-generate via `openssl rand -hex 64`
- [ ] `PAYMENT_WEBHOOK_SECRET` di-generate via `openssl rand -hex 32`
- [ ] `POSTGRES_PASSWORD` di-generate via `openssl rand -hex 24`
- [ ] `APP_BASE_URL` pakai HTTPS, bukan `http://`
- [ ] `RESEND_FROM_EMAIL` domain sudah di-verify di Resend
- [ ] `STORAGE_BACKEND=r2` di production
- [ ] `R2_*` semua ter-set dan valid
- [ ] `.env` di-add ke `.gitignore` (sudah default)

## B. Referensi cepat

- **Dokploy docs**: https://docs.dokploy.com
- **Neon docs**: https://neon.tech/docs
- **Render docs**: https://render.com/docs
- **Vercel docs**: https://vercel.com/docs
- **Cloudflare R2**: https://developers.cloudflare.com/r2
- **Resend docs**: https://resend.com/docs
- **Azure for Students**: https://azure.microsoft.com/en-us/free/students/
- **GitHub Student Developer Pack**: https://education.github.com/pack
- **Azure VM sizes**: https://learn.microsoft.com/en-us/azure/virtual-machines/sizes-b-series-burstable

## C. Dokploy command cheatsheet (SSH ke VM)

```bash
# Status semua container
docker ps

# Lihat log service
docker logs -f <container_id>

# Restart service tertentu
docker restart <container_id>

# Disk usage
docker system df
du -sh /var/lib/docker

# Cek resource real-time
htop

# Update Dokploy
sudo dokploy update

# Lihat Traefik logs (SSL/HTTPS issues)
docker logs -f dokploy-traefik
```

## D. Migrasi dari Opsi 1 → Opsi 2

1. Provision VPS + Dokploy.
2. Setup Postgres di Dokploy, export schema & data dari Neon:
   ```bash
   pg_dump "postgres://neondb_owner:PASS@ep-xxx...neon.tech/neondb?sslmode=require" \
     -F c -f backup.dump
   pg_restore -d "postgres://insurance_admin:PASS@postgres-host/digital_insurance" \
     --no-owner --no-acl backup.dump
   ```
3. Migrasi uploads dari R2 bucket (kalau beda account) → pakai `rclone sync`.
4. Update DNS records ke VPS IP.
5. Deploy services di Dokploy.
6. Decommission Render + Neon (setelah verify semua jalan).

---

**Pertanyaan atau ada step yang kurang jelas?** Update dokumen ini dan buka PR — sesuai [CONTRIBUTING.md](./CONTRIBUTING.md).
