@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Local Container Mode Bootstrap - Windows Batch
REM Location: stack\scripts\dev-container.bat
REM
REM Runs the 6 app services (api, worker, scheduler, neon-web,
REM mesh-web, admin-web) as PRODUCTION containers on the developer
REM machine. Used for performance testing and QA that mirrors
REM staging behaviour without leaving Windows.
REM
REM Complement to dev-local.bat (which runs apps on host in dev mode).
REM Both scripts share the same infra containers (core profile).
REM
REM Usage:
REM   dev-container.bat              : start 6 app containers (no rebuild)
REM   dev-container.bat --build      : rebuild images first, then start
REM   dev-container.bat --stop-only  : just stop the 6 app containers
REM   dev-container.bat --with-search: also start searchcore (Meilisearch)
REM   dev-container.bat --all        : also start ALL optional sidecars
REM                                    (searchcore, docparser, docrender,
REM                                    errorcollect, cronwatch, statuswatch,
REM                                    analyticsboard, secretstore, dbconsole,
REM                                    queueconsole)
REM
REM Combine flags:
REM   dev-container.bat --build --all   : rebuild + start everything (heavy)
REM
REM Uses:
REM   stack\compose\athyper.override.local-container.yml
REM     -> swaps server/Dockerfile.dev -> Dockerfile.prod for api/worker/scheduler
REM     -> forces NODE_ENV=production on all 6 apps
REM     -> preserves all Windows-specific tweaks from athyper.override.local.yml
REM
REM Env loading:
REM   Parses stack\env\.env line-by-line into the shell (mirrors up.bat's
REM   approach). --env-file alone is unreliable for compose bind-mount
REM   interpolation on Windows; injecting into shell ensures ATHYPER_CONFIG
REM   / ATHYPER_DATA / etc. are visible to `docker compose`.
REM
REM Container naming: ${COMPOSE_PROJECT_NAME}-<svc>-1 (matches dev-local.bat).
REM ============================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
pushd "%SCRIPT_DIR%\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "ENV_FILE=%STACK_DIR%\env\.env"
set "COMPOSE_DIR=%STACK_DIR%\compose"
set "LOCAL_CONTAINER_OVERRIDE=%COMPOSE_DIR%\athyper.override.local-container.yml"

REM ----------------------------
REM Parse args
REM ----------------------------
set "DO_BUILD=0"
set "STOP_ONLY=0"
set "WITH_SEARCH=0"
set "ALL_SIDECARS=0"
:parse
if "%~1"=="" goto :after_parse
if /I "%~1"=="--build"       ( set "DO_BUILD=1"     & shift & goto :parse )
if /I "%~1"=="--stop-only"   ( set "STOP_ONLY=1"    & shift & goto :parse )
if /I "%~1"=="--with-search" ( set "WITH_SEARCH=1"  & shift & goto :parse )
if /I "%~1"=="--all"         ( set "ALL_SIDECARS=1" & set "WITH_SEARCH=1" & shift & goto :parse )
if /I "%~1"=="-h"            goto :usage
if /I "%~1"=="--help"        goto :usage
echo ERROR: unsupported option: %~1
goto :usage
:after_parse

REM ----------------------------
REM Resolve COMPOSE_PROJECT_NAME (env > .env > "athyper")
REM ----------------------------
if not defined COMPOSE_PROJECT_NAME (
  if exist "%ENV_FILE%" (
    for /f "tokens=2 delims==" %%a in ('findstr "^COMPOSE_PROJECT_NAME=" "%ENV_FILE%" 2^>nul') do set "COMPOSE_PROJECT_NAME=%%a"
    set "COMPOSE_PROJECT_NAME=!COMPOSE_PROJECT_NAME:"=!"
  )
)
if not defined COMPOSE_PROJECT_NAME set "COMPOSE_PROJECT_NAME=athyper"

set "APP_CONTAINERS=!COMPOSE_PROJECT_NAME!-api-1 !COMPOSE_PROJECT_NAME!-worker-1 !COMPOSE_PROJECT_NAME!-scheduler-1 !COMPOSE_PROJECT_NAME!-neon-web-1 !COMPOSE_PROJECT_NAME!-mesh-web-1 !COMPOSE_PROJECT_NAME!-admin-web-1"

