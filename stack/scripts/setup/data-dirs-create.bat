@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - CREATE DATA DIRS - Windows Batch
REM Location:
REM   stack\scripts\setup\data-dirs-create.bat
REM Usage:
REM   data-dirs-create.bat
REM
REM Safe, idempotent. Creates the data folder structure that Docker
REM volume mounts require. Path is read from ATHYPER_DATA_ROOT in
REM .env (D:\Stack\athyper\data by default for local dev).
REM Never deletes anything.
REM ============================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "ENV_DIR=%STACK_DIR%\env"
set "ENV_FILE=%ENV_DIR%\.env"

REM ----------------------------
REM Read ATHYPER_DATA_ROOT (+ CONFIG/SECRETS for completeness) from .env
REM ----------------------------
set "_CR_FROM_ENV=" & set "_SR_FROM_ENV=" & set "_DR_FROM_ENV="

if exist "%ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    set "K=%%A"
    set "V=%%B"
    for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
    if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
      set "V=!V:"=!"
      for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
      for /f "tokens=* delims= " %%V in ("!V!") do set "V=%%V"
      if /I "!K!"=="ATHYPER_CONFIG_ROOT"  if "!_CR_FROM_ENV!"=="" set "_CR_FROM_ENV=!V!"
      if /I "!K!"=="ATHYPER_SECRETS_ROOT" if "!_SR_FROM_ENV!"=="" set "_SR_FROM_ENV=!V!"
      if /I "!K!"=="ATHYPER_DATA_ROOT"    if "!_DR_FROM_ENV!"=="" set "_DR_FROM_ENV=!V!"
    )
  )
) else (
  echo WARNING: .env not found: "%ENV_FILE%"
)

if not "!ATHYPER_CONFIG_ROOT!"==""  goto :dc_skip_cr
if not "!_CR_FROM_ENV!"==""         (set "ATHYPER_CONFIG_ROOT=!_CR_FROM_ENV!" & goto :dc_skip_cr)
set "ATHYPER_CONFIG_ROOT=%STACK_DIR%\config"
:dc_skip_cr
if not "!ATHYPER_SECRETS_ROOT!"=="" goto :dc_skip_sr
if not "!_SR_FROM_ENV!"==""         (set "ATHYPER_SECRETS_ROOT=!_SR_FROM_ENV!" & goto :dc_skip_sr)
set "ATHYPER_SECRETS_ROOT=%STACK_DIR%\secrets"
:dc_skip_sr
if not "!ATHYPER_DATA_ROOT!"==""    goto :dc_skip_dr
if not "!_DR_FROM_ENV!"==""         (set "ATHYPER_DATA_ROOT=!_DR_FROM_ENV!" & goto :dc_skip_dr)
set "ATHYPER_DATA_ROOT=%STACK_DIR%\data"
:dc_skip_dr

REM Backwards-compat alias (used in mkdir commands below)
set "ATHYPER_DATA=!ATHYPER_DATA_ROOT!"

echo.
echo ==========================
echo STACK_DIR        = %STACK_DIR%
echo ATHYPER_DATA_ROOT = !ATHYPER_DATA_ROOT!
echo ==========================
echo.

REM ----------------------------
REM Create folder structure (idempotent) - must match every ${ATHYPER_DATA}/*
REM bind mount in stack\compose\**\*.yml. Keep this list in sync with
REM data-dirs-reset.bat.
REM ----------------------------
echo Creating data directory structure...
mkdir "!ATHYPER_DATA!\db"                      >nul 2>&1
mkdir "!ATHYPER_DATA!\meilisearch"             >nul 2>&1
mkdir "!ATHYPER_DATA!\memorycache"             >nul 2>&1
mkdir "!ATHYPER_DATA!\memorycache-jobs"        >nul 2>&1
mkdir "!ATHYPER_DATA!\metabase"                >nul 2>&1
mkdir "!ATHYPER_DATA!\objectstorage"           >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry"               >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry\logging"       >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry\metrics"       >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry\observability" >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry\tracing"       >nul 2>&1
mkdir "!ATHYPER_DATA!\uptime-kuma"             >nul 2>&1

echo.
echo Done:
echo   !ATHYPER_DATA!\db
echo   !ATHYPER_DATA!\meilisearch
echo   !ATHYPER_DATA!\memorycache
echo   !ATHYPER_DATA!\memorycache-jobs
echo   !ATHYPER_DATA!\metabase
echo   !ATHYPER_DATA!\objectstorage
echo   !ATHYPER_DATA!\telemetry\logging
echo   !ATHYPER_DATA!\telemetry\metrics
echo   !ATHYPER_DATA!\telemetry\observability
echo   !ATHYPER_DATA!\telemetry\tracing
echo   !ATHYPER_DATA!\uptime-kuma
echo.
endlocal
