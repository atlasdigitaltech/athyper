@echo off
REM =======================================================================
REM Keycloak IAM Reset Script (Windows)
REM Location:
REM   stack\scripts\db\session\iam\reset-iam.bat
REM
REM Performs a FULL reset of Keycloak IAM data:
REM   [0/5] Validates realm-athyper.json
REM   [1/5] Stops the KC container
REM   [2/5] Drops and recreates the entire KC database schema (true clean slate)
REM   [3/5] Starts KC - it initializes master realm (admin user created from
REM         KC_BOOTSTRAP_ADMIN_* env vars) and auto-imports all realm JSON files
REM         mounted at /opt/keycloak/data/import/ (athyper + platform-control)
REM   [4/5] Waits for healthy status; seeds demo user passwords via
REM         seed-iam-credentials.bat (realm JSON does NOT contain plaintext creds)
REM   [5/5] Done — prints verify command and admin console URL
REM
REM Use when: stale users/roles/orgs exist in KC that are not in the JSON,
REM or when a full clean-slate reset is needed.
REM
REM NOTE: kc import --override is NOT used here because it does not create
REM the master realm bootstrap admin. Letting kc start handle a fresh DB
REM creates the admin AND imports realm files in one step.
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

REM ---------------------------------------------------------------------------
REM Container / database names — honour env-var overrides (mirrors lib/constants.sh)
REM Prefix is derived from COMPOSE_PROJECT_NAME in stack\env\.env
REM ---------------------------------------------------------------------------
if not defined COMPOSE_PROJECT_NAME (
    if exist "%STACK_DIR%\env\.env" (
        for /f "tokens=2 delims==" %%a in ('findstr "^COMPOSE_PROJECT_NAME=" "%STACK_DIR%\env\.env" 2^>nul') do set "COMPOSE_PROJECT_NAME=%%a"
        set "COMPOSE_PROJECT_NAME=!COMPOSE_PROJECT_NAME:"=!"
    )
)
if not defined COMPOSE_PROJECT_NAME set "COMPOSE_PROJECT_NAME=athyper"

if not defined DOCKER_CONTAINER_IAM           set "DOCKER_CONTAINER_IAM=!COMPOSE_PROJECT_NAME!-iam-1"
if not defined DOCKER_CONTAINER_DB            set "DOCKER_CONTAINER_DB=!COMPOSE_PROJECT_NAME!-db-1"
if not defined DOCKER_CONTAINER_DBPOOL_SESSION set "DOCKER_CONTAINER_DBPOOL_SESSION=!COMPOSE_PROJECT_NAME!-dbpool-session-1"
if not defined DB_NAME_AUTH                   set "DB_NAME_AUTH=athyper_iam"

REM ---------------------------------------------------------------------------
REM Resolve .env helper
REM ---------------------------------------------------------------------------
set "ENV_FILE_RST="
if exist "%STACK_DIR%\env\.env" (
    set "ENV_FILE_RST=%STACK_DIR%\env\.env"
) else if exist "%STACK_DIR%\env\.env.example" (
    set "ENV_FILE_RST=%STACK_DIR%\env\.env.example"
)

echo.
echo === Keycloak IAM FULL RESET ===
echo WARNING: This will DELETE ALL KC data and reimport from JSON seed files.
echo Press Ctrl+C to cancel, or wait 10 seconds to continue...
timeout /t 10 /nobreak >nul 2>&1

REM --- Step 0: Validate realm JSON -------------------------------------------
echo.
echo [0/5] Validating realm-athyper.json...

where node >nul 2>&1
if errorlevel 1 (
    echo Error: node not found in PATH
    exit /b 1
)

echo Using checked-in realm-athyper.json.

set "DEMO_REALM_NAME="
for /f "usebackq delims=" %%r in (`node -e "const fs=require('fs'); const file=process.argv[1]; const realm=JSON.parse(fs.readFileSync(file,'utf8')).realm; if(realm===undefined||realm===null||realm==='') process.exit(1); process.stdout.write(realm);" "%IMPORT_FILE%"`) do set "DEMO_REALM_NAME=%%r"
if errorlevel 1 (
    echo Error: realm-athyper.json validation failed
    exit /b 1
)
if "!DEMO_REALM_NAME!"=="" (
    echo Error: Cannot determine realm name from %IMPORT_FILE%
    exit /b 1
)
echo realm-athyper.json validated ^(realm=!DEMO_REALM_NAME!^)

REM --- Step 1: Stop KC container ---------------------------------------------
echo.
echo [1/5] Stopping Keycloak container...

docker ps --format "{{.Names}}" | findstr /C:"%DOCKER_CONTAINER_IAM%" >nul 2>&1
if not errorlevel 1 (
    docker stop %DOCKER_CONTAINER_IAM%
    echo Keycloak stopped
) else (
    echo KC container not running - proceeding with DB wipe
)

REM --- Step 2: Wipe KC database (true clean slate) ---------------------------
echo.
echo [2/5] Wiping KC database (drop + recreate schema)...

docker ps --format "{{.Names}}" | findstr /C:"%DOCKER_CONTAINER_DBPOOL_SESSION%" >nul 2>&1
if errorlevel 1 (
    echo Error: Session pool ^(dbpool-session^) container is not running
    echo Start the stack first: cd stack\scripts\stack-profile ^&^& up.bat
    exit /b 1
)

