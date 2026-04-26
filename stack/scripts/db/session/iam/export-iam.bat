@echo off
REM =======================================================================
REM Keycloak IAM Export Script (Windows)
REM Location:
REM   stack\scripts\db\session\iam\export-iam.bat
REM
REM Exports athyper + platform-control realms to stack\config\iam\ via a
REM temporary `docker run` container connected to the IAM database.
REM
REM Steps:
REM   [1/5] Create temp export directory (%TEMP%\keycloak-export-*)
REM   [2/5] Export athyper realm
REM   [3/5] Export platform-control realm
REM   [4/5] Move exported JSON files to stack\config\iam\
REM           -> realm-demosetup.json (athyper)
REM           -> realm-platform-control.json (platform-control, if provisioned)
REM   [5/5] Clean up temp directory
REM
REM Platform-control export produces a warning (not an error) if the realm
REM is not yet provisioned in Keycloak.
REM
REM Requires: running IAM container; KEYCLOAK_IMAGE_TAG in stack\env\.env
REM =======================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\..\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "CONFIG_DIR=%STACK_DIR%\config\iam"
set "EXPORT_FILE=%CONFIG_DIR%\realm-demosetup.json"
set "PLATFORM_EXPORT_FILE=%CONFIG_DIR%\realm-platform-control.json"
set "TEMP_EXPORT_DIR=%TEMP%\keycloak-export-%RANDOM%%RANDOM%"

REM ---------------------------------------------------------------------------
REM Container / network names — honour env-var overrides (mirrors lib/constants.sh)
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
if not defined DOCKER_CONTAINER_DB  set "DOCKER_CONTAINER_DB=!COMPOSE_PROJECT_NAME!-db-1"
if not defined DOCKER_NETWORK       set "DOCKER_NETWORK=athyper-internal"

echo.
echo === Keycloak Realm Export ===
echo Exporting athyper + platform-control realms
echo.

REM Ensure config directory exists
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"

REM Check if IAM container is running
docker ps --format "{{.Names}}" | findstr /C:"%DOCKER_CONTAINER_IAM%" >nul 2>&1
if errorlevel 1 (
    echo Error: Keycloak ^(IAM^) container is not running
    echo Start it with: cd stack\scripts\stack-profile ^&^& up.bat
    exit /b 1
)

REM ---------------------------------------------------------------------------
REM Resolve Keycloak image tag + DB credentials from .env then container
REM ---------------------------------------------------------------------------
set "ENV_FILE_EXP="
if exist "%STACK_DIR%\env\.env" (
    set "ENV_FILE_EXP=%STACK_DIR%\env\.env"
) else if exist "%STACK_DIR%\env\.env.example" (
    set "ENV_FILE_EXP=%STACK_DIR%\env\.env.example"
)

set "KEYCLOAK_IMAGE_TAG="
if defined ENV_FILE_EXP (
    for /f "tokens=2 delims==" %%a in ('findstr "^KEYCLOAK_IMAGE_TAG=" "!ENV_FILE_EXP!" 2^>nul') do set "KEYCLOAK_IMAGE_TAG=%%a"
)
if "!KEYCLOAK_IMAGE_TAG!"=="" (
    echo Error: KEYCLOAK_IMAGE_TAG not found in stack\env\.env
    exit /b 1
)

echo Reading database credentials from Keycloak container...
for /f "tokens=*" %%i in ('docker exec %DOCKER_CONTAINER_IAM% printenv KC_DB_URL 2^>nul') do set "IAM_DB_URL=%%i"
for /f "tokens=*" %%i in ('docker exec %DOCKER_CONTAINER_IAM% printenv KC_DB_USERNAME 2^>nul') do set "IAM_DB_USERNAME=%%i"
for /f "tokens=*" %%i in ('docker exec %DOCKER_CONTAINER_IAM% printenv KC_DB_PASSWORD 2^>nul') do set "IAM_DB_PASSWORD=%%i"

