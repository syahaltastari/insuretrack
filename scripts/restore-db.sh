#!/usr/bin/env bash
# =============================================================================
# restore-db.sh — Restore Postgres dari backup file
#
# HATI-HATI: ini REPLACE semua data di DB dengan isi backup. Tidak ada
# undo. Selalu backup state sekarang dulu sebelum restore.
#
# Usage:
#   scripts/restore-db.sh                       # interactive: list backups
#   scripts/restore-db.sh <file>                # restore dari file tertentu
#   scripts/restore-db.sh <file> --no-confirm   # skip konfirmasi (untuk script)
#
# Catatan:
#   - Backup format `custom` di-restore via `pg_restore` (binary, fast)
#   - Backup format `plain` (sql.gz) di-restore via `psql` (text, slow)
#   - Service backend akan di-stop selama restore supaya tidak ada write
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Warna
if [[ -t 1 ]]; then
    GREEN=$'\033[0;32m'
    YELLOW=$'\033[0;33m'
    RED=$'\033[0;31m'
    BOLD=$'\033[1m'
    NC=$'\033[0m'
else
    GREEN=""; YELLOW=""; RED=""; BOLD=""; NC=""
fi

BACKUP_DIR="$ROOT_DIR/backups"
BACKUP_FILE="${1:-}"
SKIP_CONFIRM=0
[[ "${2:-}" == "--no-confirm" ]] && SKIP_CONFIRM=1

# ---- 1. Pre-flight --------------------------------------------------------

# Load .env untuk POSTGRES_USER/DB
if [[ ! -f .env ]]; then
    echo -e "${RED}✗ .env tidak ditemukan${NC}" >&2
    exit 1
fi
# shellcheck disable=SC1091
set -a; source .env; set +a

# Cek db service up
if ! docker compose ps db >/dev/null 2>&1; then
    echo -e "${RED}✗ db service tidak running${NC}" >&2
    exit 1
fi

# ---- 2. Pilih backup file ------------------------------------------------

