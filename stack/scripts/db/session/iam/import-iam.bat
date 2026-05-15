@echo off
REM =======================================================================
REM Keycloak IAM Import Script (Windows)
REM Location:
REM   stack\scripts\db\session\iam\import-iam.bat
REM
REM Imports realm configuration from stack\config\iam\ into a running
REM Keycloak instance via `kc import --override true`.
REM
REM Steps:
REM   [1/6] Copy realm file to temp directory (%TEMP%\keycloak-import-*)
REM         (Windows CMD: Docker volume mounts require a host-side copy)
REM   [2/6] Check database connection (via db container)
REM   [3/6] Import athyper realm (5-second countdown to cancel)
REM   [3b/6] Import platform-control realm (only if realm-platform-control.json
REM          exists in stack\config\iam\; uses a separate temp directory)
REM   [4/6] Clean up temp directory
REM   [5/6] Restart Keycloak container; wait for healthy status
REM         (60 attempts x 3 s = 180 s max ? extended vs .sh's 60 s because
REM          Docker Desktop on Windows restarts containers more slowly)
REM   [6/6] Run provision-keycloak-users.mjs to seed passwords + MFA
REM
REM Requires: running dbpool-session container; KEYCLOAK_IMAGE_TAG in stack\env\.env
REM =======================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\..\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "CONFIG_DIR=%STACK_DIR%\config\iam"
set "IMPORT_FILE=%CONFIG_DIR%\realm-demosetup.json"
set "PLATFORM_IMPORT_FILE=%CONFIG_DIR%\realm-platform-control.json"
set "TEMP_IMPORT_DIR=%TEMP%\keycloak-import-%RANDOM%%RANDOM%"

REM ---------------------------------------------------------------------------
REM Container / network / DB names ? honour env-var overrides (mirrors lib/constants.sh)
REM Prefix is derived from COMPOSE_PROJECT_NAME in stack\env\.env
REM ---------------------------------------------------------------------------
if not defined COMPOSE_PROJECT_NAME (
    if exist "%STACK_DIR%\env\.env" (
        for /f "tokens=2 delims==" %%a in ('findstr "^COMPOSE_PROJECT_NAME=" "%STACK_DIR%\env\.env" 2^>nul') do set "COMPOSE_PROJECT_NAME=%%a"
        set "COMPOSE_PROJECT_NAME=!COMPOSE_PROJECT_NAME:"=!"
    )
)
if not defined COMPOSE_PROJECT_NAME set "COMPOSE_PROJECT_NAME=athyper"

if not defined DOCKER_CONTAINER_IAM            set "DOCKER_CONTAINER_IAM=!COMPOSE_PROJECT_NAME!-iam-1"
if not defined DOCKER_CONTAINER_DB             set "DOCKER_CONTAINER_DB=!COMPOSE_PROJECT_NAME!-db-1"
if not defined DOCKER_CONTAINER_DBPOOL_SESSION  set "DOCKER_CONTAINER_DBPOOL_SESSION=!COMPOSE_PROJECT_NAME!-dbpool-session-1"
if not defined DB_NAME_AUTH                    set "DB_NAME_AUTH=athyper_iam"
if not defined DOCKER_NETWORK                  set "DOCKER_NETWORK=athyper-internal"

REM ---------------------------------------------------------------------------
REM Resolve .env helper
REM ---------------------------------------------------------------------------
set "ENV_FILE_IMP="
if exist "%STACK_DIR%\env\.env" (
    set "ENV_FILE_IMP=%STACK_DIR%\env\.env"
) else if exist "%STACK_DIR%\env\.env.example" (
    set "ENV_FILE_IMP=%STACK_DIR%\env\.env.example"
)
set "KEYCLOAK_IMAGE_TAG="
if defined ENV_FILE_IMP (
    for /f "tokens=2 delims==" %%a in ('findstr "^KEYCLOAK_IMAGE_TAG=" "!ENV_FILE_IMP!" 2^>nul') do set "KEYCLOAK_IMAGE_TAG=%%a"
)
if "!KEYCLOAK_IMAGE_TAG!"=="" (
    echo Error: KEYCLOAK_IMAGE_TAG not found in stack\env\.env
    exit /b 1
)

echo.
echo === Keycloak Realm Import ===
echo Importing from: %IMPORT_FILE%
echo.

REM Check if import file exists
if not exist "%IMPORT_FILE%" (
    echo Error: Import file not found: %IMPORT_FILE%
    echo.
    echo To create this file:
    echo   1. Export from existing Keycloak: export-iam.bat
    echo   2. Or manually export from Keycloak Admin Console
    echo   3. Save to: %IMPORT_FILE%
    exit /b 1
)

