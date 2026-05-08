@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - RESET DATA DIRS - Windows Batch
REM Location:
REM   stack\scripts\setup\data-dirs-reset.bat
REM Usage:
REM   data-dirs-reset.bat
REM
REM DESTRUCTIVE — deletes all contents under ATHYPER_DATA then
REM recreates the folder structure. Requires explicit YES confirmation.
REM For a safe first-time create, use: setup\data-dirs-create.bat
REM ============================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "ENV_DIR=%STACK_DIR%\env"
set "ENV_FILE=%ENV_DIR%\.env"

if not exist "%ENV_FILE%" (
  echo ERROR: .env not found: %ENV_FILE%
  echo Run setup\setup-env.bat first.
  pause
  exit /b 1
)

REM ----------------------------
REM Read ENVIRONMENT + ATHYPER_DATA_ROOT from .env
REM ----------------------------
set "ENVIRONMENT="
set "_DR_FROM_ENV="

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  set "K=%%A"
  set "V=%%B"
  for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
  if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
    set "V=!V:"=!"
    for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
    for /f "tokens=* delims= " %%V in ("!V!") do set "V=%%V"
    if /I "!K!"=="ENVIRONMENT"       set "ENVIRONMENT=!V!"
    if /I "!K!"=="ATHYPER_DATA_ROOT" if "!_DR_FROM_ENV!"=="" set "_DR_FROM_ENV=!V!"
  )
)

if "!ENVIRONMENT!"=="" (
  echo ERROR: ENVIRONMENT not found in %ENV_FILE%
  pause & exit /b 1
)

if not "!ATHYPER_DATA_ROOT!"=="" goto :dr_skip_dr
if not "!_DR_FROM_ENV!"==""      (set "ATHYPER_DATA_ROOT=!_DR_FROM_ENV!" & goto :dr_skip_dr)
set "ATHYPER_DATA_ROOT=%STACK_DIR%\data"
:dr_skip_dr

set "ATHYPER_DATA=!ATHYPER_DATA_ROOT!"

echo.
echo ==========================
echo ENV_FILE         = %ENV_FILE%
echo ENVIRONMENT      = !ENVIRONMENT!
echo ATHYPER_DATA_ROOT = !ATHYPER_DATA_ROOT!
echo ==========================
echo.
echo WARNING: This will DELETE all contents under ATHYPER_DATA.
echo.

set /p "CONFIRM=Type YES to confirm: "
if /I not "%CONFIRM%"=="YES" (
  echo Cancelled.
  pause & exit /b 0
)

REM ----------------------------
REM Delete all inside ATHYPER_DATA
REM ----------------------------
echo Deleting folders...
for /d %%D in ("!ATHYPER_DATA!\*") do rmdir /s /q "%%D" 2>nul
echo Deleting files...
for %%F in ("!ATHYPER_DATA!\*") do del /f /q "%%F" 2>nul

REM ----------------------------
REM Recreate folder structure - must match every ${ATHYPER_DATA}/* bind mount
REM in stack\compose\**\*.yml. Keep this list in sync with data-dirs-create.bat.
REM ----------------------------
echo Recreating folder structure...
mkdir "!ATHYPER_DATA!\db"                      >nul 2>&1
mkdir "!ATHYPER_DATA!\meilisearch"             >nul 2>&1
mkdir "!ATHYPER_DATA!\memorycache"             >nul 2>&1
mkdir "!ATHYPER_DATA!\memorycache-jobs"        >nul 2>&1
mkdir "!ATHYPER_DATA!\metabase"                >nul 2>&1
mkdir "!ATHYPER_DATA!\objectstorage"           >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry"               >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry\alertmanager"  >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry\logging"       >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry\metrics"       >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry\observability" >nul 2>&1
mkdir "!ATHYPER_DATA!\telemetry\tracing"       >nul 2>&1
mkdir "!ATHYPER_DATA!\uptime-kuma"             >nul 2>&1

echo.
echo Done.
endlocal
