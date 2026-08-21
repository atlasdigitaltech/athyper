@echo off
setlocal

:: ============================================================
:: athyper Stack - VERIFY PORT HARDENING (F8 Phase 2)
:: Location:
::   stack/scripts/setup/verify-port-hardening.bat
:: Usage:
::   verify-port-hardening.bat
::
:: Windows equivalent of verify-port-hardening.sh
:: Enforces the single-ingress posture: a service that accepts
:: traffic via Traefik MUST NOT also publish its backend port
:: directly on the host. The only legitimate port publisher is
:: the gateway itself (80/443 -- the ingress).
::
:: Rule:
::   If a service in any stack/compose/**/*.yml file has BOTH
::     (a) a traefik.* label, AND
::     (b) a `ports:` block that publishes a port,
::   then it violates F8 Phase 2 -- unless it's on ALLOWLIST.
::
:: Allowlist:
::   gateway -- publishes 80/443 as the ingress. Its Traefik
::              labels point at api@internal (its own dashboard),
::              not a backend service, so there is no bypass path.
::
:: Exit codes:
::   0 -- all compose files pass
::   1 -- one or more violations
:: ============================================================

:: ----------------------------
:: Resolve paths
:: ----------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\..\compose" 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Compose directory not found: %SCRIPT_DIR%\..\..\compose 1>&2
    exit /b 1
)
set "COMPOSE_DIR=%CD%"
popd

echo F8 Phase 2 -- port hardening check
echo     compose dir: %COMPOSE_DIR%
echo     allowlist:   gateway
echo.

:: ----------------------------
:: Write PowerShell scanner to a temp file.
:: PowerShell handles the YAML service-block parsing, replicating
:: the awk logic from verify-port-hardening.sh.
:: ----------------------------
set "TMPSCRIPT=%TEMP%\vph_%RANDOM%.ps1"
if exist "%TMPSCRIPT%" del "%TMPSCRIPT%"

echo param([string]$composeDir)>> "%TMPSCRIPT%"
echo $allowlist = @('gateway')>> "%TMPSCRIPT%"
echo $violations = 0>> "%TMPSCRIPT%"
echo $checked = 0>> "%TMPSCRIPT%"
echo $flagged = 0>> "%TMPSCRIPT%"
echo $svc = ''>> "%TMPSCRIPT%"
echo $hasPorts = $false>> "%TMPSCRIPT%"
echo $hasTraefik = $false>> "%TMPSCRIPT%"
echo $currentFile = ''>> "%TMPSCRIPT%"
echo.>> "%TMPSCRIPT%"
echo function FlushService {>> "%TMPSCRIPT%"
echo     if ($script:svc -ne '') {>> "%TMPSCRIPT%"
echo         $script:checked++>> "%TMPSCRIPT%"
echo         if ($script:hasPorts -and $script:hasTraefik) {>> "%TMPSCRIPT%"
echo             $script:flagged++>> "%TMPSCRIPT%"
echo             $leaf = Split-Path $script:currentFile -Leaf>> "%TMPSCRIPT%"
echo             if ($script:allowlist -contains $script:svc) {>> "%TMPSCRIPT%"
echo                 Write-Host "  ALLOW    $($script:svc)  (in $leaf)">> "%TMPSCRIPT%"
echo             } else {>> "%TMPSCRIPT%"
echo                 Write-Host "  VIOLATION  $($script:svc)  (in $leaf)">> "%TMPSCRIPT%"
echo                 Write-Host "             service has both traefik.* labels and a ports: block.">> "%TMPSCRIPT%"
echo                 Write-Host "             Either remove ports: (preferred -- Traefik proxies via internal network)">> "%TMPSCRIPT%"
echo                 Write-Host "             or add '$($script:svc)' to the ALLOWLIST with rationale.">> "%TMPSCRIPT%"
echo                 $script:violations++>> "%TMPSCRIPT%"
echo             }>> "%TMPSCRIPT%"
echo         }>> "%TMPSCRIPT%"
echo     }>> "%TMPSCRIPT%"
echo }>> "%TMPSCRIPT%"
echo.>> "%TMPSCRIPT%"
echo foreach ($f in (Get-ChildItem -Path $composeDir -Recurse -Filter '*.yml')) {>> "%TMPSCRIPT%"
echo     $currentFile = $f.FullName>> "%TMPSCRIPT%"
echo     $inServices = $false>> "%TMPSCRIPT%"
echo     $svc = ''>> "%TMPSCRIPT%"
echo     $hasPorts = $false>> "%TMPSCRIPT%"
echo     $hasTraefik = $false>> "%TMPSCRIPT%"
echo.>> "%TMPSCRIPT%"
echo     foreach ($line in (Get-Content $f.FullName -Encoding UTF8)) {>> "%TMPSCRIPT%"
echo         if ($line -match '^^services:\s*$') { $inServices = $true; continue }>> "%TMPSCRIPT%"
echo         if ($line -match '^^[a-zA-Z0-9_-]+:' -and $line -notmatch '^^services:') { $inServices = $false }>> "%TMPSCRIPT%"
echo         if ($inServices -and $line -match '^^  [a-zA-Z0-9_-]+:\s*$') {>> "%TMPSCRIPT%"
echo             FlushService>> "%TMPSCRIPT%"
echo             $svc = $line.Trim().TrimEnd(':')>> "%TMPSCRIPT%"
echo             $hasPorts = $false>> "%TMPSCRIPT%"
echo             $hasTraefik = $false>> "%TMPSCRIPT%"
echo             continue>> "%TMPSCRIPT%"
echo         }>> "%TMPSCRIPT%"
echo         if ($svc -ne '' -and $line -match '^^    ports:\s*$') { $hasPorts = $true }>> "%TMPSCRIPT%"
echo         if ($svc -ne '' -and $line -match 'traefik\.') { $hasTraefik = $true }>> "%TMPSCRIPT%"
echo     }>> "%TMPSCRIPT%"
echo     FlushService>> "%TMPSCRIPT%"
echo     $svc = ''>> "%TMPSCRIPT%"
echo }>> "%TMPSCRIPT%"
echo.>> "%TMPSCRIPT%"
echo Write-Host ''>> "%TMPSCRIPT%"
echo Write-Host '------------------------------------------------'>> "%TMPSCRIPT%"
echo Write-Host "  scanned: $checked service blocks">> "%TMPSCRIPT%"
echo Write-Host "  flagged: $flagged (traefik + ports)">> "%TMPSCRIPT%"
echo Write-Host "  violations: $violations">> "%TMPSCRIPT%"
echo Write-Host '------------------------------------------------'>> "%TMPSCRIPT%"
echo.>> "%TMPSCRIPT%"
echo if ($violations -gt 0) {>> "%TMPSCRIPT%"
echo     Write-Host "F8 Phase 2 check FAILED ($violations violations)">> "%TMPSCRIPT%"
echo     exit 1>> "%TMPSCRIPT%"
echo }>> "%TMPSCRIPT%"
echo Write-Host 'F8 Phase 2 check passed'>> "%TMPSCRIPT%"
echo exit 0>> "%TMPSCRIPT%"

:: ----------------------------
:: Run the scanner
:: ----------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%TMPSCRIPT%" "%COMPOSE_DIR%"
set "EXITCODE=%errorlevel%"

:: Cleanup
del "%TMPSCRIPT%" 2>nul

exit /b %EXITCODE%
