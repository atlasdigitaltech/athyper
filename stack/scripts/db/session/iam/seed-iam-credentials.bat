@echo off
REM =======================================================================
REM seed-iam-credentials.bat
REM Location: stack\scripts\db\session\iam\seed-iam-credentials.bat
REM
REM Seeds passwords for demo users in KC realms (athyper and platform-control)
REM after a realm import. Passwords are NEVER committed to realm JSON - they
REM are set here via kcadm.sh set-password inside the running KC container.
REM
REM Resolution order for passwords:
REM   1. Shell env var (IAM_DEMO_USER_PASSWORD / IAM_PLATFORM_CONTROL_USER_PASSWORD / IAM_ADMIN_REALM_USER_PASSWORD)
REM   2. .env file (stack\env\.env)
REM   3. Safe policy-compliant defaults for local/staging; production should use secrets
REM
REM Invoked by reset-iam.bat. Can also be run standalone:
REM     stack\scripts\db\session\iam\seed-iam-credentials.bat
REM
REM Idempotent: re-running overwrites existing passwords and removes the
REM UPDATE_PASSWORD required action so the next login skips the forced reset.
REM
REM Requires: running Keycloak container; IAM_ADMIN + IAM_ADMIN_PASSWORD in
REM   stack\env\.env (or as environment variables)
REM =======================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\..\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

REM ---------------------------------------------------------------------------
REM Container name ? honour env-var override (mirrors lib/constants.sh)
REM Prefix is derived from COMPOSE_PROJECT_NAME in stack\env\.env
REM ---------------------------------------------------------------------------
if not defined COMPOSE_PROJECT_NAME (
    if exist "%STACK_DIR%\env\.env" (
        for /f "tokens=2 delims==" %%a in ('findstr "^COMPOSE_PROJECT_NAME=" "%STACK_DIR%\env\.env" 2^>nul') do set "COMPOSE_PROJECT_NAME=%%a"
        set "COMPOSE_PROJECT_NAME=!COMPOSE_PROJECT_NAME:"=!"
    )
)
if not defined COMPOSE_PROJECT_NAME set "COMPOSE_PROJECT_NAME=athyper"

if not defined DOCKER_CONTAINER_IAM set "DOCKER_CONTAINER_IAM=!COMPOSE_PROJECT_NAME!-iam-1"

REM ---------------------------------------------------------------------------
REM Resolve .env
REM ---------------------------------------------------------------------------
set "ENV_FILE_SED="
if exist "%STACK_DIR%\env\.env" (
    set "ENV_FILE_SED=%STACK_DIR%\env\.env"
) else if exist "%STACK_DIR%\env\.env.example" (
    set "ENV_FILE_SED=%STACK_DIR%\env\.env.example"
)

REM ---------------------------------------------------------------------------
REM Pre-flight: KC container must be running
REM ---------------------------------------------------------------------------
docker ps --format "{{.Names}}" | findstr /C:"%DOCKER_CONTAINER_IAM%" >nul 2>&1
if errorlevel 1 (
    echo Error: Keycloak container %DOCKER_CONTAINER_IAM% is not running
    exit /b 1
)

REM ---------------------------------------------------------------------------
REM Resolve admin credentials (env var then .env)
REM ---------------------------------------------------------------------------
set "IAM_ADMIN_USER=%IAM_ADMIN%"
set "IAM_ADMIN_PASS=%IAM_ADMIN_PASSWORD%"

if "!IAM_ADMIN_USER!"=="" (
    if defined ENV_FILE_SED for /f "tokens=2 delims==" %%a in ('findstr "^IAM_ADMIN=" "!ENV_FILE_SED!" 2^>nul') do set "IAM_ADMIN_USER=%%a"
)
if "!IAM_ADMIN_PASS!"=="" (
    if defined ENV_FILE_SED for /f "tokens=2 delims==" %%a in ('findstr "^IAM_ADMIN_PASSWORD=" "!ENV_FILE_SED!" 2^>nul') do set "IAM_ADMIN_PASS=%%a"
)

if "!IAM_ADMIN_USER!"=="" (
    echo Error: IAM_ADMIN not resolvable from env or stack\env\.env
    exit /b 1
)
if "!IAM_ADMIN_PASS!"=="" (
    echo Error: IAM_ADMIN_PASSWORD not resolvable from env or stack\env\.env
    exit /b 1
)