REM Check if session pool container is running
docker ps --format "{{.Names}}" | findstr /C:"%DOCKER_CONTAINER_DBPOOL_SESSION%" >nul 2>&1
if errorlevel 1 (
    echo Error: Session pool ^(dbpool-session^) container is not running
    echo Start it with: cd stack\scripts\stack-profile ^&^& up.bat
    exit /b 1
)

REM Get database credentials from running Keycloak container
docker ps --format "{{.Names}}" | findstr /C:"%DOCKER_CONTAINER_IAM%" >nul 2>&1
if not errorlevel 1 (
    echo Reading database credentials from Keycloak container...
    for /f "tokens=*" %%i in ('docker exec %DOCKER_CONTAINER_IAM% printenv KC_DB_URL 2^>nul') do set "IAM_DB_URL=%%i"
    for /f "tokens=*" %%i in ('docker exec %DOCKER_CONTAINER_IAM% printenv KC_DB_USERNAME 2^>nul') do set "IAM_DB_USERNAME=%%i"
    for /f "tokens=*" %%i in ('docker exec %DOCKER_CONTAINER_IAM% printenv KC_DB_PASSWORD 2^>nul') do set "IAM_DB_PASSWORD=%%i"
)

REM Fallback to .env values
if "!IAM_DB_URL!"=="" (
    if defined ENV_FILE_IMP for /f "tokens=2 delims==" %%a in ('findstr "^IAM_DB_URL=" "!ENV_FILE_IMP!" 2^>nul') do set "IAM_DB_URL=%%a"
)
if "!IAM_DB_URL!"=="" set "IAM_DB_URL=jdbc:postgresql://dbpool-session:6433/athyper_iam"
if "!IAM_DB_USERNAME!"=="" (
    if defined ENV_FILE_IMP for /f "tokens=2 delims==" %%a in ('findstr "^IAM_DB_USERNAME=" "!ENV_FILE_IMP!" 2^>nul') do set "IAM_DB_USERNAME=%%a"
)

if "!IAM_DB_PASSWORD!"=="" (
    echo Reading database password from environment file...
    if defined ENV_FILE_IMP (
        for /f "tokens=2 delims==" %%a in ('findstr "^IAM_DB_PASSWORD=" "!ENV_FILE_IMP!" 2^>nul') do set "IAM_DB_PASSWORD=%%a"
        set "IAM_DB_PASSWORD=!IAM_DB_PASSWORD:"=!"
    )
)

if "%IAM_DB_PASSWORD%"=="" (
    echo Error: Cannot determine database password
    echo Set IAM_DB_PASSWORD in stack\env\.env or as environment variable
    exit /b 1
)

for %%V in (KC_SMTP_HOST KC_SMTP_PORT KC_SMTP_FROM KC_SMTP_FROM_DISPLAY_NAME KC_SMTP_AUTH KC_SMTP_SSL KC_SMTP_STARTTLS KC_SMTP_USERNAME KC_SMTP_PASSWORD KC_WEBAUTHN_RP_ID ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET NEON_SVC_BFF_CLIENT_SECRET GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET) do (
    if not defined %%V (
        if defined ENV_FILE_IMP (
            for /f "tokens=2 delims==" %%a in ('findstr /B /C:"%%V=" "!ENV_FILE_IMP!" 2^>nul') do set "%%V=%%a"
        )
    )
)
if not defined KC_SMTP_HOST set "KC_SMTP_HOST=mailhog"
if not defined KC_SMTP_PORT set "KC_SMTP_PORT=1025"
if not defined KC_SMTP_FROM set "KC_SMTP_FROM=noreply@athyper.local"
if not defined KC_SMTP_FROM_DISPLAY_NAME set "KC_SMTP_FROM_DISPLAY_NAME=Athyper"
if not defined KC_SMTP_AUTH set "KC_SMTP_AUTH=false"
if not defined KC_SMTP_SSL set "KC_SMTP_SSL=false"
if not defined KC_SMTP_STARTTLS set "KC_SMTP_STARTTLS=false"
if not defined KC_WEBAUTHN_RP_ID set "KC_WEBAUTHN_RP_ID=athyper.local"

echo [1/6] Creating temporary import directory...
mkdir "%TEMP_IMPORT_DIR%" 2>nul
copy /y "%IMPORT_FILE%" "%TEMP_IMPORT_DIR%\athyper-realm.json" >nul

