@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - RESTART - Windows Batch
REM Location:
REM   stack\scripts\stack-profile\restart.bat
REM Usage:
REM   restart.bat                  -> restart all running services (all profiles)
REM   restart.bat all              -> same as no arg (all profiles, no service filter)
REM   restart.bat gateway          -> restart specific service
REM   restart.bat gateway keycloak -> restart multiple services
REM   restart.bat --timeout 60     -> custom stop timeout in seconds (default 10)
REM Note: docker compose restart does not support --profile; all profiles are
REM       always active so every running service is reachable by name.
REM ============================================================

REM ----------------------------
REM Resolve base directories (robust)
REM ----------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "COMPOSE_DIR=%STACK_DIR%\compose"
set "ENV_DIR=%STACK_DIR%\env"
set "ENV_FILE=%ENV_DIR%\.env"

if not exist "%COMPOSE_DIR%" (
  echo ERROR: COMPOSE_DIR not found: "%COMPOSE_DIR%"
  pause
  exit /b 1
)

REM ----------------------------
REM Parse arguments
REM   --timeout N  sets stop timeout
REM   all          restarts all services without profile filter
REM   anything else is treated as a service name
REM ----------------------------
set "TIMEOUT_ARG="
set "SERVICES="

:parse_args
if "%~1"=="" goto :done_parsing

if /I "%~1"=="--timeout" (
  set "TIMEOUT_ARG=--timeout %~2"
  shift
  shift
  goto :parse_args
)
if /I "%~1"=="-t" (
  set "TIMEOUT_ARG=--timeout %~2"
  shift
  shift
  goto :parse_args
)
if /I "%~1"=="all" (
  shift
  goto :parse_args
)

REM Positional arg: service name
set "SERVICES=!SERVICES! %~1"
shift
goto :parse_args

:done_parsing

REM ----------------------------
REM Read ENVIRONMENT + STACK_PROFILE + six ATHYPER_*_ROOT vars from .env
REM ----------------------------
set "ENVIRONMENT="
set "STACK_PROFILE="
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
      if /I "!K!"=="ENVIRONMENT"          set "ENVIRONMENT=!V!"
      if /I "!K!"=="STACK_PROFILE"        set "STACK_PROFILE=!V!"
      if /I "!K!"=="ATHYPER_CONFIG_ROOT"  if "!_CR_FROM_ENV!"=="" set "_CR_FROM_ENV=!V!"
      if /I "!K!"=="ATHYPER_SECRETS_ROOT" if "!_SR_FROM_ENV!"=="" set "_SR_FROM_ENV=!V!"
      if /I "!K!"=="ATHYPER_DATA_ROOT"    if "!_DR_FROM_ENV!"=="" set "_DR_FROM_ENV=!V!"
    )
  )
) else (
  echo WARNING: .env not found: "%ENV_FILE%"
  echo Will attempt to run compose restart without env-file.
)

if not "!ATHYPER_CONFIG_ROOT!"==""  goto :rs_skip_cr
if not "!_CR_FROM_ENV!"==""         (set "ATHYPER_CONFIG_ROOT=!_CR_FROM_ENV!" & goto :rs_skip_cr)
set "ATHYPER_CONFIG_ROOT=%STACK_DIR%\config"
:rs_skip_cr
if not "!ATHYPER_SECRETS_ROOT!"=="" goto :rs_skip_sr
if not "!_SR_FROM_ENV!"==""         (set "ATHYPER_SECRETS_ROOT=!_SR_FROM_ENV!" & goto :rs_skip_sr)
set "ATHYPER_SECRETS_ROOT=%STACK_DIR%\secrets"
:rs_skip_sr
if not "!ATHYPER_DATA_ROOT!"==""    goto :rs_skip_dr
if not "!_DR_FROM_ENV!"==""         (set "ATHYPER_DATA_ROOT=!_DR_FROM_ENV!" & goto :rs_skip_dr)
set "ATHYPER_DATA_ROOT=%STACK_DIR%\data"
:rs_skip_dr

set "_TMP=!ATHYPER_CONFIG_ROOT:\=/!" & set "ATHYPER_CONFIG=!_TMP!"
set "_TMP=!ATHYPER_DATA_ROOT:\=/!"   & set "ATHYPER_DATA=!_TMP!"
set "_TMP=!ATHYPER_SECRETS_ROOT:\=/!" & set "ATHYPER_SECRETS_ROOT=!_TMP!"

