@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - LOGS (profile-aware) - Windows Batch
REM Location:
REM   stack\scripts\stack-profile\logs.bat
REM Usage:
REM   logs.bat                -> show logs for all running services
REM   logs.bat gateway        -> show logs for gateway service only
REM   logs.bat -f             -> follow logs (tail -f style)
REM   logs.bat gateway -f     -> follow gateway logs
REM   logs.bat --tail 100     -> show last 100 lines
REM   logs.bat gateway -f --tail 50
REM ============================================================

REM ----------------------------
REM Resolve base directories
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
REM ----------------------------
set "SERVICE="
set "FOLLOW="
set "TAIL="
set "EXTRA_ARGS="

:parse_args
if "%~1"=="" goto :done_parsing

if /I "%~1"=="-f" (
  set "FOLLOW=-f"
  shift
  goto :parse_args
)
if /I "%~1"=="--follow" (
  set "FOLLOW=-f"
  shift
  goto :parse_args
)
if /I "%~1"=="--tail" (
  set "TAIL=--tail %~2"
  shift
  shift
  goto :parse_args
)
if /I "%~1"=="-n" (
  set "TAIL=--tail %~2"
  shift
  shift
  goto :parse_args
)

REM Assume it's a service name
if "!SERVICE!"=="" (
  set "SERVICE=%~1"
) else (
  set "EXTRA_ARGS=!EXTRA_ARGS! %~1"
)
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
)

if not "!ATHYPER_CONFIG_ROOT!"==""  goto :lg_skip_cr
if not "!_CR_FROM_ENV!"==""         (set "ATHYPER_CONFIG_ROOT=!_CR_FROM_ENV!" & goto :lg_skip_cr)
set "ATHYPER_CONFIG_ROOT=%STACK_DIR%\config"
:lg_skip_cr
if not "!ATHYPER_SECRETS_ROOT!"=="" goto :lg_skip_sr
if not "!_SR_FROM_ENV!"==""         (set "ATHYPER_SECRETS_ROOT=!_SR_FROM_ENV!" & goto :lg_skip_sr)
set "ATHYPER_SECRETS_ROOT=%STACK_DIR%\secrets"
:lg_skip_sr
if not "!ATHYPER_DATA_ROOT!"==""    goto :lg_skip_dr
if not "!_DR_FROM_ENV!"==""         (set "ATHYPER_DATA_ROOT=!_DR_FROM_ENV!" & goto :lg_skip_dr)
set "ATHYPER_DATA_ROOT=%STACK_DIR%\data"
:lg_skip_dr

set "_TMP=!ATHYPER_CONFIG_ROOT:\=/!" & set "ATHYPER_CONFIG=!_TMP!"
set "_TMP=!ATHYPER_DATA_ROOT:\=/!"   & set "ATHYPER_DATA=!_TMP!"
set "_TMP=!ATHYPER_SECRETS_ROOT:\=/!" & set "ATHYPER_SECRETS_ROOT=!_TMP!"

REM Default profile (display only — actual logs use all profiles)
if "!STACK_PROFILE!"=="" set "STACK_PROFILE=core"
set "ALL_COMPOSE_PROFILES=admin,analytics,apps,core,db,dev,emergency,gateway,iam,memorycache,memorycache-jobs,monitoring,objectstorage,render,search,security-infisical,telemetry"

REM ----------------------------
REM Pick override compose based on ENVIRONMENT
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

