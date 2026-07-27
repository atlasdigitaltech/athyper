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
REM   [3/6] Import unified athyper realm (5-second countdown to cancel)
REM   [3b/6] Import platform-control realm (only if realm-platform-control.json
REM          exists in stack\config\iam\; uses a separate temp directory)
REM   [4/6] Clean up temp directory
REM   [5/6] Restart Keycloak container; wait for healthy status
REM         (100 attempts x 3 s = 300 s max because
REM          Docker Desktop on Windows restarts containers more slowly)
REM   [6/6] Run seed-iam-credentials.bat to seed demo passwords
REM
REM Requires: running dbpool-session container; KEYCLOAK_IMAGE_TAG in stack\env\.env
REM =======================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\..\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul
pushd "%STACK_DIR%\.." >nul
set "REPO_DIR=%CD%"
popd >nul

set "CONFIG_DIR=%STACK_DIR%\config\iam"
set "IMPORT_FILE=%CONFIG_DIR%\realm-athyper.json"
set "PLATFORM_IMPORT_FILE=%CONFIG_DIR%\realm-platform-control.json"
set "DEMO_FILE=%CONFIG_DIR%\realm-athyper-demosetup.json"
set "PLATFORM_DEMO_FILE=%CONFIG_DIR%\realm-platform-control-demosetup.json"
set "TEMP_IMPORT_DIR=%TEMP%\keycloak-import-%RANDOM%%RANDOM%"

node "%REPO_DIR%\tools\scripts\generate-athyper-demo-iam.cjs" --check
if errorlevel 1 exit /b 1
node "%REPO_DIR%\tools\scripts\verify-athyper-demo-iam.cjs"
if errorlevel 1 exit /b 1

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
set "IMPORT_ENVIRONMENT=%ENVIRONMENT%"
if "!IMPORT_ENVIRONMENT!"=="" (
    if defined ENV_FILE_IMP for /f "tokens=2 delims==" %%a in ('findstr "^ENVIRONMENT=" "!ENV_FILE_IMP!" 2^>nul') do set "IMPORT_ENVIRONMENT=%%a"
)
if "!IMPORT_ENVIRONMENT!"=="" set "IMPORT_ENVIRONMENT=local"

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

set "IAM_ADMIN_USER=%IAM_ADMIN%"
set "IAM_ADMIN_PASS=%IAM_ADMIN_PASSWORD%"
if "!IAM_ADMIN_USER!"=="" (
    if defined ENV_FILE_IMP for /f "tokens=2 delims==" %%a in ('findstr "^IAM_ADMIN=" "!ENV_FILE_IMP!" 2^>nul') do set "IAM_ADMIN_USER=%%a"
)
if "!IAM_ADMIN_PASS!"=="" (
    if defined ENV_FILE_IMP for /f "tokens=2 delims==" %%a in ('findstr "^IAM_ADMIN_PASSWORD=" "!ENV_FILE_IMP!" 2^>nul') do set "IAM_ADMIN_PASS=%%a"
)
if "!IAM_ADMIN_USER!"=="" (
    echo Error: IAM_ADMIN is required for post-restart API check
    exit /b 1
)
if "!IAM_ADMIN_PASS!"=="" (
    echo Error: IAM_ADMIN_PASSWORD is required for post-restart API check
    exit /b 1
)

