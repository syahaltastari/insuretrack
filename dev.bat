@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================================
REM InsureTrack — dev stack launcher (Windows, NO DOCKER)
REM
REM Mode: SEPENUHNYA native. Backend jalan via `cargo run`, portal+admin
REM       via `pnpm dev` (turbo parallel). Database diasumsikan native
REM       Postgres yang SUDAH running di localhost:5432.
REM       Lihat memory/hybrid-local-dev.md untuk rationale.
REM
REM Prasyarat:
REM   - Postgres native running di localhost:5432 dengan database
REM     `digital_insurance` (lihat scripts\setup-db-native.bat untuk one-time
REM     create).
REM   - Rust toolchain (cargo), pnpm >= 10, Node >= 22.
REM   - apps\backend\.env, apps\portal\.env, apps\admin\.env sudah ada
REM     (sudah pre-configured untuk host mode — lihat .env.example tiap app).
REM
REM Cara pakai:
REM   1. Klik dua kali file ini (atau pin shortcut di Desktop).
REM   2. Dua window cmd baru terbuka: backend + frontend.
REM ============================================================================


REM --- Resolve repo root from script location (portable, bisa dipindah) -----
set "REPO_ROOT=%~dp0"
if "!REPO_ROOT:~-1!"=="\" set "REPO_ROOT=!REPO_ROOT:~0,-1!"


echo.
echo === InsureTrack Dev Stack (zero Docker) ===
echo Repo: !REPO_ROOT!
echo.


REM --- 1. Backend (Rust + Axum) --------------------------------------------
echo [1/2] Membuka window baru untuk backend (cargo run)...
echo   Pertama kali compile 3-5 menit; setelahnya incremental detik.
echo   Backend listen di :8080. Migrations auto-run pada startup.
start "InsureTrack - Backend (Rust :8080)" cmd /k "cd /d ""!REPO_ROOT!\apps\backend"" && cargo run"
echo.


REM --- 2. Frontend (Next.js via turbo) -------------------------------------
echo [2/2] Membuka window baru untuk frontend (pnpm dev)...
echo   Portal :3000 + Admin :3001 jalan paralel (turbo).
start "InsureTrack - Frontend (Portal :3000 + Admin :3001)" cmd /k "cd /d ""!REPO_ROOT!"" && pnpm dev"
echo.


echo === Stack jalan ===
echo   Backend  http://localhost:8080   (window "InsureTrack - Backend")
echo   Portal   http://localhost:3000   (window "InsureTrack - Frontend")
echo   Admin    http://localhost:3001   (window "InsureTrack - Frontend")
echo   DB       localhost:5432          (native Postgres, harus running manual)
echo.
echo Stop: Ctrl+C di masing-masing window. Window ini aman ditutup kapan saja.
echo Untuk start/stop database: services.msc → postgresql-x64-18.
echo.
pause
exit /b 0
