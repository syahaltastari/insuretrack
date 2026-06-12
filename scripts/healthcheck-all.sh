#!/usr/bin/env bash
# =============================================================================
# healthcheck-all.sh — Cek status semua service + endpoint health
#
# Menampilkan tabel: service / state / health / uptime.
# Plus probe internal (backend /health) dan eksternal (Traefik routing).
#
# Usage:
#   scripts/healthcheck-all.sh
# =============================================================================

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a; source .env; set +a

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

# Symbol
SYM_OK="${GREEN}✓${NC}"
SYM_FAIL="${RED}✗${NC}"
SYM_WARN="${YELLOW}⚠${NC}"

printf "${BOLD}=== InsureTrack Stack Health ===${NC}\n"
printf "Generated: %s\n\n" "$(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# ---- 1. Service-level status ---------------------------------------------

printf "${BOLD}1. Container status${NC}\n"
printf "%-15s %-12s %-12s %-15s %s\n" "SERVICE" "STATE" "HEALTH" "PORTS" "UPTIME"
printf "%-15s %-12s %-12s %-15s %s\n" "-------" "-----" "------" "-----" "------"

# Get JSON output dari docker compose ps
SERVICES_JSON=$(docker compose ps --format json 2>/dev/null)
if [[ -z "$SERVICES_JSON" ]]; then
    printf "${RED}✗ docker compose ps gagal — compose file atau services issue${NC}\n" >&2
    exit 1
fi

declare -A HEALTH_COUNTS=([healthy]=0 [unhealthy]=0 [starting]=0 [none]=0)
declare -A STATE_COUNTS=([running]=0 [exited]=0 [restarting]=0 [other]=0)

while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    # Parser portable: coba python3 dulu (VPS biasanya ada), fallback
    # ke grep/sed (penting untuk Windows/Git Bash di mana python3 =
    # Microsoft Store stub).
    if command -v python3 >/dev/null 2>&1 && python3 -c "import json" 2>/dev/null; then
        SERVICE=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('Service','?'))" 2>/dev/null || echo "?")
        STATE=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('State','?'))" 2>/dev/null || echo "?")
        HEALTH=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('Health','none'))" 2>/dev/null || echo "none")
        PORTS=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('Publishers',[{}])[0].get('PublishedPort','') if d.get('Publishers') else '-')" 2>/dev/null || echo "-")
        STATUS=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('Status',''))" 2>/dev/null || echo "")
    else
        # Fallback: grep + sed extract field values dari single-line JSON.
        # Field di-quote dengan double-quote, value di antara :" dan ".
        SERVICE=$(echo "$line" | sed -n 's/.*"Service":"\([^"]*\)".*/\1/p')
        STATE=$(echo "$line" | sed -n 's/.*"State":"\([^"]*\)".*/\1/p')
        HEALTH=$(echo "$line" | sed -n 's/.*"Health":"\([^"]*\)".*/\1/p')
        PORTS=$(echo "$line" | sed -n 's/.*"PublishedPort":\([0-9]*\).*/\1/p')
        STATUS=$(echo "$line" | sed -n 's/.*"Status":"\([^"]*\)".*/\1/p')
        SERVICE="${SERVICE:-?}"
        STATE="${STATE:-?}"
        HEALTH="${HEALTH:-none}"
        PORTS="${PORTS:--}"
    fi

    # Simbol untuk state & health
    case "$STATE" in
        running)   STATE_SYM="${GREEN}running${NC}"   ; STATE_COUNTS[running]=$((STATE_COUNTS[running]+1)) ;;
        exited)    STATE_SYM="${RED}exited${NC}"      ; STATE_COUNTS[exited]=$((STATE_COUNTS[exited]+1)) ;;
        restarting) STATE_SYM="${YELLOW}restarting${NC}" ; STATE_COUNTS[restarting]=$((STATE_COUNTS[restarting]+1)) ;;
        *)         STATE_SYM="${YELLOW}${STATE}${NC}"  ; STATE_COUNTS[other]=$((STATE_COUNTS[other]+1)) ;;
    esac

    case "$HEALTH" in
        healthy)   HEALTH_SYM="${GREEN}healthy${NC}"   ; HEALTH_COUNTS[healthy]=$((HEALTH_COUNTS[healthy]+1)) ;;
        unhealthy) HEALTH_SYM="${RED}unhealthy${NC}"   ; HEALTH_COUNTS[unhealthy]=$((HEALTH_COUNTS[unhealthy]+1)) ;;
        starting)  HEALTH_SYM="${YELLOW}starting${NC}" ; HEALTH_COUNTS[starting]=$((HEALTH_COUNTS[starting]+1)) ;;
        *)         HEALTH_SYM="${YELLOW}none${NC}"     ; HEALTH_COUNTS[none]=$((HEALTH_COUNTS[none]+1)) ;;
    esac

    # Uptime dari status string (extract "Up X minutes")
    UPTIME=$(echo "$STATUS" | grep -oE 'Up [^,]+' | head -1 || echo "-")

    printf "%-15s %-22b %-22b %-15s %s\n" "$SERVICE" "$STATE_SYM" "$HEALTH_SYM" "$PORTS" "$UPTIME"