REM Extended set stopped only when --stop-only is combined with --all (or when
REM --stop-only alone is passed — we opportunistically stop these if present).
set "SIDECAR_CONTAINERS=!COMPOSE_PROJECT_NAME!-searchcore-1 !COMPOSE_PROJECT_NAME!-docparser-1 !COMPOSE_PROJECT_NAME!-docrender-1 !COMPOSE_PROJECT_NAME!-cronwatch-1 !COMPOSE_PROJECT_NAME!-errorcollect-1 !COMPOSE_PROJECT_NAME!-statuswatch-1 !COMPOSE_PROJECT_NAME!-analyticsboard-1 !COMPOSE_PROJECT_NAME!-secretstore-1 !COMPOSE_PROJECT_NAME!-dbconsole-1 !COMPOSE_PROJECT_NAME!-queueconsole-1"

echo.
echo ================================
echo  athyper local container bootstrap
echo ================================
echo  COMPOSE_PROJECT_NAME = !COMPOSE_PROJECT_NAME!
echo  DO_BUILD             = !DO_BUILD!
echo  STOP_ONLY            = !STOP_ONLY!
echo  WITH_SEARCH          = !WITH_SEARCH!
echo  ALL_SIDECARS         = !ALL_SIDECARS!
echo  OVERRIDE             = %LOCAL_CONTAINER_OVERRIDE%
echo ================================
echo.

REM ----------------------------
REM Pre-flight: Docker running + override exists
REM ----------------------------
docker version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker is not running. Start Docker Desktop and re-run.
  exit /b 1
)

if not exist "%LOCAL_CONTAINER_OVERRIDE%" (
  echo ERROR: local-container override not found: %LOCAL_CONTAINER_OVERRIDE%
  exit /b 1
)

if not exist "%ENV_FILE%" (
  echo ERROR: .env not found: %ENV_FILE%
  echo Run stack\scripts\stack-profile\up.bat core once first to bootstrap it.
  exit /b 1
)

REM ----------------------------
REM Step 1: Stop any running app containers (clean slate)
REM ----------------------------
echo [1/4] Stopping any running app containers...
set "STALE_FOUND=0"
for %%C in (!APP_CONTAINERS!) do (
  for /f %%R in ('docker ps --format "{{.Names}}" --filter "name=^%%C$" 2^>nul') do (
    if "%%R"=="%%C" (
      echo   docker stop %%C
      docker stop %%C >nul
      set "STALE_FOUND=1"
    )
  )
)

REM On --stop-only, also stop optional sidecars (searchcore, render, monitoring, ...)
REM that may have been started by --all or --with-search. Idempotent — silent if absent.
if "!STOP_ONLY!"=="1" (
  for %%C in (!SIDECAR_CONTAINERS!) do (
    for /f %%R in ('docker ps --format "{{.Names}}" --filter "name=^%%C$" 2^>nul') do (
      if "%%R"=="%%C" (
        echo   docker stop %%C
        docker stop %%C >nul
        set "STALE_FOUND=1"
      )
    )
  )
)

if "!STALE_FOUND!"=="0" echo   (none running — clean start)
echo.

if "!STOP_ONLY!"=="1" (
  REM Flip the gateway back to host upstream URLs so a follow-up dev-local.bat
  REM (or a browser hit right now) reaches the host dev server, not a dead
  REM neon-web:3000 container link.
  echo   Recreating gateway with host upstream URLs...
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" -f "%COMPOSE_DIR%\gateway\athyper-gateway.yml" -f "%COMPOSE_DIR%\athyper.override.local.yml" up -d --force-recreate gateway >nul 2>&1
  echo --stop-only: done.
  goto :end
)

REM ----------------------------
REM Step 2: Warn if host dev servers appear to be running
REM (ports 4000/3101/3102/3103 = api / neon / mesh / admin dev servers)
REM ----------------------------
set "HOST_PORTS_IN_USE=0"
for %%P in (4000 3101 3102 3103) do (
  netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul 2>&1
  if not errorlevel 1 (
    set "HOST_PORTS_IN_USE=1"
    echo WARNING: host port %%P is in use — likely a dev-local.bat window is still running.
  )
)
if "!HOST_PORTS_IN_USE!"=="1" (
  echo.
  echo Ctrl+C the athyper-api / athyper-neon / athyper-mesh / athyper-admin windows,
  echo then re-run this script. Container Traefik routing will fight host processes otherwise.
  echo.
  choice /M "Continue anyway"
  if errorlevel 2 exit /b 1
  echo.
)

REM ----------------------------
REM Step 3: Load .env into the current shell so docker compose sees every
REM variable during compose-file interpolation (including bind-mount paths
REM like ${ATHYPER_CONFIG}). --env-file alone is unreliable on Windows for
REM this — up.bat uses the same manual-parse approach for robustness.
REM ----------------------------
echo [2/4] Loading env vars from %ENV_FILE% into shell...
for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  set "K=%%A"
  set "V=%%B"
  for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
  if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
    REM Strip trailing inline comment starting with ' #'
    for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
    REM Strip surrounding quotes
    set "V=!V:"=!"
    REM Trim trailing spaces
    for /l %%N in (1,1,20) do if "!V:~-1!"==" " set "V=!V:~0,-1!"
    set "!K!=!V!"
  )
)

