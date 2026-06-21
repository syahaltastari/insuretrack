# InsureTrack — Cloudflare R2 Setup Guide

**Tanggal:** 2026-06-09
**Status:** 🟡 Guide — R2 dipakai untuk file upload (KTP, claim docs, e-policy PDF, invoice PDF). Default development pakai `local` storage (Docker volume). Panduan ini untuk setup **R2 production** atau **R2 dev/staging** kalau butuh storage persisten di luar container.

---

## TL;DR — Kenapa R2?

Backend punya 2 storage backend (lihat `apps/backend/src/services/storage.rs`):

| Backend | Env | Lokasi file | Use case |
| --- | --- | --- | --- |
| `local` | `STORAGE_BACKEND=local` | Docker volume `backend_uploads` → mount `/var/uploads` | Development, demo lokal |
| `r2` | `STORAGE_BACKEND=r2` | Cloudflare R2 (S3-compatible) | Production, staging, multi-host |

File yang disimpan lewat storage abstraction: **KTP customer, claim documents, e-policy PDF, invoice PDF, logo klien, foto testimoni** (lihat `Storage` trait di `storage.rs:36–71`).

R2 dipilih karena:
- S3-compatible API (pakai `aws-sdk-s3` di Rust, no SDK proprietary)
- Egress **gratis** (beda dari S3 yang charge per GB keluar)
- 10 GB free tier / bulan (cukup untuk dev/staging)
- Integrasi native sama Cloudflare (kalau frontend juga di-deploy di Cloudflare)

---

## 1. Prasyarat

1. **Akun Cloudflare** — daftar di https://dash.cloudflare.com/sign-up (free tier cukup untuk mulai).
2. **R2 subscription aktif** — Cloudflare sekarang minta kartu kredit untuk aktifkan R2 (walau free tier tidak charge). Buka https://dash.cloudflare.com → sidebar **R2** → klik **"Subscribe to R2"** → masukkan payment method.
3. **Domain custom** (opsional, hanya kalau mau serve file publik via domain sendiri, mis. `cdn.insuretrack.com`).

> **Note:** Free tier R2: 10 GB storage, 10 juta Class A requests, 10 juta Class B requests, **egress gratis** per bulan. Untuk dev/staging, ini lebih dari cukup.

---

## 2. Setup Step-by-Step

### 2.1. Dapatkan Account ID

1. Login ke https://dash.cloudflare.com
2. Scroll ke bawah di sidebar kanan — ada bagian **"Account ID"** di bagian "API"
3. Klik **"Click to copy"** — simpan sebagai `R2_ACCOUNT_ID`

Contoh format: `32c2b49351beccd95110065674eed9b7` (32 hex char)

### 2.2. Buat Bucket

1. Di sidebar Cloudflare, klik **R2** → **"Create bucket"**
2. Isi nama bucket, misal `insuretrack-uploads` atau `insuretrack-prod`
3. Pilih **Location**: biarkan default (auto) atau pilih region spesifik (lebih cepat kalau pilih region terdekat)
4. Klik **"Create bucket"**
5. **Simpan nama bucket** — ini jadi `R2_BUCKET`

> **Naming tip:** Pakai prefix environment agar mudah dipisah, mis. `insuretrack-prod`, `insuretrack-staging`, `insuretrack-dev`. Jangan share bucket antar environment.

### 2.3. Buat API Token (Access Key + Secret)

> **PENTING:** Jangan pakai Global API Key Cloudflare — itu privilege terlalu tinggi. Pakai **R2 API Token** yang scope-nya cuma ke R2.

