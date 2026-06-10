#!/usr/bin/env bash
# =============================================================================
# preflight.sh — Pre-deploy checker untuk InsureTrack stack
#
# Verifikasi env, dependency, dan resource SEBELUM `docker compose up`.
# Cegah failure yang sudah bisa diprediksi: env file hilang, secret
# placeholder, disk penuh, port konflik, DNS tidak resolve.
#
# Usage:
#   scripts/preflight.sh           # semua check
#   scripts/preflight.sh --strict  # exit 1 kalau ada WARN (default: WARN only print)
# =============================================================================

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Warna untuk output (skip kalau bukan TTY)
if [[ -t 1 ]]; then
    PASS=$'\033[0;32m✓\033[0m'
    FAIL=$'\033[0;31m✗\033[0m'
    WARN=$'\033[0;33m⚠\033[0m'
    INFO=$'\033[0;36mℹ\033[0m'
    RESET=$'\033[0m'
else
    PASS="[PASS]"
    FAIL="[FAIL]"
    WARN="[WARN]"
    INFO="[INFO]"
    RESET=""
fi

STRICT=0
[[ "${1:-}" == "--strict" ]] && STRICT=1

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

record_pass() { printf "  %s %s\n" "$PASS" "$1"; ((PASS_COUNT++)); }
record_fail() { printf "  %s %s\n" "$FAIL" "$1"; ((FAIL_COUNT++)); }
record_warn() { printf "  %s %s\n" "$WARN" "$1"; ((WARN_COUNT++)); }

section() { printf "\n%s%s%s\n" "$INFO" "$1" "$RESET"; }


# ---- 1. Environment file -------------------------------------------------
section "1. Environment file"

