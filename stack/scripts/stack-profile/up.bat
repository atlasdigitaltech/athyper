@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - UP (profile-aware) - Windows Batch
REM Location:
REM   stack\scripts\stack-profile\up.bat
REM Usage:
REM   up.bat                -> uses STACK_PROFILE=core (default)
REM   up.bat core           -> explicit profile
REM   up.bat telemetry      -> start only telemetry profile (if defined)
REM   up.bat apps           -> start apps profile (if defined)
REM   up.bat all            -> start without --profile (bring everything)
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

REM Compute absolute paths for ATHYPER_CONFIG / ATHYPER_DATA and export them.
REM Shell env vars take precedence over --env-file in Docker Compose, so these
REM override the relative ../../config values in .env regardless of CWD or
REM whether the caller uses compose.yml include: or individual -f flags.
set "ATHYPER_CONFIG=%STACK_DIR:\=/%/config"
set "ATHYPER_DATA=%STACK_DIR:\=/%/data"

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
REM Read ENVIRONMENT + STACK_PROFILE from .env (optional)
REM ----------------------------
set "ENVIRONMENT="
set "STACK_PROFILE="

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  set "K=%%A"
  set "V=%%B"
  for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
  if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
    set "V=!V:"=!"
    for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
    for /f "tokens=* delims= " %%V in ("!V!") do set "V=%%V"
    if /I "!K!"=="ENVIRONMENT"     set "ENVIRONMENT=!V!"
    if /I "!K!"=="STACK_PROFILE" set "STACK_PROFILE=!V!"
  )
)

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
echo ATHYPER_CONFIG  = "%ATHYPER_CONFIG%"
echo ATHYPER_DATA    = "%ATHYPER_DATA%"
echo ENV_FILE        = "%ENV_FILE%"
echo ENVIRONMENT     = "!ENVIRONMENT!"
echo ACTIVE_PROFILE  = "!ACTIVE_PROFILE!"
echo OVERRIDE        = "!OVERRIDE!"
echo ==========================
echo.

REM ----------------------------
REM Validate environment variables
REM ----------------------------
set "VALIDATE_SCRIPT=%STACK_DIR%\scripts\setup\validate-env.bat"
if exist "!VALIDATE_SCRIPT!" (
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
)

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
REM Bring up stack (PROFILE-AWARE)
REM ----------------------------
if "!USE_PROFILE!"=="1" (
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!ACTIVE_PROFILE!" !COMPOSE_FILES! up -d --remove-orphans
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!ACTIVE_PROFILE!" !COMPOSE_FILES! up -d --remove-orphans
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

REM Show status (same profile rules)
if "!USE_PROFILE!"=="1" (
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!ACTIVE_PROFILE!" !COMPOSE_FILES! ps
) else (
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! ps
)

echo.
pause
endlocal
