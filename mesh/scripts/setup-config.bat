@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Mesh - Setup Kernel Config File
REM Location:
REM   mesh\scripts\setup-config.bat
REM Usage:
REM   setup-config.bat              -> prompted for environment
REM   setup-config.bat local        -> copies kernel.config.local.parameter.json
REM   setup-config.bat staging      -> copies kernel.config.staging.parameter.json
REM   setup-config.bat production   -> copies kernel.config.production.parameter.json
REM ============================================================

REM ----------------------------
REM Resolve base directories
REM ----------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\.." >nul
set "MESH_DIR=%CD%"
popd >nul

set "CONFIG_DIR=%MESH_DIR%\config\apps\athyper"
set "TARGET_FILE=%CONFIG_DIR%\kernel.config.parameter.json"

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
set "TEMPLATE=%CONFIG_DIR%\kernel.config.!ENV_NAME!.parameter.json"

if not exist "!TEMPLATE!" (
  echo ERROR: Template not found: "!TEMPLATE!"
  echo.
  echo Available templates:
  dir /b "%CONFIG_DIR%\kernel.config.*.parameter.json" 2>nul
  exit /b 1
)

REM ----------------------------
REM Backup existing config if present
REM ----------------------------
if exist "%TARGET_FILE%" (
  echo Backing up existing kernel.config.parameter.json to kernel.config.parameter.json.bak ...
  copy /Y "%TARGET_FILE%" "%TARGET_FILE%.bak" >nul
)

REM ----------------------------
REM Copy template to target
REM ----------------------------
copy /Y "!TEMPLATE!" "%TARGET_FILE%" >nul
if errorlevel 1 (
  echo ERROR: Failed to copy template to kernel.config.parameter.json
  exit /b 1
)

echo.
echo ==========================
echo Environment : !ENV_NAME!
echo Template    : !TEMPLATE!
echo Target      : %TARGET_FILE%
echo ==========================
echo.
echo Done: kernel.config.parameter.json created for "!ENV_NAME!" environment.

endlocal
