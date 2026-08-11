@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Web Frontend RESTART - Windows Batch
REM Location: stack\scripts\app\web-restart.bat
REM
REM Usage:
REM   web-restart.bat             : restart Neon
REM   web-restart.bat mesh        : restart Mesh
REM   web-restart.bat admin       : restart Admin
REM   web-restart.bat all --build : rebuild and recreate all plane services
REM   web-restart.bat all         : restart Neon, Mesh, and Admin
REM
REM Behaviour (auto-detected from ENVIRONMENT in .env):
REM   local      : prints target-aware guidance
REM   staging    : restart selected services; with --build, build then recreate
REM   production : restart selected services; with --build, build then recreate
REM ============================================================
REM
REM LOCAL WINDOWS DEVELOPMENT ONLY.
REM For staging or production deployments use the Linux .sh equivalents on Ubuntu.
REM The .bat scripts do not implement the two-file env model (bootstrap + secrets)
REM required for staging/production and will silently drop secrets-file variables.
REM ============================================================

set "SCRIPT_EXIT=0"

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
set "PATH=%APPDATA%\npm;%LOCALAPPDATA%\pnpm;%PATH%"

set "PLANE_TARGET=neon"
set "PLANE_TARGET_SEEN=0"
set "BUILD_FLAG=0"

:parse_args
if "%~1"=="" goto :after_parse_args
if /I "%~1"=="--build" goto :arg_build
if /I "%~1"=="-h" goto :arg_help
if /I "%~1"=="--help" goto :arg_help
if "!PLANE_TARGET_SEEN!"=="1" goto :arg_duplicate
set "PLANE_TARGET=%~1"
set "PLANE_TARGET_SEEN=1"
shift
goto :parse_args

:arg_build
set "BUILD_FLAG=1"
shift
goto :parse_args

:arg_help
call :usage
exit /b 0

:arg_duplicate
echo ERROR: only one target can be supplied.
call :usage
exit /b 1

:after_parse_args

call :resolve_targets
if errorlevel 1 goto :error

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
      if /I "!K!"=="ENVIRONMENT" set "ENVIRONMENT=!V!"
      if /I "!K!"=="ATHYPER_CONFIG_ROOT" if "!_CR_FROM_ENV!"=="" set "_CR_FROM_ENV=!V!"
      if /I "!K!"=="ATHYPER_DATA_ROOT" if "!_DR_FROM_ENV!"=="" set "_DR_FROM_ENV=!V!"
    )
  )
) else (
  echo WARNING: .env not found: "%ENV_FILE%" -- defaulting to local mode.
)

if not "!ATHYPER_CONFIG_ROOT!"=="" goto :app_skip_cr
if not "!_CR_FROM_ENV!"=="" (set "ATHYPER_CONFIG_ROOT=!_CR_FROM_ENV!" & goto :app_skip_cr)
set "ATHYPER_CONFIG_ROOT=%STACK_DIR%\config"
:app_skip_cr
if not "!ATHYPER_DATA_ROOT!"=="" goto :app_skip_dr
if not "!_DR_FROM_ENV!"=="" (set "ATHYPER_DATA_ROOT=!_DR_FROM_ENV!" & goto :app_skip_dr)
set "ATHYPER_DATA_ROOT=%STACK_DIR%\data"
:app_skip_dr

set "_TMP=!ATHYPER_CONFIG_ROOT:\=/!" & set "ATHYPER_CONFIG=!_TMP!"
set "_TMP=!ATHYPER_DATA_ROOT:\=/!" & set "ATHYPER_DATA=!_TMP!"

echo.
echo ==========================
echo ENVIRONMENT = "!ENVIRONMENT!"
echo TARGET      = "!PLANE_TARGET!"
echo SERVICES    = !SERVICES!
echo ==========================
echo.

if /I "!ENVIRONMENT!"=="local" (
  if "!BUILD_FLAG!"=="1" (
    echo Local mode: --build is ignored; Next.js handles incremental rebuilds.
  )
  echo Local mode: Next.js HMR handles hot reloads automatically.
  echo For a hard restart: Ctrl+C in the target dev terminal, then run web-up.bat !PLANE_TARGET!.
  goto :end
)

docker version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker is not running. Start Docker Desktop and re-run.
  set "SCRIPT_EXIT=1"
  goto :end
)

call :resolve_compose_override
call :build_compose_files

if "!BUILD_FLAG!"=="1" (
  echo Running: docker compose ... build !SERVICES!
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
    !COMPOSE_FILES! build !SERVICES!
  if errorlevel 1 (
    echo ERROR: docker compose build failed.
    set "SCRIPT_EXIT=1"
    goto :end
  )
  echo.

  echo Running: docker compose ... up -d --no-deps --force-recreate !SERVICES!
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
    !COMPOSE_FILES! up -d --no-deps --force-recreate !SERVICES!
) else (
  echo Running: docker compose ... restart !SERVICES!
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
    !COMPOSE_FILES! restart !SERVICES!
)

if errorlevel 1 (
  echo ERROR: docker compose operation failed.
  set "SCRIPT_EXIT=1"
  goto :end
)