REM Docker bind mounts on Windows require forward slashes
if defined ATHYPER_CONFIG_ROOT set "ATHYPER_CONFIG=!ATHYPER_CONFIG_ROOT:\=/!"
if defined ATHYPER_DATA_ROOT   set "ATHYPER_DATA=!ATHYPER_DATA_ROOT:\=/!"
if defined ATHYPER_CONFIG      set "ATHYPER_CONFIG=!ATHYPER_CONFIG:\=/!"
if defined ATHYPER_DATA        set "ATHYPER_DATA=!ATHYPER_DATA:\=/!"

echo   ATHYPER_CONFIG = !ATHYPER_CONFIG!
echo   ATHYPER_DATA   = !ATHYPER_DATA!
echo   ENVIRONMENT    = !ENVIRONMENT!
echo   IAM_HOST       = !IAM_HOST!
echo.

if not defined ATHYPER_CONFIG (
  echo ERROR: ATHYPER_CONFIG could not be resolved from .env.
  echo Check that ATHYPER_CONFIG_ROOT or ATHYPER_CONFIG is defined in %ENV_FILE%.
  exit /b 1
)

REM ----------------------------
REM Step 4: Assemble compose file list (matches stack-profile\up.bat) and up
REM ----------------------------
set "COMPOSE_FILES="
if exist "%COMPOSE_DIR%\athyper.base.yml"                              set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\athyper.base.yml""
if exist "%COMPOSE_DIR%\db\athyper-db.yml"                             set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-db.yml""
if exist "%COMPOSE_DIR%\db\athyper-dbpool-apps.yml"                    set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-dbpool-apps.yml""
if exist "%COMPOSE_DIR%\db\athyper-dbpool-session.yml"                 set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\db\athyper-dbpool-session.yml""
if exist "%COMPOSE_DIR%\security\athyper-socket-proxy-gateway.yml"     set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-socket-proxy-gateway.yml""
if exist "%COMPOSE_DIR%\security\athyper-socket-proxy-logshipper.yml"  set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-socket-proxy-logshipper.yml""
if exist "%COMPOSE_DIR%\gateway\athyper-gateway.yml"                   set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\gateway\athyper-gateway.yml""
if exist "%COMPOSE_DIR%\mail\athyper-mailtrap.yml"                     set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\mail\athyper-mailtrap.yml""
if exist "%COMPOSE_DIR%\iam\athyper-iam.yml"                           set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\iam\athyper-iam.yml""
if exist "%COMPOSE_DIR%\objectstorage\athyper-objectstorage.yml"       set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\objectstorage\athyper-objectstorage.yml""
if exist "%COMPOSE_DIR%\security\athyper-virusscan.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-virusscan.yml""
if exist "%COMPOSE_DIR%\memorycache\athyper-memorycache.yml"           set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\memorycache\athyper-memorycache.yml""
if exist "%COMPOSE_DIR%\memorycache\athyper-memorycache-exporter.yml"  set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\memorycache\athyper-memorycache-exporter.yml""
if exist "%COMPOSE_DIR%\memorycache\athyper-memorycache-jobs.yml"      set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\memorycache\athyper-memorycache-jobs.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-alertmanager.yml"            set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-alertmanager.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-metrics.yml"                 set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-metrics.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-tracing.yml"                 set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-tracing.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-logging.yml"                 set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-logging.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-logshipper.yml"              set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-logshipper.yml""
if exist "%COMPOSE_DIR%\telemetry\athyper-telemetry.yml"               set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\telemetry\athyper-telemetry.yml""
if exist "%COMPOSE_DIR%\apps\athyper-apps.yml"                         set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\apps\athyper-apps.yml""
if "!WITH_SEARCH!"=="1" (
  if exist "%COMPOSE_DIR%\search\athyper-searchcore.yml"               set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\search\athyper-searchcore.yml""
)

