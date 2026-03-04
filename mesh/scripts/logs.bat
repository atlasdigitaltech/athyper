@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Mesh - LOGS (profile-aware) - Windows Batch
REM Location:
REM   mesh\scripts\logs.bat
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

pushd "%SCRIPT_DIR%\.." >nul
set "MESH_DIR=%CD%"
popd >nul

set "COMPOSE_DIR=%MESH_DIR%\compose"
set "ENV_DIR=%MESH_DIR%\env"
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
REM Read ENVIRONMENT + MESH_PROFILE from .env
REM ----------------------------
set "ENVIRONMENT="
set "MESH_PROFILE="

if exist "%ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    set "K=%%A"
    set "V=%%B"
    for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
    if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
      set "V=!V:"=!"
      for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
      for /f "tokens=* delims= " %%V in ("!V!") do set "V=%%V"
      if /I "!K!"=="ENVIRONMENT"  set "ENVIRONMENT=!V!"
      if /I "!K!"=="MESH_PROFILE" set "MESH_PROFILE=!V!"
    )
  )
) else (
  echo WARNING: .env not found: "%ENV_FILE%"
)

REM Default profile
if "!MESH_PROFILE!"=="" set "MESH_PROFILE=mesh"

REM ----------------------------
REM Pick override compose based on ENVIRONMENT
REM ----------------------------
set "OVERRIDE="
if /I "!ENVIRONMENT!"=="localdev" set "OVERRIDE=%COMPOSE_DIR%\mesh.override.localdev.yml"
if /I "!ENVIRONMENT!"=="staging"  set "OVERRIDE=%COMPOSE_DIR%\mesh.override.staging.yml"
if /I "!ENVIRONMENT!"=="prod"     set "OVERRIDE=%COMPOSE_DIR%\mesh.override.yml"
if "!OVERRIDE!"=="" set "OVERRIDE=%COMPOSE_DIR%\mesh.override.yml"

if not exist "!OVERRIDE!" (
  if exist "%COMPOSE_DIR%\mesh.dev.yml" (
    set "OVERRIDE=%COMPOSE_DIR%\mesh.dev.yml"
  ) else (
    set "OVERRIDE=%COMPOSE_DIR%\mesh.prod.yml"
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
REM ----------------------------
set "COMPOSE_FILES="

call :addfile "%COMPOSE_DIR%\mesh.base.yml"
call :addfile "%COMPOSE_DIR%\gateway\mesh-gateway.yml"
call :addfile "%COMPOSE_DIR%\iam\mesh-iam.yml"
call :addfile "%COMPOSE_DIR%\objectstorage\mesh-objectstorage.yml"
call :addfile "%COMPOSE_DIR%\memorycache\mesh-memorycache.yml"
call :addfile "%COMPOSE_DIR%\memorycache\mesh-memorycache-exporter.yml"
call :addfile "%COMPOSE_DIR%\telemetry\mesh-metrics.yml"
call :addfile "%COMPOSE_DIR%\telemetry\mesh-tracing.yml"
call :addfile "%COMPOSE_DIR%\telemetry\mesh-logging.yml"
call :addfile "%COMPOSE_DIR%\telemetry\mesh-logshipper.yml"
call :addfile "%COMPOSE_DIR%\telemetry\mesh-telemetry.yml"
call :addfile "%COMPOSE_DIR%\apps\mesh-athyper.yml"
call :addfile "!OVERRIDE!"

goto :after_addfile

:addfile
if exist "%~1" (
  set "COMPOSE_FILES=!COMPOSE_FILES! -f "%~1""
)
exit /b 0

:after_addfile

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
echo MESH_PROFILE = "!MESH_PROFILE!"
echo SERVICE      = "!SERVICE!"
echo FOLLOW       = "!FOLLOW!"
echo TAIL         = "!TAIL!"
echo ==========================
echo.

if exist "%ENV_FILE%" (
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!MESH_PROFILE!" %COMPOSE_FILES% !LOGS_ARGS!
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!MESH_PROFILE!" %COMPOSE_FILES% !LOGS_ARGS!
) else (
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" --profile "!MESH_PROFILE!" %COMPOSE_FILES% !LOGS_ARGS!
  docker compose --project-directory "%COMPOSE_DIR%" --profile "!MESH_PROFILE!" %COMPOSE_FILES% !LOGS_ARGS!
)

endlocal
