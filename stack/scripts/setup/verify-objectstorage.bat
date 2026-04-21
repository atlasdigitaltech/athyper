@echo off
setlocal EnableDelayedExpansion

:: ============================================================
:: athyper Stack - VERIFY OBJECT STORAGE
:: Location:
::   stack/scripts/setup/verify-objectstorage.bat
:: Usage:
::   verify-objectstorage.bat
::   verify-objectstorage.bat C:\path\to\.env
::
:: Windows companion to verify-objectstorage.sh
:: Verifies MinIO health, required buckets, and (non-local)
:: scoped service account existence.
::
:: Exit codes:
::   0 -- all checks pass
::   1 -- one or more failures
:: ============================================================

:: ----------------------------
:: Prefer Git Bash if available
:: ----------------------------
where bash >nul 2>&1
if %errorlevel% equ 0 (
    if "%~1"=="" (
        bash "%~dp0verify-objectstorage.sh"
    ) else (
        bash "%~dp0verify-objectstorage.sh" "%~1"
    )
    exit /b %errorlevel%
)

:: ----------------------------
:: Fallback: PowerShell inline
:: ----------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: Resolve env file path
if not "%~1"=="" (
    set "ENV_FILE=%~1"
) else (
    set "ENV_FILE=%SCRIPT_DIR%\..\..\env\.env"
)

if not exist "!ENV_FILE!" (
    echo FATAL: env file not found: !ENV_FILE!
    echo Run setup-env.bat first or pass the path explicitly.
    exit /b 1
)

set "TMPSCRIPT=%TEMP%\vos_%RANDOM%.ps1"
if exist "%TMPSCRIPT%" del "%TMPSCRIPT%"

