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
REM     `insuretrack` (user `postgres`, password di apps\backend\.env).
REM   - Rust toolchain (cargo), pnpm >= 10, Node >= 22.
REM   - apps\backend\.env, apps\portal\.env, apps\admin\.env sudah ada
REM     (sudah pre-configured untuk host mode — lihat .env.example tiap app).
REM
REM Yang dilakukan script ini SEBELUM launch (self-healing):
REM   1. Kill proses stale yang masih pegang port 3000/3001/8080
REM      (dari klik dev.bat sebelumnya yang lupa di-stop).
REM   2. Quick check Postgres reachable di localhost:5432 — fail early
REM      dengan instruksi jelas kalau service-nya mati.
REM   3. Launch backend di window baru (cargo run → :8080).
REM   4. Launch frontend di window baru (pnpm dev → :3000 + :3001 turbo).
REM   5. (Opsional) Buka window seeder kalau user pilih y.
REM
REM Cara pakai:
REM   - Klik dua kali file ini (atau pin shortcut di Desktop).
REM   - Dua window cmd baru terbuka: backend + frontend.
REM   - Untuk stop: klik scripts\stop.bat, atau tutup window-nya.
REM ============================================================================


REM --- Resolve repo root from script location (portable, bisa dipindah) -----
set "REPO_ROOT=%~dp0"
if "!REPO_ROOT:~-1!"=="\" set "REPO_ROOT=!REPO_ROOT:~0,-1!"


echo.
echo === InsureTrack Dev Stack (zero Docker) ===
echo Repo: !REPO_ROOT!
echo.


REM ============================================================================
REM [Pre-flight 1/2] Kill stale processes on dev ports
REM ============================================================================
REM Tanpa step ini, klik dev.bat berulang = EADDRINUSE di :3000/:3001/:8080
REM karena node.exe/cargo.exe/insuretrack-backend.exe dari run sebelumnya
REM masih hidup. Kill by port (netstat+taskkill), JANGAN blind kill by image
REM name — supaya VSCode/IDE/PNPM-cache-process lain tidak ikut terbunuh.
echo [Pre-flight] Membersihkan proses stale di port 3000, 3001, 8080...

set "PORTS_CLEARED=0"
for %%P in (3000 3001 8080) do (
    set "PORT_FOUND=0"
    for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr /R /C:":%%P " ^| findstr /R /C:"LISTENING"') do (
        set "PORT_FOUND=1"
        echo   Kill PID %%A di port %%P...
        taskkill /PID %%A /F >nul 2>&1
    )
    if "!PORT_FOUND!"=="0" echo   Port %%P sudah kosong.
)

REM Tunggu sebentar supaya OS benar-benar release socket-nya (TIME_WAIT).
REM 1.5 detik cukup untuk Windows; loop 5x × 300ms = 1.5s max.
set /a "WAIT_ITERS=0"
:wait_loop
set /a "WAIT_ITERS+=1"
set "ALL_CLEAR=1"
for %%P in (3000 3001 8080) do (
    netstat -ano 2>nul | findstr /R /C:":%%P " | findstr /R /C:"LISTENING" >nul 2>&1
    if not errorlevel 1 set "ALL_CLEAR=0"
)
if "!ALL_CLEAR!"=="0" if !WAIT_ITERS! lss 5 (
    REM Use ping for ~300ms sleep (no Windows-native sleep in batch pre-Win10).
    ping -n 1 -w 300 127.0.0.1 >nul 2>&1
    goto :wait_loop
)
echo.


REM ============================================================================
REM [Pre-flight 2/2] Quick Postgres connectivity check
REM ============================================================================
REM Kalau Postgres service mati, cargo run akan hang sampai timeout 5 detik
REM (lihat PgPoolOptions::acquire_timeout di src/main.rs). Detect lebih awal
REM pakai PowerShell Test-NetConnection — cepat (<1 detik) dan fail early
REM dengan instruksi yang jelas.
echo [Pre-flight] Cek Postgres di localhost:5432...

powershell -NoProfile -Command ^
    "$c = New-Object System.Net.Sockets.TcpClient;" ^
    "try { $c.Connect('127.0.0.1', 5432); $c.Close(); exit 0 }" ^
    "catch { Write-Host '   GAGAL: Postgres tidak reachable di localhost:5432.' -ForegroundColor Yellow; Write-Host '   Start service: Get-Service postgresql-x64-18 ^| Start-Service' -ForegroundColor Yellow; exit 1 }" >nul 2>&1

if errorlevel 1 (
    echo.
    echo   ! Backend tidak akan bisa start tanpa Postgres.
    echo   ! Lanjutkan juga? (Ctrl+C dalam 5 detik untuk batal, atau Enter untuk lanjut)
    echo.
    timeout /t 5 /nobreak >nul 2>&1
)
echo.


REM ============================================================================
REM [1/2] Backend (Rust + Axum)
REM ============================================================================
echo [1/2] Membuka window baru untuk backend (cargo run)...
echo   Pertama kali compile 3-5 menit; setelahnya incremental detik.
echo   Backend listen di :8080. Migrations auto-run pada startup.
start "InsureTrack - Backend (Rust :8080)" cmd /k "cd /d ""!REPO_ROOT!\apps\backend"" && cargo run"
echo.


REM ============================================================================
REM [2/2] Frontend (Next.js via turbo)
REM ============================================================================
echo [2/2] Membuka window baru untuk frontend (pnpm dev)...
echo   Portal :3000 + Admin :3001 jalan paralel (turbo).
start "InsureTrack - Frontend (Portal :3000 + Admin :3001)" cmd /k "cd /d ""!REPO_ROOT!"" && pnpm dev"
echo.


echo === Stack jalan ===
echo   Backend  http://localhost:8080   (window "InsureTrack - Backend")
echo   Portal   http://localhost:3000   (window "InsureTrack - Frontend")
echo   Admin    http://localhost:3001   (window "InsureTrack - Frontend")
echo   DB       localhost:5432          (native Postgres)
echo.
echo Stop: scripts\stop.bat, atau tutup window backend/frontend-nya.
echo DB stop/start: services.msc -^> postgresql-x64-18.
echo.


REM ============================================================================
REM [3/3] Optional: Seed dummy data
REM ============================================================================
echo [3/3] Seed dummy data? (Reset DB + insert 30 customers, 50 regs, dst.)
echo   Default [N] - skip.
echo   Pilih y untuk populate database dengan data demo realistis.
echo   Pilih n untuk lanjut tanpa seed.
echo.
echo   ! Backend HARUS di-stop dulu (lihat instruksi) supaya tidak ada
echo     race condition pada id_sequences. Tutup window "InsureTrack -
echo     Backend" jika sedang running, lalu tekan Enter di window seeder.
echo.
set /p "SEED_CHOICE=Seed dummy data? [y/N]: "
if /i "!SEED_CHOICE!"=="y" (
    echo [Seeder] Membuka window baru untuk cargo run --bin seed -- --reset...
    start "InsureTrack - Seeder (cargo run --bin seed)" cmd /k "cd /d ""!REPO_ROOT!\apps\backend"" && cargo run --bin seed -- --reset --registrations 50 --upload-dir ./uploads"
) else (
    echo [Seeder] Skip.
)
echo.


REM TIDAK pakai `pause` di sini — bikin developer harus klik tombol tiap kali
REM run. Window ini auto-close setelah user selesai baca. Kalau perlu tahan
REM (untuk lihat error), uncomment baris pause di bawah.
REM pause
exit /b 0