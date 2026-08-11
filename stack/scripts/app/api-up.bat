@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Backend API UP - Windows Batch
REM Location: stack\scripts\app\api-up.bat
REM Usage:
REM   api-up.bat                    : API HTTP mode
REM   api-up.bat worker             : BullMQ worker mode
REM   api-up.bat scheduler          : scheduler mode
REM   api-up.bat --build            : rebuild image, then start API
REM   api-up.bat worker --build     : rebuild image, then start worker
REM   api-up.bat --build scheduler  : rebuild image, then start scheduler
REM
REM Behaviour (auto-detected from ENVIRONMENT in stack\env\.env):
REM   local      : load stack\env\.env, translate Docker hostnames to 127.0.0.1,
REM                 then: pnpm --filter @athyper/server-platform-host run dev:<mode>
REM                 (--build is ignored in local mode; tsx handles incremental reloads)
REM   staging    : optional build, then docker compose up selected api/worker/scheduler service
REM   production : optional build, then docker compose up selected api/worker/scheduler service
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

set "MODE=api"
set "BUILD_FLAG=0"
set "MODE_SEEN=0"

:parse_args
if "%~1"=="" goto :after_parse_args
if /I "%~1"=="--build" goto :arg_build
if /I "%~1"=="-h" goto :arg_help
if /I "%~1"=="--help" goto :arg_help
if /I "%~1"=="api" goto :arg_mode
if /I "%~1"=="worker" goto :arg_mode
if /I "%~1"=="scheduler" goto :arg_mode
echo ERROR: unsupported target or option: %~1
call :usage
exit /b 1

:arg_build
set "BUILD_FLAG=1"
shift
goto :parse_args

:arg_help
call :usage
exit /b 0

:arg_mode
if "!MODE_SEEN!"=="1" (
  echo ERROR: only one service target can be supplied.
  call :usage
  exit /b 1
)
if /I "%~1"=="api" set "MODE=api"
if /I "%~1"=="worker" set "MODE=worker"
if /I "%~1"=="scheduler" set "MODE=scheduler"
set "MODE_SEEN=1"
shift
goto :parse_args

:after_parse_args
set "REQUESTED_MODE=!MODE!"

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

REM The shared environment may provide MODE=api for compose.  A command-line
REM worker or scheduler selection is authoritative for this launcher.
set "MODE=!REQUESTED_MODE!"

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
echo SERVICE     = !MODE! ^(@athyper/server-platform-host^)
echo MODE        = "!MODE!"
echo ==========================
echo.

REM ----------------------------
REM Local: translate Docker hostnames → 127.0.0.1, then run pnpm dev
REM ----------------------------
if /I "!ENVIRONMENT!"=="local" (
  set "PNPM_SCRIPT=dev:!MODE!"

  REM Shadow-detection: if the containerized counterpart is running, host edits
  REM will silently NOT take effect because the bundle inside the container is
  REM stale. Stop the container before starting host dev.
  if not defined COMPOSE_PROJECT_NAME set "COMPOSE_PROJECT_NAME=athyper"
  set "_SHADOW_NAME=!COMPOSE_PROJECT_NAME!-!MODE!-1"
  for /f %%R in ('docker ps --format "{{.Names}}" --filter "name=^!_SHADOW_NAME!$" 2^>nul') do (
    if "%%R"=="!_SHADOW_NAME!" (
      echo.
      echo ============================================================
      echo  WARNING: containerized !MODE! is running while ENVIRONMENT=local.
      echo           Host source edits will NOT take effect.
      echo           Stop it first:  docker stop !_SHADOW_NAME!
      echo           Or run:         stack\scripts\dev-local.bat --stop-only
      echo ============================================================
      echo.
      pause
    )
  )

  if "!BUILD_FLAG!"=="1" (
    echo Local mode: --build is ignored; tsx handles incremental reloads.
    echo.
  )

  REM Server always runs on port 4000 on the host (compose uses API_PORT=3000)
  set "PORT=4000"

  REM Translate Docker service names to 127.0.0.1.
  REM Docker Desktop publishes these ports to the host; all reachable via 127.0.0.1.
  set "DATABASE_URL=!DATABASE_URL:dbpool-apps=127.0.0.1!"
  set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:@db:=@127.0.0.1:!"
  set "MESH_DATABASE_URL=!MESH_DATABASE_URL:dbpool-apps=127.0.0.1!"
  set "MESH_DATABASE_ADMIN_URL=!MESH_DATABASE_ADMIN_URL:@db:=@127.0.0.1:!"
  set "MESH_DB_URL=!MESH_DB_URL:dbpool-apps=127.0.0.1!"
  set "REDIS_URL=!REDIS_URL:memorycache=127.0.0.1!"
  set "REDIS_BULLMQ_URL=!REDIS_BULLMQ_URL:memorycache-jobs=127.0.0.1!"
  set "REDIS_BULLMQ_URL=!REDIS_BULLMQ_URL:memorycache=127.0.0.1!"
  set "S3_ENDPOINT=!S3_ENDPOINT:objectstorage=127.0.0.1!"

  REM docrender port 3000 conflicts with Next.js dev server -- clear it.
  set "DOCRENDER_BASE_URL="
  REM docparser 9998 is unique; no-ops gracefully if render profile not running.
  set "DOCPARSER_URL=!DOCPARSER_URL:docparser=127.0.0.1!"

  REM OTel Tempo gRPC (4317); no-ops if telemetry profile not running.
  set "OTEL_EXPORTER_OTLP_ENDPOINT=!OTEL_EXPORTER_OTLP_ENDPOINT:tracing=127.0.0.1!"
  REM Alloy/logshipper HTTP OTLP not published to host by default.
  set "OTLP_ENDPOINT="

  REM searchcore (7700); no-ops if search profile not running.
  set "SEARCHCORE_URL=!SEARCHCORE_URL:searchcore=127.0.0.1!"

  REM Cronwatch ping port not published to host by default.
  set "CRONWATCH_BASE_URL="

  set "NODE_ENV=development"
  set "NODE_TLS_REJECT_UNAUTHORIZED=0"

  echo Local mode: starting backend server
  echo   MODE=!MODE! pnpm --filter @athyper/server-platform-host run !PNPM_SCRIPT!
  echo.
  pushd "%REPO_ROOT%" >nul
  pnpm --filter @athyper/server-platform-host run !PNPM_SCRIPT!
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
if exist "!OVERRIDE!" set "COMPOSE_FILES=!COMPOSE_FILES! -f "!OVERRIDE!""

if "!BUILD_FLAG!"=="1" (
  echo Running: docker compose ... build !MODE!
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
    !COMPOSE_FILES! build !MODE!
  if errorlevel 1 (
    echo ERROR: docker compose build failed.
    pause & exit /b 1
  )
  echo.
)

echo Running: docker compose ... up -d --no-deps !MODE!
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
  !COMPOSE_FILES! up -d --no-deps !MODE!

if errorlevel 1 (
  echo ERROR: docker compose up failed.
  pause & exit /b 1
)

echo.
echo !MODE! service is UP (env=!ENVIRONMENT!)
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
  !COMPOSE_FILES! ps !MODE!

goto :end

:usage
echo Usage:
echo   api-up.bat [api^|worker^|scheduler] [--build]
echo.
echo Defaults to: api
exit /b 0

:end
echo.
endlocal