set "STACK_ENVIRONMENT=%ENVIRONMENT%"
if "!STACK_ENVIRONMENT!"=="" (
    if defined ENV_FILE_SED for /f "tokens=2 delims==" %%a in ('findstr "^ENVIRONMENT=" "!ENV_FILE_SED!" 2^>nul') do set "STACK_ENVIRONMENT=%%a"
)
if "!STACK_ENVIRONMENT!"=="" set "STACK_ENVIRONMENT=local"

REM ---------------------------------------------------------------------------
REM Resolve seed passwords (with safe local-dev defaults)
REM ---------------------------------------------------------------------------
set "DEMO_PASS=%IAM_DEMO_USER_PASSWORD%"
if "!DEMO_PASS!"=="" (
    if defined ENV_FILE_SED for /f "tokens=2 delims==" %%a in ('findstr "^IAM_DEMO_USER_PASSWORD=" "!ENV_FILE_SED!" 2^>nul') do set "DEMO_PASS=%%a"
)
if "!DEMO_PASS!"=="" (
    set "DEMO_PASS=Demo@1234"
)

set "PCC_PASS=%IAM_PLATFORM_CONTROL_USER_PASSWORD%"
if "!PCC_PASS!"=="" (
    if defined ENV_FILE_SED for /f "tokens=2 delims==" %%a in ('findstr "^IAM_PLATFORM_CONTROL_USER_PASSWORD=" "!ENV_FILE_SED!" 2^>nul') do set "PCC_PASS=%%a"
)
if "!PCC_PASS!"=="" set "PCC_PASS=Platform@1234"

REM ---------------------------------------------------------------------------
set "ADMIN_REALM_PASS=%IAM_ADMIN_REALM_USER_PASSWORD%"
if "!ADMIN_REALM_PASS!"=="" (
    if defined ENV_FILE_SED for /f "tokens=2 delims==" %%a in ('findstr "^IAM_ADMIN_REALM_USER_PASSWORD=" "!ENV_FILE_SED!" 2^>nul') do set "ADMIN_REALM_PASS=%%a"
)
if "!ADMIN_REALM_PASS!"=="" set "ADMIN_REALM_PASS=AdminDemo@1234"

REM ---------------------------------------------------------------------------
REM User lists ? derived from checked-in realm demo setup JSONs and must stay in sync with
REM seed-iam-credentials.sh.
REM   stack\config\iam\realm-athyper.json
REM   stack\config\iam\realm-athyper-demosetup.json
REM   stack\config\iam\realm-platform-control.json
REM   stack\config\iam\realm-platform-control-demosetup.json
REM ---------------------------------------------------------------------------
set "IMPORT_FILE=%STACK_DIR%\config\iam\realm-athyper.json"
set "DEMO_FILE=%STACK_DIR%\config\iam\realm-athyper-demosetup.json"
set "PLATFORM_IMPORT_FILE=%STACK_DIR%\config\iam\realm-platform-control.json"
set "PLATFORM_DEMO_FILE=%STACK_DIR%\config\iam\realm-platform-control-demosetup.json"
set "DEMO_REALM_NAME="
for /f "usebackq delims=" %%r in (`node -e "const fs=require('fs'); const file=process.argv[1]; const realm=JSON.parse(fs.readFileSync(file,'utf8')).realm; if(realm===undefined||realm===null||realm==='') process.exit(1); process.stdout.write(realm);" "%IMPORT_FILE%"`) do set "DEMO_REALM_NAME=%%r"
if "!DEMO_REALM_NAME!"=="" (
    echo Error: Cannot determine realm name from %IMPORT_FILE%
    exit /b 1
)

set "DEMO_USERS="
set "NEON_USERS_FILE=%IMPORT_FILE%"
if exist "!DEMO_FILE!" set "NEON_USERS_FILE=!DEMO_FILE!"
for /f "usebackq delims=" %%u in (`node -e "const fs=require('fs'); const file=process.argv[1]; const realm=JSON.parse(fs.readFileSync(file,'utf8')); const users=(realm.users||[]).filter(u=>u.serviceAccountClientId?false:true).map(u=>u.username).filter(Boolean); process.stdout.write(users.join(' '));" "!NEON_USERS_FILE!"`) do set "DEMO_USERS=%%u"
set "PCC_USERS=product.admin tenant.manager support.admin"
if exist "!PLATFORM_DEMO_FILE!" (
    for /f "usebackq delims=" %%u in (`node -e "const fs=require('fs'); const file=process.argv[1]; const realm=JSON.parse(fs.readFileSync(file,'utf8')); const users=(realm.users||[]).filter(u=>u.serviceAccountClientId?false:true).map(u=>u.username).filter(Boolean); process.stdout.write(users.join(' '));" "!PLATFORM_DEMO_FILE!"`) do set "PCC_USERS=%%u"
)

