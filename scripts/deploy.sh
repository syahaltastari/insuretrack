#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Selective blue-green deploy untuk 1 service
#
# Deploy salah satu service (portal/admin/backend) TANPA mengganggu
# service lain. Kalau service pakai replicas, pakai rolling update
# (scale up → wait healthy → scale down) untuk zero-downtime.
#
# Usage:
#   scripts/deploy.sh portal
#   scripts/deploy.sh admin
#   scripts/deploy.sh backend
#   scripts/deploy.sh all           # deploy 3 service sequentially
#   scripts/deploy.sh portal --skip-preflight
#
# Catatan:
#   - Untuk Dokploy, trigger deploy dari UI (Dokploy orchestrate git pull
#     + docker compose up). Script ini untuk local dev & manual deploy
#     via SSH.
#   - Image lama TIDAK otomatis di-prune. Gunakan `docker image prune`
#     berkala (lihat document/DEPLOYMENT.md §11).
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Warna
if [[ -t 1 ]]; then
    GREEN=$'\033[0;32m'
    RED=$'\033[0;31m'
    YELLOW=$'\033[0;33m'
    CYAN=$'\033[0;36m'
    BOLD=$'\033[1m'
    NC=$'\033[0m'
else
    GREEN=""; RED=""; YELLOW=""; CYAN=""; BOLD=""; NC=""
fi

# Args
SERVICE="${1:-}"
SKIP_PREFLIGHT=0
[[ "${2:-}" == "--skip-preflight" ]] && SKIP_PREFLIGHT=1
[[ "${1:-}" == "--skip-preflight" ]] && { SKIP_PREFLIGHT=1; SERVICE="${2:-}"; }

# Validate
if [[ -z "$SERVICE" ]]; then
    echo "Usage: $0 {portal|admin|backend|all} [--skip-preflight]" >&2
    exit 1
fi

if [[ "$SERVICE" != "portal" ]] && [[ "$SERVICE" != "admin" ]] \
   && [[ "$SERVICE" != "backend" ]] && [[ "$SERVICE" != "all" ]]; then
    echo -e "${RED}✗ Service tidak valid: $SERVICE${NC}" >&2
    echo "  Pilih: portal | admin | backend | all" >&2
    exit 1
fi

# Pre-flight
if [[ $SKIP_PREFLIGHT -eq 0 ]]; then
    echo -e "${CYAN}▶ Running preflight checks...${NC}"
    if ! scripts/preflight.sh; then
        echo -e "${RED}✗ Preflight FAILED. Fix errors di atas atau pakai --skip-preflight${NC}" >&2
        exit 1
    fi
fi

# shellcheck disable=SC1091
[[ -f .env ]] && set -a; source .env; set +a

# ---- Helper: deploy satu service dengan rolling update ---------------

