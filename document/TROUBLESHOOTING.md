# InsureTrack — Troubleshooting Guide

Quick reference untuk error yang umum muncul saat deploy demo + development. Diorganisir by **gejala** (apa yang Anda lihat) → **diagnosa** (cek apa) → **fix** (langkah konkret).

> Untuk detail lengkap tentang deployment, lihat [`DEPLOY_QUICKSTART.md`](./DEPLOY_QUICKSTART.md) (mode demo) atau [`RUNBOOK_VPS_DEV.md`](./RUNBOOK_VPS_DEV.md) (deep dive).

---

## Daftar Isi

### Build & Deploy
- [Build gagal / hang](#build-gagal--hang)
- [Container restart loop](#container-restart-loop)
- [GitHub Actions workflow gagal](#github-actions-workflow-gagal)

### Network & DNS
- [sslip.io tidak resolve](#sslipio-tidak-resolve)
- [Browser `NET::ERR_CERT_AUTHORITY_INVALID`](#browser-neterr_cert_authority_invalid)
- [Traefik 502 Bad Gateway](#traefik-502-bad-gateway)
- [Port 80 tidak reachable dari internet](#port-80-tidak-reachable-dari-internet)

### Database
- [Backend `unhealthy` terus](#backend-unhealthy-terus)
- [Migration gagal apply](#migration-gagal-apply)
- [`password authentication failed`](#password-authentication-failed)

### Application
- [Landing page kosong (no products/clients)](#landing-page-kosong-no-productsclients)
- [Login admin gagal dengan credential benar](#login-admin-gagal-dengan-credential-benar)
- [Email tidak terkirim](#email-tidak-terkirim)
- [CORS error di browser console](#cors-error-di-browser-console)

### Operations
- [Cara baca log](#cara-baca-log)
- [Cara rollback](#cara-rollback)
- [Dokploy API tidak respond](#dokploy-api-tidak-respond)

---

## Build & Deploy

### Build gagal / hang

**Gejala:** `docker compose build` atau Dokploy deploy stuck / fail dengan error `failed to compute cache key`.

**Diagnosa:**
```bash
ssh ubuntu@<IP-VPS>
cd /etc/dokploy/applications/<service-name>/code
docker compose build 2>&1 | tail -50
```

**Penyebab umum & fix:**

| Error | Fix |
|---|---|
| `failed to compute cache key: "/path" not found` | Dockerfile reference path salah. Cek `docker compose build <service>` log detail. |
| `BuildKit: failed to solve: target not found` | Multi-stage build gagal. Cek `Dockerfile` line yang error. |
| `pnpm ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` | Root `pnpm-workspace.yaml` atau `package.json` tidak ter-COPY ke build context. Lihat [`DOCKER_SETUP.md`](./DOCKER_SETUP.md) §1. |
| Build context > 100 MB | `.dockerignore` corrupt. Verifikasi: `cat .dockerignore | head -20` di working directory. |
| Build hang di "Collecting build traces" (Next.js) | Image portal/admin gagal. Cek log — biasanya `pnpm install` OOM. Tambah memory limit atau pakai buildkit cache. |

**Recovery:**
```bash
# Bersih cache build lalu retry
docker builder prune -af
docker compose build --no-cache <service>
```

---

### Container restart loop

**Gejala:** `docker ps` menampilkan container dengan status `Restarting (1) X seconds ago`.

**Diagnosa:**
```bash
# Cek log container yang restart
docker logs <container_name> --tail 50

# Untuk backend spesifik
docker logs insuretrack_backend --tail 50 2>&1
```

**Penyebab umum & fix:**

| Container | Error di log | Fix |
|---|---|---|
| `insuretrack_backend` | `connection refused` ke `db:5432` | DB belum ready. Tunggu 30 detik, cek `docker logs insuretrack_db` (harus `database system is ready`). |
| `insuretrack_backend` | `DATABASE_URL` not set / invalid | Set env var di Dokploy atau perbaiki syntax. |
| `insuretrack_backend` | `JWT_SECRET` not set | Set di tab General/Secret Dokploy. |
| `insuretrack_backend` | `failed to bind socket: address in use` | Port 8080 sudah dipakai container lain. Cek `docker ps`. |
| `insuretrack_portal` / `insuretrack_admin` | `NEXT_PUBLIC_API_URL not set` saat build | Set di build args Dokploy, redeploy (image harus rebuild). |
| `insuretrack_db` | `initdb: error: directory "/var/lib/postgresql/data" exists but is not empty` | Volume corrupt. Reset: `docker compose down -v` lalu `up -d`. |

**Recovery pattern:**
```bash
# 1. Fix env var di Dokploy (UI)
# 2. Klik Redeploy di Dokploy
# 3. Pantau log sampai `(healthy)`

# Kalau masih loop setelah redeploy:
docker compose down <service>
docker compose up -d <service>
```

---

### GitHub Actions workflow gagal

**Gejala:** Workflow `Deploy Demo` di tab Actions GitHub muncul dengan status ❌ merah.

**Diagnosa:** Klik workflow run yang gagal → buka step yang ❌ merah → baca error.

**Common errors:**

#### `Missing Dokploy secrets`
```
::error::Missing Dokploy secrets. Setup di GitHub repo Settings → Secrets:
  - DOKPLOY_URL
  - DOKPLOY_API_KEY
  - DOKPLOY_COMPOSE_ID
```
**Fix:** Setup 3 secrets di GitHub repo → Settings → Secrets → Actions. Lihat [`DEPLOY_QUICKSTART.md` §5](./DEPLOY_QUICKSTART.md#5-setup-github-secrets-sekali).

#### `Dokploy API returned HTTP 401`
```
HTTP_STATUS:401
::error::Dokploy API returned HTTP 401
```
**Fix:** API key salah / expired. Regenerate di Dokploy panel → Settings → Profile → API → revoke old → create new → update `DOKPLOY_API_KEY` di GitHub Secrets.

#### `Dokploy API returned HTTP 404`
```
HTTP_STATUS:404
::error::Dokploy API returned HTTP 404
```
**Fix:** Compose ID salah. Cek URL service di Dokploy panel — ID biasanya `c-xxx` di akhir URL. Update `DOKPLOY_COMPOSE_ID` di GitHub Secrets.

#### `CI workflow tidak ditemukan`
```
Error: Cannot find workflow ci.yml
```
**Fix:** Workflow `ci.yml` harus sudah ada di `.github/workflows/`. Cek:
```bash
ls -la .github/workflows/
# Harus ada ci.yml dan deploy-demo.yml
```

#### `Health check gagal setelah 5 menit`
```
::error::Health check gagal setelah 5 menit
```
**Fix:** Lihat [§Backend unhealthy terus](#backend-unhealthy-terus). Cek `DEPLOY_HEALTH_URL` pointing ke URL yang benar dan accessible dari internet.

---

## Network & DNS

### sslip.io tidak resolve

**Gejala:** `curl https://portal.203-0-113-42.sslip.io` → `Could not resolve host` atau timeout.

**Diagnosa:**
```bash
# Test DNS resolution
nslookup portal.203-0-113-42.sslip.io 8.8.8.8
# Harus return IP VPS Anda

# Atau online: https://www.whatsmydns.net/#A/api.203-0-113-42.sslip.io
```

**Fix:**

| Hasil | Fix |
|---|---|
| Tidak ada jawaban | Format sslip.io salah. Cek: `203-0-113-42` pakai **dash** (`-`), bukan dot (`.`). Kalau IP Anda `203.0.113.42`, hostname jadi `203-0-113-42`. |
| Resolve ke IP lain | Anda pakai IP lama yang sudah berubah. Update `DOMAIN` di Dokploy env ke IP baru. |
| Resolve ke IP benar tapi curl timeout | Port 80/443 tidak reachable. Lihat [§Port 80 tidak reachable](#port-80-tidak-reachable-dari-internet). |
| Tidak resolve di belakang corporate VPN | DNS VPN block external. Test dari HP pakai data seluler. |

---

### Browser `NET::ERR_CERT_AUTHORITY_INVALID`

**Gejala:** Browser tampilkan "Your connection is not private" dengan error `NET::ERR_CERT_AUTHORITY_INVALID`.

**Diagnosa:** Anda akses pakai `https://...` tapi:
- SSL belum di-generate di Dokploy, ATAU
- sslip.io subdomain salah format, ATAU
- SSL cert generation gagal

**Fix:**
```bash
# Opsi A: Pakai http:// bukan https:// (kalau SSL belum ready)
# Opsi B: Cek SSL status di Dokploy
ssh -L 3000:localhost:3000 ubuntu@<IP-VPS>  # SSH tunnel
# Browser → http://localhost:3000 → service → tab Domains
# Lihat SSL status per domain — kalau "Generating" tunggu 1-2 menit
# Kalau "Failed" → klik "Generate" lagi
```

> sslip.io + Let's Encrypt butuh waktu 1-3 menit untuk issue cert. Kalau masih gagal setelah 5 menit, kemungkinan firewall outbound port 80 block ke Let's Encrypt.

---

### Traefik 502 Bad Gateway

**Gejala:** Akses URL → Traefik return "502 Bad Gateway".

**Diagnosa:**
```bash
ssh ubuntu@<IP-VPS>
docker ps  # semua harus (healthy)
docker logs dokploy-traefik --tail 30
```

**Fix:**

| Penyebab | Fix |
|---|---|
| Upstream container unhealthy | Tunggu 30-60 detik, Traefik retry otomatis. Cek `docker ps`. |
| `Host()` rule di label salah | Cek label Traefik di `docker-compose.yml` — pastikan host pattern match dengan domain yang Anda akses. |
| Port internal salah (mis. backend di 8081 bukan 8080) | Verifikasi `docker inspect insuretrack_backend | grep -A 5 "NetworkSettings"` — lihat port mapping. |
| Traefik sendiri restart | `docker restart dokploy-traefik` lalu tunggu 30 detik. |

---

### Port 80 tidak reachable dari internet

**Gejala:** `curl http://<IP-VPS>` timeout atau connection refused.

**Diagnosa:**
```bash
# Dari lokal
Test-NetConnection -ComputerName <IP-VPS> -Port 80  # PowerShell
# atau
nc -zv <IP-VPS> 80  # bash/Git Bash
```

**Fix:**

| Hasil | Fix |
|---|---|
| Connection refused | Traefik belum jalan atau down. `ssh ubuntu@<IP-VPS> && docker ps` — pastikan `dokploy-traefik` Up. |
| Timeout | Firewall VPS (`ufw`) atau cloud firewall block. |
| UFW allow sudah OK tapi masih timeout | Cloud firewall (Azure NSG / Hetzner SG) yang block. Lihat [`DEPLOY_QUICKSTART.md` §4.2](./DEPLOY_QUICKSTART.md). |

---

## Database

### Backend `unhealthy` terus

**Gejala:** `docker ps` menampilkan `insuretrack_backend` dengan status `Up X minutes (unhealthy)`.

**Diagnosa:**
```bash
docker logs insuretrack_backend --tail 30
```

**Common errors & fix:**

#### `connection to server at "db" (172.x.x.x), port 5432 failed: Connection refused`
DB belum ready. Cek:
```bash
docker logs insuretrack_db --tail 30
# Harus ada: "database system is ready to accept connections"
# Kalau tidak ada, tunggu atau restart db: docker compose restart db
```

#### `FATAL: password authentication failed for user "postgres"`
`POSTGRES_PASSWORD` di backend env beda dengan di db env. Pastikan:
```env
POSTGRES_PASSWORD=xxx
DATABASE_URL=postgres://postgres:xxx@db:5432/insuretrack_demo
```
Password di kedua tempat harus sama.

#### `database "insuretrack_demo" does not exist`
Database belum di-create. Cek:
```bash
docker exec insuretrack_db psql -U postgres -l  # list databases
# Harus ada insuretrack_demo
```

Kalau tidak ada, tambahkan ke `docker-compose.yml` db env atau create manual:
```bash
docker exec insuretrack_db psql -U postgres -c "CREATE DATABASE insuretrack_demo;"
docker compose restart backend  # trigger migrations apply
```

---

### Migration gagal apply

**Gejala:** Backend log menampilkan error SQL saat startup. Migration tidak applied.

**Diagnosa:**
```bash
docker logs insuretrack_backend --tail 50 | grep -i migration
docker exec insuretrack_db psql -U postgres -d insuretrack_demo \
  -c "SELECT version, description, success FROM _sqlx_migrations ORDER BY version;"
```

**Fix:**

#### `relation "xxx" already exists`
Migration sebelumnya sudah applied. sqlx skip kalau ada di `_sqlx_migrations`. Cek apakah file SQL yang baru Anda tulis bentrok.

#### `syntax error at or near "xxx"`
Bug di SQL migration. Edit `apps/backend/migrations/NNNN_*.sql`, perbaiki syntax.

⚠️ **PENTING:** Jangan edit migration yang sudah pernah applied ke DB production. Tambah file baru dengan nomor berikutnya (NNNN+1).

#### `column "xxx" does not exist`
Migration lama reference column yang dihapus. Tambah migration ALTER TABLE.

---

### `password authentication failed`

**Gejala:** Backend tidak bisa connect ke DB dengan credential apapun.

**Fix:**
```bash
# 1. Cek env di container
docker exec insuretrack_backend env | grep DATABASE_URL
docker exec insuretrack_db env | grep POSTGRES_PASSWORD

# 2. Test manual connection dari dalam container backend
docker exec insuretrack_backend sh -c 'psql "$DATABASE_URL" -c "SELECT 1;"'
# Kalau gagal, password tidak match.

# 3. Sync password di Dokploy env
# 4. Restart: docker compose restart backend
```

---

## Application

### Landing page kosong (no products/clients)

**Gejala:** Portal load tapi section produk / klien / testimoni kosong atau loading terus.

**Diagnosa:**
```bash
# 1. Cek dari dalam container portal
docker exec insuretrack_portal sh -c 'wget -qO- http://backend:8080/api/public/products || echo "BACKEND_URL NOT WORKING"'
```

**Fix:**

| Hasil | Fix |
|---|---|
| `bad address` atau connection refused | `BACKEND_URL` tidak di-set di Dokploy env. Set `BACKEND_URL=http://backend:8080` lalu redeploy. |
| Return JSON valid | Next.js fetch dari SSR pakai URL salah. Verifikasi `BACKEND_URL` di-set dan `docker compose restart portal`. |
| Timeout | Backend slow/down. Cek `docker logs insuretrack_backend`. |

> Tanpa `BACKEND_URL`, Next.js SSR pakai `NEXT_PUBLIC_API_URL` (public URL). Dari dalam container, `api.203-0-113-42.sslip.io` tidak resolve. Bug silent — tidak ada error log, hanya page kosong.

---

### Login admin gagal dengan credential benar

**Gejala:** `POST /api/admin/login` dengan `admin/admin123` return 401.

**Diagnosa:**
```bash
# Cek user ada di DB
docker exec insuretrack_db psql -U postgres -d insuretrack_demo \
  -c "SELECT username, created_at FROM admin_users;"
```

**Fix:**

| Hasil | Fix |
|---|---|
| User tidak ada | DB di-reset. Re-apply seed: jalankan `cargo run --bin seed -- --reset` di lokal, atau insert manual via psql. |
| User ada, hash beda | Password hash di DB bukan `argon2id$admin123`. Reset manual (lihat §Reset Admin Password). |
| Token JWT invalid | `JWT_SECRET` di backend berubah. Cek log: `jwt encode failed` atau `jwt decode failed`. |

#### Reset Admin Password
```bash
# Generate hash baru (butuh tool eksternal)
# Mis. via Python: pip install argon2-cffi
python -c "
from argon2 import PasswordHasher
ph = PasswordHasher()
print(ph.hash('admin123'))
"
# Output: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>

# Update DB
docker exec insuretrack_db psql -U postgres -d insuretrack_demo -c "
UPDATE admin_users
SET password_hash = '\$argon2id\$v=19\$m=65536,t=3,p=4\$<salt>\$<hash>'
WHERE username = 'admin';
"
```

---

### Email tidak terkirim

**Gejala:** Registration berhasil tapi customer tidak terima email aktivasi.

**Diagnosa:**
```bash
# Cek email_logs
docker exec insuretrack_db psql -U postgres -d insuretrack_demo \
  -c "SELECT recipient, email_type, status, error_message FROM email_logs ORDER BY sent_at DESC LIMIT 5;"
```

**Fix:**

| Status di email_logs | Fix |
|---|---|
| `QUEUED` selamanya | Backend tidak call Resend. Cek `RESEND_API_KEY` env. Kalau kosong = demo mode (expected). |
| `FAILED` dengan error `401 Unauthorized` | Resend API key salah. Generate baru di https://resend.com/api-keys. |
| `FAILED` dengan error `domain not verified` | `RESEND_FROM_EMAIL` domain belum diverifikasi di Resend dashboard. Untuk demo, pakai `onboarding@resend.dev` (Resend default testing address). |
| `SENT` tapi email tidak masuk | Cek spam folder. Tunggu 5 menit (Resend kadang delay). Verifikasi recipient email benar. |

**Workaround untuk demo:** Set `RESEND_API_KEY=` (kosong) → backend log warning tapi flow lain tetap jalan. Customer tidak terima email, tapi bisa langsung login kalau sudah punya credential.

---

### CORS error di browser console

**Gejala:** Browser DevTools console menampilkan:
```
Access to fetch at 'https://api.xxx.sslip.io' from origin 'https://portal.xxx.sslip.io'
has been blocked by CORS policy
```

**Diagnosa:** Backend pakai CORS layer (`CorsLayer::permissive()` di `main.rs`). Seharusnya allow semua origin.

**Fix:**
```bash
# Cek backend log — biasanya tidak ada error CORS.
# Lebih sering masalahnya: HTTPS mismatch (mixed content).

# Opsi 1: Pastikan semua surface pakai protocol sama
# Portal: https://portal.xxx.sslip.io
# API: https://api.xxx.sslip.io
# Mixed (portal HTTPS, API HTTP) = browser block

# Opsi 2: Kalau pakai HTTP-only, set CORS headers manual
# (kontak dev untuk custom layer)
```

**Untuk mode demo dengan sslip.io + HTTPS**, CORS harusnya otomatis OK karena:
1. Backend `CorsLayer::permissive()` allow semua origin
2. Semua hostname di bawah `.sslip.io` (same parent domain)
3. Browser izinkan cross-origin fetch kalau HTTPS-HTTPS

Kalau masih error, kemungkinan besar adalah mixed-content (HTTPS page fetch HTTP endpoint) — fix dengan upgrade semua ke HTTPS.

---

## Operations

### Cara baca log

#### Real-time tail
```bash
ssh ubuntu@<IP-VPS>

# Backend (paling penting untuk debug API errors)
docker logs -f insuretrack_backend

# Portal (frontend logs)
docker logs -f insuretrack_portal

# Admin
docker logs -f insuretrack_admin

# Database
docker logs -f insuretrack_db

# Traefik (lihat routing)
docker logs -f dokploy-traefik
```

#### Filter error only
```bash
docker logs insuretrack_backend 2>&1 | grep -iE 'error|warn|fail' | tail -50
```

#### Timestamp range
```bash
# Logs dari 1 jam terakhir
docker logs --since "1h" insuretrack_backend

# Logs antara 14:00 - 15:00 hari ini
docker logs --since "2026-06-18T14:00:00" --until "2026-06-18T15:00:00" insuretrack_backend
```

#### Save log untuk di-share
```bash
docker logs insuretrack_backend --since "2h" > backend-log.txt
# Attach ke GitHub issue / kirim ke support
```

---

### Cara rollback

#### Rollback ke commit sebelumnya (Dokploy)
```bash
# SSH tunnel ke panel
ssh -L 3000:localhost:3000 ubuntu@<IP-VPS>

# Browser → http://localhost:3000
# → Project → Service → tab "Deployments"
# → Pilih deployment working sebelumnya → klik "Redeploy"
```

Atau via GitHub Actions (kalau sudah ada commit lama yang working):
```bash
# Revert commit di lokal
git revert HEAD
git push origin main
# → CI run → deploy dengan kode lama
```

#### Rollback DB schema
Lihat [`DEPLOY_QUICKSTART.md` §8.2](./DEPLOY_QUICKSTART.md).

#### Nuclear: full reset
```bash
ssh ubuntu@<IP-VPS>
cd /etc/dokploy/applications/<service-name>/code
docker compose down -v   # HAPUS semua data + image
docker compose up -d --build
# DB fresh, migrations re-applied dari awal
```

---

### Dokploy API tidak respond

**Gejala:** GitHub Actions atau curl ke `http://<IP-VPS>:3000/api/...` timeout atau connection refused.

**Diagnosa:**
```bash
# Test API manual
curl -sS -w "\nHTTP:%{http_code}" -H "x-api-key: <your-key>" \
  "http://<IP-VPS>:3000/api/project.all"

# Kalau 404 — endpoint salah
# Kalau 401 — API key salah/expired
# Kalau timeout — Dokploy panel down atau port 3000 tidak reachable
```

**Fix:**

| Hasil | Fix |
|---|---|
| Connection refused | Port 3000 di-tutup (per hardening §4.4). Test dari dalam VPS langsung via SSH + localhost. |
| 401 Unauthorized | API key expired. Regenerate di panel → update GitHub Secret. |
| 404 Not Found | Endpoint path salah. Cek https://docs.dokploy.com/docs/api/reference-compose |
| Connection timeout | Dokploy container down. `ssh ubuntu@<IP-VPS> && docker ps \| grep dokploy`. |

---

## Quick Diagnostic Commands

Copy-paste satu blok untuk full diagnostic:

```bash
# === Dari VPS, via SSH ===
ssh ubuntu@<IP-VPS>

# Container status
echo "=== CONTAINER STATUS ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Last 10 lines each container
echo "=== BACKEND LOG (last 10) ==="
docker logs insuretrack_backend --tail 10 2>&1
echo "=== PORTAL LOG (last 10) ==="
docker logs insuretrack_portal --tail 10 2>&1
echo "=== ADMIN LOG (last 10) ==="
docker logs insuretrack_admin --tail 10 2>&1
echo "=== DB LOG (last 10) ==="
docker logs insuretrack_db --tail 10 2>&1
echo "=== TRAEFIK LOG (last 10) ==="
docker logs dokploy-traefik --tail 10 2>&1

# Database connectivity
echo "=== DB TABLES ==="
docker exec insuretrack_db psql -U postgres -d insuretrack_demo -c "\dt" 2>&1
echo "=== MIGRATIONS ==="
docker exec insuretrack_db psql -U postgres -d insuretrack_demo -c "SELECT version, success FROM _sqlx_migrations ORDER BY version;" 2>&1
echo "=== ADMIN USERS ==="
docker exec insuretrack_db psql -U postgres -d insuretrack_demo -c "SELECT username, role FROM admin_users;" 2>&1

# Backend health dari dalam VPS
echo "=== BACKEND HEALTH ==="
docker exec insuretrack_backend wget -qO- http://localhost:8080/health 2>&1
echo ""
echo "=== TRAEFIK ROUTING (test Host headers) ==="
curl -sS -o /dev/null -w "Host=api → %{http_code}\n" -H "Host: api.203-0-113-42.sslip.io" http://localhost/
curl -sS -o /dev/null -w "Host=portal → %{http_code}\n" -H "Host: portal.203-0-113-42.sslip.io" http://localhost/
curl -sS -o /dev/null -w "Host=admin → %{http_code}\n" -H "Host: admin.203-0-113-42.sslip.io" http://localhost/
```

Save output ini ke file dan share ke tim support kalau perlu debug.

---

## Referensi Cepat

| Topik | File |
|---|---|
| Quickstart (demo, single env, IP/sslip.io) | [`DEPLOY_QUICKSTART.md`](./DEPLOY_QUICKSTART.md) |
| Deep dive VPS Dev + HTTP-only | [`RUNBOOK_VPS_DEV.md`](./RUNBOOK_VPS_DEV.md) |
| Production deployment | [`DEPLOYMENT.md`](./DEPLOYMENT.md) |
| Docker troubleshooting | [`DOCKER_SETUP.md`](./DOCKER_SETUP.md) |
| Spec aplikasi | `Technical Specification Document Digital Insurance v1.2.pdf` |
| Dokploy API docs | https://docs.dokploy.com/docs/api |
| Traefik docs | https://doc.traefik.io/traefik/ |

---

**Maintainer:** tim InsureTrack · **Update terakhir:** 2026-06-18