echo.
echo Web service^(s^) restarted ^(env=!ENVIRONMENT!^)
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
  !COMPOSE_FILES! ps !SERVICES!

goto :end

:usage
echo Usage:
echo   web-restart.bat [neon^|mesh^|studio^|all] [--build]
echo.
echo Defaults to: neon
exit /b 0

:resolve_targets
if /I "!PLANE_TARGET!"=="neon" (
  set "SERVICES=neon-web"
  exit /b 0
)
if /I "!PLANE_TARGET!"=="mesh" (
  set "SERVICES=mesh-web"
  exit /b 0
)
if /I "!PLANE_TARGET!"=="studio" (
  set "SERVICES=studio-web"
  exit /b 0
)
if /I "!PLANE_TARGET!"=="all" (
  set "SERVICES=neon-web mesh-web studio-web"
  exit /b 0
)
echo ERROR: unsupported target "!PLANE_TARGET!".
call :usage
exit /b 1

:resolve_compose_override
set "OVERRIDE="
if /I "!ENVIRONMENT!"=="staging" set "OVERRIDE=%COMPOSE_DIR%\athyper.override.staging.yml"
if /I "!ENVIRONMENT!"=="production" set "OVERRIDE=%COMPOSE_DIR%\athyper.override.production.yml"
if "!OVERRIDE!"=="" set "OVERRIDE=%COMPOSE_DIR%\athyper.override.yml"
if not exist "!OVERRIDE!" (
  if exist "%COMPOSE_DIR%\athyper.dev.yml" (set "OVERRIDE=%COMPOSE_DIR%\athyper.dev.yml") else (set "OVERRIDE=%COMPOSE_DIR%\athyper.prod.yml")
)
exit /b 0

:build_compose_files
set "COMPOSE_FILES="
call :add_compose_file "%COMPOSE_DIR%\athyper.base.yml"
call :add_compose_file "%COMPOSE_DIR%\db\athyper-db.yml"
call :add_compose_file "%COMPOSE_DIR%\db\athyper-dbpool-apps.yml"
call :add_compose_file "%COMPOSE_DIR%\db\athyper-dbpool-session.yml"
call :add_compose_file "%COMPOSE_DIR%\security\athyper-socket-proxy-gateway.yml"
call :add_compose_file "%COMPOSE_DIR%\security\athyper-socket-proxy-logshipper.yml"
call :add_compose_file "%COMPOSE_DIR%\gateway\athyper-gateway.yml"
call :add_compose_file "%COMPOSE_DIR%\mail\athyper-mailtrap.yml"
call :add_compose_file "%COMPOSE_DIR%\iam\athyper-iam.yml"
call :add_compose_file "%COMPOSE_DIR%\objectstorage\athyper-objectstorage.yml"
call :add_compose_file "%COMPOSE_DIR%\security\athyper-virusscan.yml"
call :add_compose_file "%COMPOSE_DIR%\memorycache\athyper-memorycache.yml"
call :add_compose_file "%COMPOSE_DIR%\memorycache\athyper-memorycache-exporter.yml"
call :add_compose_file "%COMPOSE_DIR%\telemetry\athyper-alertmanager.yml"
call :add_compose_file "%COMPOSE_DIR%\telemetry\athyper-metrics.yml"
call :add_compose_file "%COMPOSE_DIR%\telemetry\athyper-tracing.yml"
call :add_compose_file "%COMPOSE_DIR%\telemetry\athyper-logging.yml"
call :add_compose_file "%COMPOSE_DIR%\telemetry\athyper-logshipper.yml"
call :add_compose_file "%COMPOSE_DIR%\telemetry\athyper-telemetry.yml"
call :add_compose_file "%COMPOSE_DIR%\apps\athyper-apps.yml"
call :add_compose_file "%COMPOSE_DIR%\render\athyper-docrender.yml"
call :add_compose_file "%COMPOSE_DIR%\render\athyper-docparser.yml"
call :add_compose_file "%COMPOSE_DIR%\search\athyper-searchcore.yml"
call :add_compose_file "%COMPOSE_DIR%\monitoring\athyper-errorcollect.yml"
call :add_compose_file "%COMPOSE_DIR%\monitoring\athyper-cronwatch.yml"
call :add_compose_file "%COMPOSE_DIR%\monitoring\athyper-statuswatch.yml"
call :add_compose_file "%COMPOSE_DIR%\analytics\athyper-analyticsboard.yml"
call :add_compose_file "%COMPOSE_DIR%\security\athyper-secretstore.yml"
call :add_compose_file "%COMPOSE_DIR%\admin\athyper-queueconsole.yml"
call :add_compose_file "%COMPOSE_DIR%\admin\athyper-dbconsole.yml"
call :add_compose_file "%COMPOSE_DIR%\memorycache\athyper-memorycache-jobs.yml"
call :add_compose_file "!OVERRIDE!"
exit /b 0

:add_compose_file
if exist "%~1" set "COMPOSE_FILES=!COMPOSE_FILES! -f "%~1""
exit /b 0

:error
set "SCRIPT_EXIT=1"

:end
echo.
endlocal & exit /b %SCRIPT_EXIT%