for %%V in (KC_SMTP_HOST KC_SMTP_PORT KC_SMTP_FROM KC_SMTP_FROM_DISPLAY_NAME KC_SMTP_AUTH KC_SMTP_SSL KC_SMTP_STARTTLS KC_SMTP_USERNAME KC_SMTP_PASSWORD KC_WEBAUTHN_RP_ID ADMIN_WEB_CLIENT_SECRET ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET NEON_SVC_BFF_CLIENT_SECRET GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED APPS_ATHYPER_NEON_HOST APPS_ATHYPER_MESH_HOST APPS_ATHYPER_ADMIN_HOST) do (
    if not defined %%V (
        if defined ENV_FILE_IMP (
            for /f "tokens=2 delims==" %%a in ('findstr /B /C:"%%V=" "!ENV_FILE_IMP!" 2^>nul') do set "%%V=%%a"
        )
    )
)
if not defined KC_SMTP_HOST set "KC_SMTP_HOST=mailtrap"
if not defined KC_SMTP_PORT set "KC_SMTP_PORT=1025"
if not defined KC_SMTP_FROM set "KC_SMTP_FROM=noreply@athyper.local"
if not defined KC_SMTP_FROM_DISPLAY_NAME set "KC_SMTP_FROM_DISPLAY_NAME=Athyper"
if not defined KC_SMTP_AUTH set "KC_SMTP_AUTH=false"
if not defined KC_SMTP_SSL set "KC_SMTP_SSL=false"
if not defined KC_SMTP_STARTTLS set "KC_SMTP_STARTTLS=false"
if not defined KC_WEBAUTHN_RP_ID set "KC_WEBAUTHN_RP_ID=athyper.local"
if not defined APPS_ATHYPER_NEON_HOST set "APPS_ATHYPER_NEON_HOST=neon.athyper.local"
if not defined APPS_ATHYPER_MESH_HOST set "APPS_ATHYPER_MESH_HOST=mesh.athyper.local"
if not defined APPS_ATHYPER_ADMIN_HOST set "APPS_ATHYPER_ADMIN_HOST=admin.athyper.local"
set "NEON_PUBLIC_WEB_URL=https://!APPS_ATHYPER_NEON_HOST!"
set "MESH_PUBLIC_WEB_URL=https://!APPS_ATHYPER_MESH_HOST!"
set "ADMIN_PUBLIC_WEB_URL=https://!APPS_ATHYPER_ADMIN_HOST!"

echo [1/6] Creating temporary import directory...
mkdir "%TEMP_IMPORT_DIR%" 2>nul
set "IMPORT_REALM_NAME="
for /f "usebackq delims=" %%r in (`node -e "const fs=require('fs'); const file=process.argv[1]; const realm=JSON.parse(fs.readFileSync(file,'utf8')).realm; if(realm===undefined||realm===null||realm==='') process.exit(1); process.stdout.write(realm);" "%IMPORT_FILE%"`) do set "IMPORT_REALM_NAME=%%r"
if "!IMPORT_REALM_NAME!"=="" (
    echo Error: Cannot determine realm name from %IMPORT_FILE%
    rmdir /s /q "%TEMP_IMPORT_DIR%" 2>nul
    exit /b 1
)
copy /y "%IMPORT_FILE%" "%TEMP_IMPORT_DIR%\!IMPORT_REALM_NAME!-realm.json" >nul
node "%STACK_DIR%\..\tools\scripts\prepare-keycloak-realm-import.cjs" --realm-file "%TEMP_IMPORT_DIR%\!IMPORT_REALM_NAME!-realm.json" --demo-file "%DEMO_FILE%"
if errorlevel 1 (
    echo Error: failed to materialize stable demo users into the realm import
    rmdir /s /q "%TEMP_IMPORT_DIR%" 2>nul
    exit /b 1
)
node "%STACK_DIR%\..\tools\scripts\apply-iam-realm-policy.cjs" --environment "!IMPORT_ENVIRONMENT!" --root "%TEMP_IMPORT_DIR%" --write
if errorlevel 1 (
    echo Error: failed to apply IAM realm policy for !IMPORT_ENVIRONMENT!
    rmdir /s /q "%TEMP_IMPORT_DIR%" 2>nul
    exit /b 1
)

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
  -e NEON_PUBLIC_WEB_URL=!NEON_PUBLIC_WEB_URL! ^
  -e MESH_PUBLIC_WEB_URL=!MESH_PUBLIC_WEB_URL! ^
  -e ADMIN_PUBLIC_WEB_URL=!ADMIN_PUBLIC_WEB_URL! ^
  -e ADMIN_WEB_CLIENT_SECRET=!ADMIN_WEB_CLIENT_SECRET! ^
  -e ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET=!ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET! ^
  -e NEON_SVC_BFF_CLIENT_SECRET=!NEON_SVC_BFF_CLIENT_SECRET! ^
  -e GITHUB_OAUTH_CLIENT_ID=!GITHUB_OAUTH_CLIENT_ID! ^
  -e GITHUB_OAUTH_CLIENT_SECRET=!GITHUB_OAUTH_CLIENT_SECRET! ^
  -e GOOGLE_CLIENT_ID=!GOOGLE_CLIENT_ID! ^
  -e GOOGLE_CLIENT_SECRET=!GOOGLE_CLIENT_SECRET! ^
  -e MICROSOFT_CLIENT_ID=!MICROSOFT_CLIENT_ID! ^
  -e MICROSOFT_CLIENT_SECRET=!MICROSOFT_CLIENT_SECRET! ^
  -e LINKEDIN_CLIENT_ID=!LINKEDIN_CLIENT_ID! ^
  -e LINKEDIN_CLIENT_SECRET=!LINKEDIN_CLIENT_SECRET! ^
  -e ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED=!ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED! ^
  quay.io/keycloak/keycloak:!KEYCLOAK_IMAGE_TAG! ^
  import ^
  --dir /opt/keycloak/data/import ^
  --override true

