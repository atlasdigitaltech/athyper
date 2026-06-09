@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - CONTAINER RESTART - Windows Batch
REM Location: stack\scripts\stack-service\restart.bat
REM Usage:
REM   restart.bat iam                  -> restart by alias
REM   restart.bat db redis             -> restart multiple at once
REM   restart.bat --time 30 gateway    -> graceful stop timeout (seconds)
REM
REM Aliases (case-insensitive, also accepts raw container names):
REM   iam            -> Keycloak          (athyper-iam-1)
REM   db             -> Postgres          (athyper-db-1)
REM   dbpool-session -> PgBouncer session (athyper-dbpool-session-1)
REM   dbpool-apps    -> PgBouncer apps    (athyper-dbpool-apps-1)
REM   gateway|traefik     -> Traefik ingress   (athyper-gateway-1)
REM   redis|cache|memorycache -> Redis cache   (athyper-memorycache-1)
REM   minio|storage  -> MinIO object store (athyper-objectstorage-1)
REM   mail|mailtrap  -> mailtrap           (athyper-mailtrap-1)
REM   web|frontend|neon -> Neon frontend   (%COMPOSE_PROJECT_NAME%-neon-web-1)
REM   mesh           -> Mesh frontend       (%COMPOSE_PROJECT_NAME%-mesh-web-1)
REM   admin          -> Admin frontend      (%COMPOSE_PROJECT_NAME%-admin-web-1)
REM   api|backend    -> Backend API         (%COMPOSE_PROJECT_NAME%-api-1)
REM   search|searchcore -> searchcore      (athyper-searchcore-1)
REM ============================================================

REM Derive STACK_DIR (script is at stack\scripts\stack-service\)
set "SCRIPT_DIR_SVC=%~dp0"
if "%SCRIPT_DIR_SVC:~-1%"=="\" set "SCRIPT_DIR_SVC=%SCRIPT_DIR_SVC:~0,-1%"
pushd "%SCRIPT_DIR_SVC%\..\.." >nul
set "STACK_DIR_SVC=%CD%"
popd >nul

REM Derive container name prefix from COMPOSE_PROJECT_NAME in stack\env\.env
if not defined COMPOSE_PROJECT_NAME (
    if exist "%STACK_DIR_SVC%\env\.env" (
        for /f "tokens=2 delims==" %%a in ('findstr "^COMPOSE_PROJECT_NAME=" "%STACK_DIR_SVC%\env\.env" 2^>nul') do set "COMPOSE_PROJECT_NAME=%%a"
        set "COMPOSE_PROJECT_NAME=!COMPOSE_PROJECT_NAME:"=!"
    )
)
if not defined COMPOSE_PROJECT_NAME set "COMPOSE_PROJECT_NAME=athyper"

REM Container name defaults
if not defined DOCKER_CONTAINER_IAM           set "DOCKER_CONTAINER_IAM=!COMPOSE_PROJECT_NAME!-iam-1"
if not defined DOCKER_CONTAINER_DB            set "DOCKER_CONTAINER_DB=!COMPOSE_PROJECT_NAME!-db-1"
if not defined DOCKER_CONTAINER_DBPOOL_SESSION set "DOCKER_CONTAINER_DBPOOL_SESSION=!COMPOSE_PROJECT_NAME!-dbpool-session-1"
if not defined DOCKER_CONTAINER_DBPOOL_APPS   set "DOCKER_CONTAINER_DBPOOL_APPS=!COMPOSE_PROJECT_NAME!-dbpool-apps-1"
if not defined DOCKER_CONTAINER_GATEWAY       set "DOCKER_CONTAINER_GATEWAY=!COMPOSE_PROJECT_NAME!-gateway-1"
if not defined DOCKER_CONTAINER_REDIS         set "DOCKER_CONTAINER_REDIS=!COMPOSE_PROJECT_NAME!-memorycache-1"
if not defined DOCKER_CONTAINER_MINIO         set "DOCKER_CONTAINER_MINIO=!COMPOSE_PROJECT_NAME!-objectstorage-1"
if not defined DOCKER_CONTAINER_MAIL          set "DOCKER_CONTAINER_MAIL=!COMPOSE_PROJECT_NAME!-mailtrap-1"
if not defined DOCKER_CONTAINER_WEB           set "DOCKER_CONTAINER_WEB=!COMPOSE_PROJECT_NAME!-neon-web-1"
if not defined DOCKER_CONTAINER_MESH_WEB      set "DOCKER_CONTAINER_MESH_WEB=!COMPOSE_PROJECT_NAME!-mesh-web-1"
if not defined DOCKER_CONTAINER_ADMIN_WEB     set "DOCKER_CONTAINER_ADMIN_WEB=!COMPOSE_PROJECT_NAME!-admin-web-1"
if not defined DOCKER_CONTAINER_API           set "DOCKER_CONTAINER_API=!COMPOSE_PROJECT_NAME!-api-1"
if not defined DOCKER_CONTAINER_SEARCH        set "DOCKER_CONTAINER_SEARCH=!COMPOSE_PROJECT_NAME!-searchcore-1"

