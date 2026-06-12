@echo off
REM ============================================================================
REM InsureTrack — Reset postgres user password (one-time recovery)
REM
REM Flow: backup pg_hba.conf -> switch localhost to trust -> restart service
REM        -> set new password -> test -> revert to scram-sha-256 -> restart
REM
REM Butuh admin (UAC prompt akan muncul). Self-elevate kalau belum admin.
REM Tidak butuh install ulang Postgres.
REM ============================================================================


REM --- Step 0: Self-elevate ke admin ----------------------------------------
net session >nul 2>&1
if errorlevel 1 (
    echo [i] Butuh privileges admin untuk edit pg_hba.conf dan restart service.
    echo     Klik "Yes" di UAC prompt.
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)


REM --- Step 1: Detect Postgres install + service ----------------------------
echo.
echo === Reset password postgres user ===
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference = 'Stop';" ^
    "try {" ^
    "  $svc = Get-Service | Where-Object {$_.Name -like 'postgresql-x64-*'} | Select-Object -ExpandProperty Name -First 1;" ^
    "  if (-not $svc) { throw 'PostgreSQL service tidak ditemukan. Pastikan Postgres terinstall.' };" ^
    "  $installs = Get-ItemProperty 'HKLM:\SOFTWARE\PostgreSQL\Installations\*' -ErrorAction SilentlyContinue;" ^
    "  if (-not $installs) { throw 'Postgres install registry key tidak ditemukan.' };" ^
    "  $inst = $installs[0];" ^
    "  $dataDir = $inst.'Data Directory';" ^
    "  $binDir = $inst.'Base Directory';" ^
    "  $version = $inst.Version;" ^
    "  $hba = Join-Path $dataDir 'pg_hba.conf';" ^
    "  $psql = Join-Path $binDir 'bin\psql.exe';" ^
    "  if (-not (Test-Path $hba)) { throw \"pg_hba.conf tidak ada di $hba\" };" ^
    "  if (-not (Test-Path $psql)) { throw \"psql.exe tidak ada di $psql\" };" ^
    "  Write-Host \"Detected: PostgreSQL $version\";" ^
    "  Write-Host \"  Service: $svc\";" ^
    "  Write-Host \"  Data:    $dataDir\";" ^
    "  Write-Host \"  psql:    $psql\";" ^
    "  Write-Host '';" ^
    "  $securePass = Read-Host 'Password BARU untuk user postgres' -AsSecureString;" ^
    "  $confirmPass = Read-Host 'Konfirmasi password' -AsSecureString;" ^
    "  $bstr1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass);" ^
    "  $bstr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmPass);" ^
    "  $newPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr1);" ^
    "  $confPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr2);" ^
    "  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr1);" ^
    "  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr2);" ^
    "  if ([string]::IsNullOrEmpty($newPass)) { throw 'Password tidak boleh kosong.' };" ^
    "  if ($newPass -ne $confPass) { throw 'Password dan konfirmasi tidak sama.' };" ^
    "  Write-Host '';" ^
    "  $backup = \"$hba.bak.$(Get-Date -Format 'yyyyMMddHHmmss')\";" ^
    "  Copy-Item $hba $backup;" ^
    "  Write-Host \"[1/5] Backup: $backup\";" ^
    "  $original = Get-Content $hba;" ^
    "  $trusted = $original | ForEach-Object {" ^
    "    $_ -replace '^(host\s+all\s+all\s+127\.0\.0\.1/32\s+)(scram-sha-256|md5|password)\s*$', '$1trust' -replace '^(host\s+all\s+all\s+::1/128\s+)(scram-sha-256|md5|password)\s*$', '$1trust'" ^
    "  };" ^
    "  Set-Content -Path $hba -Value $trusted -Encoding ASCII;" ^
    "  Write-Host '[2/5] pg_hba.conf switched to trust (temporary)';" ^
    "  Write-Host \"[3/5] Restarting $svc...\";" ^
    "  Restart-Service $svc;" ^
    "  Start-Sleep -Seconds 3;" ^
    "  if ((Get-Service $svc).Status -ne 'Running') { throw \"Service $svc tidak running setelah restart.\" };" ^
    "  $env:PGPASSWORD = '';" ^
    "  & $psql -U postgres -h localhost -d postgres -c \"ALTER USER postgres WITH PASSWORD '$newPass';\" 2>&1 | Out-Null;" ^
    "  if ($LASTEXITCODE -ne 0) { throw 'ALTER USER gagal. Cek log di atas.' };" ^
    "  Write-Host '[4/5] Password set OK';" ^
    "  $reverted = $original | ForEach-Object {" ^
    "    $_ -replace '^(host\s+all\s+all\s+127\.0\.0\.1/32\s+)trust\s*$', '$1scram-sha-256' -replace '^(host\s+all\s+all\s+::1/128\s+)trust\s*$', '$1scram-sha-256'" ^
    "  };" ^
    "  Set-Content -Path $hba -Value $reverted -Encoding ASCII;" ^
    "  Write-Host '[5/5] pg_hba.conf reverted to scram-sha-256';" ^
    "  Restart-Service $svc;" ^
    "  Start-Sleep -Seconds 3;" ^
    "  $env:PGPASSWORD = $newPass;" ^
    "  & $psql -U postgres -h localhost -d postgres -c 'SELECT version();' 2>&1 | Out-Null;" ^
    "  if ($LASTEXITCODE -ne 0) { throw 'Test koneksi GAGAL dengan password baru.' };" ^
    "  Write-Host '';" ^
    "  Write-Host '=== SELESAI ===' -ForegroundColor Green;" ^
    "  Write-Host 'Password postgres sudah di-reset dan diverifikasi.';" ^
    "  Write-Host 'Sekarang bisa run: scripts\setup-db-native.bat';" ^
    "  Write-Host '  -> masukkan password BARU ini saat prompt.';" ^
    "} catch {" ^
    "  Write-Host '';" ^
    "  Write-Host ('GAGAL: ' + $_.Exception.Message) -ForegroundColor Red;" ^
    "  Write-Host 'Coba manual: lihat README di atas script untuk langkah darurat.';" ^
    "  exit 1" ^
    "}"

if errorlevel 1 (
    echo.
    echo Ada error di atas. Lihat pesan dan coba lagi.
) else (
    echo.
    echo Lanjut dengan: scripts\setup-db-native.bat
    echo Masukkan password BARU postgres saat diminta.
)

echo.
pause
exit /b 0