if "!STACK_PROFILE!"=="" set "STACK_PROFILE=core"
set "ALL_COMPOSE_PROFILES=admin,analytics,apps,core,db,dev,emergency,gateway,iam,memorycache,memorycache-jobs,monitoring,objectstorage,render,search,security-infisical,telemetry"

REM ----------------------------
REM Pick override compose based on ENVIRONMENT (or default)
REM ----------------------------
set "OVERRIDE="
if /I "!ENVIRONMENT!"=="local"      set "OVERRIDE=%COMPOSE_DIR%\athyper.override.local.yml"
if /I "!ENVIRONMENT!"=="staging"    set "OVERRIDE=%COMPOSE_DIR%\athyper.override.staging.yml"
if /I "!ENVIRONMENT!"=="production" set "OVERRIDE=%COMPOSE_DIR%\athyper.override.production.yml"
if "!OVERRIDE!"=="" set "OVERRIDE=%COMPOSE_DIR%\athyper.override.yml"

if not exist "!OVERRIDE!" (
  if exist "%COMPOSE_DIR%\athyper.dev.yml" (
    set "OVERRIDE=%COMPOSE_DIR%\athyper.dev.yml"
  ) else (
    set "OVERRIDE=%COMPOSE_DIR%\athyper.prod.yml"
  )
)

echo.
echo ==========================
echo COMPOSE_DIR     = "%COMPOSE_DIR%"
echo ATHYPER_CONFIG  = "!ATHYPER_CONFIG!"
echo ATHYPER_SECRETS = "!ATHYPER_SECRETS_ROOT!"
echo ATHYPER_DATA    = "!ATHYPER_DATA!"
echo ENV_FILE        = "%ENV_FILE%"
echo ENVIRONMENT     = "!ENVIRONMENT!"
echo STACK_PROFILE   = "!STACK_PROFILE!"
echo SERVICES        = "!SERVICES!"
echo OVERRIDE        = "!OVERRIDE!"
echo ==========================
echo.

REM ----------------------------
REM Optional: pre-flight check
REM ----------------------------
docker version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker does not seem to be running or accessible.
  echo Start Docker Desktop and re-run.
  pause
  exit /b 1
)

REM ----------------------------
REM Compose files list
REM ----------------------------
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
if exist "!OVERRIDE!" (
  set "COMPOSE_FILES=!COMPOSE_FILES! -f "!OVERRIDE!""
) else (
  echo WARNING: override file missing, skipping: !OVERRIDE!
)

REM ----------------------------
REM Build restart command
REM   docker compose restart does not take --profile; profile only affects up.
REM   We pass the full compose file list so Docker Compose targets the right project.
REM ----------------------------
set "RESTART_CMD=restart"
if not "!TIMEOUT_ARG!"=="" set "RESTART_CMD=!RESTART_CMD! !TIMEOUT_ARG!"
if not "!SERVICES!"=="" set "RESTART_CMD=!RESTART_CMD!!SERVICES!"

REM ----------------------------
REM Execute RESTART (all profiles active so every running service is restarted)
REM ----------------------------
set "COMPOSE_PROFILES=!ALL_COMPOSE_PROFILES!"
if exist "%ENV_FILE%" (
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! !RESTART_CMD! [all profiles]
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! !RESTART_CMD!
) else (
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" !COMPOSE_FILES! !RESTART_CMD! [all profiles]
  docker compose --project-directory "%COMPOSE_DIR%" !COMPOSE_FILES! !RESTART_CMD!
)

if errorlevel 1 (
  echo ERROR: docker compose restart failed.
  pause
  exit /b 1
)

echo.
set "_SVC_LABEL=!SERVICES!"
if "!_SVC_LABEL!"=="" set "_SVC_LABEL=all"
echo Restart complete (services=!_SVC_LABEL!, env=!ENVIRONMENT!)

REM Show status
if exist "%ENV_FILE%" (
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! ps
) else (
  docker compose --project-directory "%COMPOSE_DIR%" !COMPOSE_FILES! ps
)

echo.
endlocal
