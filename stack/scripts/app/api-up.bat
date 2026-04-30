@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Backend API UP - Windows Batch
REM Location: stack\scripts\app\api-up.bat
REM Usage:
REM   api-up.bat              -> default API mode
REM   api-up.bat worker       -> BullMQ worker mode
REM   api-up.bat scheduler    -> scheduler mode
REM
REM Behaviour (auto-detected from ENVIRONMENT in stack\env\.env):
REM   local      -> load stack\env\.env, translate Docker hostnames to 127.0.0.1,
REM                 then: pnpm --filter @athyper/runtime-server dev[:<mode>]
REM   staging    -> docker compose up -d --no-deps athyper-api
REM   production -> docker compose up -d --no-deps athyper-api
REM
REM Single source of truth: stack\env\.env is the only env file needed.
REM server\.env is NOT required -- this script injects all vars directly.
REM ============================================================
REM
REM LOCAL WINDOWS DEVELOPMENT ONLY.
REM For staging or production deployments use the Linux .sh equivalents on Ubuntu.
REM The .bat scripts do not implement the two-file env model (bootstrap + secrets)
REM required for staging/production and will silently drop secrets-file variables.
REM ============================================================

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

set "MODE=%~1"
if "!MODE!"=="" set "MODE=api"

REM ----------------------------
REM Read all vars from stack .env into the current environment.
REM Uses FOR variable expansion (%%A=%%B) to set values — this avoids delayed-
REM expansion ! processing inside values (e.g. bcrypt hashes, auth secrets).
REM Lines starting with # and blank lines are skipped.
REM ----------------------------
set "ENVIRONMENT=local"

if exist "%ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    set "_k=%%A"
    for /f "tokens=* delims= " %%K in ("!_k!") do set "_k=%%K"
    if not "!_k!"=="" if /I not "!_k:~0,1!"=="#" (
      set "%%A=%%B"
    )
  )
) else (
  echo WARNING: .env not found: "%ENV_FILE%" -- defaulting to local mode.
)

if "!ENVIRONMENT!"=="" set "ENVIRONMENT=local"

REM ATHYPER_CONFIG_ROOT / ATHYPER_DATA_ROOT fallbacks (loaded from .env above;
REM fallback only if the file didn't contain them)
if not "!ATHYPER_CONFIG_ROOT!"=="" goto :app_skip_cr
set "ATHYPER_CONFIG_ROOT=%STACK_DIR%\config"
:app_skip_cr
if not "!ATHYPER_DATA_ROOT!"==""   goto :app_skip_dr
set "ATHYPER_DATA_ROOT=%STACK_DIR%\data"
:app_skip_dr

set "_TMP=!ATHYPER_CONFIG_ROOT:\=/!" & set "ATHYPER_CONFIG=!_TMP!"
set "_TMP=!ATHYPER_DATA_ROOT:\=/!"   & set "ATHYPER_DATA=!_TMP!"

echo.
echo ==========================
echo ENVIRONMENT = "!ENVIRONMENT!"
echo SERVICE     = athyper-api ^(@athyper/runtime-server^)
echo MODE        = "!MODE!"
echo ==========================
echo.

REM ----------------------------
REM Local: translate Docker hostnames → 127.0.0.1, then run pnpm dev
REM ----------------------------
if /I "!ENVIRONMENT!"=="local" (
  set "PNPM_SCRIPT=dev"
  if /I "!MODE!"=="worker"    set "PNPM_SCRIPT=dev:worker"
  if /I "!MODE!"=="scheduler" set "PNPM_SCRIPT=dev:scheduler"

  REM Server always runs on port 4000 on the host (compose uses API_PORT=3000)
  set "PORT=4000"

  REM Translate Docker service names to 127.0.0.1.
  REM Docker Desktop publishes these ports to the host; all reachable via 127.0.0.1.
  set "DATABASE_URL=!DATABASE_URL:dbpool-apps=127.0.0.1!"
  set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:@db:=@127.0.0.1:!"
  set "REDIS_URL=!REDIS_URL:memorycache=127.0.0.1!"
  set "S3_ENDPOINT=!S3_ENDPOINT:objectstorage=127.0.0.1!"

  REM Gotenberg port 3000 conflicts with Next.js dev server -- clear it.
  set "GOTENBERG_BASE_URL="
  REM Tika 9998 is unique; no-ops gracefully if render profile not running.
  set "TIKA_URL=!TIKA_URL:tika=127.0.0.1!"

  REM OTel Tempo gRPC (4317); no-ops if telemetry profile not running.
  set "OTEL_EXPORTER_OTLP_ENDPOINT=!OTEL_EXPORTER_OTLP_ENDPOINT:tracing=127.0.0.1!"
  REM Alloy/logshipper HTTP OTLP not published to host by default.
  set "OTLP_ENDPOINT="

  REM Meilisearch (7700); no-ops if search profile not running.
  set "MEILISEARCH_URL=!MEILISEARCH_URL:meilisearch=127.0.0.1!"

  REM Healthchecks ping port not published to host by default.
  set "HEALTHCHECKS_BASE_URL="

  set "NODE_ENV=development"
  set "NODE_TLS_REJECT_UNAUTHORIZED=0"

  echo Local mode: starting backend server
  echo   pnpm --filter @athyper/runtime-server !PNPM_SCRIPT!
  echo.
  pushd "%REPO_ROOT%" >nul
  pnpm --filter @athyper/runtime-server !PNPM_SCRIPT!
  popd >nul
  goto :end
)

REM ----------------------------
REM Staging / Production: compose up
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

echo Running: docker compose ... up -d --no-deps athyper-api
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
  !COMPOSE_FILES! up -d --no-deps athyper-api

if errorlevel 1 (
  echo ERROR: docker compose up failed.
  pause & exit /b 1
)

echo.
echo API service is UP (env=!ENVIRONMENT!)
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
  !COMPOSE_FILES! ps athyper-api

:end
echo.
endlocal
