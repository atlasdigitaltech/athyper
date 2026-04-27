@echo off
setlocal EnableDelayedExpansion

:: ============================================================
:: athyper Stack — SMOKE TEST
:: Location:
::   stack\scripts\smoke-staging.bat
:: Usage:
::   smoke-staging.bat                (auto-detects .env)
::   smoke-staging.bat C:\path\.env   (explicit env file)
::
:: Windows companion to smoke-staging.sh
:: Runs a fast end-to-end health sweep against a running stack.
::
:: Prefers Git Bash (runs smoke-staging.sh directly).
:: Falls back to a PowerShell inline implementation when Git Bash
:: is not available.
::
:: Exit codes:
::   0 -- all checks passed
::   1 -- one or more failures
:: ============================================================

:: ----------------------------
:: Prefer Git Bash; skip WSL relay (System32\bash.exe requires a distro).
:: ----------------------------
set "BASH_EXE="

:: 1. Well-known system-scope Git Bash locations
for %%P in (
    "C:\Program Files\Git\bin\bash.exe"
    "C:\Program Files (x86)\Git\bin\bash.exe"
) do if "!BASH_EXE!"=="" if exist "%%~P" set "BASH_EXE=%%~P"

:: 2. User-scope Git install (winget / scoop default)
if "!BASH_EXE!"=="" if exist "!LOCALAPPDATA!\Programs\Git\bin\bash.exe" (
    set "BASH_EXE=!LOCALAPPDATA!\Programs\Git\bin\bash.exe"
)

:: 3. Any bash on PATH that is NOT the WSL relay at System32\bash.exe
if "!BASH_EXE!"=="" (
    for /f "delims=" %%B in ('where bash 2^>nul') do (
        if "!BASH_EXE!"=="" (
            echo "%%B" | findstr /i /c:"System32\bash" >nul 2>&1
            if errorlevel 1 set "BASH_EXE=%%B"
        )
    )
)

if not "!BASH_EXE!"=="" (
    if "%~1"=="" (
        "!BASH_EXE!" "%~dp0smoke-staging.sh"
    ) else (
        "!BASH_EXE!" "%~dp0smoke-staging.sh" "%~1"
    )
    exit /b !errorlevel!
)

:: ----------------------------
:: Fallback: PowerShell inline
:: ----------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: Resolve env file
if not "%~1"=="" (
    set "ENV_FILE=%~1"
) else (
    set "ENV_FILE=%SCRIPT_DIR%\..\..\env\.env"
)

if not exist "!ENV_FILE!" (
    echo FATAL: env file not found: !ENV_FILE!
    echo Pass the path explicitly: smoke-staging.bat C:\path\to\.env
    exit /b 1
)

set "TMPSCRIPT=%TEMP%\smoke_%RANDOM%.ps1"
if exist "%TMPSCRIPT%" del "%TMPSCRIPT%"

