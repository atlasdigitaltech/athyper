@echo off
REM =======================================================================
REM Keycloak IAM Import Script (Windows)
REM Location:
REM   mesh\scripts\db\import-iam.bat
REM Imports realm configuration from mesh\config\iam\realm-demosetup.json
REM and mesh\config\iam\realm-platform-control.json
REM =======================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "MESH_DIR=%CD%"
popd >nul

set "CONFIG_DIR=%MESH_DIR%\config\iam"
set "IMPORT_FILE=%CONFIG_DIR%\realm-demosetup.json"
set "PLATFORM_IMPORT_FILE=%CONFIG_DIR%\realm-platform-control.json"
set "TEMP_IMPORT_DIR=%TEMP%\keycloak-import-%RANDOM%"

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

REM Check if database container is running
docker ps --format "{{.Names}}" | findstr /C:"athyper-mesh-dbpool-auth" >nul 2>&1
if errorlevel 1 (
    echo Error: Database ^(dbpool-auth^) container is not running
    echo Start it with: cd mesh\scripts\stack ^&^& up.bat
    exit /b 1
)

REM Get database credentials from running Keycloak container
docker ps --format "{{.Names}}" | findstr /C:"athyper-mesh-iam" >nul 2>&1
if not errorlevel 1 (
    echo Reading database credentials from Keycloak container...
    for /f "tokens=*" %%i in ('docker exec athyper-mesh-iam-1 printenv KC_DB_URL 2^>nul') do set "IAM_DB_URL=%%i"
    for /f "tokens=*" %%i in ('docker exec athyper-mesh-iam-1 printenv KC_DB_USERNAME 2^>nul') do set "IAM_DB_USERNAME=%%i"
    for /f "tokens=*" %%i in ('docker exec athyper-mesh-iam-1 printenv KC_DB_PASSWORD 2^>nul') do set "IAM_DB_PASSWORD=%%i"
)

REM Fallback to defaults
if "%IAM_DB_URL%"=="" set "IAM_DB_URL=jdbc:postgresql://dbpool-auth:6433/athyperauth_dev1"
if "%IAM_DB_USERNAME%"=="" set "IAM_DB_USERNAME=athyperadmin"

if "%IAM_DB_PASSWORD%"=="" (
    echo Reading database password from environment file...
    set "ENV_FILE_IAM="
    if exist "%MESH_DIR%\env\.env" (
        set "ENV_FILE_IAM=%MESH_DIR%\env\.env"
    ) else if exist "%MESH_DIR%\env\.env.example" (
        set "ENV_FILE_IAM=%MESH_DIR%\env\.env.example"
    )
    if defined ENV_FILE_IAM (
        for /f "tokens=2 delims==" %%a in ('findstr "IAM_DB_PASSWORD" "!ENV_FILE_IAM!"') do set "IAM_DB_PASSWORD=%%a"
        set "IAM_DB_PASSWORD=!IAM_DB_PASSWORD:"=!"
    )
)

if "%IAM_DB_PASSWORD%"=="" (
    echo Error: Cannot determine database password
    echo Set IAM_DB_PASSWORD in mesh\env\.env or as environment variable
    exit /b 1
)

echo [1/5] Creating temporary import directory...
mkdir "%TEMP_IMPORT_DIR%" 2>nul
copy /y "%IMPORT_FILE%" "%TEMP_IMPORT_DIR%\athyper-realm.json" >nul

echo [2/5] Checking database connection...
docker exec athyper-mesh-db-1 psql -U %IAM_DB_USERNAME% -d athyperauth_dev1 -c "SELECT version();" >nul 2>&1
if errorlevel 1 (
    echo Error: Cannot connect to database
    rmdir /s /q "%TEMP_IMPORT_DIR%" 2>nul
    exit /b 1
)
echo Database connection successful

echo [3/5] Importing realm configuration...
echo This will override existing realm data!
echo Press Ctrl+C to cancel, or wait 5 seconds...
timeout /t 5 >nul

docker run --rm ^
  --network athyper-mesh-internal ^
  -v "%TEMP_IMPORT_DIR%:/opt/keycloak/data/import" ^
  -e KC_DB=postgres ^
  -e KC_DB_URL=%IAM_DB_URL% ^
  -e KC_DB_USERNAME=%IAM_DB_USERNAME% ^
  -e KC_DB_PASSWORD=%IAM_DB_PASSWORD% ^
  quay.io/keycloak/keycloak:26.5.1 ^
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
    echo [3b/5] Importing platform-control realm...
    set "TEMP_PLATFORM_DIR=%TEMP%\keycloak-import-platform-%RANDOM%"
    mkdir "!TEMP_PLATFORM_DIR!" 2>nul
    copy /y "%PLATFORM_IMPORT_FILE%" "!TEMP_PLATFORM_DIR!\platform-control-realm.json" >nul

    docker run --rm ^
      --network athyper-mesh-internal ^
      -v "!TEMP_PLATFORM_DIR!:/opt/keycloak/data/import" ^
      -e KC_DB=postgres ^
      -e KC_DB_URL=%IAM_DB_URL% ^
      -e KC_DB_USERNAME=%IAM_DB_USERNAME% ^
      -e KC_DB_PASSWORD=%IAM_DB_PASSWORD% ^
      quay.io/keycloak/keycloak:26.5.1 ^
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

echo [4/5] Cleaning up...
rmdir /s /q "%TEMP_IMPORT_DIR%" 2>nul

echo [5/5] Restarting Keycloak container...
docker ps --format "{{.Names}}" | findstr /C:"athyper-mesh-iam" >nul 2>&1
if not errorlevel 1 (
    docker restart athyper-mesh-iam-1
    echo Waiting for Keycloak to be ready...
    timeout /t 10 >nul
    echo Keycloak restarted
) else (
    echo Keycloak container not running, start it to apply changes:
    echo   cd mesh\scripts\stack ^&^& up.bat
)

echo.
echo Import completed successfully!
echo.
echo Next steps:
echo   1. Access Keycloak Admin Console
echo   2. Verify realms: athyper, platform-control
echo   3. Check clients, users, roles
echo.
echo Keycloak Admin URL: http://localhost/auth
echo.
