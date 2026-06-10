#!/usr/bin/env bash
# =============================================================================
# backup-now.sh — Trigger manual DB backup di luar schedule
#
# Jalankan backup ad-hoc (mis. sebelum deploy risky, sebelum DB migration,
# atau setelah import data besar). Backup disimpan di ./backups/ sesuai
# konfigurasi db-backup service di docker-compose.yml.
#
# Usage:
#   scripts/backup-now.sh           # backup dengan format & retention default
#   scripts/backup-now.sh --list    # list existing backups, no new one
#   scripts/backup-now.sh --offsite # trigger backup + sync ke BACKUP_OFFSITE_TARGET
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Warna
if [[ -t 1 ]]; then
    GREEN=$'\033[0;32m'
    YELLOW=$'\033[0;33m'
    RED=$'\033[0;31m'
    NC=$'\033[0m'
else
    GREEN=""; YELLOW=""; RED=""; NC=""
fi

ACTION="backup"
[[ "${1:-}" == "--list" ]] && ACTION="list"
[[ "${1:-}" == "--offsite" ]] && ACTION="offsite"

# Pre-flight
if ! docker compose ps db-backup >/dev/null 2>&1; then
    echo -e "${RED}✗ db-backup service not running. Start dengan: docker compose up -d db-backup${NC}" >&2
    exit 1
fi

case "$ACTION" in
    list)
        echo -e "${GREEN}Existing backups di ./backups/:${NC}"
        if [[ -d ./backups ]] && [[ -n "$(ls -A ./backups 2>/dev/null)" ]]; then
            ls -lh ./backups/ | tail -n +2
        else
            echo "  (belum ada backup)"
        fi

        TOTAL_SIZE=$(du -sh ./backups 2>/dev/null | awk '{print $1}')
        echo -e "\n${GREEN}Total size: ${TOTAL_SIZE:-0}${NC}"
        ;;

    offsite)
        if [[ -z "${BACKUP_OFFSITE_TARGET:-}" ]]; then
            echo -e "${RED}✗ BACKUP_OFFSITE_TARGET tidak di-set di .env${NC}" >&2
            echo "  Set BACKUP_OFFSITE_TARGET=rclone-remote:bucket/path untuk enable offsite" >&2
            exit 1
        fi
        echo -e "${GREEN}▶ Trigger backup + rclone ke ${BACKUP_OFFSITE_TARGET}${NC}"
        docker compose exec -T db-backup backup

        # Ambil file backup terbaru
        LATEST=$(ls -t ./backups/*.{sql.gz,dump} 2>/dev/null | head -1 || true)
        if [[ -z "$LATEST" ]]; then
            echo -e "${RED}✗ backup tidak menghasilkan file${NC}" >&2
            exit 1
        fi

        echo -e "${GREEN}▶ rclone copy $LATEST → $BACKUP_OFFSITE_TARGET${NC}"
        rclone copy "$LATEST" "$BACKUP_OFFSITE_TARGET" --progress
        ;;

    backup|*)
        echo -e "${GREEN}▶ Trigger backup...${NC}"
        docker compose exec -T db-backup backup

        LATEST=$(ls -t ./backups/*.{sql.gz,dump} 2>/dev/null | head -1 || true)
        if [[ -n "$LATEST" ]]; then
            SIZE=$(du -h "$LATEST" | awk '{print $1}')
            echo -e "${GREEN}✓ Backup selesai: $LATEST ($SIZE)${NC}"
        else
            echo -e "${YELLOW}⚠ Tidak ada file backup terdeteksi — cek logs: docker compose logs db-backup${NC}" >&2
            exit 1
        fi
        ;;
esac