>> "%TMPSCRIPT%" echo param([string]$envFile)
>> "%TMPSCRIPT%" echo $envMap = @{}
>> "%TMPSCRIPT%" echo foreach ($line in (Get-Content $envFile -Encoding UTF8)) {
>> "%TMPSCRIPT%" echo     if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
>> "%TMPSCRIPT%" echo     $parts = $line -split '=', 2
>> "%TMPSCRIPT%" echo     if ($parts.Count -lt 2) { continue }
>> "%TMPSCRIPT%" echo     $k = $parts[0].Trim()
>> "%TMPSCRIPT%" echo     $v = ($parts[1] -replace '#.*$', '' -replace '"', '').Trim()
>> "%TMPSCRIPT%" echo     $envMap[$k] = $v
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo $project     = if ($envMap['COMPOSE_PROJECT_NAME']) { $envMap['COMPOSE_PROJECT_NAME'] } else { 'athyper' }
>> "%TMPSCRIPT%" echo $apiHost     = if ($envMap['APPS_ATHYPER_API_HOST'])  { $envMap['APPS_ATHYPER_API_HOST'] }  else { 'api.athyper.local' }
>> "%TMPSCRIPT%" echo $webHost     = if ($envMap['APPS_ATHYPER_WEB_HOST'])  { $envMap['APPS_ATHYPER_WEB_HOST'] }  else { 'neon.athyper.local' }
>> "%TMPSCRIPT%" echo $iamHost     = if ($envMap['IAM_HOST'])               { $envMap['IAM_HOST'] }               else { 'iam.athyper.local' }
>> "%TMPSCRIPT%" echo $environment = if ($envMap['ENVIRONMENT'])            { $envMap['ENVIRONMENT'] }            else { 'local' }
>> "%TMPSCRIPT%" echo $scheme      = if ($environment -eq 'local') { 'http' } else { 'https' }
>> "%TMPSCRIPT%" echo $redisPass   = $envMap['MEMORYCACHE_PASSWORD']
>> "%TMPSCRIPT%" echo $errors = 0
>> "%TMPSCRIPT%" echo $failures = @()
>> "%TMPSCRIPT%" echo function Pass([string]$msg) { Write-Host "  OK    $msg" }
>> "%TMPSCRIPT%" echo function Fail([string]$msg) { Write-Host "  FAIL  $msg"; $script:errors++; $script:failures += $msg }
>> "%TMPSCRIPT%" echo function Skip([string]$msg) { Write-Host "  SKIP  $msg" }
>> "%TMPSCRIPT%" echo function HttpCheck([string]$label, [string]$url, [int]$expected = 200) {
>> "%TMPSCRIPT%" echo     try {
>> "%TMPSCRIPT%" echo         $resp = Invoke-WebRequest -Uri $url -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
>> "%TMPSCRIPT%" echo         if ([int]$resp.StatusCode -eq $expected) { Pass "$label -^> HTTP $($resp.StatusCode)" }
>> "%TMPSCRIPT%" echo         else { Fail "$label -^> expected HTTP $expected, got $($resp.StatusCode) ($url)" }
>> "%TMPSCRIPT%" echo     } catch {
>> "%TMPSCRIPT%" echo         Fail "$label -^> no response ($url)"
>> "%TMPSCRIPT%" echo     }
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo Write-Host ""
>> "%TMPSCRIPT%" echo Write-Host "============================================================"
>> "%TMPSCRIPT%" echo Write-Host "  athyper Smoke Test"
>> "%TMPSCRIPT%" echo Write-Host "  environment : $environment"
>> "%TMPSCRIPT%" echo Write-Host "  project     : $project"
>> "%TMPSCRIPT%" echo Write-Host "  env file    : $envFile"
>> "%TMPSCRIPT%" echo Write-Host "============================================================"
>> "%TMPSCRIPT%" echo Write-Host ""
>> "%TMPSCRIPT%" echo Write-Host "[1/8] Docker container status..."
>> "%TMPSCRIPT%" echo $containers = @("$project-db-1","$project-dbpool-apps-1","$project-dbpool-session-1","$project-memorycache-1","$project-objectstorage-1","$project-gateway-1")
>> "%TMPSCRIPT%" echo foreach ($cname in $containers) {
>> "%TMPSCRIPT%" echo     $state = docker inspect --format '{{.State.Status}}' $cname 2^>$null
>> "%TMPSCRIPT%" echo     if ($LASTEXITCODE -eq 0 -and $state -eq 'running') { Pass "container: $cname" }
>> "%TMPSCRIPT%" echo     else { $s = if ($state) { $state.Trim() } else { 'missing' }; Fail "container: $cname (state=$s)" }
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo $allRunning = (docker ps --format '{{.Names}}' 2^>$null ^| Where-Object { $_ -match "^$project-" }).Count
>> "%TMPSCRIPT%" echo Pass "total containers running under project: $allRunning"
>> "%TMPSCRIPT%" echo Write-Host ""
>> "%TMPSCRIPT%" echo Write-Host "[2/8] Postgres direct readiness..."
>> "%TMPSCRIPT%" echo docker inspect "$project-db-1" 2^>$null ^| Out-Null
>> "%TMPSCRIPT%" echo if ($LASTEXITCODE -eq 0) {
>> "%TMPSCRIPT%" echo     docker exec "$project-db-1" pg_isready -q 2^>$null ^| Out-Null
>> "%TMPSCRIPT%" echo     if ($LASTEXITCODE -eq 0) { Pass "Postgres pg_isready" } else { Fail "Postgres pg_isready returned non-zero" }
>> "%TMPSCRIPT%" echo } else { Skip "container $project-db-1 not found" }
>> "%TMPSCRIPT%" echo Write-Host ""
>> "%TMPSCRIPT%" echo Write-Host "[3/8] PgBouncer pools..."
>> "%TMPSCRIPT%" echo $pools = @( @{c="$project-dbpool-apps-1";p=6432;l="apps"}, @{c="$project-dbpool-session-1";p=6433;l="session"} )
>> "%TMPSCRIPT%" echo foreach ($pool in $pools) {
>> "%TMPSCRIPT%" echo     docker inspect $pool.c 2^>$null ^| Out-Null
>> "%TMPSCRIPT%" echo     if ($LASTEXITCODE -eq 0) {
>> "%TMPSCRIPT%" echo         docker exec $pool.c pg_isready -h 127.0.0.1 -p $pool.p -q 2^>$null ^| Out-Null
>> "%TMPSCRIPT%" echo         if ($LASTEXITCODE -eq 0) { Pass "PgBouncer $($pool.l) (:$($pool.p))" } else { Fail "PgBouncer $($pool.l) (:$($pool.p)) not ready" }
>> "%TMPSCRIPT%" echo     } else { Skip "container $($pool.c) not found" }
>> "%TMPSCRIPT%" echo }
>> "%TMPSCRIPT%" echo Write-Host ""
>> "%TMPSCRIPT%" echo Write-Host "[4/8] Redis ping..."
>> "%TMPSCRIPT%" echo docker inspect "$project-memorycache-1" 2^>$null ^| Out-Null
>> "%TMPSCRIPT%" echo if ($LASTEXITCODE -eq 0) {
>> "%TMPSCRIPT%" echo     if ($redisPass) {
>> "%TMPSCRIPT%" echo         $ping = docker exec "$project-memorycache-1" redis-cli --no-auth-warning -a $redisPass ping 2^>$null
>> "%TMPSCRIPT%" echo     } else {
>> "%TMPSCRIPT%" echo         $ping = docker exec "$project-memorycache-1" redis-cli ping 2^>$null
>> "%TMPSCRIPT%" echo     }
>> "%TMPSCRIPT%" echo     if ($ping -match 'PONG') { Pass "Redis ping -^> PONG" } else { Fail "Redis ping failed (got: $ping)" }
>> "%TMPSCRIPT%" echo } else { Skip "container $project-memorycache-1 not found" }
>> "%TMPSCRIPT%" echo Write-Host ""
>> "%TMPSCRIPT%" echo Write-Host "[5/8] MinIO HTTP health..."
>> "%TMPSCRIPT%" echo HttpCheck "MinIO liveness" "http://127.0.0.1:9000/minio/health/live"
>> "%TMPSCRIPT%" echo Write-Host ""
>> "%TMPSCRIPT%" echo Write-Host "[6/8] API service endpoints (${scheme}://${apiHost})..."
>> "%TMPSCRIPT%" echo HttpCheck "API /livez"  "${scheme}://${apiHost}/livez"
>> "%TMPSCRIPT%" echo HttpCheck "API /readyz" "${scheme}://${apiHost}/readyz"
>> "%TMPSCRIPT%" echo Write-Host ""
>> "%TMPSCRIPT%" echo Write-Host "[7/8] Web frontend (${scheme}://${webHost})..."
>> "%TMPSCRIPT%" echo HttpCheck "Web /livez" "${scheme}://${webHost}/livez"
>> "%TMPSCRIPT%" echo Write-Host ""
>> "%TMPSCRIPT%" echo Write-Host "[8/8] IAM OIDC discovery (${scheme}://${iamHost})..."
>> "%TMPSCRIPT%" echo HttpCheck "IAM /.well-known/openid-configuration" "${scheme}://${iamHost}/realms/athyper/.well-known/openid-configuration"
>> "%TMPSCRIPT%" echo Write-Host ""
>> "%TMPSCRIPT%" echo Write-Host "============================================================"
>> "%TMPSCRIPT%" echo if ($errors -gt 0) {
>> "%TMPSCRIPT%" echo     Write-Host "  RESULT: FAILED -- $errors check(s) failed"
>> "%TMPSCRIPT%" echo     Write-Host ""
>> "%TMPSCRIPT%" echo     foreach ($msg in $failures) { Write-Host "    x $msg" }
>> "%TMPSCRIPT%" echo     Write-Host "============================================================"
>> "%TMPSCRIPT%" echo     exit 1
>> "%TMPSCRIPT%" echo } else {
>> "%TMPSCRIPT%" echo     Write-Host "  RESULT: PASSED -- all 8 check groups clean"
>> "%TMPSCRIPT%" echo     Write-Host "============================================================"
>> "%TMPSCRIPT%" echo     exit 0
>> "%TMPSCRIPT%" echo }

powershell -NoProfile -ExecutionPolicy Bypass -File "%TMPSCRIPT%" "!ENV_FILE!"
set "EXITCODE=%errorlevel%"

del "%TMPSCRIPT%" 2>nul

exit /b %EXITCODE%