echo [2/6] Checking database connection...
docker exec %DOCKER_CONTAINER_DB% psql -U %IAM_DB_USERNAME% -d %DB_NAME_AUTH% -c "SELECT version();" >nul 2>&1
if errorlevel 1 (
    echo Error: Cannot connect to database
    rmdir /s /q "%TEMP_IMPORT_DIR%" 2>nul
    exit /b 1
)
echo Database connection successful

echo [3/6] Importing realm configuration...
echo This will override existing realm data!
echo Press Ctrl+C to cancel, or wait 5 seconds...
timeout /t 5 /nobreak >nul 2>&1

docker run --rm ^
  --network %DOCKER_NETWORK% ^
  -v "%TEMP_IMPORT_DIR%:/opt/keycloak/data/import" ^
  -e KC_DB=postgres ^
  -e KC_DB_URL=%IAM_DB_URL% ^
  -e KC_DB_USERNAME=%IAM_DB_USERNAME% ^
  -e KC_DB_PASSWORD=%IAM_DB_PASSWORD% ^
  -e KC_SMTP_HOST=!KC_SMTP_HOST! ^
  -e KC_SMTP_PORT=!KC_SMTP_PORT! ^
  -e KC_SMTP_FROM=!KC_SMTP_FROM! ^
  -e KC_SMTP_FROM_DISPLAY_NAME=!KC_SMTP_FROM_DISPLAY_NAME! ^
  -e KC_SMTP_AUTH=!KC_SMTP_AUTH! ^
  -e KC_SMTP_SSL=!KC_SMTP_SSL! ^
  -e KC_SMTP_STARTTLS=!KC_SMTP_STARTTLS! ^
  -e KC_SMTP_USERNAME=!KC_SMTP_USERNAME! ^
  -e KC_SMTP_PASSWORD=!KC_SMTP_PASSWORD! ^
  -e KC_WEBAUTHN_RP_ID=!KC_WEBAUTHN_RP_ID! ^
  -e ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET=!ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET! ^
  -e NEON_SVC_BFF_CLIENT_SECRET=!NEON_SVC_BFF_CLIENT_SECRET! ^
  -e GITHUB_OAUTH_CLIENT_ID=!GITHUB_OAUTH_CLIENT_ID! ^
  -e GITHUB_OAUTH_CLIENT_SECRET=!GITHUB_OAUTH_CLIENT_SECRET! ^
  -e GOOGLE_CLIENT_ID=!GOOGLE_CLIENT_ID! ^
  -e GOOGLE_CLIENT_SECRET=!GOOGLE_CLIENT_SECRET! ^
  -e MICROSOFT_CLIENT_ID=!MICROSOFT_CLIENT_ID! ^
  -e MICROSOFT_CLIENT_SECRET=!MICROSOFT_CLIENT_SECRET! ^
  quay.io/keycloak/keycloak:!KEYCLOAK_IMAGE_TAG! ^
  import ^
  --dir /opt/keycloak/data/import ^
  --override true

if errorlevel 1 (
    echo Import failed!
    rmdir /s /q "%TEMP_IMPORT_DIR%" 2>nul
    exit /b 1
)

echo athyper realm imported