REM ----------------------------
REM Docker pre-flight check
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
REM   the behaviour of logs.sh.
REM ----------------------------
set "COMPOSE_FILES="
if exist "%COMPOSE_DIR%\athyper.base.yml"                              set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\athyper.base.yml""
if exist "%COMPOSE_DIR%\db\athyper-db.yml"                            set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-db.yml""
if exist "%COMPOSE_DIR%\db\athyper-dbpool-apps.yml"                   set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-dbpool-apps.yml""
if exist "%COMPOSE_DIR%\db\athyper-dbpool-session.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-dbpool-session.yml""
if exist "%COMPOSE_DIR%\security\athyper-socket-proxy-gateway.yml"    set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-socket-proxy-gateway.yml""
if exist "%COMPOSE_DIR%\security\athyper-socket-proxy-logshipper.yml" set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-socket-proxy-logshipper.yml""
if exist "%COMPOSE_DIR%\gateway\athyper-gateway.yml"                  set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\gateway\athyper-gateway.yml""
if exist "%COMPOSE_DIR%\mail\athyper-mailtrap.yml"                     set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\mail\athyper-mailtrap.yml""
if exist "%COMPOSE_DIR%\iam\athyper-iam.yml"                          set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\iam\athyper-iam.yml""
if exist "%COMPOSE_DIR%\objectstorage\athyper-objectstorage.yml"      set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\objectstorage\athyper-objectstorage.yml""
if exist "%COMPOSE_DIR%\security\athyper-virusscan.yml"                  set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-virusscan.yml""
if exist "%COMPOSE_DIR%\memorycache\athyper-memorycache.yml"          set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\memorycache\athyper-memorycache.yml""
if exist "%COMPOSE_DIR%\memorycache\athyper-memorycache-exporter.yml" set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\memorycache\athyper-memorycache-exporter.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-alertmanager.yml"           set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-alertmanager.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-metrics.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-metrics.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-tracing.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-tracing.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-logging.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-logging.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-logshipper.yml"             set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-logshipper.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-telemetry.yml"              set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-telemetry.yml""
if exist "%COMPOSE_DIR%\apps\athyper-apps.yml"                        set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\apps\athyper-apps.yml""
if exist "%COMPOSE_DIR%\render\athyper-docrender.yml"                 set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\render\athyper-docrender.yml""
if exist "%COMPOSE_DIR%\render\athyper-docparser.yml"                      set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\render\athyper-docparser.yml""
if exist "%COMPOSE_DIR%\search\athyper-searchcore.yml"               set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\search\athyper-searchcore.yml""
if exist "%COMPOSE_DIR%\monitoring\athyper-errorcollect.yml"             set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\monitoring\athyper-errorcollect.yml""
if exist "%COMPOSE_DIR%\monitoring\athyper-cronwatch.yml"          set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\monitoring\athyper-cronwatch.yml""
if exist "%COMPOSE_DIR%\monitoring\athyper-statuswatch.yml"           set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\monitoring\athyper-statuswatch.yml""
if exist "%COMPOSE_DIR%\analytics\athyper-analyticsboard.yml"               set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\analytics\athyper-analyticsboard.yml""
if exist "%COMPOSE_DIR%\security\athyper-secretstore.yml"               set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-secretstore.yml""
if exist "%COMPOSE_DIR%\admin\athyper-queueconsole.yml"                  set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\admin\athyper-queueconsole.yml""
if exist "%COMPOSE_DIR%\admin\athyper-dbconsole.yml"                      set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\admin\athyper-dbconsole.yml""
if exist "%COMPOSE_DIR%\memorycache\athyper-memorycache-jobs.yml"     set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\memorycache\athyper-memorycache-jobs.yml""
if exist "!OVERRIDE!" (
  set "COMPOSE_FILES=!COMPOSE_FILES! -f "!OVERRIDE!""
) else (
  echo WARNING: override file missing, skipping: !OVERRIDE!
)

REM ----------------------------
REM Build logs command
REM ----------------------------
set "LOGS_ARGS=logs"
if not "!FOLLOW!"=="" set "LOGS_ARGS=!LOGS_ARGS! !FOLLOW!"
if not "!TAIL!"=="" set "LOGS_ARGS=!LOGS_ARGS! !TAIL!"
if not "!SERVICE!"=="" set "LOGS_ARGS=!LOGS_ARGS! !SERVICE!"
if not "!EXTRA_ARGS!"=="" set "LOGS_ARGS=!LOGS_ARGS! !EXTRA_ARGS!"

REM ----------------------------
REM Show logs
REM ----------------------------
echo.
echo ==========================
echo ENVIRONMENT  = "!ENVIRONMENT!"
echo STACK_PROFILE = "!STACK_PROFILE!"
echo SERVICE      = "!SERVICE!"
echo FOLLOW       = "!FOLLOW!"
echo TAIL         = "!TAIL!"
echo ==========================
echo.

set "COMPOSE_PROFILES=!ALL_COMPOSE_PROFILES!"
if exist "%ENV_FILE%" (
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! !LOGS_ARGS! [all profiles]
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! !LOGS_ARGS!
) else (
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" !COMPOSE_FILES! !LOGS_ARGS! [all profiles]
  docker compose --project-directory "%COMPOSE_DIR%" !COMPOSE_FILES! !LOGS_ARGS!
)

endlocal
