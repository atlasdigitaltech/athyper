@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Local Dev Bootstrap - Windows Batch
REM Location: stack\scripts\dev-local.bat
REM
REM Single canonical command for "Option C" local dev (host apps + Docker infra).
REM Equivalent to running, by hand:
REM   1. docker stop <any stale app containers>
REM   2. stack\scripts\stack-profile\up.bat core
REM   3. stack\scripts\app\api-up.bat            (terminal 2)
REM   4. stack\scripts\app\local-ui-up.bat       (terminal 3 -> 3 plane windows)
REM   5. (optional) api-up.bat worker, api-up.bat scheduler
REM
REM Usage:
REM   dev-local.bat                : api + 3 web planes
REM   dev-local.bat --with-jobs    : also start worker + scheduler windows
REM   dev-local.bat --no-infra     : skip stack-profile/up (infra already up)
REM   dev-local.bat --stop-only    : just stop the 6 app containers, do nothing else
REM
REM Note: file attachments (Tika/docparser) require BOTH --with-jobs AND the
REM render profile running. Start render separately first if needed:
REM   stack\scripts\stack-profile\up.bat render
REM
REM Container naming: ${COMPOSE_PROJECT_NAME}-<svc>-1 (matches stack-service/stop.bat).
REM ============================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
pushd "%SCRIPT_DIR%\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "ENV_FILE=%STACK_DIR%\env\.env"

REM ----------------------------
REM Parse args
REM ----------------------------
set "WITH_JOBS=0"
set "NO_INFRA=0"
set "STOP_ONLY=0"
:parse
if "%~1"=="" goto :after_parse
if /I "%~1"=="--with-jobs" ( set "WITH_JOBS=1" & shift & goto :parse )
if /I "%~1"=="--no-infra"  ( set "NO_INFRA=1"  & shift & goto :parse )
if /I "%~1"=="--stop-only" ( set "STOP_ONLY=1" & shift & goto :parse )
if /I "%~1"=="-h"          goto :usage
if /I "%~1"=="--help"      goto :usage
echo ERROR: unsupported option: %~1
goto :usage
:after_parse

REM ----------------------------
REM Resolve COMPOSE_PROJECT_NAME (env > .env > "athyper")
REM ----------------------------
if not defined COMPOSE_PROJECT_NAME (
  if exist "%ENV_FILE%" (
    for /f "tokens=2 delims==" %%a in ('findstr "^COMPOSE_PROJECT_NAME=" "%ENV_FILE%" 2^>nul') do set "COMPOSE_PROJECT_NAME=%%a"
    set "COMPOSE_PROJECT_NAME=!COMPOSE_PROJECT_NAME:"=!"
  )
)
if not defined COMPOSE_PROJECT_NAME set "COMPOSE_PROJECT_NAME=athyper"

set "APP_CONTAINERS=!COMPOSE_PROJECT_NAME!-api-1 !COMPOSE_PROJECT_NAME!-worker-1 !COMPOSE_PROJECT_NAME!-scheduler-1 !COMPOSE_PROJECT_NAME!-neon-web-1 !COMPOSE_PROJECT_NAME!-mesh-web-1 !COMPOSE_PROJECT_NAME!-admin-web-1"

echo.
echo ==========================
echo  athyper local dev bootstrap
echo ==========================
echo  COMPOSE_PROJECT_NAME = !COMPOSE_PROJECT_NAME!
echo  WITH_JOBS            = !WITH_JOBS!
echo  NO_INFRA             = !NO_INFRA!
echo  STOP_ONLY            = !STOP_ONLY!
echo ==========================
echo.

REM ----------------------------
REM Step 1: Pre-stop stale app containers (silent if none running)
REM ----------------------------
docker version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker is not running. Start Docker Desktop and re-run.
  exit /b 1
)

echo [1/4] Stopping any stale app containers so host dev isn't shadowed...
set "STALE_FOUND=0"
for %%C in (!APP_CONTAINERS!) do (
  for /f %%R in ('docker ps --format "{{.Names}}" --filter "name=^%%C$" 2^>nul') do (
    if "%%R"=="%%C" (
      echo   docker stop %%C
      docker stop %%C >nul
      set "STALE_FOUND=1"
    )
  )
)
if "!STALE_FOUND!"=="0" echo   (none running — clean start)
echo.

if "!STOP_ONLY!"=="1" (
  echo --stop-only: done.
  goto :end
)

REM ----------------------------
REM Step 2: Bring up infra (core profile)
REM ----------------------------
if "!NO_INFRA!"=="1" (
  echo [2/4] Skipping infra bringup ^(--no-infra^).
) else (
  echo [2/4] Starting infra ^(stack-profile/up.bat core^)...
  call "%STACK_DIR%\scripts\stack-profile\up.bat" core
  if errorlevel 1 (
    echo ERROR: infra bringup failed.
    exit /b 1
  )
)
echo.

REM ----------------------------
REM Step 3: Start API host dev server (new window)
REM ----------------------------
echo [3/4] Starting API host dev server in a new window...
start "athyper-api" cmd /k call "%STACK_DIR%\scripts\app\api-up.bat"

if "!WITH_JOBS!"=="1" (
  echo       Also starting worker + scheduler ^(--with-jobs^)...
  start "athyper-worker" cmd /k call "%STACK_DIR%\scripts\app\api-up.bat" worker
  start "athyper-scheduler" cmd /k call "%STACK_DIR%\scripts\app\api-up.bat" scheduler
)
echo.

REM ----------------------------
REM Step 4: Start the 3 web plane dev servers
REM ----------------------------
echo [4/4] Starting Neon + Mesh + Admin host dev servers ^(via local-ui-up.bat^)...
call "%STACK_DIR%\scripts\app\local-ui-up.bat"
echo.

echo ==========================
echo  All host dev servers launched.
echo  Tail logs in their windows; Ctrl+C in each to stop.
echo  To clean shutdown: dev-local.bat --stop-only
echo ==========================
echo.
goto :end

:usage
echo Usage:
echo   dev-local.bat [--with-jobs] [--no-infra] [--stop-only]
echo.
echo Flags:
echo   --with-jobs   also start worker + scheduler host windows
echo   --no-infra    skip stack-profile/up ^(infra already up^)
echo   --stop-only   just stop the 6 app containers, do nothing else
echo.
exit /b 0

:end
endlocal
