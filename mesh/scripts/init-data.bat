@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ----------------------------
REM Paths
REM ----------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\.." >nul
set "MESH_DIR=%CD%"
popd >nul

set "ENV_DIR=%MESH_DIR%\env"
set "ENV_FILE=%ENV_DIR%\.env"

REM ----------------------------
REM Pick env file if .env missing
REM ----------------------------
if not exist "%ENV_FILE%" (
  echo.
  echo WARNING: .env not found: %ENV_FILE%
  echo.

  set "PROFILE="
  set /p "PROFILE=Select profile [local | staging | production] (blank=local): "

  REM normalize empty -> local
  if "!PROFILE!"=="" set "PROFILE=local"

  REM choose template file
  set "TEMPLATE_FILE=%ENV_DIR%\.env.example"
  if /I "!PROFILE!"=="local"      set "TEMPLATE_FILE=%ENV_DIR%\local.env.example"
  if /I "!PROFILE!"=="staging"    set "TEMPLATE_FILE=%ENV_DIR%\staging.env.example"
  if /I "!PROFILE!"=="production" set "TEMPLATE_FILE=%ENV_DIR%\production.env.example"

  echo.
  echo ENV_DIR       = "%ENV_DIR%"
  echo PROFILE       = "!PROFILE!"
  echo TEMPLATE_FILE = "!TEMPLATE_FILE!"
  echo TARGET_ENV    = "%ENV_FILE%"
  echo.

  if not exist "!TEMPLATE_FILE!" (
    echo ERROR: Template env file not found: "!TEMPLATE_FILE!"
    echo Available env templates in "%ENV_DIR%":
    dir /b "%ENV_DIR%\*.example" 2>nul
    pause
    exit /b 1
  )

  echo Creating .env from template...
  copy /Y "!TEMPLATE_FILE!" "%ENV_FILE%" >nul
  if errorlevel 1 (
    echo ERROR: Failed to create .env at: "%ENV_FILE%"
    pause
    exit /b 1
  )

  echo ✅ Created: "%ENV_FILE%"
  echo.
)

REM ----------------------------
REM Check chosen env file exists
REM ----------------------------
if not exist "%ENV_FILE%" (
  echo ERROR: env file not found: %ENV_FILE%
  echo Please ensure it exists under: %ENV_DIR%
  pause
  exit /b 1
)

REM ----------------------------
REM Read ENVIRONMENT and MESH_DATA
REM ----------------------------
set "ENVIRONMENT="
set "MESH_DATA="

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  set "K=%%A"
  set "V=%%B"

  REM trim spaces
  for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
  for /f "tokens=* delims= " %%V in ("!V!") do set "V=%%V"

  REM skip comments/empty
  if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
    REM remove quotes
    set "V=!V:"=!"
    REM strip inline comments
    for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
    for /f "tokens=* delims= " %%V in ("!V!") do set "V=%%V"

    if /I "!K!"=="ENVIRONMENT"  set "ENVIRONMENT=!V!"
    if /I "!K!"=="MESH_DATA" set "MESH_DATA=!V!"
  )
)

if "%ENVIRONMENT%"=="" (
  echo ERROR: ENVIRONMENT not found in %ENV_FILE%
  pause
  exit /b 1
)

if "%MESH_DATA%"=="" (
  echo ERROR: MESH_DATA not found in %ENV_FILE%
  pause
  exit /b 1
)

REM Normalize slashes
set "MESH_DATA=%MESH_DATA:/=\%"

echo ==========================
echo ENV_FILE  = %ENV_FILE%
echo ENVIRONMENT  = %ENVIRONMENT%
echo MESH_DATA = %MESH_DATA%
echo ==========================

REM ----------------------------
REM Confirm
REM ----------------------------
set /p "CONFIRM=Type YES to delete contents under MESH_DATA: "
if /I not "%CONFIRM%"=="YES" (
  echo Cancelled.
  pause
  exit /b 0
)

REM ----------------------------
REM Ensure base dir exists
REM ----------------------------
if not exist "%MESH_DATA%" mkdir "%MESH_DATA%"

REM ----------------------------
REM Delete all inside MESH_DATA
REM ----------------------------
echo Deleting folders...
for /d %%D in ("%MESH_DATA%\*") do rmdir /s /q "%%D" 2>nul

echo Deleting files...
for %%F in ("%MESH_DATA%\*") do del /f /q "%%F" 2>nul

REM ----------------------------
REM Recreate folder structure
REM ----------------------------
mkdir "%MESH_DATA%\memorycache" >nul 2>&1
mkdir "%MESH_DATA%\objectstorage" >nul 2>&1
mkdir "%MESH_DATA%\telemetry" >nul 2>&1
mkdir "%MESH_DATA%\telemetry\logging" >nul 2>&1
mkdir "%MESH_DATA%\telemetry\metrics" >nul 2>&1
mkdir "%MESH_DATA%\telemetry\observability" >nul 2>&1
mkdir "%MESH_DATA%\telemetry\tracing" >nul 2>&1

echo Done.
pause
endlocal
