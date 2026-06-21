@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================================
REM InsureTrack — dev stack shutdown (companion untuk dev.bat)
REM
REM Yang dilakukan:
REM   1. Kill proses di port 3000 (portal), 3001 (admin), 8080 (backend)
REM   2. Kill orphan cargo.exe yang masih compile (kalau backend window
REM      tertutup sebelum cargo selesai, compile-nya bisa nyangkut)
REM
REM Aman run berulang (idempotent). Aman run saat tidak ada proses
REM (akan lapor "Port X sudah kosong." dan lanjut).
REM ============================================================================


echo.
echo === InsureTrack Dev Stop ===
echo   Kill processes on :3000 (portal), :3001 (admin), :8080 (backend)
echo.


REM --- 1. Kill by port --------------------------------------------------------
REM netstat menampilkan 2 baris per listening socket (IPv4 0.0.0.0 + IPv6
REM [::]) yang share PID sama. Dedup dulu sebelum kill supaya output rapi.
set "KILLED_ANY=0"
for %%P in (3000 3001 8080) do (
    set "PORT_FOUND=0"
    set "SEEN_PIDS="
    for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr /R /C:":%%P " ^| findstr /R /C:"LISTENING"') do (
        echo !SEEN_PIDS! | findstr /R /C:" %%A " >nul 2>&1
        if errorlevel 1 (
            set "PORT_FOUND=1"
            set "KILLED_ANY=1"
            set "SEEN_PIDS=!SEEN_PIDS! %%A "
            echo   Killing PID %%A on port %%P...
            taskkill /PID %%A /F >nul 2>&1
        )
    )
    if "!PORT_FOUND!"=="0" echo   Port %%P already free.
)


REM --- 2. Kill orphan cargo.exe building for backend -------------------------
REM cargo yang masih run (mis. habis klik close window backend tapi build
REM belum selesai) kadang meninggalkan cargo.exe yang consume CPU dan
REM nge-block rebuild berikutnya. Filter by parent window title tidak
REM reliable dari batch — pakai heuristic: kill semua cargo.exe yang
REM child-nya rustc.exe (linker aktif). Untuk simplicity & safety, kita
REM skip aggressive kill di sini — biarkan user kill manual kalau perlu.
REM taskkill /IM cargo.exe /F  -- intentionally NOT used (too aggressive).


if "!KILLED_ANY!"=="1" (
    echo.
    echo   Stack stopped. Ports akan release dalam 1-2 detik.
) else (
    echo.
    echo   Nothing to stop — no dev processes were running.
)
echo.
exit /b 0