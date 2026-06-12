@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================================
REM InsureTrack — one-time native Postgres setup (Windows cmd compatible)
REM
REM Tujuan: siapkan database `digital_insurance` + role `insurance_admin` di
REM         Postgres native (versi apapun) yang sudah running di localhost:5432.
REM         Idempotent — aman run berulang.
REM
REM Prasyarat:
REM   - psql.exe accessible. Default diasumsikan di:
REM       C:\Program Files\PostgreSQL\18\bin\psql.exe
REM     Override via env var PSQL_BIN jika beda.
REM   - Anda tahu password untuk user `postgres` (akan diminta oleh psql).
REM
REM Setelah selesai:
REM   - apps\backend\.env sudah point ke localhost:5432 (sudah di-edit).
REM   - `cargo run` di apps\backend akan trigger sqlx::migrate! otomatis.
REM ============================================================================


REM --- Override via env var --------------------------------------------------
if "%PSQL_BIN%"=="" set "PSQL_BIN=C:\Program Files\PostgreSQL\18\bin\psql.exe"
set "TEMP_SQL=%TEMP%\insuretrack_setup_%RANDOM%.sql"


REM --- Resolve repo root -----------------------------------------------------
set "REPO_ROOT=%~dp0.."
if "!REPO_ROOT:~-1!"=="\" set "REPO_ROOT=!REPO_ROOT:~0,-1!"


echo.
echo === InsureTrack — Native Postgres setup ===
echo psql:  !PSQL_BIN!
echo Repo:  !REPO_ROOT!
echo.

REM --- Tanya password postgres SEKALI di awal, simpan di PGPASSWORD ---------
REM psql akan auto-pakai env var ini (tidak perlu prompt 5x). Input echoed
REM di layar — untuk dev lokal di mesin pribadi cukup aman.
set /p PGPASSWORD="Password untuk user 'postgres': "
echo.

if "%PGPASSWORD%"=="" (
    echo ERROR: password tidak boleh kosong.
    goto :err
)


REM --- Pre-flight: cek psql ada --------------------------------------------
if not exist "!PSQL_BIN!" (
    echo ERROR: psql.exe tidak ditemukan di "!PSQL_BIN!".
    echo Set env var PSQL_BIN ke path yang benar, misal:
    echo   set PSQL_BIN=C:\Program Files\PostgreSQL\15\bin\psql.exe
    goto :err
)


REM --- [1/4] Sanity ping ----------------------------------------------------
echo [1/4] Pinging Postgres sebagai postgres@localhost...
"!PSQL_BIN!" -U postgres -h localhost -d postgres -c "SELECT version();" >nul 2>&1
if errorlevel 1 (
    echo.
    echo GAGAL connect ke postgres@localhost. Kemungkinan:
    echo   1. Service postgresql belum running — start via services.msc.
    echo   2. Password postgres salah. (Reset: edit pg_hba.conf, ganti
    echo      "host all all 127.0.0.1/32 scram-sha-256" jadi "trust",
    echo      restart service, lalu ALTER USER postgres WITH PASSWORD='...'.)
    goto :err
)
echo   OK.
echo.


REM --- [2/4] Create role 'insurance_admin' (idempotent) ---------------------
echo [2/4] Menyiapkan role 'insurance_admin'...
"!PSQL_BIN!" -U postgres -h localhost -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='insurance_admin';" > "%TEMP%\role_check.txt" 2>nul
findstr /r "^1$" "%TEMP%\role_check.txt" >nul 2>&1
if not errorlevel 1 (
    "!PSQL_BIN!" -U postgres -h localhost -d postgres -c "ALTER ROLE insurance_admin WITH LOGIN PASSWORD 'insurance_password';" >nul 2>&1
    echo   Role sudah ada, password di-reset ke 'insurance_password'.
) else (
    "!PSQL_BIN!" -U postgres -h localhost -d postgres -c "CREATE ROLE insurance_admin WITH LOGIN PASSWORD 'insurance_password';" >nul 2>&1
    echo   Role dibuat dengan password 'insurance_password'.
)
if errorlevel 1 goto :err
echo.


REM --- [3/4] Create database 'digital_insurance' (idempotent) ---------------
echo [3/4] Menyiapkan database 'digital_insurance'...
"!PSQL_BIN!" -U postgres -h localhost -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='digital_insurance';" > "%TEMP%\db_check.txt" 2>nul
findstr /r "^1$" "%TEMP%\db_check.txt" >nul 2>&1
if not errorlevel 1 (
    echo   Database sudah ada, skip.
) else (
    "!PSQL_BIN!" -U postgres -h localhost -d postgres -c "CREATE DATABASE digital_insurance OWNER insurance_admin;" >nul 2>&1
    if errorlevel 1 goto :err
    echo   Database dibuat, owner=insurance_admin.
)
echo.


REM --- [4/4] Grant + enable uuid-ossp extension -----------------------------
echo [4/4] Grant privileges + enable uuid-ossp extension...

REM Tulis SQL ke temp file (lebih reliable dari -c untuk multi-statement)
(
    echo GRANT ALL PRIVILEGES ON DATABASE digital_insurance TO insurance_admin;
    echo GRANT ALL ON SCHEMA public TO insurance_admin;
    echo CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
) > "!TEMP_SQL!"

"!PSQL_BIN!" -U postgres -h localhost -d digital_insurance -v ON_ERROR_STOP=1 -f "!TEMP_SQL!" >nul 2>&1
if errorlevel 1 goto :err
del "!TEMP_SQL!" 2>nul
echo   OK.
echo.


echo === Setup selesai ===
echo.
echo Verifikasi koneksi sebagai insurance_admin:
echo   "!PSQL_BIN!" -U insurance_admin -h localhost -d digital_insurance -c "\dt"
echo.
echo Lanjut: klik dev.bat, atau:
echo   cd apps\backend ^&^& cargo run
echo   (di terminal lain: pnpm dev)
echo.
pause
exit /b 0


:err
echo.
echo GAGAL. Lihat error di atas.
if exist "!TEMP_SQL!" del "!TEMP_SQL!" 2>nul
pause
exit /b 1