REM Import platform-control realm (if the file exists)
if exist "%PLATFORM_IMPORT_FILE%" (
    echo [3b/6] Importing platform-control realm...
    set "TEMP_PLATFORM_DIR=%TEMP%\keycloak-import-platform-%RANDOM%%RANDOM%"
    mkdir "!TEMP_PLATFORM_DIR!" 2>nul
    copy /y "%PLATFORM_IMPORT_FILE%" "!TEMP_PLATFORM_DIR!\platform-control-realm.json" >nul

    docker run --rm ^
      --network %DOCKER_NETWORK% ^
      -v "!TEMP_PLATFORM_DIR!:/opt/keycloak/data/import" ^
      -e KC_DB=postgres ^
      -e KC_DB_URL=%IAM_DB_URL% ^
      -e KC_DB_USERNAME=%IAM_DB_USERNAME% ^
      -e KC_DB_PASSWORD=%IAM_DB_PASSWORD% ^
      -e KC_SMTP_HOST=!KC_SMTP_HOST! ^
      -e KC_SMTP_PORT=!KC_SMTP_PORT! ^
      -e KC_SMTP_FROM=!KC_SMTP_FROM! ^
      -e KC_SMTP_FROM_DISPLAY_NAME=!KC_SMTP_FROM_DISPLAY_NAME! ^
      -e KC_SMTP_AUTH=!KC_SMTP_AUTH! ^
      -e KC_SMTP_SSL=!KC_SMTP_SSL! ^
      -e KC_SMTP_STARTTLS=!KC_SMTP_STARTTLS! ^
      -e KC_SMTP_USERNAME=!KC_SMTP_USERNAME! ^
      -e KC_SMTP_PASSWORD=!KC_SMTP_PASSWORD! ^
      -e KC_WEBAUTHN_RP_ID=!KC_WEBAUTHN_RP_ID! ^
      -e ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET=!ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET! ^
      -e NEON_SVC_BFF_CLIENT_SECRET=!NEON_SVC_BFF_CLIENT_SECRET! ^
      -e GITHUB_OAUTH_CLIENT_ID=!GITHUB_OAUTH_CLIENT_ID! ^
      -e GITHUB_OAUTH_CLIENT_SECRET=!GITHUB_OAUTH_CLIENT_SECRET! ^
      -e GOOGLE_CLIENT_ID=!GOOGLE_CLIENT_ID! ^
      -e GOOGLE_CLIENT_SECRET=!GOOGLE_CLIENT_SECRET! ^
      -e MICROSOFT_CLIENT_ID=!MICROSOFT_CLIENT_ID! ^
      -e MICROSOFT_CLIENT_SECRET=!MICROSOFT_CLIENT_SECRET! ^
      quay.io/keycloak/keycloak:!KEYCLOAK_IMAGE_TAG! ^
      import ^
      --dir /opt/keycloak/data/import ^
      --override true

    if errorlevel 1 (
        echo Warning: platform-control realm import failed
    ) else (
        echo platform-control realm imported
    )
    rmdir /s /q "!TEMP_PLATFORM_DIR!" 2>nul
) else (
    echo Skipping platform-control realm ^(file not found: %PLATFORM_IMPORT_FILE%^)
)

echo [4/6] Cleaning up...
rmdir /s /q "%TEMP_IMPORT_DIR%" 2>nul

echo [5/6] Restarting Keycloak container...
docker ps --format "{{.Names}}" | findstr /C:"%DOCKER_CONTAINER_IAM%" >nul 2>&1
if not errorlevel 1 (
    docker restart %DOCKER_CONTAINER_IAM%
    echo Waiting for Keycloak to be ready ^(health check^)...
    REM Windows: 60 attempts x 3 s = 180 s max (import-iam.sh uses 30 x 2 s = 60 s).
    REM Docker Desktop on Windows takes longer to fully restart a container than
    REM the Linux/macOS daemon, so the extended window prevents false timeouts.
    set "KC_READY=0"
    for /L %%i in (1,1,60) do (
        if "!KC_READY!"=="0" (
            for /f "tokens=*" %%s in ('docker inspect --format "{{.State.Health.Status}}" %DOCKER_CONTAINER_IAM% 2^>nul') do set "KC_STATUS=%%s"
            if "!KC_STATUS!"=="healthy" (
                set "KC_READY=1"
                echo Keycloak is ready.
            ) else (
                timeout /t 3 /nobreak >nul 2>&1
            )
        )
    )
    if "!KC_READY!"=="0" (
        echo Warning: Keycloak health check timed out. Waiting an extra 15 seconds...
        timeout /t 15 /nobreak >nul 2>&1
    )
) else (
    echo Keycloak container not running, start it to apply changes:
    echo   cd stack\scripts\stack-profile ^&^& up.bat
)

echo [6/6] Provisioning users (passwords + MFA)...
set "PROVISION_SCRIPT=%STACK_DIR%\..\tools\devtools\keycloackgen\provision-keycloak-users.mjs"
if exist "!PROVISION_SCRIPT!" (
    where node >nul 2>&1
    if not errorlevel 1 (
        node "!PROVISION_SCRIPT!"
        echo Users provisioned successfully
    ) else (
        echo Warning: node not found - run manually:
        echo   node tools\devtools\keycloackgen\provision-keycloak-users.mjs
    )
) else (
    echo Warning: provision script not found at: !PROVISION_SCRIPT!
    echo   Run manually: node tools\devtools\keycloackgen\provision-keycloak-users.mjs
)

echo.
echo Import completed successfully!
echo.
echo Next steps:
echo   1. Access Keycloak Admin Console
echo   2. Verify realms: athyper, platform-control
echo   3. Check clients, users, roles
echo   4. Demo user password is controlled by IAM_DEMO_USER_PASSWORD in stack\env\.env
echo      Default (if unset): Demo@1234  ^|  Run seed-iam-credentials.bat to re-apply
echo.
echo Keycloak Admin URL: http://localhost/auth
echo.
