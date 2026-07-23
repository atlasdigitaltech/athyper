@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - UP (profile-aware) - Windows Batch
REM Location:
REM   stack\scripts\stack-profile\up.bat
REM Usage:
REM   up.bat                -> uses STACK_PROFILE from .env, else "core"
REM   up.bat core           -> start only core-profile services
REM   up.bat telemetry      -> start only telemetry-profile services
REM   up.bat apps           -> start only apps-profile services
REM   up.bat all            -> start ALL profiles (no --profile filter)
REM
REM If stack\env\.env is missing, prompts to choose a template and
REM creates it before continuing.
REM
REM Environment validation (validate-env.bat) runs automatically before
REM docker compose up. To bypass: set SKIP_ENV_VALIDATION=1 before running.
REM
REM Available profiles:
REM   admin, analytics, apps, core, db, dev, emergency, gateway, iam,
REM   memorycache, memorycache-jobs, monitoring, objectstorage, render,
REM   search, security-infisical, telemetry
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
REM   STACK_PROFILE  = persisted value from .env
REM   ACTIVE_PROFILE = resolved runtime value (CLI arg > STACK_PROFILE > "core")
REM ----------------------------
set "ACTIVE_PROFILE=%~1"

REM ----------------------------
REM Bootstrap .env if missing (environment template selection)
REM ----------------------------
if not exist "%ENV_FILE%" (
  echo.
  echo WARNING: .env not found: %ENV_FILE%
  echo.

  set "PROFILE="
  set /p "PROFILE=Select env template [local | staging | production] (blank=local): "
  if "!PROFILE!"=="" set "PROFILE=local"

  set "TEMPLATE_FILE=%ENV_DIR%\.env.example"
  if /I "!PROFILE!"=="local" (
    if exist "%ENV_DIR%\local.env.example" set "TEMPLATE_FILE=%ENV_DIR%\local.env.example"
  )
  if /I "!PROFILE!"=="staging"    set "TEMPLATE_FILE=%ENV_DIR%\staging.env.example"
  if /I "!PROFILE!"=="production" set "TEMPLATE_FILE=%ENV_DIR%\production.env.example"

  echo.
  echo ENV_DIR       = "%ENV_DIR%"
  echo ENV TEMPLATE  = "!PROFILE!"
  echo TEMPLATE_FILE = "!TEMPLATE_FILE!"
  echo TARGET_ENV    = "%ENV_FILE%"
  echo.

  if not exist "!TEMPLATE_FILE!" (
    echo ERROR: Template env file not found: "!TEMPLATE_FILE!"
    echo Available env templates in "%ENV_DIR%":
    dir /b "%ENV_DIR%\*.example" 2>nul
    pause
    exit /b 1
  )

  echo Creating .env from template...
  copy /Y "!TEMPLATE_FILE!" "%ENV_FILE%" >nul
  if errorlevel 1 (
    echo ERROR: Failed to create .env at: "%ENV_FILE%"
    pause
    exit /b 1
  )

  echo Created: "%ENV_FILE%"
  echo.
)

REM ----------------------------
REM Read ENVIRONMENT + STACK_PROFILE + six ATHYPER_*_ROOT vars from .env.
REM Priority: existing shell env var > .env value > fallback below.
REM ----------------------------
set "ENVIRONMENT="
set "STACK_PROFILE="
set "_CR_FROM_ENV="
set "_SR_FROM_ENV="
set "_DR_FROM_ENV="
set "_LR_FROM_ENV="
set "_BR_FROM_ENV="

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
    if /I "!K!"=="ATHYPER_LOG_ROOT"     if "!_LR_FROM_ENV!"=="" set "_LR_FROM_ENV=!V!"
    if /I "!K!"=="ATHYPER_BACKUP_ROOT"  if "!_BR_FROM_ENV!"=="" set "_BR_FROM_ENV=!V!"
  )
)

