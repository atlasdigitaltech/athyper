@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Web Frontend DOWN - Windows Batch
REM Location: stack\scripts\app\web-down.bat
REM
REM Behaviour (auto-detected from ENVIRONMENT in .env):
REM   local      -> prints guidance (Next.js dev runs in your terminal)
REM   staging    -> docker compose stop athyper-neon-web
REM   production -> docker compose stop athyper-neon-web
REM ============================================================

REM ----------------------------
REM Resolve directories
REM ----------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

pushd "%STACK_DIR%\.." >nul
set "REPO_ROOT=%CD%"
popd >nul

set "COMPOSE_DIR=%STACK_DIR%\compose"
set "ENV_DIR=%STACK_DIR%\env"
set "ENV_FILE=%ENV_DIR%\.env"
REM Ensure npm global bin and standalone pnpm installer are on PATH
set "PATH=%APPDATA%\npm;%LOCALAPPDATA%\pnpm;%PATH%"

set "ENVIRONMENT=local"
set "_CR_FROM_ENV=" & set "_DR_FROM_ENV="

if exist "%ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    set "K=%%A"
    set "V=%%B"
    for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
    if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
      set "V=!V:"=!"
      for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
      for /f "tokens=* delims= " %%V in ("!V!") do set "V=%%V"
      if /I "!K!"=="ENVIRONMENT"          set "ENVIRONMENT=!V!"
      if /I "!K!"=="ATHYPER_CONFIG_ROOT"  if "!_CR_FROM_ENV!"=="" set "_CR_FROM_ENV=!V!"
      if /I "!K!"=="ATHYPER_DATA_ROOT"    if "!_DR_FROM_ENV!"=="" set "_DR_FROM_ENV=!V!"
    )
  )
) else (
  echo WARNING: .env not found: "%ENV_FILE%" — defaulting to local mode.
)

if not "!ATHYPER_CONFIG_ROOT!"=="" goto :app_skip_cr
if not "!_CR_FROM_ENV!"==""        (set "ATHYPER_CONFIG_ROOT=!_CR_FROM_ENV!" & goto :app_skip_cr)
set "ATHYPER_CONFIG_ROOT=%STACK_DIR%\config"
:app_skip_cr
if not "!ATHYPER_DATA_ROOT!"==""   goto :app_skip_dr
if not "!_DR_FROM_ENV!"==""        (set "ATHYPER_DATA_ROOT=!_DR_FROM_ENV!" & goto :app_skip_dr)
set "ATHYPER_DATA_ROOT=%STACK_DIR%\data"
:app_skip_dr

set "_TMP=!ATHYPER_CONFIG_ROOT:\=/!" & set "ATHYPER_CONFIG=!_TMP!"
set "_TMP=!ATHYPER_DATA_ROOT:\=/!"   & set "ATHYPER_DATA=!_TMP!"

echo.
echo ==========================
echo ENVIRONMENT = "!ENVIRONMENT!"
echo SERVICE     = athyper-neon-web ^(@athyper/web^)
echo ==========================
echo.

REM ----------------------------
REM Local: guidance only
REM ----------------------------
if /I "!ENVIRONMENT!"=="local" (
  echo Local mode: Next.js dev server runs in your terminal.
  echo To stop: press Ctrl+C in the terminal running "pnpm dev".
  echo.
  goto :end
)

REM ----------------------------
REM Staging / Production: compose stop
REM ----------------------------
docker version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker is not running. Start Docker Desktop and re-run.
  pause & exit /b 1
)

REM Pick override file
set "OVERRIDE="
if /I "!ENVIRONMENT!"=="staging"    set "OVERRIDE=%COMPOSE_DIR%\athyper.override.staging.yml"
if /I "!ENVIRONMENT!"=="production" set "OVERRIDE=%COMPOSE_DIR%\athyper.override.production.yml"
if "!OVERRIDE!"=="" set "OVERRIDE=%COMPOSE_DIR%\athyper.override.yml"
if not exist "!OVERRIDE!" (
  if exist "%COMPOSE_DIR%\athyper.dev.yml" ( set "OVERRIDE=%COMPOSE_DIR%\athyper.dev.yml"
  ) else ( set "OVERRIDE=%COMPOSE_DIR%\athyper.prod.yml" )
)

