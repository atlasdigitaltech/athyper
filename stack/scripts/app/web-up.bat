@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Web Frontend UP - Windows Batch
REM Location: stack\scripts\app\web-up.bat
REM
REM Usage:
REM   web-up.bat                 : start Neon
REM   web-up.bat mesh            : start Mesh
REM   web-up.bat admin --build   : rebuild and start Admin
REM   web-up.bat all             : start Neon, Mesh, and Admin
REM
REM Behaviour (auto-detected from ENVIRONMENT in stack\env\.env):
REM   local      : load stack\env\.env, translate Docker hostnames to 127.0.0.1,
REM                 derive app-specific vars, then run Next.js dev
REM                 (--build is ignored in local mode; pnpm handles incremental rebuilds)
REM   staging    : [--build: docker compose build selected services]
REM                 docker compose up -d --no-deps selected services
REM   production : [--build: docker compose build selected services]
REM                 docker compose up -d --no-deps selected services
REM
REM Single source of truth: stack\env\.env is the only env file needed.
REM apps\*.env.local files are NOT required -- this script injects vars directly.
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

set "BUILD_FLAG=0"
set "PLANE_TARGET=neon"
set "PLANE_TARGET_SEEN=0"

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

if "!ENVIRONMENT!"=="" set "ENVIRONMENT=local"

if not "!ATHYPER_CONFIG_ROOT!"=="" goto :app_skip_cr
set "ATHYPER_CONFIG_ROOT=%STACK_DIR%\config"
:app_skip_cr
if not "!ATHYPER_DATA_ROOT!"=="" goto :app_skip_dr
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
  call :apply_common_local_env
  call :pnpm_preflight
  if errorlevel 1 (
    set "SCRIPT_EXIT=1"
    goto :end
  )
  REM Shadow-detection: stale <plane>-web container shadows host Next.js dev.
  if not defined COMPOSE_PROJECT_NAME set "COMPOSE_PROJECT_NAME=athyper"
  for %%P in (!PLANE_LIST!) do call :shadow_check "%%P"
  echo Local mode: starting Next.js dev server^(s^)
  if /I "!PLANE_TARGET!"=="all" (
    for %%P in (!PLANE_LIST!) do call :start_plane_window "%%P"
    echo.
    echo Started. Keep the selected dev windows open while using Traefik plane routes.
    goto :end
  )

  call :start_plane_foreground "!PLANE_TARGET!"
  set "SCRIPT_EXIT=!ERRORLEVEL!"
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
)

echo Running: docker compose ... up -d --no-deps !SERVICES!
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
  !COMPOSE_FILES! up -d --no-deps !SERVICES!

if errorlevel 1 (
  echo ERROR: docker compose up failed.
  set "SCRIPT_EXIT=1"
  goto :end
)

echo.
echo Web service^(s^) are UP ^(env=!ENVIRONMENT!^)
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" ^
  !COMPOSE_FILES! ps !SERVICES!

goto :end

:usage
echo Usage:
echo   web-up.bat [neon^|mesh^|admin^|all] [--build]
echo.
echo Defaults to: neon
exit /b 0

:resolve_targets
if /I "!PLANE_TARGET!"=="neon" (
  set "PLANE_LIST=neon"
  set "SERVICES=neon-web"
  exit /b 0
)
if /I "!PLANE_TARGET!"=="mesh" (
  set "PLANE_LIST=mesh"
  set "SERVICES=mesh-web"
  exit /b 0
)
if /I "!PLANE_TARGET!"=="admin" (
  set "PLANE_LIST=admin"
  set "SERVICES=admin-web"
  exit /b 0
)
if /I "!PLANE_TARGET!"=="all" (
  set "PLANE_LIST=neon mesh admin"
  set "SERVICES=neon-web mesh-web admin-web"
  exit /b 0
)
echo ERROR: unsupported target "!PLANE_TARGET!".
call :usage
exit /b 1