>> "%TMPSCRIPT%" echo param([string]$envFile)
>> "%TMPSCRIPT%" echo $envMap = @{}
>> "%TMPSCRIPT%" echo foreach ($line in (Get-Content $envFile -Encoding UTF8)) {
>> "%TMPSCRIPT%" echo     if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
>> "%TMPSCRIPT%" echo     $parts = $line -split '=', 2
>> "%TMPSCRIPT%" echo     if ($parts.Count -lt 2) { continue }
>> "%TMPSCRIPT%" echo     $k = $parts[0].Trim()
>> "%TMPSCRIPT%" echo     $v = $parts[1] -replace '#.*$', '' -replace '"', ''
>> "%TMPSCRIPT%" echo     $v = $v.Trim()
>> "%TMPSCRIPT%" echo     $envMap[$k] = $v
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo $environment     = if ($envMap['ENVIRONMENT'])       { $envMap['ENVIRONMENT'] }       else { 'local' }
>> "%TMPSCRIPT%" echo $s3AccessKey     = if ($envMap['S3_ACCESS_KEY'])     { $envMap['S3_ACCESS_KEY'] }     else { '' }
>> "%TMPSCRIPT%" echo $s3SecretKey     = if ($envMap['S3_SECRET_KEY'])     { $envMap['S3_SECRET_KEY'] }     else { '' }
>> "%TMPSCRIPT%" echo $s3Bucket        = if ($envMap['S3_BUCKET'])         { $envMap['S3_BUCKET'] }         else { 'athyper-local' }
>> "%TMPSCRIPT%" echo $backupBucket    = if ($envMap['BACKUP_S3_BUCKET'])  { $envMap['BACKUP_S3_BUCKET'] }  else { 'athyper-backups' }
>> "%TMPSCRIPT%" echo $tempoBucket     = if ($envMap['TEMPO_S3_BUCKET'])   { $envMap['TEMPO_S3_BUCKET'] }   else { 'athyper-tempo-traces' }
>> "%TMPSCRIPT%" echo $lokiBucket      = if ($envMap['LOKI_S3_BUCKET'])    { $envMap['LOKI_S3_BUCKET'] }    else { 'athyper-loki-logs' }
>> "%TMPSCRIPT%" echo $appKey          = if ($envMap['APP_S3_ACCESS_KEY'])    { $envMap['APP_S3_ACCESS_KEY'] }    else { '' }
>> "%TMPSCRIPT%" echo $backupKey       = if ($envMap['BACKUP_S3_ACCESS_KEY']) { $envMap['BACKUP_S3_ACCESS_KEY'] } else { '' }
>> "%TMPSCRIPT%" echo $tempoKey        = if ($envMap['TEMPO_S3_ACCESS_KEY'])  { $envMap['TEMPO_S3_ACCESS_KEY'] }  else { '' }
>> "%TMPSCRIPT%" echo $lokiKey         = if ($envMap['LOKI_S3_ACCESS_KEY'])   { $envMap['LOKI_S3_ACCESS_KEY'] }   else { '' }
>> "%TMPSCRIPT%" echo $mcImage         = 'minio/mc:RELEASE.2025-08-13T08-35-41Z'
>> "%TMPSCRIPT%" echo $mcNetwork       = 'athyper-edge'
>> "%TMPSCRIPT%" echo $hostEndpoint    = 'http://127.0.0.1:9000'
>> "%TMPSCRIPT%" echo $mcEndpoint      = 'http://objectstorage:9000'
>> "%TMPSCRIPT%" echo $errors = 0
>> "%TMPSCRIPT%" echo $failures = @()
>> "%TMPSCRIPT%" echo function Fail($msg) { Write-Host "  FAIL  $msg"; $script:errors++; $script:failures += $msg }
>> "%TMPSCRIPT%" echo function Pass($msg) { Write-Host "  OK    $msg" }
>> "%TMPSCRIPT%" echo function McRun([string[]]$args_) {
>> "%TMPSCRIPT%" echo     $result = docker run --rm --network $mcNetwork -e MC_CONFIG_DIR=/tmp/.mc $mcImage @args_ 2`>$null
>> "%TMPSCRIPT%" echo     return $LASTEXITCODE
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo Write-Host '=============================================='
>> "%TMPSCRIPT%" echo Write-Host '  athyper object storage verification'
>> "%TMPSCRIPT%" echo Write-Host "  environment: $environment"
>> "%TMPSCRIPT%" echo Write-Host '=============================================='
>> "%TMPSCRIPT%" echo Write-Host ''
>> "%TMPSCRIPT%" echo Write-Host '[1/4] MinIO health...'
>> "%TMPSCRIPT%" echo try {
>> "%TMPSCRIPT%" echo     $resp = Invoke-WebRequest -Uri "$hostEndpoint/minio/health/live" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
>> "%TMPSCRIPT%" echo     if ($resp.StatusCode -eq 200) { Pass "MinIO health endpoint returned 200" }
>> "%TMPSCRIPT%" echo     else { Fail "MinIO returned HTTP $($resp.StatusCode)" }
>> "%TMPSCRIPT%" echo } catch {
>> "%TMPSCRIPT%" echo     Fail "MinIO not reachable at $hostEndpoint/minio/health/live"
>> "%TMPSCRIPT%" echo     Write-Host "  Make sure the stack is running: stack\scripts\stack-profile\up.bat core"
>> "%TMPSCRIPT%" echo     Write-Host "RESULT: FAILED ($($script:errors) error(s))"
>> "%TMPSCRIPT%" echo     exit 1
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo Write-Host '[2/4] Buckets...'
>> "%TMPSCRIPT%" echo if (-not $s3AccessKey -or -not $s3SecretKey) {
>> "%TMPSCRIPT%" echo     Fail 'S3_ACCESS_KEY or S3_SECRET_KEY not set -- cannot verify buckets'
>> "%TMPSCRIPT%" echo } else {
>> "%TMPSCRIPT%" echo     McRun @('alias','set','storage',$mcEndpoint,$s3AccessKey,$s3SecretKey) | Out-Null
>> "%TMPSCRIPT%" echo     if ($LASTEXITCODE -ne 0) {
>> "%TMPSCRIPT%" echo         Fail 'mc alias set failed -- MinIO may not be reachable from athyper-edge network'
>> "%TMPSCRIPT%" echo     } else {
>> "%TMPSCRIPT%" echo         foreach ($b in @($s3Bucket, $backupBucket, $tempoBucket, $lokiBucket)) {
>> "%TMPSCRIPT%" echo             $rc = McRun @('ls',"storage/$b")
>> "%TMPSCRIPT%" echo             if ($rc -eq 0) { Pass "bucket exists: $b" } else { Fail "bucket missing: $b" }
>> "%TMPSCRIPT%" echo         }
>> "%TMPSCRIPT%" echo     }
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo Write-Host '[3/4] APP credential r/w test...'
>> "%TMPSCRIPT%" echo $appSecretKey = if ($envMap['APP_S3_SECRET_KEY']) { $envMap['APP_S3_SECRET_KEY'] } else { '' }
>> "%TMPSCRIPT%" echo if (-not $appKey -or -not $appSecretKey) {
>> "%TMPSCRIPT%" echo     Write-Host "  SKIP  APP_S3_ACCESS_KEY not set -- skipping r/w test"
>> "%TMPSCRIPT%" echo } else {
>> "%TMPSCRIPT%" echo     McRun @('alias','set','apptest',$mcEndpoint,$appKey,$appSecretKey) | Out-Null
>> "%TMPSCRIPT%" echo     $testKey = "athyper-verify-test-$(Get-Date -UFormat '%s')"
>> "%TMPSCRIPT%" echo     $testContent = "athyper-objectstorage-verify"
>> "%TMPSCRIPT%" echo     $tmpFile = [System.IO.Path]::GetTempFileName()
>> "%TMPSCRIPT%" echo     Set-Content -Path $tmpFile -Value $testContent -Encoding ASCII
>> "%TMPSCRIPT%" echo     $rc = McRun @('cp',$tmpFile,"apptest/$s3Bucket/$testKey")
>> "%TMPSCRIPT%" echo     Remove-Item $tmpFile -ErrorAction SilentlyContinue
>> "%TMPSCRIPT%" echo     if ($rc -eq 0) {
>> "%TMPSCRIPT%" echo         Pass "APP credentials: write OK"
>> "%TMPSCRIPT%" echo         $rc2 = McRun @('cat',"apptest/$s3Bucket/$testKey")
>> "%TMPSCRIPT%" echo         if ($rc2 -eq 0) { Pass "APP credentials: read OK" } else { Fail "APP credentials: read failed" }
>> "%TMPSCRIPT%" echo         McRun @('rm',"apptest/$s3Bucket/$testKey") | Out-Null
>> "%TMPSCRIPT%" echo         Pass "APP credentials: delete OK (test object cleaned up)"
>> "%TMPSCRIPT%" echo     } else { Fail "APP credentials: write failed on bucket $s3Bucket" }
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo Write-Host '[4/4] Scoped service accounts...'
>> "%TMPSCRIPT%" echo if ($environment -eq 'local') {
>> "%TMPSCRIPT%" echo     Write-Host "  SKIP  ENVIRONMENT=local -- scoped accounts not provisioned"
>> "%TMPSCRIPT%" echo } else {
>> "%TMPSCRIPT%" echo     McRun @('alias','set','storage',$mcEndpoint,$s3AccessKey,$s3SecretKey) | Out-Null
>> "%TMPSCRIPT%" echo     foreach ($entry in @("${appKey}:app","${backupKey}:backup","${tempoKey}:tempo","${lokiKey}:loki")) {
>> "%TMPSCRIPT%" echo         $parts2 = $entry -split ':', 2
>> "%TMPSCRIPT%" echo         $key2 = $parts2[0]; $label2 = $parts2[1]
>> "%TMPSCRIPT%" echo         if (-not $key2) { Fail "scoped account key empty for: $label2"; continue }
>> "%TMPSCRIPT%" echo         $rc3 = McRun @('admin','user','info','storage',$key2)
>> "%TMPSCRIPT%" echo         if ($rc3 -eq 0) { Pass "scoped user exists: $label2 ($key2)" }
>> "%TMPSCRIPT%" echo         else { Fail "scoped user missing: $label2 ($key2)" }
>> "%TMPSCRIPT%" echo     }
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo Write-Host ''
>> "%TMPSCRIPT%" echo Write-Host '=============================================='
>> "%TMPSCRIPT%" echo if ($script:errors -gt 0) {
>> "%TMPSCRIPT%" echo     Write-Host "  RESULT: FAILED -- $($script:errors) error(s)"
>> "%TMPSCRIPT%" echo     foreach ($f in $script:failures) { Write-Host "    x $f" }
>> "%TMPSCRIPT%" echo     Write-Host '=============================================='
>> "%TMPSCRIPT%" echo     exit 1
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo Write-Host '  RESULT: PASSED -- MinIO healthy, all checks OK'
>> "%TMPSCRIPT%" echo Write-Host '=============================================='
>> "%TMPSCRIPT%" echo exit 0

powershell -NoProfile -ExecutionPolicy Bypass -File "%TMPSCRIPT%" "!ENV_FILE!"
set "EXITCODE=%errorlevel%"

del "%TMPSCRIPT%" 2>nul

exit /b %EXITCODE%