deploy_service() {
    local svc="$1"
    echo ""
    echo -e "${BOLD}==========================================${NC}"
    echo -e "${BOLD}  Deploying: $svc${NC}"
    echo -e "${BOLD}==========================================${NC}"

    # 1. Capture image hash sebelum build (untuk deteksi perubahan)
    local IMAGE_NAME="insuretrack-${svc}"
    local OLD_HASH=""
    if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
        OLD_HASH=$(docker image inspect "$IMAGE_NAME" --format '{{.Id}}' 2>/dev/null || echo "")
    fi

    # 2. Build image baru
    echo -e "\n${CYAN}▶ Build image untuk $svc...${NC}"
    if ! docker compose build "$svc" 2>&1 | tail -20; then
        echo -e "${RED}✗ Build FAILED untuk $svc${NC}" >&2
        return 1
    fi

    # 3. Deteksi apakah image berubah
    local NEW_HASH=$(docker image inspect "$IMAGE_NAME" --format '{{.Id}}' 2>/dev/null || echo "")
    if [[ -n "$OLD_HASH" ]] && [[ "$OLD_HASH" == "$NEW_HASH" ]]; then
        echo -e "${YELLOW}⚠ Image tidak berubah (hash sama). Skip deploy.${NC}"
        echo -e "  Untuk force re-deploy, ubah sedikit code atau sentuh Dockerfile"
        return 0
    fi

    # 4. Cek replicas (rolling update hanya kalau >1)
    local CURRENT_COUNT=$(docker compose ps "$svc" --format json 2>/dev/null | grep -c '"Service"') || true
    if [[ -z "$CURRENT_COUNT" ]] || [[ "$CURRENT_COUNT" -eq 0 ]]; then
        # Service belum jalan, just up
        echo -e "${CYAN}▶ Service belum running, start dengan image baru...${NC}"
        docker compose up -d --no-deps "$svc"
    elif [[ "$CURRENT_COUNT" -eq 1 ]]; then
        # Single instance — ada blip ~5-10 detik
        echo -e "${YELLOW}⚠ Service single instance. Akan ada blip singkat saat recreate.${NC}"
        docker compose up -d --no-deps --force-recreate "$svc"
    else
        # Multi-instance — rolling update
        echo -e "${CYAN}▶ Rolling update ($CURRENT_COUNT instances → scale up 1 → wait healthy → scale down 1)...${NC}"
        local TARGET=$((CURRENT_COUNT + 1))

        docker compose up -d --no-deps --scale "$svc=$TARGET" "$svc"

        # Tunggu instance baru healthy (max 90 detik).
        # Portable: pakai python3 kalau available, fallback ke grep+sed
        # (penting untuk Windows/Git Bash yang python3 = Microsoft Store stub).
        echo -e "${CYAN}▶ Tunggu instance baru healthy...${NC}"
        local waited=0
        local target_healthy=$TARGET
        while [[ $waited -lt 90 ]]; do
            local healthy
            if command -v python3 >/dev/null 2>&1 && python3 -c "import json" 2>/dev/null; then
                healthy=$(docker compose ps "$svc" --format json 2>/dev/null | python3 -c "
import json, sys
count = 0
for line in sys.stdin:
    if not line.strip(): continue
    try:
        d = json.loads(line)
        if d.get('Health') == 'healthy': count += 1
    except: pass
print(count)
" 2>/dev/null || echo "0")
            else
                # Fallback: hitung JSON lines dengan Health=healthy
                healthy=$(docker compose ps "$svc" --format json 2>/dev/null | grep -c '"Health":"healthy"' || echo "0")
            fi
            if [[ "$healthy" -ge "$target_healthy" ]]; then
                echo -e "${GREEN}✓ Semua $target_healthy instance healthy${NC}"
                break
            fi
            sleep 5
            waited=$((waited + 5))
            printf "  ... %d/%d healthy setelah %ds\r" "$healthy" "$target_healthy" "$waited"
        done
        echo ""

        if [[ $waited -ge 90 ]]; then
            echo -e "${RED}✗ Timeout: instance baru tidak healthy dalam 90 detik${NC}" >&2
            echo "  Cek logs: docker compose logs --tail 50 $svc" >&2
            return 1
        fi

        # Scale down — Compose akan drop instance TERLAMA (yang punya image lama)
        echo -e "${CYAN}▶ Scale down ke $CURRENT_COUNT (drop instance terlama)...${NC}"
        docker compose up -d --no-deps --scale "$svc=$CURRENT_COUNT" "$svc"
    fi

    # 5. Tunggu service healthy (post-deploy). Portable parser (lihat
    # komentar di blok rolling update di atas untuk rationale).
    echo -e "\n${CYAN}▶ Tunggu $svc healthy (max 60 detik)...${NC}"
    local waited=0
    while [[ $waited -lt 60 ]]; do
        local unhealthy all_healthy
        if command -v python3 >/dev/null 2>&1 && python3 -c "import json" 2>/dev/null; then
            unhealthy=$(docker compose ps "$svc" --format json 2>/dev/null | python3 -c "
import json, sys
count = 0
for line in sys.stdin:
    if not line.strip(): continue
    try:
        d = json.loads(line)
        h = d.get('Health', 'none')
        if h == 'unhealthy' or h == 'starting': count += 1
    except: pass
print(count)
" 2>/dev/null || echo "0")
            if [[ "$unhealthy" -eq 0 ]]; then
                all_healthy=$(docker compose ps "$svc" --format json 2>/dev/null | python3 -c "
import json, sys
total = 0
healthy = 0
for line in sys.stdin:
    if not line.strip(): continue
    try:
        d = json.loads(line)
        total += 1
        if d.get('Health') == 'healthy': healthy += 1
    except: pass
print(f'{healthy}/{total}')
" 2>/dev/null || echo "?")
            else
                all_healthy="?"
            fi
        else
            # Fallback grep+sed untuk Windows / Git Bash tanpa python3
            local total_count
            total_count=$(docker compose ps "$svc" --format json 2>/dev/null | grep -c '"Service":' || echo "0")
            local healthy_count
            healthy_count=$(docker compose ps "$svc" --format json 2>/dev/null | grep -c '"Health":"healthy"' || echo "0")
            unhealthy=$((total_count - healthy_count))
            all_healthy="${healthy_count}/${total_count}"
        fi
        if [[ "$unhealthy" -eq 0 ]]; then
            echo -e "${GREEN}✓ $svc deployed: $all_healthy healthy${NC}"
            return 0
        fi
        sleep 5
        waited=$((waited + 5))
    done

    echo -e "${YELLOW}⚠ $svc belum fully healthy setelah 60 detik. Cek: docker compose ps $svc${NC}"
    return 0
}

# ---- Main: deploy sesuai argumen ----------------------------------------

if [[ "$SERVICE" == "all" ]]; then
    # Deploy backend dulu (dependensi), lalu portal, lalu admin
    for svc in backend portal admin; do
        if ! deploy_service "$svc"; then
            echo -e "\n${RED}✗ Deploy GAGAL di service: $svc${NC}" >&2
            echo "  Service lain mungkin sudah ter-deploy. Cek: docker compose ps" >&2
            exit 1
        fi
    done
    echo ""
    echo -e "${GREEN}==========================================${NC}"
    echo -e "${GREEN}  ✓ All services deployed${NC}"
    echo -e "${GREEN}==========================================${NC}"
else
    if ! deploy_service "$SERVICE"; then
        echo -e "\n${RED}✗ Deploy GAGAL: $SERVICE${NC}" >&2
        exit 1
    fi
fi

# Final status
echo ""
echo -e "${CYAN}Final status:${NC}"
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Status}}" | sed 's/^/  /'