:apply_common_local_env
if "!IAM_HOST!"=="" set "IAM_HOST=iam.athyper.local"
set "REDIS_URL=!REDIS_URL:memorycache=127.0.0.1!"
set "REDIS_SOCKET_TIMEOUT_MS=0"
set "RUNTIME_API_URL=http://localhost:4000"
set "KEYCLOAK_BASE_URL=https://!IAM_HOST!"
if "!PLATFORM_KEYCLOAK_REALM!"=="" set "PLATFORM_KEYCLOAK_REALM=platform-control"
if "!PLATFORM_KEYCLOAK_CLIENT_ID!"=="" set "PLATFORM_KEYCLOAK_CLIENT_ID=athyper-admin"
set "ALLOW_DIRECT_ACCESS=true"
if "!SENTRY_DSN!"=="" set "SENTRY_DSN=!GLITCHTIP_DSN!"
set "NEXT_PUBLIC_ENVIRONMENT=!ENVIRONMENT!"
set "NEXT_PUBLIC_SERVICE_VERSION=!SERVICE_VERSION!"
if "!NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE!"=="" set "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=!SENTRY_TRACES_SAMPLE_RATE!"
if "!NEXT_PUBLIC_GITHUB_LOGIN_ENABLED!"=="" set "NEXT_PUBLIC_GITHUB_LOGIN_ENABLED=false"
if "!NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED!"=="" set "NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED=false"
set "NODE_ENV=development"
set "NODE_TLS_REJECT_UNAUTHORIZED=0"
exit /b 0

:pnpm_preflight
where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERROR: pnpm.cmd was not found. Install pnpm or add it to PATH.
  exit /b 1
)
exit /b 0

:shadow_check
set "_SHADOW_NAME=!COMPOSE_PROJECT_NAME!-%~1-web-1"
for /f %%R in ('docker ps --format "{{.Names}}" --filter "name=^!_SHADOW_NAME!$" 2^>nul') do (
  if "%%R"=="!_SHADOW_NAME!" (
    echo.
    echo ============================================================
    echo  WARNING: containerized %~1-web is running while ENVIRONMENT=local.
    echo           Host source edits will NOT take effect.
    echo           Stop it first:  docker stop !_SHADOW_NAME!
    echo           Or run:         stack\scripts\dev-local.bat --stop-only
    echo ============================================================
    echo.
    pause
  )
)
exit /b 0