REM Build compose file list
set "COMPOSE_FILES="
if exist "%COMPOSE_DIR%\athyper.base.yml"                              set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\athyper.base.yml""
if exist "%COMPOSE_DIR%\db\athyper-db.yml"                            set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-db.yml""
if exist "%COMPOSE_DIR%\db\athyper-dbpool-apps.yml"                   set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-dbpool-apps.yml""
if exist "%COMPOSE_DIR%\db\athyper-dbpool-session.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-dbpool-session.yml""
if exist "%COMPOSE_DIR%\security\athyper-socket-proxy-gateway.yml"    set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-socket-proxy-gateway.yml""
if exist "%COMPOSE_DIR%\security\athyper-socket-proxy-logshipper.yml" set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-socket-proxy-logshipper.yml""
if exist "%COMPOSE_DIR%\gateway\athyper-gateway.yml"                  set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\gateway\athyper-gateway.yml""
if exist "%COMPOSE_DIR%\mail\athyper-mailhog.yml"                     set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\mail\athyper-mailhog.yml""
if exist "%COMPOSE_DIR%\iam\athyper-iam.yml"                          set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\iam\athyper-iam.yml""
if exist "%COMPOSE_DIR%\objectstorage\athyper-objectstorage.yml"      set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\objectstorage\athyper-objectstorage.yml""
if exist "%COMPOSE_DIR%\security\athyper-clamav.yml"                  set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-clamav.yml""
if exist "%COMPOSE_DIR%\memorycache\athyper-memorycache.yml"          set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\memorycache\athyper-memorycache.yml""
if exist "%COMPOSE_DIR%\memorycache\athyper-memorycache-exporter.yml" set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\memorycache\athyper-memorycache-exporter.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-metrics.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-metrics.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-tracing.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-tracing.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-logging.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-logging.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-logshipper.yml"             set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-logshipper.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-telemetry.yml"              set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-telemetry.yml""
if exist "%COMPOSE_DIR%\apps\athyper-apps.yml"                        set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\apps\athyper-apps.yml""
if exist "%COMPOSE_DIR%\render\athyper-gotenberg.yml"                 set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\render\athyper-gotenberg.yml""
if exist "%COMPOSE_DIR%\render\athyper-tika.yml"                      set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\render\athyper-tika.yml""
if exist "%COMPOSE_DIR%\search\athyper-meilisearch.yml"               set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\search\athyper-meilisearch.yml""
if exist "%COMPOSE_DIR%\monitoring\athyper-glitchtip.yml"             set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\monitoring\athyper-glitchtip.yml""
if exist "%COMPOSE_DIR%\monitoring\athyper-healthchecks.yml"          set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\monitoring\athyper-healthchecks.yml""
if exist "%COMPOSE_DIR%\monitoring\athyper-uptime-kuma.yml"           set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\monitoring\athyper-uptime-kuma.yml""
if exist "%COMPOSE_DIR%\analytics\athyper-metabase.yml"               set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\analytics\athyper-metabase.yml""
if exist "%COMPOSE_DIR%\security\athyper-infisical.yml"               set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-infisical.yml""
if exist "%COMPOSE_DIR%\admin\athyper-bullboard.yml"                  set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\admin\athyper-bullboard.yml""
if exist "%COMPOSE_DIR%\admin\athyper-pgweb.yml"                      set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\admin\athyper-pgweb.yml""
if exist "%COMPOSE_DIR%\memorycache\athyper-memorycache-jobs.yml"     set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\memorycache\athyper-memorycache-jobs.yml""
if exist "!OVERRIDE!" set "COMPOSE_FILES=!COMPOSE_FILES! -f "!OVERRIDE!""

echo Running: docker compose ... stop athyper-neon-web
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
  !COMPOSE_FILES! stop athyper-neon-web

if errorlevel 1 (
  echo ERROR: docker compose stop failed.
  pause & exit /b 1
)

echo.
echo Web service stopped (env=!ENVIRONMENT!)

:end
echo.
endlocal