REM Fallback to .env values
if "!IAM_DB_URL!"=="" (
    if defined ENV_FILE_EXP for /f "tokens=2 delims==" %%a in ('findstr "^IAM_DB_URL=" "!ENV_FILE_EXP!" 2^>nul') do set "IAM_DB_URL=%%a"
)
if "!IAM_DB_URL!"=="" set "IAM_DB_URL=jdbc:postgresql://dbpool-session:6433/athyper_iam"
if "!IAM_DB_USERNAME!"=="" (
    if defined ENV_FILE_EXP for /f "tokens=2 delims==" %%a in ('findstr "^IAM_DB_USERNAME=" "!ENV_FILE_EXP!" 2^>nul') do set "IAM_DB_USERNAME=%%a"
)

if "!IAM_DB_PASSWORD!"=="" (
    echo Reading database password from environment file...
    if defined ENV_FILE_EXP (
        for /f "tokens=2 delims==" %%a in ('findstr "^IAM_DB_PASSWORD=" "!ENV_FILE_EXP!" 2^>nul') do set "IAM_DB_PASSWORD=%%a"
        set "IAM_DB_PASSWORD=!IAM_DB_PASSWORD:"=!"
    )
)

if "!IAM_DB_PASSWORD!"=="" (
    echo Error: Cannot determine database password
    echo Set IAM_DB_PASSWORD in stack\env\.env or as environment variable
    exit /b 1
)

echo [1/5] Creating temporary export directory...
mkdir "%TEMP_EXPORT_DIR%" 2>nul

echo [2/5] Exporting athyper realm...
docker run --rm ^
  --network %DOCKER_NETWORK% ^
  -v "%TEMP_EXPORT_DIR%:/opt/keycloak/data/export" ^
  -e KC_DB=postgres ^
  -e KC_DB_URL=%IAM_DB_URL% ^
  -e KC_DB_USERNAME=%IAM_DB_USERNAME% ^
  -e KC_DB_PASSWORD=%IAM_DB_PASSWORD% ^
  quay.io/keycloak/keycloak:!KEYCLOAK_IMAGE_TAG! ^
  export ^
  --dir /opt/keycloak/data/export ^
  --users realm_file ^
  --realm athyper

if errorlevel 1 (
    echo Export failed!
    rmdir /s /q "%TEMP_EXPORT_DIR%" 2>nul
    exit /b 1
)

echo [3/5] Exporting platform-control realm...
docker run --rm ^
  --network %DOCKER_NETWORK% ^
  -v "%TEMP_EXPORT_DIR%:/opt/keycloak/data/export" ^
  -e KC_DB=postgres ^
  -e KC_DB_URL=%IAM_DB_URL% ^
  -e KC_DB_USERNAME=%IAM_DB_USERNAME% ^
  -e KC_DB_PASSWORD=%IAM_DB_PASSWORD% ^
  quay.io/keycloak/keycloak:!KEYCLOAK_IMAGE_TAG! ^
  export ^
  --dir /opt/keycloak/data/export ^
  --users realm_file ^
  --realm platform-control

if errorlevel 1 (
    echo Warning: platform-control realm export failed ^(may not be provisioned yet^)
)

echo [4/5] Moving exports to config directory...
if exist "%TEMP_EXPORT_DIR%\athyper-realm.json" (
    move /y "%TEMP_EXPORT_DIR%\athyper-realm.json" "%EXPORT_FILE%" >nul
    echo athyper realm exported
) else (
    echo Error: athyper realm export file not found
    rmdir /s /q "%TEMP_EXPORT_DIR%" 2>nul
    exit /b 1
)

if exist "%TEMP_EXPORT_DIR%\platform-control-realm.json" (
    move /y "%TEMP_EXPORT_DIR%\platform-control-realm.json" "%PLATFORM_EXPORT_FILE%" >nul
    echo platform-control realm exported
) else (
    echo Warning: platform-control realm not found ^(not yet provisioned?^)
)

echo [5/5] Cleaning up...
rmdir /s /q "%TEMP_EXPORT_DIR%" 2>nul

echo.
echo Export completed successfully!
echo Exported to: %CONFIG_DIR%
echo.
echo What's exported:
echo   - Realm configuration (athyper + platform-control)
echo   - Clients and client scopes
echo   - Roles (realm and client)
echo   - Groups and users
echo   - Authentication flows
echo   - Organizations
echo.
echo To import this configuration:
echo   import-iam.bat
echo.
