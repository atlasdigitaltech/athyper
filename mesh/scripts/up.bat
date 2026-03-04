@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Mesh - UP (profile-aware) - Windows Batch
REM Location:
REM   mesh\scripts\up.bat
REM Usage:
REM   up.bat                -> uses MESH_PROFILE=mesh (default)
REM   up.bat mesh           -> explicit profile
REM   up.bat telemetry      -> start only telemetry profile (if defined)
REM   up.bat apps           -> start apps profile (if defined)
REM   up.bat all            -> start without --profile (bring everything)
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
REM   Priority:
REM   1) CLI arg (up.bat mesh)
REM   2) MESH_PROFILE in .env
REM   3) default = mesh
REM ----------------------------
set "RUN_PROFILE=%~1"

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
  if /I "!PROFILE!"=="local"      set "TEMPLATE_FILE=%ENV_DIR%\local.env.example"
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

  echo ✅ Created: "%ENV_FILE%"
  echo.
)

REM ----------------------------
REM Read ENVIRONMENT + MESH_PROFILE from .env (optional)
REM ----------------------------
set "ENVIRONMENT="
set "MESH_PROFILE="

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

REM If CLI arg not provided, use MESH_PROFILE from env, else default mesh
if "!RUN_PROFILE!"=="" (
  if not "!MESH_PROFILE!"=="" (
    set "RUN_PROFILE=!MESH_PROFILE!"
  ) else (
    set "RUN_PROFILE=mesh"
  )
)

REM Special: allow "all" to run without --profile
set "USE_PROFILE=1"
if /I "!RUN_PROFILE!"=="all" set "USE_PROFILE=0"

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
echo COMPOSE_DIR  = "%COMPOSE_DIR%"
echo ENV_FILE     = "%ENV_FILE%"
echo ENVIRONMENT     = "!ENVIRONMENT!"
echo RUN_PROFILE  = "!RUN_PROFILE!"
echo OVERRIDE     = "!OVERRIDE!"
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
call :addfile "%COMPOSE_DIR%\db\mesh-db.yml"
call :addfile "%COMPOSE_DIR%\db\mesh-dbpool-apps.yml"
call :addfile "%COMPOSE_DIR%\db\mesh-dbpool-auth.yml"
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
REM Bring up stack (PROFILE-AWARE)
REM Matches your working command pattern:
REM   docker compose --env-file ../env/.env --profile mesh up -d
REM ----------------------------
if "!USE_PROFILE!"=="1" (
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!RUN_PROFILE!" %COMPOSE_FILES% up -d --remove-orphans
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!RUN_PROFILE!" %COMPOSE_FILES% up -d --remove-orphans
) else (
  echo Running: docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" %COMPOSE_FILES% up -d --remove-orphans
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" %COMPOSE_FILES% up -d --remove-orphans
)

if errorlevel 1 (
  echo ERROR: docker compose up failed.
  pause
  exit /b 1
)

echo ✅ Mesh is UP (profile=!RUN_PROFILE!, env=!ENVIRONMENT!)

REM Show status (same profile rules)
if "!USE_PROFILE!"=="1" (
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile "!RUN_PROFILE!" %COMPOSE_FILES% ps
) else (
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" %COMPOSE_FILES% ps
)

echo.
pause
endlocal