done <<< "$SERVICES_JSON"

# Summary
TOTAL=$((HEALTH_COUNTS[healthy] + HEALTH_COUNTS[unhealthy] + HEALTH_COUNTS[starting] + HEALTH_COUNTS[none]))
echo ""
printf "  ${GREEN}healthy: %d${NC}  " "${HEALTH_COUNTS[healthy]}"
if [[ ${HEALTH_COUNTS[unhealthy]} -gt 0 ]]; then
    printf "${RED}unhealthy: %d${NC}  " "${HEALTH_COUNTS[unhealthy]}"
fi
if [[ ${HEALTH_COUNTS[starting]} -gt 0 ]]; then
    printf "${YELLOW}starting: %d${NC}  " "${HEALTH_COUNTS[starting]}"
fi
printf "no-check: %d  total: %d\n" "${HEALTH_COUNTS[none]}" "$TOTAL"

# ---- 2. Backend health endpoint ------------------------------------------

printf "\n${BOLD}2. Backend /health${NC}\n"
if docker compose exec -T backend wget -qO- http://127.0.0.1:8080/health 2>/dev/null; then
    printf "  ${SYM_OK} /health returns 200\n"
else
    printf "  ${SYM_FAIL} /health FAIL — backend tidak reachable\n"
fi

# ---- 3. Traefik routing --------------------------------------------------

if [[ -n "${DOMAIN:-}" ]]; then
    printf "\n${BOLD}3. Traefik routing (via Host header)${NC}\n"
    printf "%-30s %s\n" "URL" "STATUS"
    printf "%-30s %s\n" "---" "------"

    for endpoint in "api:${DOMAIN}:8080" "portal:${DOMAIN}:3000" "admin:${DOMAIN}:3001"; do
        SUB=$(echo "$endpoint" | cut -d: -f1)
        DOM=$(echo "$endpoint" | cut -d: -f2)
        PORT=$(echo "$endpoint" | cut -d: -f3)
        FQDN="${SUB}.${DOM}"
        # Hit Traefik di localhost (Traefik di Dokploy bind 0.0.0.0:80/443)
        CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
            -H "Host: ${FQDN}" \
            "http://localhost/" 2>/dev/null || echo "ERR")
        case "$CODE" in
            2*|3*) CODE_SYM="${GREEN}${CODE}${NC}" ;;
            4*|5*) CODE_SYM="${RED}${CODE}${NC}" ;;
            *)     CODE_SYM="${YELLOW}${CODE}${NC}" ;;
        esac
        printf "  %-28s %b\n" "$FQDN/" "$CODE_SYM"
    done
else
    printf "\n${YELLOW}DOMAIN tidak di-set — skip Traefik routing check${NC}\n"
fi

# ---- 4. Disk & memory ----------------------------------------------------

printf "\n${BOLD}4. Resources${NC}\n"
DISK_USAGE=$(df -h "$ROOT_DIR" | awk 'NR==2 {print $5 " (" $4 " free)"}')
printf "  Disk:           %s\n" "$DISK_USAGE"
if [[ -d ./backups ]]; then
    BACKUP_SIZE=$(du -sh ./backups 2>/dev/null | awk '{print $1}')
    printf "  Backups:        %s in ./backups/\n" "${BACKUP_SIZE:-0}"
fi

# Docker stats ringkas
if command -v docker >/dev/null 2>&1; then
    printf "\n${BOLD}5. Container resource usage${NC}\n"
    docker stats --no-stream --format "  {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | \
        awk -F'\t' 'BEGIN{printf "  %-25s %-10s %-15s %s\n", "CONTAINER", "CPU", "MEMORY", "MEM%"; printf "  %-25s %-10s %-15s %s\n", "---------", "---", "------", "----"} {printf "  %-25s %-10s %-15s %s\n", $1, $2, $3, $4}'
fi

echo ""