if "%~1"=="" (
  echo Usage: restart.bat [--time N] ^<alias^|name^> [alias^|name ...]
  echo Aliases: iam  db  dbpool-session  dbpool-apps  gateway  redis  minio  mail  web  neon  mesh  admin  api  search
  pause & exit /b 1
)

docker version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker is not running. Start Docker Desktop and re-run.
  pause & exit /b 1
)

REM Pre-scan: --time must appear before container names
set "TIME_ARG="
if /I "%~1"=="--time" ( set "TIME_ARG=--time %~2" & shift & shift )
if /I "%~1"=="-t"     ( set "TIME_ARG=--time %~2" & shift & shift )

if "%~1"=="" (
  echo ERROR: No container alias or name provided after --time.
  pause & exit /b 1
)

:loop
if "%~1"=="" goto :done

set "ARG=%~1"
set "CNAME="
call :resolve "!ARG!" CNAME
echo Restarting: !CNAME!
docker restart !TIME_ARG! "!CNAME!"
if errorlevel 1 echo WARNING: docker restart returned non-zero for !CNAME!

shift
goto :loop

:done
echo.
echo Done.
endlocal
goto :eof

:resolve
set "A=%~1"
set "RESULT="
if /I "!A!"=="iam"          set "RESULT=!DOCKER_CONTAINER_IAM!"
if /I "!A!"=="db"           set "RESULT=!DOCKER_CONTAINER_DB!"
if /I "!A!"=="dbpool-session"  set "RESULT=!DOCKER_CONTAINER_DBPOOL_SESSION!"
if /I "!A!"=="dbpool-apps"  set "RESULT=!DOCKER_CONTAINER_DBPOOL_APPS!"
if /I "!A!"=="gateway"      set "RESULT=!DOCKER_CONTAINER_GATEWAY!"
if /I "!A!"=="traefik"      set "RESULT=!DOCKER_CONTAINER_GATEWAY!"
if /I "!A!"=="redis"        set "RESULT=!DOCKER_CONTAINER_REDIS!"
if /I "!A!"=="cache"        set "RESULT=!DOCKER_CONTAINER_REDIS!"
if /I "!A!"=="memorycache"  set "RESULT=!DOCKER_CONTAINER_REDIS!"
if /I "!A!"=="minio"        set "RESULT=!DOCKER_CONTAINER_MINIO!"
if /I "!A!"=="storage"      set "RESULT=!DOCKER_CONTAINER_MINIO!"
if /I "!A!"=="mail"         set "RESULT=!DOCKER_CONTAINER_MAIL!"
if /I "!A!"=="mailtrap"     set "RESULT=!DOCKER_CONTAINER_MAIL!"
if /I "!A!"=="web"          set "RESULT=!DOCKER_CONTAINER_WEB!"
if /I "!A!"=="frontend"     set "RESULT=!DOCKER_CONTAINER_WEB!"
if /I "!A!"=="neon"         set "RESULT=!DOCKER_CONTAINER_WEB!"
if /I "!A!"=="mesh"         set "RESULT=!DOCKER_CONTAINER_MESH_WEB!"
if /I "!A!"=="admin"        set "RESULT=!DOCKER_CONTAINER_ADMIN_WEB!"
if /I "!A!"=="api"          set "RESULT=!DOCKER_CONTAINER_API!"
if /I "!A!"=="backend"      set "RESULT=!DOCKER_CONTAINER_API!"
if /I "!A!"=="search"       set "RESULT=!DOCKER_CONTAINER_SEARCH!"
if /I "!A!"=="searchcore"   set "RESULT=!DOCKER_CONTAINER_SEARCH!"
if "!RESULT!"=="" set "RESULT=!A!"
set "%~2=!RESULT!"
goto :eof