if errorlevel 1 (
    echo Import failed!
    rmdir /s /q "%TEMP_IMPORT_DIR%" 2>nul
    exit /b 1
)

echo !IMPORT_REALM_NAME! realm imported

REM Import platform-control realm (if the file exists)
if exist "%PLATFORM_IMPORT_FILE%" (
    echo [3b/6] Importing platform-control realm...
    set "TEMP_PLATFORM_DIR=%TEMP%\keycloak-import-platform-%RANDOM%%RANDOM%"
    mkdir "!TEMP_PLATFORM_DIR!" 2>nul
    copy /y "%PLATFORM_IMPORT_FILE%" "!TEMP_PLATFORM_DIR!\platform-control-realm.json" >nul
    if exist "%PLATFORM_DEMO_FILE%" (
      node "%STACK_DIR%\..\tools\scripts\prepare-keycloak-realm-import.cjs" --realm-file "!TEMP_PLATFORM_DIR!\platform-control-realm.json" --demo-file "%PLATFORM_DEMO_FILE%"
      if errorlevel 1 (
        echo Error: failed to materialize stable platform-control demo users
        rmdir /s /q "!TEMP_PLATFORM_DIR!" 2>nul
        exit /b 1
      )
    )
    node "%STACK_DIR%\..\tools\scripts\apply-iam-realm-policy.cjs" --environment "!IMPORT_ENVIRONMENT!" --root "!TEMP_PLATFORM_DIR!" --write
    if errorlevel 1 (
        echo Warning: failed to apply IAM realm policy to platform-control import
    )

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
      -e NEON_PUBLIC_WEB_URL=!NEON_PUBLIC_WEB_URL! ^
      -e MESH_PUBLIC_WEB_URL=!MESH_PUBLIC_WEB_URL! ^
      -e ADMIN_PUBLIC_WEB_URL=!ADMIN_PUBLIC_WEB_URL! ^
      -e ADMIN_WEB_CLIENT_SECRET=!ADMIN_WEB_CLIENT_SECRET! ^
      -e ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET=!ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET! ^
      -e NEON_SVC_BFF_CLIENT_SECRET=!NEON_SVC_BFF_CLIENT_SECRET! ^
      -e GITHUB_OAUTH_CLIENT_ID=!GITHUB_OAUTH_CLIENT_ID! ^
      -e GITHUB_OAUTH_CLIENT_SECRET=!GITHUB_OAUTH_CLIENT_SECRET! ^
      -e GOOGLE_CLIENT_ID=!GOOGLE_CLIENT_ID! ^
      -e GOOGLE_CLIENT_SECRET=!GOOGLE_CLIENT_SECRET! ^
      -e MICROSOFT_CLIENT_ID=!MICROSOFT_CLIENT_ID! ^
      -e MICROSOFT_CLIENT_SECRET=!MICROSOFT_CLIENT_SECRET! ^
      -e LINKEDIN_CLIENT_ID=!LINKEDIN_CLIENT_ID! ^
      -e LINKEDIN_CLIENT_SECRET=!LINKEDIN_CLIENT_SECRET! ^
      -e ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED=!ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED! ^
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

echo [5/6] Recreating Keycloak container with current compose mounts...
set "LIVE_CONFIG_ROOT=%ATHYPER_CONFIG_ROOT%"
if "!LIVE_CONFIG_ROOT!"=="" (
    if defined ENV_FILE_IMP for /f "tokens=2 delims==" %%a in ('findstr "^ATHYPER_CONFIG_ROOT=" "!ENV_FILE_IMP!" 2^>nul') do set "LIVE_CONFIG_ROOT=%%a"
)
if "!LIVE_CONFIG_ROOT!"=="" set "LIVE_CONFIG_ROOT=%STACK_DIR%\config"
set "LIVE_IAM_DIR=!LIVE_CONFIG_ROOT!\iam"
if not exist "!LIVE_IAM_DIR!" mkdir "!LIVE_IAM_DIR!" 2>nul
copy /y "%IMPORT_FILE%" "!LIVE_IAM_DIR!\realm-athyper.json" >nul
if errorlevel 1 (
    echo Warning: failed to sync realm-athyper.json to !LIVE_IAM_DIR!
)
if exist "%DEMO_FILE%" copy /y "%DEMO_FILE%" "!LIVE_IAM_DIR!\realm-athyper-demosetup.json" >nul
if exist "%PLATFORM_IMPORT_FILE%" (
    copy /y "%PLATFORM_IMPORT_FILE%" "!LIVE_IAM_DIR!\realm-platform-control.json" >nul
    if errorlevel 1 (
        echo Warning: failed to sync realm-platform-control.json to !LIVE_IAM_DIR!
    )
) else (
    echo Skipping platform-control sync ^(file not found: %PLATFORM_IMPORT_FILE%^)
)
if exist "%PLATFORM_DEMO_FILE%" copy /y "%PLATFORM_DEMO_FILE%" "!LIVE_IAM_DIR!\realm-platform-control-demosetup.json" >nul

node "%STACK_DIR%\..\tools\scripts\apply-iam-realm-policy.cjs" --environment "!IMPORT_ENVIRONMENT!" --root "!LIVE_IAM_DIR!" --write
if errorlevel 1 (
    echo Warning: failed to apply IAM realm policy to !LIVE_IAM_DIR!
)

docker rm -f %DOCKER_CONTAINER_IAM% >nul 2>&1

set "UP_SCRIPT=%STACK_DIR%\scripts\stack-profile\up.bat"
if exist "!UP_SCRIPT!" (
    call "!UP_SCRIPT!" core
) else (
    echo Error: stack-profile up script not found at: !UP_SCRIPT!
    exit /b 1
)

echo Waiting for Keycloak to be ready ^(health check^)...
REM Windows: 100 attempts x 3 s = 300 s max.
REM Docker Desktop on Windows takes longer to fully restart a container than
REM the Linux/macOS daemon, so the extended window prevents false timeouts.
set "KC_READY=0"
for /L %%i in (1,1,100) do (
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
    echo Warning: Keycloak health check timed out after 300 seconds. Waiting an extra 30 seconds...
    timeout /t 30 /nobreak >nul 2>&1
)

echo Waiting for Keycloak admin API...
set "KC_ADMIN_READY=0"
for /L %%i in (1,1,60) do (
    if "!KC_ADMIN_READY!"=="0" (
        docker exec %DOCKER_CONTAINER_IAM% /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user "!IAM_ADMIN_USER!" --password "!IAM_ADMIN_PASS!" >nul 2>&1
        if not errorlevel 1 (
            set "KC_ADMIN_READY=1"
            echo Keycloak admin API is ready.
        ) else (
            timeout /t 3 /nobreak >nul 2>&1
        )
    )
)
if "!KC_ADMIN_READY!"=="0" (
    echo Warning: Keycloak admin API was not ready after 180 seconds.
)

echo [6/6] Seeding demo credentials...
if exist "%SCRIPT_DIR%\seed-iam-credentials.bat" (
    call "%SCRIPT_DIR%\seed-iam-credentials.bat"
    if errorlevel 1 (
        echo Warning: demo credential seeding failed. Import itself succeeded.
        echo   Re-run manually: stack\scripts\db\session\iam\seed-iam-credentials.bat
    ) else (
        echo Demo credentials seeded successfully
    )
) else (
    echo Warning: seed script not found at: %SCRIPT_DIR%\seed-iam-credentials.bat
    echo   Run manually: stack\scripts\db\session\iam\seed-iam-credentials.bat
)

echo.
echo Import completed successfully!
echo.
echo Next steps:
echo   1. Access Keycloak Admin Console
echo   2. Verify realms: athyper, platform-control
echo   3. Check clients, users, roles
echo   4. Demo user passwords are controlled by IAM_DEMO_USER_PASSWORD, IAM_ADMIN_REALM_USER_PASSWORD,
echo      and IAM_PLATFORM_CONTROL_USER_PASSWORD in stack\env\.env.
echo      Run seed-iam-credentials.bat to re-apply.
echo.
echo Keycloak Admin URL: http://localhost/auth
echo.
