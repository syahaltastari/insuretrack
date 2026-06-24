# Smoke Checklist — Cookie Auth Migration

Migration dari `Authorization: Bearer <jwt>` di localStorage ke httpOnly
cookie + double-submit CSRF di-tag sebagai complete di Phase 1-10
(commit ref `refactor(auth): migrate to httpOnly cookie + CSRF`).
Smoke verification di-bawah adalah **verifikasi end-to-end manual** yang
harus dijalankan di staging sebelum deploy production.

## Dev mode — Next.js rewrites

`apps/{portal,admin}/next.config.ts` punya blok `rewrites` yang aktif
di **dev mode only** (saat `NODE_ENV !== "production"`). Rewrite
mem-proxy `http://localhost:3000/api/*` → `http://localhost:8080/api/*`
sehingga browser FE di :3000 fetch ke same-origin (FE host), dan
`Set-Cookie` response dari backend di-apply ke FE origin
(`localhost:3000`).

**Kenapa perlu**: tanpa rewrite, browser FE :3000 fetch langsung ke
backend :8080 — `Set-Cookie` di-apply ke `localhost:8080` (host-only).
FE di :3000 baca `document.cookie` → cookie tidak ada → `hasSessionCookie()`
return false → `PortalShell` redirect ke login. Loop.

**Setup**:
- `NEXT_PUBLIC_API_URL=/api` di `.env` (default — pakai proxy mode)
- Override ke `http://localhost:8080/api` kalau perlu debug backend
  langsung (tapi expect login flow break karena cookie tidak visible
  di FE origin)

**Production**: tidak perlu rewrite — Traefik route FE di `portal.X`
dan BE di `api.X`, cookie `Domain=.X` share cross-subdomain. `rewrites`
di `next.config.ts` di-skip karena `NODE_ENV=production`.

## Status

| Layer | Automated Test | Status |
|---|---|---|
| Backend — JWT issue/verify | `apps/backend/src/auth/jwt.rs` unit (3 test) | ✅ |
| Backend — CSRF middleware | `apps/backend/tests/csrf.rs` (6 test) | ✅ |
| Backend — Login/Logout/Auth flow (admin + customer) | `apps/backend/tests/admin_customers.rs`, `claims.rs`, `inquiry_thread.rs` (semua migrated ke cookie) | ✅ 133/133 |
| Frontend — `apiFetch` CSRF auto-attach | `packages/api-client/src/api.test.ts` (19 test) | ✅ |
| Frontend — Login form drop `setXToken` | e2e `auth-cookie.spec.ts` (form rendering) | ✅ |
| Frontend — Cookie attributes (HttpOnly, SameSite) | e2e `auth-cookie.spec.ts` (dengan backend) | ✅ |
| Frontend — Logout button | e2e `auth-cookie.spec.ts` (dengan backend) | ✅ |
| Middleware — Unauthed redirect | e2e `auth-cookie.spec.ts` | ✅ |
| Browser — Manual visual check | **Manual smoke** (di bawah) | ⏳ |

Backend tests sudah pass 133/133 (`cargo test`). E2E Playwright test
sudah ditulis di `e2e/auth-cookie.spec.ts` — auto-skip kalau backend
tidak running, jadi aman dijalankan di CI tanpa backend.

## Prerequisites

```bash
# 1. Backend running di :8080
cd apps/backend && cargo run

# 2. Database seeded (default admin 'admin' / 'admin123' dari 0004_seed.sql)
#    + minimal 1 customer (lihat setup di bawah).
```

## Setup customer untuk test

Backend tests pakai `argon2id$placeholder` (fake hash), jadi untuk
manual smoke perlu customer sungguhan. Buat via API:

```bash
# Register customer (PENDING)
curl -sX POST http://localhost:8080/api/public/customers \
  -H 'Content-Type: application/json' \
  -d '{
    "nik": "3201010101010001",
    "full_name": "Smoke Tester",
    "birth_place": "Jakarta",
    "birth_date": "1990-01-01",
    "gender": "MALE",
    "address": "Jl. Test 1",
    "rt_rw": "001/002",
    "village": "Kelurahan",
    "district": "Kecamatan",
    "city": "Jakarta",
    "province": "DKI Jakarta",
    "postal_code": "12345",
    "email": "smoke-tester@example.com",
    "mobile_number": "081234567890",
    "password": "Test1234!"
  }'
# Response: {"id":"...","email":"smoke-tester@example.com",...}

# Activate via psql (simulasi klik link aktivasi) — ambil activation token
# via psql atau endpoint backend. Untuk test ini, set password_hash
# langsung + portal_status='ACTIVE' via psql.
psql -U postgres -d insuretrack -c \
  "UPDATE customers SET portal_status='ACTIVE' WHERE email='smoke-tester@example.com';"
```

## Test cases

### 1. Login sets correct cookies

```bash
# Login sebagai admin
curl -isX POST http://localhost:8080/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | head -20
```

Expected response headers:
```
HTTP/1.1 200 OK
Set-Cookie: insuretrack_session=<jwt>; HttpOnly; Secure?; SameSite=Lax; Path=/; Max-Age=28800
Set-Cookie: insuretrack_csrf=<random>; Secure?; SameSite=Lax; Path=/; Max-Age=28800
Content-Type: application/json
```

Verify:
- [ ] `insuretrack_session` ada + `HttpOnly`
- [ ] `insuretrack_csrf` ada + TIDAK `HttpOnly`
- [ ] Keduanya `SameSite=Lax`
- [ ] Keduanya `Path=/`
- [ ] `Max-Age=28800` (= 8h, sama dengan JWT TTL)
- [ ] Response body `{role, id, is_super_admin}` — TIDAK ada `token` field

