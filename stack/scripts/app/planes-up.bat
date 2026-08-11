@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Plane Apps UP - Windows Batch
REM Location: stack\scripts\app\planes-up.bat
REM
REM Usage:
REM   planes-up.bat          : start Neon, Mesh, and Studio
REM   planes-up.bat all      : start Neon, Mesh, and Studio
REM   planes-up.bat mesh     : start Mesh only
REM   planes-up.bat studio   : start Studio only
REM
REM Local Windows:
REM   Starts selected app(s) on ports 3101-3103.
REM
REM For staging/production use planes-up.sh on Ubuntu so the two-file
REM bootstrap + secrets env model is preserved.
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

set "ENV_FILE=%STACK_DIR%\env\.env"
set "PATH=%APPDATA%\npm;%LOCALAPPDATA%\pnpm;%PATH%"

set "BUILD_FLAG=0"
set "PLANE_TARGET=all"
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

if exist "%ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    set "_k=%%A"
    for /f "tokens=* delims= " %%K in ("!_k!") do set "_k=%%K"
    if not "!_k!"=="" if /I not "!_k:~0,1!"=="#" (
      set "%%A=%%B"
    )
  )
) else (
  echo WARNING: .env not found: "%ENV_FILE%" -- using local defaults.
)

if "!ENVIRONMENT!"=="" set "ENVIRONMENT=local"
if /I not "!ENVIRONMENT!"=="local" (
  echo ERROR: planes-up.bat is local-only. Use planes-up.sh on staging/production.
  set "SCRIPT_EXIT=1"
  goto :end
)

call :apply_common_local_env
call :pnpm_preflight
if errorlevel 1 (
  set "SCRIPT_EXIT=1"
  goto :end
)

echo.
echo ==========================
echo ENVIRONMENT = "!ENVIRONMENT!"
echo TARGET      = "!PLANE_TARGET!"
echo SERVICES    = !SERVICES!
echo ==========================
echo.

if "!BUILD_FLAG!"=="1" (
  echo Local mode: --build is ignored; pnpm handles incremental rebuilds.
  echo.
)

echo Starting local plane app^(s^):
for %%P in (!PLANE_LIST!) do call :start_plane_window "%%P"

echo.
echo Started. Keep the selected dev window^(s^) open while using Traefik plane routes.
echo.
goto :end

:usage
echo Usage:
echo   planes-up.bat [neon^|mesh^|studio^|all] [--build]
echo.
echo Defaults to: all
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
if /I "!PLANE_TARGET!"=="studio" (
  set "PLANE_LIST=studio"
  set "SERVICES=studio-web"
  exit /b 0
)
if /I "!PLANE_TARGET!"=="all" (
  set "PLANE_LIST=neon mesh studio"
  set "SERVICES=neon-web mesh-web studio-web"
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
if "!PLATFORM_KEYCLOAK_CLIENT_ID!"=="" set "PLATFORM_KEYCLOAK_CLIENT_ID=athyper-studio"
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
if /I "!_PLANE!"=="studio" (
  if "!STUDIO_DEV_PORT!"=="" set "STUDIO_DEV_PORT=3103"
  if "!APPS_ATHYPER_STUDIO_HOST!"=="" set "APPS_ATHYPER_STUDIO_HOST=studio.athyper.local"
  set "_PLANE_PORT=!STUDIO_DEV_PORT!"
  set "_PLANE_LABEL=Studio"
  if not "!PUBLIC_STUDIO_URL!"=="" (set "_PLANE_URL=!PUBLIC_STUDIO_URL!") else (set "_PLANE_URL=https://!APPS_ATHYPER_STUDIO_HOST!")
  if "!STUDIO_KEYCLOAK_REALM!"=="" if not "!KEYCLOAK_REALM!"=="" set "STUDIO_KEYCLOAK_REALM=!KEYCLOAK_REALM!"
  if "!STUDIO_KEYCLOAK_REALM!"=="" set "STUDIO_KEYCLOAK_REALM=athyper"
  if "!STUDIO_KEYCLOAK_CLIENT_ID!"=="" set "STUDIO_KEYCLOAK_CLIENT_ID=studio-web"
  set "KEYCLOAK_REALM=!STUDIO_KEYCLOAK_REALM!"
  set "KEYCLOAK_CLIENT_ID=!STUDIO_KEYCLOAK_CLIENT_ID!"
  set "STUDIO_PUBLIC_WEB_URL=!_PLANE_URL!"
)
set "PUBLIC_BASE_URL=!_PLANE_URL!"
set "PUBLIC_WEB_URL=!_PLANE_URL!"
exit /b 0

:start_plane_window
call :set_plane_env "%~1"
echo   !_PLANE_LABEL! : !_PLANE_URL! -^> localhost:!_PLANE_PORT!
start "athyper-%~1" /D "%REPO_ROOT%" cmd /k call pnpm.cmd --filter @athyper/%~1 exec next dev --port !_PLANE_PORT!
exit /b 0

:error
set "SCRIPT_EXIT=1"

:end
echo.
endlocal & exit /b %SCRIPT_EXIT%
