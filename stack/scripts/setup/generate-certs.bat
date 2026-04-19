@echo off
setlocal

REM =====================================================
REM athyper Stack - Local TLS Certificate Generator
REM Location:
REM   stack\scripts\setup\generate-certs.bat
REM Usage:
REM   generate-certs.bat
REM
REM Generates a wildcard TLS certificate for local dev using mkcert.
REM SANs covered:
REM   *.athyper.local, neon.athyper.local, gateway.athyper.local,
REM   api.athyper.local, iam.athyper.local, objectstorage.athyper.local
REM Output: stack\config\gateway\certs\athyper.tls.local.{crt,key}
REM
REM Requires: mkcert (winget install FiloSottile.mkcert)
REM   https://github.com/FiloSottile/mkcert
REM =====================================================

echo.
echo ==========================================
echo  athyper Stack - mkcert TLS Generator
echo ==========================================
echo.

REM Resolve directories safely
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul
set "CERT_DIR=%STACK_DIR%\config\gateway\certs"

REM Ensure mkcert.exe exists (NOT this script)
where mkcert.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: mkcert.exe not found in PATH
  echo Install from https://github.com/FiloSottile/mkcert
  echo   winget install FiloSottile.mkcert
  exit /b 1
)

REM Create cert directory
if not exist "%CERT_DIR%" (
  echo Creating cert directory:
  echo   %CERT_DIR%
  mkdir "%CERT_DIR%"
)

REM Install local CA (idempotent)
echo.
echo Installing mkcert local CA...
mkcert.exe -install

REM Generate certificate
echo.
echo Generating athyper TLS certificates...
mkcert.exe ^
  -cert-file "%CERT_DIR%\athyper.tls.local.crt" ^
  -key-file  "%CERT_DIR%\athyper.tls.local.key" ^
  "*.athyper.local" ^
  "neon.athyper.local" ^
  "gateway.athyper.local" ^
  "api.athyper.local" ^
  "iam.athyper.local" ^
  "objectstorage.athyper.local"

if errorlevel 1 (
  echo ERROR: Certificate generation failed
  exit /b 1
)

echo.
echo Certificates generated successfully
echo Location: %CERT_DIR%
echo.
endlocal
