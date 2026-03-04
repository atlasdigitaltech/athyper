@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Mesh - DOWN (profile-aware) - Windows Batch
REM Location:
REM   mesh\scripts\down.bat
REM Usage:
REM   down.bat              -> uses MESH_PROFILE from .env or default=mesh
REM   down.bat mesh         -> stop only mesh profile
REM   down.bat telemetry    -> stop only telemetry profile (if defined)
REM   down.bat apps         -> stop only apps profile (if defined)
REM   down.bat all          -> bring down everything (no --profile)
REM   down.bat clean        -> bring down everything + remove volumes
REM ============================================================

REM ----------------------------
REM Resolve base directories (robust)
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
REM Determine docker compose profile to run
REM ----------------------------
set "RUN_PROFILE=%~1"

REM ----------------------------
REM Read ENVIRONMENT + MESH_PROFILE from .env (optional)
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
      if /I "!K!"=="ENVIRONMENT"     set "ENVIRONMENT=!V!"
      if /I "!K!"=="MESH_PROFILE" set "MESH_PROFILE=!V!"
    )
  )
) else (
  echo WARNING: .env not found: "%ENV_FILE%"
  echo Will attempt to run compose down without env-file.
)

REM If CLI arg not provided, use MESH_PROFILE from env, else default mesh
if "!RUN_PROFILE!"=="" (
  if not "!MESH_PROFILE!"=="" (
    set "RUN_PROFILE=!MESH_PROFILE!"
  ) else (
    set "RUN_PROFILE=mesh"
  )
)

REM Special modes
set "USE_PROFILE=1"
set "REMOVE_VOLUMES=0"

if /I "!RUN_PROFILE!"=="all"   set "USE_PROFILE=0"
if /I "!RUN_PROFILE!"=="clean" (
  set "USE_PROFILE=0"
  set "REMOVE_VOLUMES=1"
)

REM ----------------------------
REM Pick override compose based on ENVIRONMENT (or default)
REM ----------------------------
set "OVERRIDE="
if /I "!ENVIRONMENT!"=="local"      set "OVERRIDE=%COMPOSE_DIR%\mesh.override.local.yml"
if /I "!ENVIRONMENT!"=="staging"    set "OVERRIDE=%COMPOSE_DIR%\mesh.override.staging.yml"
if /I "!ENVIRONMENT!"=="production" set "OVERRIDE=%COMPOSE_DIR%\mesh.override.production.yml"
if "!OVERRIDE!"=="" set "OVERRIDE=%COMPOSE_DIR%\mesh.override.yml"

if not exist "!OVERRIDE!" (
  if exist "%COMPOSE_DIR%\mesh.dev.yml" (
    set "OVERRIDE=%COMPOSE_DIR%\mesh.dev.yml"
  ) else (
    set "OVERRIDE=%COMPOSE_DIR%\mesh.prod.yml"
  )
)

echo.
echo ==========================
echo COMPOSE_DIR     = "%COMPOSE_DIR%"
echo ENV_FILE        = "%ENV_FILE%"
echo ENVIRONMENT     = "!ENVIRONMENT!"
echo RUN_PROFILE     = "!RUN_PROFILE!"
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
REM Compose files list (skip missing files)
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
) else (
  echo WARNING: compose file missing, skipping: %~1
)
exit /b 0

:after_addfile

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
    echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!RUN_PROFILE!" %COMPOSE_FILES% !DOWN_ARGS!
    docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!RUN_PROFILE!" %COMPOSE_FILES% !DOWN_ARGS!
  ) else (
    echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" %COMPOSE_FILES% !DOWN_ARGS!
    docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" %COMPOSE_FILES% !DOWN_ARGS!
  )
) else (
  REM Fallback if env file missing
  if "!USE_PROFILE!"=="1" (
    echo Running: docker compose --project-directory "%COMPOSE_DIR%" --profile "!RUN_PROFILE!" %COMPOSE_FILES% !DOWN_ARGS!
    docker compose --project-directory "%COMPOSE_DIR%" --profile "!RUN_PROFILE!" %COMPOSE_FILES% !DOWN_ARGS!
  ) else (
    echo Running: docker compose --project-directory "%COMPOSE_DIR%" %COMPOSE_FILES% !DOWN_ARGS!
    docker compose --project-directory "%COMPOSE_DIR%" %COMPOSE_FILES% !DOWN_ARGS!
  )
)

if errorlevel 1 (
  echo ERROR: docker compose down failed.
  pause
  exit /b 1
)

echo ✅ Mesh is DOWN (profile=!RUN_PROFILE!, env=!ENVIRONMENT!)

echo.
pause
endlocal
