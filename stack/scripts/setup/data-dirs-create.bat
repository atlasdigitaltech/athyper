@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - CREATE DATA DIRS - Windows Batch
REM Location:
REM   stack\scripts\setup\data-dirs-create.bat
REM Usage:
REM   data-dirs-create.bat
REM
REM Safe, idempotent. Creates the stack\data\ folder structure
REM that Docker volume mounts require. Never deletes anything.
REM ============================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "ENV_DIR=%STACK_DIR%\env"
set "ENV_FILE=%ENV_DIR%\.env"

REM ----------------------------
REM Derive ATHYPER_DATA from STACK_DIR (portable — works at any clone path).
REM ATHYPER_DATA in .env is the docker-compose substitution value and may hold
REM a relative path like ../../data that is only meaningful from a compose file
REM directory, not from STACK_DIR.  We always anchor to STACK_DIR\data.
REM Override: if ATHYPER_DATA is already set in the calling environment AND is
REM an absolute path (starts with drive letter or '/'), honour it.
REM ----------------------------
set "_ABS_OVERRIDE=0"
if not "!ATHYPER_DATA!"=="" (
  if "!ATHYPER_DATA:~1,1!"==":" set "_ABS_OVERRIDE=1"
  if "!ATHYPER_DATA:~0,1!"=="/" set "_ABS_OVERRIDE=1"
)
if "!_ABS_OVERRIDE!"=="0" (
  set "ATHYPER_DATA=%STACK_DIR%\data"
)

echo.
echo ==========================
echo STACK_DIR  = %STACK_DIR%
echo ATHYPER_DATA = %ATHYPER_DATA%
echo ==========================
echo.

REM ----------------------------
REM Create folder structure (idempotent) - must match every ${ATHYPER_DATA}/*
REM bind mount in stack\compose\**\*.yml. Keep this list in sync with
REM data-dirs-reset.bat.
REM ----------------------------
echo Creating data directory structure...
mkdir "%ATHYPER_DATA%\db"                      >nul 2>&1
mkdir "%ATHYPER_DATA%\meilisearch"             >nul 2>&1
mkdir "%ATHYPER_DATA%\memorycache"             >nul 2>&1
mkdir "%ATHYPER_DATA%\memorycache-jobs"        >nul 2>&1
mkdir "%ATHYPER_DATA%\metabase"                >nul 2>&1
mkdir "%ATHYPER_DATA%\objectstorage"           >nul 2>&1
mkdir "%ATHYPER_DATA%\telemetry"               >nul 2>&1
mkdir "%ATHYPER_DATA%\telemetry\logging"       >nul 2>&1
mkdir "%ATHYPER_DATA%\telemetry\metrics"       >nul 2>&1
mkdir "%ATHYPER_DATA%\telemetry\observability" >nul 2>&1
mkdir "%ATHYPER_DATA%\telemetry\tracing"       >nul 2>&1
mkdir "%ATHYPER_DATA%\uptime-kuma"             >nul 2>&1

echo.
echo Done:
echo   %ATHYPER_DATA%\db
echo   %ATHYPER_DATA%\meilisearch
echo   %ATHYPER_DATA%\memorycache
echo   %ATHYPER_DATA%\memorycache-jobs
echo   %ATHYPER_DATA%\metabase
echo   %ATHYPER_DATA%\objectstorage
echo   %ATHYPER_DATA%\telemetry\logging
echo   %ATHYPER_DATA%\telemetry\metrics
echo   %ATHYPER_DATA%\telemetry\observability
echo   %ATHYPER_DATA%\telemetry\tracing
echo   %ATHYPER_DATA%\uptime-kuma
echo.
endlocal