REM Apply root var resolution: existing env var > .env value > repo-relative fallback
if not "!ATHYPER_CONFIG_ROOT!"==""  goto :skip_cr
if not "!_CR_FROM_ENV!"==""         (set "ATHYPER_CONFIG_ROOT=!_CR_FROM_ENV!" & goto :skip_cr)
set "ATHYPER_CONFIG_ROOT=%STACK_DIR%\config"
:skip_cr

if not "!ATHYPER_SECRETS_ROOT!"=="" goto :skip_sr
if not "!_SR_FROM_ENV!"==""         (set "ATHYPER_SECRETS_ROOT=!_SR_FROM_ENV!" & goto :skip_sr)
set "ATHYPER_SECRETS_ROOT=%STACK_DIR%\secrets"
:skip_sr

if not "!ATHYPER_DATA_ROOT!"==""    goto :skip_dr
if not "!_DR_FROM_ENV!"==""         (set "ATHYPER_DATA_ROOT=!_DR_FROM_ENV!" & goto :skip_dr)
set "ATHYPER_DATA_ROOT=%STACK_DIR%\data"
:skip_dr

if not "!ATHYPER_LOG_ROOT!"==""     goto :skip_lr
if not "!_LR_FROM_ENV!"==""         (set "ATHYPER_LOG_ROOT=!_LR_FROM_ENV!" & goto :skip_lr)
set "ATHYPER_LOG_ROOT=%STACK_DIR%\logs"
:skip_lr

if not "!ATHYPER_BACKUP_ROOT!"==""  goto :skip_br
if not "!_BR_FROM_ENV!"==""         (set "ATHYPER_BACKUP_ROOT=!_BR_FROM_ENV!" & goto :skip_br)
set "ATHYPER_BACKUP_ROOT=%STACK_DIR%\backups"
:skip_br

REM Backwards-compat aliases (Docker Compose bind mounts use ATHYPER_CONFIG / ATHYPER_DATA).
REM Convert backslashes to forward slashes — Docker requires forward slashes in bind mounts.
set "_TMP=!ATHYPER_CONFIG_ROOT:\=/!"
set "ATHYPER_CONFIG=!_TMP!"
set "_TMP=!ATHYPER_DATA_ROOT:\=/!"
set "ATHYPER_DATA=!_TMP!"
set "_TMP=!ATHYPER_SECRETS_ROOT:\=/!"
set "ATHYPER_SECRETS_ROOT=!_TMP!"

REM If CLI arg not provided, use STACK_PROFILE from env, else default core
if "!ACTIVE_PROFILE!"=="" (
  if not "!STACK_PROFILE!"=="" (
    set "ACTIVE_PROFILE=!STACK_PROFILE!"
  ) else (
    set "ACTIVE_PROFILE=core"
  )
)

REM Special: allow "all" to activate every profile
set "USE_PROFILE=1"
if /I "!ACTIVE_PROFILE!"=="all" set "USE_PROFILE=0"
set "ALL_COMPOSE_PROFILES=admin,analytics,apps,core,db,dev,emergency,gateway,iam,memorycache,memorycache-jobs,monitoring,objectstorage,render,search,security-infisical,telemetry"

REM ----------------------------
REM Pick override compose based on ENVIRONMENT (or default)
REM
REM LOCAL_CONTAINER_MODE=1 (opt-in) swaps the local override to the
REM local-container variant, which runs the 6 app services as PRODUCTION
REM containers on the developer machine. Used by dev-container.bat for
REM perf testing / QA. Ignored outside ENVIRONMENT=local.
REM ----------------------------
set "OVERRIDE="
if /I "!ENVIRONMENT!"=="local" (
  if /I "!LOCAL_CONTAINER_MODE!"=="1" (
    set "OVERRIDE=%COMPOSE_DIR%\athyper.override.local-container.yml"
  ) else (
    set "OVERRIDE=%COMPOSE_DIR%\athyper.override.local.yml"
  )
)
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
echo COMPOSE_DIR        = "%COMPOSE_DIR%"
echo ATHYPER_CONFIG     = "!ATHYPER_CONFIG!"
echo ATHYPER_SECRETS    = "!ATHYPER_SECRETS_ROOT!"
echo ATHYPER_DATA       = "!ATHYPER_DATA!"
echo ENV_FILE           = "%ENV_FILE%"
echo ENVIRONMENT        = "!ENVIRONMENT!"
echo ACTIVE_PROFILE     = "!ACTIVE_PROFILE!"
echo OVERRIDE           = "!OVERRIDE!"
echo ==========================
echo.