REM --all adds every optional sidecar (~2.5GB extra RAM total)
if "!ALL_SIDECARS!"=="1" (
  if exist "%COMPOSE_DIR%\render\athyper-docparser.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\render\athyper-docparser.yml""
  if exist "%COMPOSE_DIR%\render\athyper-docrender.yml"                set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\render\athyper-docrender.yml""
  if exist "%COMPOSE_DIR%\monitoring\athyper-cronwatch.yml"            set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\monitoring\athyper-cronwatch.yml""
  if exist "%COMPOSE_DIR%\monitoring\athyper-errorcollect.yml"         set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\monitoring\athyper-errorcollect.yml""
  if exist "%COMPOSE_DIR%\monitoring\athyper-statuswatch.yml"          set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\monitoring\athyper-statuswatch.yml""
  if exist "%COMPOSE_DIR%\analytics\athyper-analyticsboard.yml"        set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\analytics\athyper-analyticsboard.yml""
  if exist "%COMPOSE_DIR%\security\athyper-secretstore.yml"            set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\security\athyper-secretstore.yml""
  if exist "%COMPOSE_DIR%\admin\athyper-dbconsole.yml"                 set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\admin\athyper-dbconsole.yml""
  if exist "%COMPOSE_DIR%\admin\athyper-queueconsole.yml"              set "COMPOSE_FILES=!COMPOSE_FILES! -f "%COMPOSE_DIR%\admin\athyper-queueconsole.yml""
)

REM Append the local-container override LAST — later -f files override earlier definitions
set "COMPOSE_FILES=!COMPOSE_FILES! -f "%LOCAL_CONTAINER_OVERRIDE%""

REM Profiles: always core+apps, optionally search, optionally all sidecars
set "EFFECTIVE_PROFILES=core,apps"
if "!WITH_SEARCH!"=="1"  set "EFFECTIVE_PROFILES=!EFFECTIVE_PROFILES!,search"
if "!ALL_SIDECARS!"=="1" set "EFFECTIVE_PROFILES=!EFFECTIVE_PROFILES!,render,monitoring,analytics,security-infisical,admin,emergency"
set "COMPOSE_PROFILES=!EFFECTIVE_PROFILES!"

if "!DO_BUILD!"=="1" (
  echo [3/4] Rebuilding 6 app images ^(--build^)... 5-10 minutes on first run.
  echo Running: docker compose ... build api worker scheduler neon-web mesh-web admin-web
  docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! build api worker scheduler neon-web mesh-web admin-web
  if errorlevel 1 (
    echo ERROR: docker compose build failed.
    exit /b 1
  )
  echo.
) else (
  echo [3/4] Skipping image build ^(pass --build to rebuild^).
  echo.
)

echo [4/4] Starting 6 app containers ^(profile=!EFFECTIVE_PROFILES!^)...
set "UP_SVCS=api worker scheduler neon-web mesh-web admin-web"
if "!WITH_SEARCH!"=="1"  set "UP_SVCS=!UP_SVCS! searchcore"
if "!ALL_SIDECARS!"=="1" set "UP_SVCS=!UP_SVCS! docparser docrender cronwatch errorcollect statuswatch analyticsboard secretstore dbconsole queueconsole"
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! up -d !UP_SVCS!
if errorlevel 1 (
  echo ERROR: docker compose up failed.
  exit /b 1
)

REM Force-recreate gateway so Traefik picks up the container upstream URLs
REM (APPS_ATHYPER_*_UPSTREAM_URL are overridden in athyper.override.local-container.yml
REM  from http://host.docker.internal:31xx to http://<container>:3000).
REM Without this, Traefik keeps routing to the host dev ports and shows the outage page.
echo Recreating gateway to pick up container upstream URLs...
docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" !COMPOSE_FILES! up -d --force-recreate gateway
if errorlevel 1 (
  echo WARNING: gateway recreate failed — traffic may still route to host.docker.internal.
)

echo.
echo ================================
echo  Local container mode is UP.
echo  Watch logs:
echo    docker compose --project-directory "%COMPOSE_DIR%" logs -f api neon-web worker
echo  Status:
echo    docker ps --filter "name=!COMPOSE_PROJECT_NAME!-"
echo  To switch back to host dev mode:
echo    dev-container.bat --stop-only
echo    dev-local.bat
echo ================================
echo.
goto :end

:usage
echo Usage:
echo   dev-container.bat [--build] [--stop-only] [--with-search] [--all]
echo.
echo Flags:
echo   --build         rebuild the 6 app images before starting
echo   --stop-only     just stop the 6 app containers, do nothing else
echo   --with-search   also start searchcore ^(Meilisearch^)
echo   --all           also start ALL optional sidecars:
echo                     searchcore, docparser, docrender,
echo                     cronwatch, errorcollect, statuswatch,
echo                     analyticsboard, secretstore, dbconsole, queueconsole
echo                   ^(implies --with-search; adds ~2.5GB RAM^)
echo.
exit /b 0

:end
endlocal