if [[ -z "$BACKUP_FILE" ]]; then
    echo -e "${BOLD}Available backups di $BACKUP_DIR:${NC}"
    echo ""
    if [[ ! -d "$BACKUP_DIR" ]] || [[ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]]; then
        echo -e "${RED}✗ Tidak ada backup file${NC}" >&2
        echo "  Trigger backup dulu: scripts/backup-now.sh" >&2
        exit 1
    fi

    # List dengan index, urut terbaru dulu
    mapfile -t BACKUPS < <(ls -t "$BACKUP_DIR"/*.{sql.gz,dump} 2>/dev/null)
    if [[ ${#BACKUPS[@]} -eq 0 ]]; then
        echo -e "${RED}✗ Tidak ada file .sql.gz atau .dump di $BACKUP_DIR${NC}" >&2
        exit 1
    fi

    for i in "${!BACKUPS[@]}"; do
        FILE="${BACKUPS[$i]}"
        SIZE=$(du -h "$FILE" | awk '{print $1}')
        MTIME=$(stat -c '%y' "$FILE" 2>/dev/null | cut -d. -f1)
        printf "  %3d) %s  %s  %s\n" "$((i+1))" "$(basename "$FILE")" "$SIZE" "$MTIME"
    done

    echo ""
    read -r -p "Pilih nomor [1-${#BACKUPS[@]}] (atau 'q' untuk cancel): " CHOICE
    if [[ "$CHOICE" == "q" ]] || [[ -z "$CHOICE" ]]; then
        echo "Cancelled."
        exit 0
    fi
    if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [[ "$CHOICE" -lt 1 ]] || [[ "$CHOICE" -gt ${#BACKUPS[@]} ]]; then
        echo -e "${RED}✗ Pilihan tidak valid${NC}" >&2
        exit 1
    fi
    BACKUP_FILE="${BACKUPS[$((CHOICE-1))]}"
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo -e "${RED}✗ File tidak ditemukan: $BACKUP_FILE${NC}" >&2
    exit 1
fi

# Detect format dari extension
BACKUP_BASENAME=$(basename "$BACKUP_FILE")
SIZE=$(du -h "$BACKUP_FILE" | awk '{print $1}')
if [[ "$BACKUP_BASENAME" == *.sql.gz ]] || [[ "$BACKUP_BASENAME" == *.sql ]]; then
    FORMAT="plain"
elif [[ "$BACKUP_BASENAME" == *.dump ]]; then
    FORMAT="custom"
else
    echo -e "${RED}✗ Format tidak dikenali dari extension: $BACKUP_BASENAME${NC}" >&2
    echo "  Didukung: .sql.gz, .sql, .dump" >&2
    exit 1
fi

# ---- 3. Konfirmasi -------------------------------------------------------

echo ""
echo -e "${BOLD}Restore plan:${NC}"
echo "  Backup file:  $BACKUP_FILE ($SIZE)"
echo "  Format:       $FORMAT"
echo "  Target DB:    $POSTGRES_DB (di container 'db')"
echo ""
echo -e "${YELLOW}⚠ PERINGATAN: Restore akan REPLACE semua data di DB.${NC}"
echo -e "${YELLOW}  Backend & db-backup akan di-stop sementara.${NC}"
echo ""

if [[ $SKIP_CONFIRM -eq 0 ]]; then
    read -r -p "Lanjutkan? Ketik 'YES' untuk konfirmasi: " CONFIRM
    if [[ "$CONFIRM" != "YES" ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

# ---- 4. Stop dependent services -----------------------------------------

echo -e "\n${GREEN}▶ Stop backend & db-backup (mencegah write concurrent)...${NC}"
docker compose stop backend db-backup 2>/dev/null || true

# ---- 5. Drop & recreate database ---------------------------------------

echo -e "${GREEN}▶ Drop & recreate database $POSTGRES_DB...${NC}"
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c "
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();
" >/dev/null
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB;" >/dev/null
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;" >/dev/null

# ---- 6. Restore ----------------------------------------------------------

echo -e "${GREEN}▶ Restore dari $BACKUP_BASENAME...${NC}"
if [[ "$FORMAT" == "custom" ]]; then
    # pg_restore expects file inside container; copy in via cat | docker exec
    cat "$BACKUP_FILE" | docker compose exec -T db pg_restore \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        --no-owner --no-privileges \
        --single-transaction \
        2>&1 | tail -5
else
    # Plain text SQL — decompress kalau perlu, pipe ke psql
    if [[ "$BACKUP_BASENAME" == *.gz ]]; then
        gunzip -c "$BACKUP_FILE" | docker compose exec -T db psql \
            -U "$POSTGRES_USER" \
            -d "$POSTGRES_DB" \
            --set ON_ERROR_STOP=1 \
            -q
    else
        cat "$BACKUP_FILE" | docker compose exec -T db psql \
            -U "$POSTGRES_USER" \
            -d "$POSTGRES_DB" \
            --set ON_ERROR_STOP=1 \
            -q
    fi
fi

# ---- 7. Verify -----------------------------------------------------------

echo -e "\n${GREEN}▶ Verifikasi restore...${NC}"
TABLE_COUNT=$(docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "
    SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
")
echo "  Tables in public schema: $TABLE_COUNT"

if [[ "$TABLE_COUNT" -lt 5 ]]; then
    echo -e "${RED}✗ Tables count rendah (expected >5). Restore mungkin incomplete.${NC}" >&2
    echo "  Cek logs: docker compose logs db" >&2
    exit 1
fi

# ---- 8. Restart services -------------------------------------------------

echo -e "\n${GREEN}▶ Restart backend & db-backup...${NC}"
docker compose up -d backend db-backup

# Tunggu backend healthy
echo -e "${GREEN}▶ Tunggu backend healthy (max 60 detik)...${NC}"
for i in {1..12}; do
    if docker compose ps backend | grep -q "(healthy)"; then
        echo -e "${GREEN}✓ Backend healthy${NC}"
        echo ""
        echo -e "${GREEN}Restore selesai.${NC}"
        exit 0
    fi
    sleep 5
done

echo -e "${YELLOW}⚠ Backend belum healthy setelah 60 detik. Cek manual: docker compose ps backend${NC}"
exit 0