echo.
echo === Seeding IAM credentials ===
echo   realm !DEMO_REALM_NAME!:          derived from realm-athyper.json
echo   realm platform-control: 3 users
echo.

echo [0/2] Applying demo setup fixtures
if exist "!DEMO_FILE!" (
    node "%STACK_DIR%\..\tools\scripts\apply-realm-demo-setup.cjs" --container "!DOCKER_CONTAINER_IAM!" --admin-user "!IAM_ADMIN_USER!" --admin-password "!IAM_ADMIN_PASS!" --realm-file "!IMPORT_FILE!" --demo-file "!DEMO_FILE!"
    if errorlevel 1 exit /b 1
)
if exist "!PLATFORM_IMPORT_FILE!" if exist "!PLATFORM_DEMO_FILE!" (
    node "%STACK_DIR%\..\tools\scripts\apply-realm-demo-setup.cjs" --container "!DOCKER_CONTAINER_IAM!" --admin-user "!IAM_ADMIN_USER!" --admin-password "!IAM_ADMIN_PASS!" --realm-file "!PLATFORM_IMPORT_FILE!" --demo-file "!PLATFORM_DEMO_FILE!"
    if errorlevel 1 exit /b 1
)
echo.

REM ---------------------------------------------------------------------------
REM Authenticate kcadm once ? credentials cached inside the KC container
REM ---------------------------------------------------------------------------
docker exec %DOCKER_CONTAINER_IAM% /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user "!IAM_ADMIN_USER!" --password "!IAM_ADMIN_PASS!" >nul
if errorlevel 1 (
    echo Error: Failed to authenticate with Keycloak admin. Check IAM_ADMIN / IAM_ADMIN_PASSWORD.
    exit /b 1
)

REM ---------------------------------------------------------------------------
REM Seed unified athyper demo realm
REM ---------------------------------------------------------------------------
echo [1/2] realm=!DEMO_REALM_NAME!
for %%u in (%DEMO_USERS%) do (
    docker exec %DOCKER_CONTAINER_IAM% /opt/keycloak/bin/kcadm.sh set-password -r !DEMO_REALM_NAME! --username "%%u" --new-password "!DEMO_PASS!" >nul 2>&1
    if errorlevel 1 (
        echo   ! !DEMO_REALM_NAME!/%%u - skipped ^(user missing?^)
    ) else (
        for /f "usebackq delims=" %%i in (`docker exec %DOCKER_CONTAINER_IAM% /opt/keycloak/bin/kcadm.sh get users -r !DEMO_REALM_NAME! -q username=%%u --fields id --format csv --noquotes 2^>nul`) do (
            if not "%%i"=="id" if not "%%i"=="" (
                docker exec %DOCKER_CONTAINER_IAM% /opt/keycloak/bin/kcadm.sh update "users/%%i" -r !DEMO_REALM_NAME! -s "requiredActions=[]" >nul 2>&1
            )
        )
        echo   OK !DEMO_REALM_NAME!/%%u
    )
)

echo.
echo [2/2] realm=platform-control
for %%u in (%PCC_USERS%) do (
    docker exec %DOCKER_CONTAINER_IAM% /opt/keycloak/bin/kcadm.sh set-password -r platform-control --username "%%u" --new-password "!PCC_PASS!" >nul 2>&1
    if errorlevel 1 (
        echo   ! platform-control/%%u - skipped ^(user missing?^)
    ) else (
        for /f "usebackq delims=" %%i in (`docker exec %DOCKER_CONTAINER_IAM% /opt/keycloak/bin/kcadm.sh get users -r platform-control -q username=%%u --fields id --format csv --noquotes 2^>nul`) do (
            if not "%%i"=="id" if not "%%i"=="" (
                docker exec %DOCKER_CONTAINER_IAM% /opt/keycloak/bin/kcadm.sh update "users/%%i" -r platform-control -s "requiredActions=[]" >nul 2>&1
            )
        )
        echo   OK platform-control/%%u
    )
)

echo.
echo Credential seeding complete
echo   Demo user password (!DEMO_REALM_NAME! realm): set from IAM_DEMO_USER_PASSWORD
echo   Demo user password (platform-control realm): set from IAM_PLATFORM_CONTROL_USER_PASSWORD
echo.

endlocal