REM ----------------------------
REM Validate environment variables
REM Call must be at top level (not inside a compound block) so that
REM call :label subroutine lookup inside validate-env.bat uses its own
REM file context, not up.bat's — a known CMD compound-block scoping bug.
REM ----------------------------
set "VALIDATE_SCRIPT=%STACK_DIR%\scripts\setup\validate-env.bat"
if not exist "!VALIDATE_SCRIPT!" goto :after_validate
call "!VALIDATE_SCRIPT!" "%ENV_FILE%"
if errorlevel 1 (
  if /I not "%SKIP_ENV_VALIDATION%"=="1" (
    echo.
    echo ERROR: Environment validation failed. Fix the errors above.
    echo To skip ^(NOT recommended^): set SKIP_ENV_VALIDATION=1
    pause
    exit /b 1
  )
  echo WARNING: SKIP_ENV_VALIDATION=1 - proceeding despite validation errors.
)
:after_validate

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
REM   List each service file explicitly. Docker Compose resolves relative
REM   bind-mount paths from the project directory (stack/compose/ via
REM   --project-directory above). ATHYPER_CONFIG / ATHYPER_DATA are exported
REM   as absolute paths above so relative .env fallbacks are never used here.
REM ----------------------------
set "COMPOSE_FILES="
if exist "%COMPOSE_DIR%\athyper.base.yml"                              set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\athyper.base.yml""
if exist "%COMPOSE_DIR%\db\athyper-db.yml"                            set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-db.yml""
if exist "%COMPOSE_DIR%\db\athyper-dbpool-apps.yml"                   set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-dbpool-apps.yml""
if exist "%COMPOSE_DIR%\db\athyper-dbpool-session.yml"                 set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-dbpool-session.yml""
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
REM Bring up stack (PROFILE-AWARE)
REM ----------------------------
if "!USE_PROFILE!"=="1" (
  REM Always include "core" alongside the requested profile so that core-profile
  REM services (memorycache, dbpool-*, virusscan ...) remain visible for depends_on
  REM validation. COMPOSE_PROFILES is used instead of --profile to guarantee both
  REM profiles are active regardless of Docker Compose version merge behaviour.
  set "EFFECTIVE_PROFILES=core,!ACTIVE_PROFILE!"
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! up -d --remove-orphans [profiles=!EFFECTIVE_PROFILES!]
  set "COMPOSE_PROFILES=!EFFECTIVE_PROFILES!"
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! up -d --remove-orphans
) else (
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! up -d --remove-orphans [all profiles]
  set "COMPOSE_PROFILES=!ALL_COMPOSE_PROFILES!"
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! up -d --remove-orphans
)

if errorlevel 1 (
  echo ERROR: docker compose up failed.
  pause
  exit /b 1
)

echo Stack is UP (profile=!ACTIVE_PROFILE!, env=!ENVIRONMENT!)
echo NOTE: --scale docrender=N is not forwarded by this script. To run multiple docrender replicas, append it directly: docker compose ... up -d --scale docrender=N

REM Show status (same profile rules)
if "!USE_PROFILE!"=="1" (
  set "COMPOSE_PROFILES=!EFFECTIVE_PROFILES!"
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! ps
) else (
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! ps
)

echo.
endlocal
