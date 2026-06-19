@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================================
REM InsureTrack — full dev environment reset + launch (1-shot)
REM
REM Apa yang dilakukan:
REM   1. Tanya password postgres (untuk drop + recreate database)
REM   2. Drop database `digital_insurance` kalau ada (fix migration drift)
REM   3. Recreate database fresh + grant privileges ke insurance_admin
REM   4. Verify insurance_admin bisa connect (cek password match dengan .env)
REM   5. Verify apps\backend\.env point ke local DB
REM   6. Launch dev.bat di window baru (backend cargo + frontend pnpm parallel)
REM
REM Prasyarat:
REM   - Postgres native running (service `postgresql-x64-18` atau setara)
REM   - psql accessible. Default: C:\Program Files\PostgreSQL\18\bin\psql.exe
REM     Override via env var PSQL_BIN kalau beda.
REM   - apps\backend\.env ada dan point ke localhost (lihat step 5 output)
REM
REM Usage: scripts\dev-reset.bat
REM ============================================================================


REM --- Config (override via env var kalau perlu) ---------------------------
if "%PSQL_BIN%"=="" set "PSQL_BIN=C:\Program Files\PostgreSQL\18\bin\psql.exe"
set "PG_SUPERUSER=postgres"
set "PG_DB_USER=postgres"
set "PG_DB_NAME=insuretrack"
set "REPO_ROOT=%~dp0.."
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"


echo.
echo ============================================================
echo   InsureTrack Dev Reset (1-shot setup + launch)
echo ============================================================
echo   Repo:  %REPO_ROOT%
echo   psql:  %PSQL_BIN%
echo   DB:    %PG_DB_NAME% (akan di-drop + recreate)
echo   User:  %PG_DB_USER%
echo.


REM --- Verify Postgres binary exists ---------------------------------------
if not exist "%PSQL_BIN%" (
    echo ERROR: psql tidak ditemukan di "%PSQL_BIN%"
    echo Set env var PSQL_BIN ke path yang benar, mis:
    echo   set PSQL_BIN=C:\path\to\psql.exe
    exit /b 1
)


REM --- Step 1: Tanya password postgres -------------------------------------
set /p PGPASSWORD="Password untuk user '%PG_SUPERUSER%' (Postgres superuser): "
if "%PGPASSWORD%"=="" (
    echo.
    echo ERROR: password tidak boleh kosong.
    exit /b 1
)
echo.


REM --- Step 2: Drop database lama (kalau ada) ------------------------------
echo [1/5] Drop database '%PG_DB_NAME%' kalau ada...
"%PSQL_BIN%" -U %PG_SUPERUSER% -c "DROP DATABASE IF EXISTS %PG_DB_NAME%;" 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: gagal drop database. Cek:
    echo   - Password postgres benar
    echo   - Postgres service running (Get-Service postgresql-x64-18)
    exit /b 1
)


REM --- Step 3: Create database fresh + grant --------------------------------
echo.
echo [2/5] Create database fresh '%PG_DB_NAME%' + grant ke %PG_DB_USER%...
"%PSQL_BIN%" -U %PG_SUPERUSER% -c "CREATE DATABASE %PG_DB_NAME% OWNER %PG_DB_USER%;" 2>&1
if errorlevel 1 (
    echo ERROR: gagal create database.
    exit /b 1
)
"%PSQL_BIN%" -U %PG_SUPERUSER% -d %PG_DB_NAME% -c "GRANT ALL PRIVILEGES ON DATABASE %PG_DB_NAME% TO %PG_DB_USER%;" 2>&1
if errorlevel 1 (
    echo ERROR: gagal grant privileges.
    exit /b 1
)


REM --- Step 4: Verify insurance_admin bisa connect -------------------------
echo.
echo [3/5] Verify %PG_DB_USER% bisa connect (password match .env)...
"%PSQL_BIN%" -U %PG_DB_USER% -d %PG_DB_NAME% -c "SELECT current_database(), current_user, version();" 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: %PG_DB_USER% tidak bisa connect ke %PG_DB_NAME%.
    echo Kemungkinan penyebab:
    echo   1. Role %PG_DB_USER% belum ada di Postgres (lihat scripts\setup-db-native.bat)
    echo   2. Password di apps\backend\.env tidak match dengan password role ini
    echo.
    echo Cek password di .env:
    findstr /B /C:"DATABASE_URL" "%REPO_ROOT%\apps\backend\.env" 2>nul
    exit /b 1
)


REM --- Step 5: Verify apps\backend\.env point ke local DB ------------------
echo.
echo [4/5] Verify apps\backend\.env point ke local DB...
findstr /B /C:"DATABASE_URL" "%REPO_ROOT%\apps\backend\.env" 2>nul
if errorlevel 1 (
    echo.
    echo WARNING: DATABASE_URL tidak ditemukan di .env
    echo File .env mungkin belum ada. Copy dari .env.example:
    echo   copy apps\backend\.env.example apps\backend\.env
) else (
    echo OK: DATABASE_URL ditemukan.
)


REM --- Step 6: Launch dev.bat (backend + frontend dalam 2 window) ---------
echo.
echo [5/5] Launching dev.bat (backend + frontend)...
echo   - Window 1: cargo run backend (port 8080, migrations auto-apply)
echo   - Window 2: pnpm dev frontend (portal :3000 + admin :3001)
echo.
echo ============================================================
echo   Dev stack launching di window baru.
echo   Close window ini (atau tekan Enter) setelah dev.bat jalan.
echo ============================================================
echo.

start "InsureTrack - Dev Stack" /D "%REPO_ROOT%" cmd /k "call \"%REPO_ROOT%\dev.bat\""
if errorlevel 1 (
    echo ERROR: gagal start dev.bat.
    exit /b 1
)

echo dev.bat launched. Tunggu beberapa detik, lalu check:
echo   - Backend window: harusnya "server listening on 0.0.0.0:8080"
echo   - Frontend window: harusnya portal :3000 + admin :3001 running
echo.
echo Test di browser:
echo   http://localhost:3000       (portal customer)
echo   http://localhost:3001       (admin login)
echo   http://localhost:8080/api/public/products   (API health)
echo.
echo Press any key to close this window...
pause > nul
