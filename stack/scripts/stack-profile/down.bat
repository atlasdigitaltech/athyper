@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - DOWN - Windows Batch
REM Location:
REM   stack\scripts\stack-profile\down.bat
REM Usage:
REM   down.bat              -> bring down ALL services (no --profile, same as down.sh)
REM   down.bat all          -> bring down ALL services (explicit, same as no arg)
REM   down.bat clean        -> bring down ALL services + remove volumes
REM   down.bat core         -> stop only core-profile services
REM   down.bat telemetry    -> stop only telemetry-profile services
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
REM Determine docker compose profile to run
REM ----------------------------
set "ACTIVE_PROFILE=%~1"

REM ----------------------------
REM Read ENVIRONMENT + STACK_PROFILE + six ATHYPER_*_ROOT vars from .env
REM ----------------------------
set "ENVIRONMENT="
set "STACK_PROFILE="
set "_CR_FROM_ENV=" & set "_SR_FROM_ENV=" & set "_DR_FROM_ENV=" & set "_LR_FROM_ENV=" & set "_BR_FROM_ENV="

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
  echo Will attempt to run compose down without env-file.
)

if not "!ATHYPER_CONFIG_ROOT!"==""  goto :dn_skip_cr
if not "!_CR_FROM_ENV!"==""         (set "ATHYPER_CONFIG_ROOT=!_CR_FROM_ENV!" & goto :dn_skip_cr)
set "ATHYPER_CONFIG_ROOT=%STACK_DIR%\config"
:dn_skip_cr
if not "!ATHYPER_SECRETS_ROOT!"=="" goto :dn_skip_sr
if not "!_SR_FROM_ENV!"==""         (set "ATHYPER_SECRETS_ROOT=!_SR_FROM_ENV!" & goto :dn_skip_sr)
set "ATHYPER_SECRETS_ROOT=%STACK_DIR%\secrets"
:dn_skip_sr
if not "!ATHYPER_DATA_ROOT!"==""    goto :dn_skip_dr
if not "!_DR_FROM_ENV!"==""         (set "ATHYPER_DATA_ROOT=!_DR_FROM_ENV!" & goto :dn_skip_dr)
set "ATHYPER_DATA_ROOT=%STACK_DIR%\data"
:dn_skip_dr

set "_TMP=!ATHYPER_CONFIG_ROOT:\=/!" & set "ATHYPER_CONFIG=!_TMP!"
set "_TMP=!ATHYPER_DATA_ROOT:\=/!"   & set "ATHYPER_DATA=!_TMP!"
set "_TMP=!ATHYPER_SECRETS_ROOT:\=/!" & set "ATHYPER_SECRETS_ROOT=!_TMP!"

REM Default: no arg = stop ALL services (no profile filter), matching down.sh behaviour.
REM A specific profile name activates per-profile filtering.
REM "all" and "clean" also stop everything; "clean" additionally removes volumes.
set "USE_PROFILE=0"
set "REMOVE_VOLUMES=0"
set "ALL_COMPOSE_PROFILES=admin,analytics,apps,core,db,dev,emergency,gateway,iam,memorycache,memorycache-jobs,monitoring,objectstorage,render,search,security-infisical,telemetry"

if "!ACTIVE_PROFILE!"=="" (
  set "ACTIVE_PROFILE=all"
)
if /I "!ACTIVE_PROFILE!"=="all"   set "USE_PROFILE=0"
if /I "!ACTIVE_PROFILE!"=="clean" set "USE_PROFILE=0" & set "REMOVE_VOLUMES=1"
if /I not "!ACTIVE_PROFILE!"=="all" if /I not "!ACTIVE_PROFILE!"=="clean" set "USE_PROFILE=1"

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
echo ACTIVE_PROFILE  = "!ACTIVE_PROFILE!"
echo USE_PROFILE     = "!USE_PROFILE!"
echo REMOVE_VOLUMES  = "!REMOVE_VOLUMES!"
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
REM   List each service file explicitly so Docker Compose resolves
REM   relative volume paths from each file's own directory, matching
REM   the behaviour of down.sh.
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
REM Build DOWN args
REM ----------------------------
set "DOWN_ARGS=down --remove-orphans"
if "!REMOVE_VOLUMES!"=="1" set "DOWN_ARGS=!DOWN_ARGS! -v"

REM ----------------------------
REM Execute DOWN (PROFILE-AWARE)
REM ----------------------------
if exist "%ENV_FILE%" (
  if "!USE_PROFILE!"=="1" (
    echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!ACTIVE_PROFILE!" !COMPOSE_FILES! !DOWN_ARGS!
    docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!ACTIVE_PROFILE!" !COMPOSE_FILES! !DOWN_ARGS!
  ) else (
    echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! !DOWN_ARGS! [all profiles]
    set "COMPOSE_PROFILES=!ALL_COMPOSE_PROFILES!"
    docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! !DOWN_ARGS!
  )
) else (
  REM Fallback if env file missing
  if "!USE_PROFILE!"=="1" (
    echo Running: docker compose --project-directory "%COMPOSE_DIR%" --profile "!ACTIVE_PROFILE!" !COMPOSE_FILES! !DOWN_ARGS!
    docker compose --project-directory "%COMPOSE_DIR%" --profile "!ACTIVE_PROFILE!" !COMPOSE_FILES! !DOWN_ARGS!
  ) else (
    echo Running: docker compose --project-directory "%COMPOSE_DIR%" !COMPOSE_FILES! !DOWN_ARGS! [all profiles]
    set "COMPOSE_PROFILES=!ALL_COMPOSE_PROFILES!"
    docker compose --project-directory "%COMPOSE_DIR%" !COMPOSE_FILES! !DOWN_ARGS!
  )
)

if errorlevel 1 (
  echo ERROR: docker compose down failed.
  pause
  exit /b 1
)

echo Stack is DOWN (profile=!ACTIVE_PROFILE!, env=!ENVIRONMENT!)

echo.
endlocal