:set_plane_env
set "_PLANE=%~1"
if /I "!_PLANE!"=="neon" (
  if "!NEON_DEV_PORT!"=="" set "NEON_DEV_PORT=3101"
  if "!APPS_ATHYPER_NEON_HOST!"=="" set "APPS_ATHYPER_NEON_HOST=neon.athyper.local"
  set "_PLANE_PORT=!NEON_DEV_PORT!"
  set "_PLANE_LABEL=Neon"
  if not "!PUBLIC_NEON_URL!"=="" (set "_PLANE_URL=!PUBLIC_NEON_URL!") else (set "_PLANE_URL=https://!APPS_ATHYPER_NEON_HOST!")
  if "!NEON_KEYCLOAK_REALM!"=="" if not "!KEYCLOAK_REALM!"=="" set "NEON_KEYCLOAK_REALM=!KEYCLOAK_REALM!"
  if "!NEON_KEYCLOAK_REALM!"=="" set "NEON_KEYCLOAK_REALM=athyper"
  if "!NEON_KEYCLOAK_CLIENT_ID!"=="" set "NEON_KEYCLOAK_CLIENT_ID=neon-web"
  set "KEYCLOAK_REALM=!NEON_KEYCLOAK_REALM!"
  set "KEYCLOAK_CLIENT_ID=!NEON_KEYCLOAK_CLIENT_ID!"
  set "NEON_PUBLIC_WEB_URL=!_PLANE_URL!"
)
if /I "!_PLANE!"=="mesh" (
  if "!MESH_DEV_PORT!"=="" set "MESH_DEV_PORT=3102"
  if "!APPS_ATHYPER_MESH_HOST!"=="" set "APPS_ATHYPER_MESH_HOST=mesh.athyper.local"
  set "_PLANE_PORT=!MESH_DEV_PORT!"
  set "_PLANE_LABEL=Mesh"
  if not "!PUBLIC_MESH_URL!"=="" (set "_PLANE_URL=!PUBLIC_MESH_URL!") else (set "_PLANE_URL=https://!APPS_ATHYPER_MESH_HOST!")
  if "!MESH_KEYCLOAK_REALM!"=="" if not "!KEYCLOAK_REALM!"=="" set "MESH_KEYCLOAK_REALM=!KEYCLOAK_REALM!"
  if "!MESH_KEYCLOAK_REALM!"=="" set "MESH_KEYCLOAK_REALM=athyper"
  if "!MESH_KEYCLOAK_CLIENT_ID!"=="" set "MESH_KEYCLOAK_CLIENT_ID=mesh-web"
  set "KEYCLOAK_REALM=!MESH_KEYCLOAK_REALM!"
  set "KEYCLOAK_CLIENT_ID=!MESH_KEYCLOAK_CLIENT_ID!"
  set "MESH_PUBLIC_WEB_URL=!_PLANE_URL!"
)
if /I "!_PLANE!"=="admin" (
  if "!ADMIN_DEV_PORT!"=="" set "ADMIN_DEV_PORT=3103"
  if "!APPS_ATHYPER_ADMIN_HOST!"=="" set "APPS_ATHYPER_ADMIN_HOST=admin.athyper.local"
  set "_PLANE_PORT=!ADMIN_DEV_PORT!"
  set "_PLANE_LABEL=Admin"
  if not "!PUBLIC_ADMIN_URL!"=="" (set "_PLANE_URL=!PUBLIC_ADMIN_URL!") else (set "_PLANE_URL=https://!APPS_ATHYPER_ADMIN_HOST!")
  if "!ADMIN_KEYCLOAK_REALM!"=="" if not "!KEYCLOAK_REALM!"=="" set "ADMIN_KEYCLOAK_REALM=!KEYCLOAK_REALM!"
  if "!ADMIN_KEYCLOAK_REALM!"=="" set "ADMIN_KEYCLOAK_REALM=athyper"
  if "!ADMIN_KEYCLOAK_CLIENT_ID!"=="" set "ADMIN_KEYCLOAK_CLIENT_ID=admin-web"
  set "KEYCLOAK_REALM=!ADMIN_KEYCLOAK_REALM!"
  set "KEYCLOAK_CLIENT_ID=!ADMIN_KEYCLOAK_CLIENT_ID!"
  set "ADMIN_PUBLIC_WEB_URL=!_PLANE_URL!"
)
set "PUBLIC_BASE_URL=!_PLANE_URL!"
set "PUBLIC_WEB_URL=!_PLANE_URL!"
exit /b 0

:start_plane_window
call :set_plane_env "%~1"
echo   !_PLANE_LABEL! : !_PLANE_URL! -^> localhost:!_PLANE_PORT!
start "athyper-%~1" /D "%REPO_ROOT%" cmd /k call pnpm.cmd --filter @athyper/%~1 exec next dev --port !_PLANE_PORT!
exit /b 0

:start_plane_foreground
call :set_plane_env "%~1"
echo   !_PLANE_LABEL! : !_PLANE_URL! -^> localhost:!_PLANE_PORT!
echo   pnpm.cmd --filter @athyper/%~1 exec next dev --port !_PLANE_PORT!
echo.
pushd "%REPO_ROOT%" >nul
call pnpm.cmd --filter @athyper/%~1 exec next dev --port !_PLANE_PORT!
set "_PNPM_EXIT=!ERRORLEVEL!"
popd >nul
exit /b !_PNPM_EXIT!

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