1. Di sidebar R2, klik **"Manage R2 API Tokens"** (atau https://dash.cloudflare.com/?to=/:account/r2/api-tokens)
2. Klik **"Create API token"**
3. Isi form:
   - **Token name:** `insuretrack-backend-dev` (atau nama descriptive)
   - **Permissions:** pilih **"Object Read & Write"** (cukup untuk upload KTP/PDF + read kembali untuk email attachment & download endpoint)
   - **Bucket scope:** pilih **"Apply to specific buckets only"** → pilih bucket dari §2.2
   - **TTL (opsional):** bisa set expiry date untuk security rotation
4. Klik **"Create API token"**
5. **Halaman konfirmasi muncul sekali** — copy dua nilai ini sebelum navigasi keluar (nanti tidak bisa lihat `Secret Access Key` lagi):
   - **Access Key ID** → simpan sebagai `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → simpan sebagai `R2_SECRET_ACCESS_KEY`
6. Klik **"Finish"**

> **Security:** Simpan kedua key di password manager / secrets vault, **JANGAN** commit ke git. Backend baca dari `.env` (yang sudah di-ignore oleh `.gitignore`).

### 2.4. (Opsional) Setup Public Access untuk File

Backend serve file upload lewat authorized endpoint (`GET /api/public/uploads/{key}`) — jadi public bucket **TIDAK WAJIB** untuk development. Tapi untuk production yang perlu serve file langsung (mis. `<img src="...">` di email), ada 2 opsi:

#### Opsi A: r2.dev subdomain (paling cepat)

1. Buka bucket yang baru dibuat
2. Tab **"Settings"** → scroll ke **"Public access"**
3. Klik **"Allow Access"** → pilih **"Connect a custom domain"** atau **"Use the r2.dev subdomain"**
4. Kalau pilih r2.dev: copy URL yang muncul, mis. `https://pub-f6d6c0760ea040c297d6592bb2eab104.r2.dev`
5. Set sebagai `R2_PUBLIC_BASE_URL`

#### Opsi B: Custom domain (production)

1. Beli / pakai domain yang sudah ada di Cloudflare
2. Di bucket Settings → Public access → **"Connect domain"**
3. Pilih zone (domain) → masukkan subdomain, mis. `cdn.insuretrack.com`
4. Cloudflare otomatis setup CNAME + proxy
5. Set `R2_PUBLIC_BASE_URL=https://cdn.insuretrack.com`

> **Verify:** Setelah enable, coba buka `https://<r2-dev-url>/<bucket-name>/<some-file>` di browser — kalau ada file di dalam, harusnya muncul. Kalau 404, cek nama bucket di URL path.

### 2.5. Update `.env`

Edit root `.env` (yang dipakai oleh `docker-compose.yml` lewat `env_file`):

```bash
# Ganti dari:
STORAGE_BACKEND=local

# Ke:
STORAGE_BACKEND=r2

# R2 credentials (dari §2.1, §2.3, §2.4)
R2_ACCOUNT_ID=32c2b49351beccd95110065674eed9b7      # ← Account ID
R2_ACCESS_KEY_ID=abc123def456...                     # ← dari API token
R2_SECRET_ACCESS_KEY=cfut_GLKsSqiUpl3UXmwE...       # ← dari API token
R2_BUCKET=insuretrack-dev                            # ← nama bucket
R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev            # ← opsional, untuk public URL
```

> **Lokasi `.env`:** `D:\01.Job\pt-ama-salam-indonesia\02.project\insuretrack\.env` (sudah di-ignore `.gitignore`).

> **Beda `.env` host vs Docker:**
> - **Docker mode** (default lewat `docker compose up`): pakai **root `.env`** via `env_file: - .env` di `docker-compose.yml`.
> - **Host mode** (langsung `cargo run` di `apps/backend/`): pakai **`apps/backend/.env`**. Untuk host mode, set `R2_*` di file yang sama.
>
> Dua env ini independent — pastikan sinkron kalau switch mode.

### 2.6. Restart Backend

```bash
docker compose up -d --force-recreate backend
```

Backend harus log `initializing storage backend: r2` (bukan `local`). Cek:

```bash
docker logs insurance_backend --tail 10
```

Expected:
```
INFO initializing storage backend: r2
INFO insuretrack-backend listening on 0.0.0.0:8080
```

Kalau muncul error, lihat §4 Troubleshooting.

---

## 3. Verifikasi End-to-End

### 3.1. Smoke test: submit registrasi insurance

1. Buka `http://localhost:3000/portal/register` → daftar akun baru
2. Aktifkan via email
3. Login → `http://localhost:3000/portal/insurance/new`
4. Isi form + upload KTP (JPG/PNG/PDF, max 5 MB)
5. Klik **"Daftar & Buat Invoice"**

**Expected:**
- Submit sukses (tidak 500)
- Di dashboard R2 (https://dash.cloudflare.com → R2 → bucket), ada file baru:
  - `ktp/<customer-uuid>/<filename>` (KTP yang diupload)
  - `invoices/<invoice-uuid>.pdf` (invoice PDF yang di-generate)

### 3.2. Cek log backend

```bash
docker logs insurance_backend --tail 30
```

Kalau ada error `r2 put_object: service error` atau `r2 get_object: 403 Forbidden`, lihat §4.

### 3.3. Test download file

Backend serve file lewat `GET /api/public/uploads/{key}` (lihat `services/storage.rs:188–193` untuk local, atau `public_url` method untuk R2).

Atau kalau `R2_PUBLIC_BASE_URL` di-set, coba langsung:
```
curl -I "https://pub-xxx.r2.dev/insuretrack-dev/ktp/<uuid>/file.jpg"
```

Harusnya return 200 dengan `Content-Type: image/jpeg`.

---

## 4. Troubleshooting

### Error: `r2 put_object: service error`

Backend log:
```
ERROR internal error error=r2 put_object: service error
ERROR response failed classification=Status code: 500 Internal Server Error
```

**Penyebab umum (urutkan likelihood):**

| # | Penyebab | Cek |
| --- | --- | --- |
| 1 | **Access Key expired / di-revoke** | Buka R2 → API Tokens → cek token masih active. Kalau TTL-nya lewat, bikin baru. |
| 2 | **Secret Access Key salah** | Re-copy dari Cloudflare dashboard (kalau hilang, hapus token lama + bikin baru) |
| 3 | **Bucket tidak ada / salah nama** | Cek nama bucket di R2 dashboard. Case-sensitive! |
| 4 | **Token scope tidak cover bucket** | Di R2 API Tokens → cek "Bucket scope" = "Apply to specific buckets only" → include bucket yang dipakai. Kalau pilih "All buckets", harusnya aman. |
| 5 | **Account ID salah** | Re-copy dari Cloudflare sidebar. Bandingkan dengan URL dashboard. |
| 6 | **R2 subscription belum aktif** | R2 butuh kartu kredit di file. Cek billing. |
| 7 | **Network egress blocked** | Kalau backend di-firewall ketat, allow outbound ke `*.r2.cloudflarestorage.com` (port 443). |

**Debug steps:**

```bash
# Test creds manual pakai AWS CLI (R2 = S3-compatible)
aws s3api put-object \
  --bucket insuretrack-dev \
  --key test.txt \
  --body /tmp/test.txt \
  --endpoint-url https://<account_id>.r2.cloudflarestorage.com

# Kalau error "InvalidAccessKeyId" → secret/access salah
# Kalau error "NoSuchBucket" → nama bucket salah
# Kalau error "SignatureDoesNotMatch" → secret salah
# Kalau error "Forbidden" → token scope tidak cover bucket / subscription belum aktif
```

### Error: `r2 get_object: 403 Forbidden`

Biasanya muncul waktu read file yang sudah di-upload. Cek:
- Bucket setting: **"Public access"** masih enabled kalau pakai `R2_PUBLIC_BASE_URL`
- Token punya permission **"Object Read & Write"** (bukan cuma "Object Write")
- File key benar (cek di R2 dashboard → bucket → file list)

### Error: backend refuse start — "R2_ACCOUNT_ID wajib di-set"

Set `STORAGE_BACKEND=local` kalau belum siap setup R2. Backend hard-fail kalau `r2` dipilih tapi env vars kosong (lihat `config.rs:75–87`).

### File upload jalan, tapi `<img>` di email broken

Set `R2_PUBLIC_BASE_URL` atau pakai custom domain. Backend generate URL lewat `Storage::public_url(key)` (lihat `storage.rs:321–327`).

Kalau tidak di-set, `public_url` return `None` dan backend serve via `GET /api/public/uploads/{key}` — masih bisa dipakai tapi harus authenticated.

---

## 5. Security Best Practices

1. **TTL di API token** — set expiry date (mis. 90 hari) supaya credential rotation otomatis. R2 API Tokens support ini.
2. **Bucket scope minimum** — kalau backend cuma butuh 1 bucket, scope token ke bucket itu saja (jangan "All buckets").
3. **Jangan share token antar environment** — dev / staging / prod masing-masing punya token sendiri.
4. **Audit log Cloudflare** — aktifkan audit log di Cloudflare dashboard untuk track siapa akses R2 API.
5. **Encryption at rest** — R2 encrypt by default (AES-256). Tidak perlu setup tambahan.
6. **Backend `.env` di git-ignore** — root `.env` dan `apps/backend/.env` keduanya harus di `.gitignore`. Verify:
   ```bash
   git check-ignore .env apps/backend/.env
   ```
   Harusnya keduanya return path (ignored).

---

## 6. Migrasi dari Local ke R2

Kalau sudah ada file di `local` storage (volume `backend_uploads`) dan mau migrasi ke R2:

1. **Setup R2** (jalankan §1–§2)
2. **Sync file existing:**
   ```bash
   # Dari host, copy isi volume ke R2 pakai rclone
   docker run --rm -v insuretrack_backend_uploads:/data \
     rclone/rclone sync /data r2:insuretrack-prod \
     --s3-endpoint https://<account_id>.r2.cloudflarestorage.com \
     --s3-access-key-id $R2_ACCESS_KEY_ID \
     --s3-secret-access-key $R2_SECRET_ACCESS_KEY
   ```
3. **Update path di database** — kolom `id_card_path` & `pdf_path` di tabel customers/invoices/policies menyimpan key (mis. `ktp/<uuid>/file.jpg`). Key tetap valid di R2, jadi **tidak perlu update DB**.
4. **Switch backend ke R2** (set `STORAGE_BACKEND=r2` di `.env`, restart)
5. **Verify** dengan submit registration baru + cek file muncul di R2 dashboard

> **Rollback plan:** Set `STORAGE_BACKEND=local` lagi kalau ada masalah. Backend baca dari env var setiap startup, jadi switch bisa instant.

---

## 7. Referensi

- **Cloudflare R2 docs:** https://developers.cloudflare.com/r2/
- **R2 pricing:** https://developers.cloudflare.com/r2/pricing/
- **S3 API compat:** https://developers.cloudflare.com/r2/api/s3/api/
- **Backend code:** `apps/backend/src/services/storage.rs` (lihat `R2Storage` impl di line 200)
- **Config loader:** `apps/backend/src/config.rs` (lihat validation R2 env di line 75–87)
- **Existing DOCKER_SETUP:** `document/operations/DOCKER_SETUP.md` (note tentang R2 secrets di line 29 & 98)
- **Env template:** `.env.example` (line 56–62)