if [[ -f .env ]]; then
    record_pass ".env exists"

    # Cek required vars
    REQUIRED=("POSTGRES_USER" "POSTGRES_PASSWORD" "POSTGRES_DB" "JWT_SECRET" "PAYMENT_WEBHOOK_SECRET" "RESEND_API_KEY" "RESEND_FROM_EMAIL" "DOMAIN")
    MISSING=()
    for var in "${REQUIRED[@]}"; do
        if ! grep -q "^${var}=" .env; then
            MISSING+=("$var")
        fi
    done
    if [[ ${#MISSING[@]} -gt 0 ]]; then
        record_fail ".env missing required vars: ${MISSING[*]}"
    else
        record_pass "all required vars present in .env"
    fi

    # Cek secret placeholder (bawaan .env.example yang belum diganti)
    PLACEHOLDERS=("change_me" "replace_me" "insurance_password")
    FOUND_PLACEHOLDERS=()
    for placeholder in "${PLACEHOLDERS[@]}"; do
        if grep -q "$placeholder" .env 2>/dev/null; then
            FOUND_PLACEHOLDERS+=("$placeholder")
        fi
    done
    if [[ ${#FOUND_PLACEHOLDERS[@]} -gt 0 ]]; then
        record_warn ".env contains placeholder values: ${FOUND_PLACEHOLDERS[*]} (ganti sebelum production)"
    else
        record_pass ".env has no obvious placeholder values"
    fi
else
    record_fail ".env NOT found. Run: cp .env.example .env && edit"
fi


# ---- 2. Docker & compose ------------------------------------------------
section "2. Docker & docker compose"

if command -v docker >/dev/null 2>&1; then
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
    record_pass "docker installed (v$DOCKER_VERSION)"
else
    record_fail "docker NOT installed"
fi

# Compose v2 pakai `docker compose` (subcommand), v1 pakai `docker-compose`
if docker compose version >/dev/null 2>&1; then
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null)
    record_pass "docker compose v2 installed (v$COMPOSE_VERSION)"
elif command -v docker-compose >/dev/null 2>&1; then
    record_warn "docker-compose v1 detected (legacy). Migrate to v2: https://docs.docker.com/compose/migrate/"
else
    record_fail "docker compose NOT installed"
fi

# Cek compose file syntax (kalau docker compose ada)
if docker compose config >/dev/null 2>&1; then
    record_pass "docker-compose.yml syntax valid"
else
    record_fail "docker-compose.yml has syntax errors"
    docker compose config 2>&1 | sed 's/^/    /'
fi


# ---- 3. Disk space ------------------------------------------------------
section "3. Disk space"

REQUIRED_MB=2048  # minimum 2GB free untuk build image + container + backups
ROOT_DISK_FREE=$(df -m "$ROOT_DIR" | awk 'NR==2 {print $4}')

if [[ "$ROOT_DISK_FREE" -lt $REQUIRED_MB ]]; then
    record_fail "low disk space: ${ROOT_DISK_FREE}MB free (need >${REQUIRED_MB}MB)"
else
    record_pass "disk space OK: ${ROOT_DISK_FREE}MB free"
fi

# Backup directory writable
if [[ -d ./backups ]]; then
    if [[ -w ./backups ]]; then
        record_pass "./backups/ writable"
    else
        record_fail "./backups/ NOT writable"
    fi
elif [[ -w . ]]; then
    record_warn "./backups/ doesn't exist (akan dibuat saat backup pertama)"
else
    record_fail "current dir not writable"
fi


# ---- 4. Port availability ------------------------------------------------
section "4. Port availability (host)"

# Untuk local dev, cek port yang akan di-publish. Untuk Dokploy, skip
# (Traefik handle semua routing, tidak ada port host yang di-bind ke app).
if [[ -z "${DOKPLOY_DEPLOY:-}" ]]; then
    PORTS_TO_CHECK=()
    [[ -n "${BACKEND_PORT:-}" ]] && PORTS_TO_CHECK+=("$BACKEND_PORT")
    [[ -n "${PORTAL_PORT:-}" ]] && PORTS_TO_CHECK+=("$PORTAL_PORT")
    [[ -n "${ADMIN_PORT:-}" ]] && PORTS_TO_CHECK+=("$ADMIN_PORT")
    [[ -n "${POSTGRES_PORT:-}" ]] && PORTS_TO_CHECK+=("$POSTGRES_PORT")

    for port in "${PORTS_TO_CHECK[@]}"; do
        if ss -tln "sport = :$port" 2>/dev/null | grep -q ":$port"; then
            record_warn "port $port already in use (host)"
        else
            record_pass "port $port available"
        fi
    done
else
    record_warn "DOKPLOY_DEPLOY detected — skipping host port check (Traefik handles routing)"
fi


# ---- 5. Domain resolution -----------------------------------------------
section "5. Domain resolution"

if [[ -n "${DOMAIN:-}" ]]; then
    for sub in api portal admin; do
        FQDN="${sub}.${DOMAIN}"
        if command -v dig >/dev/null 2>&1; then
            if dig +short "$FQDN" 2>/dev/null | grep -q .; then
                record_pass "$FQDN resolves"
            else
                record_warn "$FQDN does NOT resolve (DNS A record missing or wrong)"
            fi
        elif command -v host >/dev/null 2>&1; then
            if host "$FQDN" >/dev/null 2>&1; then
                record_pass "$FQDN resolves"
            else
                record_warn "$FQDN does NOT resolve"
            fi
        else
            record_warn "no DNS lookup tool (dig/host) — skipping"
            break
        fi
    done
else
    record_warn "DOMAIN not set — skipping DNS check"
fi


# ---- 6. Docker daemon ----------------------------------------------------
section "6. Docker daemon"

if docker info >/dev/null 2>&1; then
    record_pass "docker daemon responsive"

    # Cek BuildKit (diperlukan untuk cache mount di Dockerfiles)
    if docker buildx version >/dev/null 2>&1; then
        record_pass "buildx available (BuildKit cache mount supported)"
    else
        record_warn "buildx NOT available — cache mount di Dockerfile tidak akan jalan (build lebih lambat)"
    fi
else
    record_fail "docker daemon not responding"
fi


# ---- Summary -------------------------------------------------------------
echo ""
echo "=========================================="
printf "  %s %d passed\n" "$PASS" "$PASS_COUNT"
if [[ $FAIL_COUNT -gt 0 ]]; then
    printf "  %s %d failed\n" "$FAIL" "$FAIL_COUNT"
fi
if [[ $WARN_COUNT -gt 0 ]]; then
    printf "  %s %d warnings\n" "$WARN" "$WARN_COUNT"
fi
echo "=========================================="

# Exit code
if [[ $FAIL_COUNT -gt 0 ]]; then
    exit 1
fi
if [[ $STRICT -eq 1 && $WARN_COUNT -gt 0 ]]; then
    exit 2
fi
exit 0
