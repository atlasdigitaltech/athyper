@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Web Frontend UP - Windows Batch
REM Location: stack\scripts\app\web-up.bat
REM
REM Usage:
REM   web-up.bat           -> start (or restart) using existing image
REM   web-up.bat --build   -> rebuild image from source, then start
REM
REM Behaviour (auto-detected from ENVIRONMENT in stack\env\.env):
REM   local      -> load stack\env\.env, translate Docker hostnames to 127.0.0.1,
REM                 derive web-specific vars, then: pnpm --filter @athyper/web dev
REM                 (--build is ignored in local mode; pnpm handles incremental rebuilds)
REM   staging    -> [--build: docker compose build athyper-neon-web]
REM                 docker compose up -d --no-deps athyper-neon-web
REM   production -> [--build: docker compose build athyper-neon-web]
REM                 docker compose up -d --no-deps athyper-neon-web
REM
REM Single source of truth: stack\env\.env is the only env file needed.
REM apps\web\.env.local is NOT required -- this script injects all vars directly.
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

REM ----------------------------
REM Read all vars from stack .env into the current environment.
REM Uses FOR variable expansion (%%A=%%B) — avoids delayed-expansion ! processing
REM inside values (bcrypt hashes, auth secrets with special chars).
REM ----------------------------
set "BUILD_FLAG=0"
for %%A in (%*) do (
  if /I "%%~A"=="--build" set "BUILD_FLAG=1"
)

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

REM ATHYPER_CONFIG_ROOT / ATHYPER_DATA_ROOT fallbacks
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
echo SERVICE     = athyper-neon-web ^(@athyper/web^)
echo ==========================
echo.

REM ----------------------------
REM Local: translate, derive web-specific vars, run pnpm dev
REM ----------------------------
if /I "!ENVIRONMENT!"=="local" (
  REM Redis: translate Docker hostname to 127.0.0.1
  set "REDIS_URL=!REDIS_URL:memorycache=127.0.0.1!"
  REM Disable socket idle timeout -- avoids ECONNRESET on Windows Docker reconnects
  set "REDIS_SOCKET_TIMEOUT_MS=0"

  REM API runs on the host at port 4000 (set by api-up.bat)
  REM Mirrors compose: RUNTIME_API_URL: "http://athyper-api:${API_PORT}"
  set "RUNTIME_API_URL=http://localhost:4000"

  REM Derive Keycloak vars from IAM stack vars.
  REM Mirrors compose: KEYCLOAK_BASE_URL: "https://${IAM_HOST}"
  set "KEYCLOAK_BASE_URL=https://!IAM_HOST!"
  set "KEYCLOAK_REALM=!IAM_DEFAULT_REALM!"
  if "!KEYCLOAK_CLIENT_ID!"=="" set "KEYCLOAK_CLIENT_ID=neon-web"

  REM The shared stack env uses PUBLIC_BASE_URL for the API. The web BFF must
  REM advertise the Neon origin to Keycloak when building OAuth redirect_uri.
  if not "!PUBLIC_WEB_URL!"=="" (
    set "PUBLIC_BASE_URL=!PUBLIC_WEB_URL!"
  ) else (
    set "PUBLIC_BASE_URL=https://!APPS_ATHYPER_WEB_HOST!"
  )

  REM Allow direct localhost:3000 access (bypasses host-guard middleware)
  set "ALLOW_DIRECT_ACCESS=true"

  REM Map GlitchTip DSN to SENTRY_DSN (mirrors production.env.example)
  if "!SENTRY_DSN!"=="" set "SENTRY_DSN=!GLITCHTIP_DSN!"

  REM Derive NEXT_PUBLIC_ vars from base stack vars (mirrors compose service env block)
  set "NEXT_PUBLIC_ENVIRONMENT=!ENVIRONMENT!"
  set "NEXT_PUBLIC_SERVICE_VERSION=!SERVICE_VERSION!"
  set "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=!SENTRY_TRACES_SAMPLE_RATE!"

  REM Feature flags -- default off unless overridden in stack/env/.env
  if "!NEXT_PUBLIC_GITHUB_LOGIN_ENABLED!"==""      set "NEXT_PUBLIC_GITHUB_LOGIN_ENABLED=false"
  if "!NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED!"==""  set "NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED=false"

  set "NODE_ENV=development"
  set "NODE_TLS_REJECT_UNAUTHORIZED=0"

  echo Local mode: starting Next.js dev server
  echo   pnpm --filter @athyper/web dev
  echo.
  pushd "%REPO_ROOT%" >nul
  pnpm --filter @athyper/web dev
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

if "!BUILD_FLAG!"=="1" (
  echo Running: docker compose ... build athyper-neon-web
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
    !COMPOSE_FILES! build athyper-neon-web
  if errorlevel 1 (
    echo ERROR: docker compose build failed.
    pause & exit /b 1
  )
  echo.
)

echo Running: docker compose ... up -d --no-deps athyper-neon-web
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
  !COMPOSE_FILES! up -d --no-deps athyper-neon-web

if errorlevel 1 (
  echo ERROR: docker compose up failed.
  pause & exit /b 1
)

echo.
echo Web service is UP (env=!ENVIRONMENT!)
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
  !COMPOSE_FILES! ps athyper-neon-web

:end
echo.
endlocal