### 2. Session cookie works on subsequent requests

```bash
# Save cookies from login
COOKIE_JAR=$(curl -sX POST http://localhost:8080/api/admin/login \
  -H 'Content-Type: application/json' \
  -c - -d '{"username":"admin","password":"admin123"}' \
  -o /dev/null)

# Use session cookie
curl -s http://localhost:8080/api/admin/me -H "Cookie: $COOKIE_JAR" | jq .
```

Expected: 200 dengan `{id, username, full_name, role, ...}`.

### 3. CSRF guard blocks mutating without X-CSRF-Token

```bash
# PATCH tanpa CSRF token → 403
curl -sX PATCH http://localhost:8080/api/admin/me \
  -H "Cookie: $COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Should Fail"}' -w "\n%{http_code}\n"
```

Expected: **403** dengan `{"error":{"code":"FORBIDDEN","message":"..."}}`.

### 4. CSRF guard passes with matching X-CSRF-Token

```bash
# Ambil csrf cookie value
CSRF=$(echo "$COOKIE_JAR" | grep insuretrack_csrf | awk '{print $7}')

# PATCH dengan CSRF token → 200
curl -sX PATCH http://localhost:8080/api/admin/me \
  -H "Cookie: $COOKIE_JAR" \
  -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Updated Name"}' -w "\n%{http_code}\n"
```

Expected: **200** dengan profile data ter-update.

### 5. Mismatched CSRF token rejected

```bash
curl -sX PATCH http://localhost:8080/api/admin/me \
  -H "Cookie: $COOKIE_JAR" \
  -H 'X-CSRF-Token: wrong-token-value' \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Should Fail"}' -w "\n%{http_code}\n"
```

Expected: **403**.

### 6. Logout clears cookies

```bash
# Logout
curl -isX POST http://localhost:8080/api/admin/logout \
  -H "Cookie: $COOKIE_JAR" \
  -H "X-CSRF-Token: $CSRF" | head -20
```

Expected response headers:
```
HTTP/1.1 204 No Content
Set-Cookie: insuretrack_session=; Max-Age=0; Path=/
Set-Cookie: insuretrack_csrf=; Max-Age=0; Path=/
```

Verify:
- [ ] Keduanya `Max-Age=0` (browser akan drop cookie immediately)
- [ ] Status 204

### 7. After logout, request tanpa cookie → 401

```bash
# Pakai cookies dari logout response — kalau Max-Age=0 bekerja,
# cookies sudah invalid. Coba request:
curl -s http://localhost:8080/api/admin/me \
  -H "Cookie: $COOKIE_JAR" -w "\n%{http_code}\n"
```

Expected: **401**.

### 8. Login endpoint exempt dari CSRF

```bash
# Login tidak butuh CSRF (user belum punya cookie).
curl -sX POST http://localhost:8080/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"wrong"}' -w "\n%{http_code}\n"
```

Expected: **401** (bukan 403). Password salah → 401. Kalau 403 → CSRF
guard salah reject login endpoint.

### 9. Cross-app session: admin cookie tidak bisa akses portal

```bash
# Login admin
ADMIN_COOKIES=$(curl -sX POST http://localhost:8080/api/admin/login \
  -H 'Content-Type: application/json' -c - \
  -d '{"username":"admin","password":"admin123"}' -o /dev/null)

# Coba akses endpoint customer dengan admin session
curl -s http://localhost:8080/api/customer/me \
  -H "Cookie: $ADMIN_COOKIES" -w "\n%{http_code}\n"
```

Expected: **403** (bukan 401) — `RequireCustomer` extractor reject
karena JWT claim `role=admin` ≠ `customer`.

### 10. Browser DevTools check (manual)

1. Login di `http://localhost:3001/admin/login` (admin/admin123)
2. Buka DevTools → Application → Cookies → `http://localhost:3001`
3. Verify:
   - [ ] `insuretrack_session` ada, HttpOnly ✓, SameSite=Lax
   - [ ] `insuretrack_csrf` ada, TIDAK HttpOnly, SameSite=Lax
4. Application → Local Storage → `http://localhost:3001`
   - [ ] **TIDAK ADA** key `insuretrack_admin_token` (atau nama token lama)
5. Buka tab baru → akses `http://localhost:3001/admin/dashboard`
   - [ ] Cookie terbawa otomatis (sudah login)
6. Logout via UI → cek cookie di DevTools
   - [ ] `insuretrack_session` dan `insuretrack_csrf` hilang
7. Tanpa login, akses `http://localhost:3001/admin/dashboard`
   - [ ] Middleware redirect ke `/admin/login` (langsung, tidak flash)

## Production deployment

Sebelum deploy ke production, update env vars di Dokploy Secrets:

```env
# Wajib set untuk production
COOKIE_DOMAIN=.insuretrack.id     # leading dot — share cookie di subdomain
COOKIE_SECURE=true                 # HTTPS only
CORS_ALLOWED_ORIGINS=https://portal.insuretrack.id,https://admin.insuretrack.id
```

Test ulang di staging (deploy dulu ke subdomain staging sebelum production).

## Sign-off

Setelah semua test pass, tandai:

- [ ] Backend test (cargo test) — 133/133 pass
- [ ] Frontend test (vitest) — 19/19 pass
- [ ] Playwright E2E — pass dengan backend running
- [ ] Manual smoke checklist di atas — 10/10 pass
- [ ] Staging deploy — semua flow OK
- [ ] Production deploy — smoke 1x setelah cutover

Sign-off: _____________ Date: _____________
