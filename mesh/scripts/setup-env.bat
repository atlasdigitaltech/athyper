@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Mesh - Setup Environment File
REM Location:
REM   mesh\scripts\setup-env.bat
REM Usage:
REM   setup-env.bat              -> prompted for environment
REM   setup-env.bat local        -> copies local.env.example to .env
REM   setup-env.bat staging      -> copies staging.env.example to .env
REM   setup-env.bat production   -> copies production.env.example to .env
REM ============================================================

REM ----------------------------
REM Resolve base directories
REM ----------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\.." >nul
set "MESH_DIR=%CD%"
popd >nul

set "ENV_DIR=%MESH_DIR%\env"
set "ENV_FILE=%ENV_DIR%\.env"

REM ----------------------------
REM Determine environment
REM ----------------------------
set "ENV_NAME=%~1"

if "!ENV_NAME!"=="" (
  echo.
  echo Available environments: local, staging, production
  echo.
  set /p "ENV_NAME=Select environment (blank=local): "
  if "!ENV_NAME!"=="" set "ENV_NAME=local"
)

REM ----------------------------
REM Validate environment name
REM ----------------------------
set "VALID=0"
if /I "!ENV_NAME!"=="local"      set "VALID=1"
if /I "!ENV_NAME!"=="staging"    set "VALID=1"
if /I "!ENV_NAME!"=="production" set "VALID=1"

if "!VALID!"=="0" (
  echo ERROR: Invalid environment "!ENV_NAME!". Must be: local, staging, or production
  exit /b 1
)

REM ----------------------------
REM Resolve template file
REM ----------------------------
if /I "!ENV_NAME!"=="local"      set "TEMPLATE=%ENV_DIR%\local.env.example"
if /I "!ENV_NAME!"=="staging"    set "TEMPLATE=%ENV_DIR%\staging.env.example"
if /I "!ENV_NAME!"=="production" set "TEMPLATE=%ENV_DIR%\production.env.example"

if not exist "!TEMPLATE!" (
  echo ERROR: Template not found: "!TEMPLATE!"
  echo.
  echo Available templates:
  dir /b "%ENV_DIR%\*.example" 2>nul
  exit /b 1
)

REM ----------------------------
REM Backup existing .env if present
REM ----------------------------
if exist "%ENV_FILE%" (
  echo Backing up existing .env to .env.bak ...
  copy /Y "%ENV_FILE%" "%ENV_FILE%.bak" >nul
)

REM ----------------------------
REM Copy template to .env
REM ----------------------------
copy /Y "!TEMPLATE!" "%ENV_FILE%" >nul
if errorlevel 1 (
  echo ERROR: Failed to copy template to .env
  exit /b 1
)

echo.
echo ==========================
echo Environment : !ENV_NAME!
echo Template    : !TEMPLATE!
echo Target      : %ENV_FILE%
echo ==========================
echo.
echo Done: .env created for "!ENV_NAME!" environment.

endlocal