REM Resolve DB credentials from .env
set "DB_USER="
if defined IAM_DB_USERNAME set "DB_USER=%IAM_DB_USERNAME%"
if "!DB_USER!"=="" (
    if defined ENV_FILE_RST for /f "tokens=2 delims==" %%a in ('findstr "^IAM_DB_USERNAME=" "!ENV_FILE_RST!" 2^>nul') do set "DB_USER=%%a"
)
if "!DB_USER!"=="" (
    echo Error: Cannot determine IAM_DB_USERNAME from stack\env\.env
    exit /b 1
)

set "DB_PASS="
if defined IAM_DB_PASSWORD set "DB_PASS=%IAM_DB_PASSWORD%"
if "!DB_PASS!"=="" (
    if defined ENV_FILE_RST for /f "tokens=2 delims==" %%a in ('findstr "^IAM_DB_PASSWORD=" "!ENV_FILE_RST!" 2^>nul') do (
        set "DB_PASS=%%a"
        set "DB_PASS=!DB_PASS:"=!"
        set "DB_PASS=!DB_PASS:'=!"
    )
)
if "!DB_PASS!"=="" (
    echo Error: Cannot determine IAM_DB_PASSWORD from stack\env\.env
    exit /b 1
)

docker exec %DOCKER_CONTAINER_DB% psql -U %DB_USER% -d %DB_NAME_AUTH% -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO %DB_USER%; GRANT ALL ON SCHEMA public TO public;" >nul
if errorlevel 1 (
    echo Error: Database wipe failed
    exit /b 1
)
echo KC database wiped - all tables removed

REM --- Step 3: Start KC (creates master realm + admin + imports realm files) --
echo.
echo [3/5] Starting Keycloak (fresh init + realm import)...
echo   KC will: initialize schema, create master realm, bootstrap admin, import realm files
echo   Realm files in container import dir: !DEMO_REALM_NAME!-realm.json + platform-control-realm.json

docker start %DOCKER_CONTAINER_IAM%
if errorlevel 1 (
    echo Error: Failed to start Keycloak container
    exit /b 1
)
echo Waiting for Keycloak to be ready (may take ~30 seconds)...
timeout /t 10 >nul

set "KC_READY=0"
for /L %%i in (1,1,35) do (
    if "!KC_READY!"=="0" (
        for /f "tokens=*" %%s in ('docker inspect --format "{{.State.Health.Status}}" %DOCKER_CONTAINER_IAM% 2^>nul') do set "KC_STATUS=%%s"
        if "!KC_STATUS!"=="healthy" (
            set "KC_READY=1"
            echo.
            echo Keycloak is healthy
        ) else (
            <nul set /p "=."
            timeout /t 3 >nul
        )
    )
)

if "!KC_READY!"=="0" (
    echo.
    echo Warning: Keycloak may still be starting (status: !KC_STATUS!)
    echo Check: docker logs %DOCKER_CONTAINER_IAM% --tail=30
)

REM --- Step 4: Seed demo credentials -----------------------------------------
echo.
echo [4/5] Seeding demo user passwords via seed-iam-credentials.bat...
if "!KC_READY!"=="1" (
    call "%SCRIPT_DIR%\seed-iam-credentials.bat"
    if errorlevel 1 (
        echo Error: credential seeding failed - demo users have no passwords
        echo Re-run manually: stack\scripts\db\session\iam\seed-iam-credentials.bat
        exit /b 1
    )
) else (
    echo   Skipped - KC not healthy. Run manually once KC is up:
    echo     stack\scripts\db\session\iam\seed-iam-credentials.bat
)

REM --- Step 5: Done -----------------------------------------------------------
echo.
echo [5/5] Reset complete.
echo Keycloak IAM fully reset from JSON seed files
echo.
echo What was loaded:
echo   - realm-athyper.json = !DEMO_REALM_NAME! realm (Neon, Mesh, and Admin clients/roles/service accounts)
echo   - realm-athyper-demosetup.json = unified demo organizations and memberships
echo   - realm-platform-control.json = platform-control realm
echo   - realm-platform-control-demosetup.json = platform-control demo fixture metadata
echo.
REM Resolve IAM admin credentials for verify command
set "IAM_ADMIN_USER="
set "IAM_ADMIN_PASS="
if defined ENV_FILE_RST (
    for /f "tokens=2 delims==" %%a in ('findstr "^IAM_ADMIN=" "!ENV_FILE_RST!" 2^>nul') do set "IAM_ADMIN_USER=%%a"
    for /f "tokens=2 delims==" %%a in ('findstr "^IAM_ADMIN_PASSWORD=" "!ENV_FILE_RST!" 2^>nul') do set "IAM_ADMIN_PASS=%%a"
)
echo Verify:
echo   docker exec %DOCKER_CONTAINER_IAM% bash -c "/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user !IAM_ADMIN_USER! --password !IAM_ADMIN_PASS! --client admin-cli && /opt/keycloak/bin/kcadm.sh get realms --fields realm"
echo.
echo Keycloak Admin Console: http://localhost/auth (via proxy)
echo.

endlocal
