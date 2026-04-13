@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Mesh - CREATE DATA DIRS - Windows Batch
REM Location:
REM   mesh\scripts\setup\create-data-dirs.bat
REM Usage:
REM   create-data-dirs.bat
REM
REM Safe, idempotent. Creates the mesh\data\ folder structure
REM that Docker volume mounts require. Never deletes anything.
REM ============================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "MESH_DIR=%CD%"
popd >nul

set "ENV_DIR=%MESH_DIR%\env"
set "ENV_FILE=%ENV_DIR%\.env"

REM ----------------------------
REM Read MESH_DATA from .env (fallback to mesh\data)
REM ----------------------------
set "MESH_DATA="

if exist "%ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    set "K=%%A"
    set "V=%%B"
    for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
    if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
      set "V=!V:"=!"
      for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
      for /f "tokens=* delims= " %%V in ("!V!") do set "V=%%V"
      if /I "!K!"=="MESH_DATA" set "MESH_DATA=!V!"
    )
  )
)

REM Resolve MESH_DATA: normalize slashes, resolve relative path against MESH_DIR
if "!MESH_DATA!"=="" (
  set "MESH_DATA=%MESH_DIR%\data"
) else (
  set "MESH_DATA=!MESH_DATA:/=\!"
  pushd "%MESH_DIR%" >nul
  if not exist "!MESH_DATA!" mkdir "!MESH_DATA!" >nul 2>&1
  pushd "!MESH_DATA!" >nul
  set "MESH_DATA=%CD%"
  popd >nul
  popd >nul
)

echo.
echo ==========================
echo MESH_DIR  = %MESH_DIR%
echo MESH_DATA = %MESH_DATA%
echo ==========================
echo.

REM ----------------------------
REM Create folder structure (idempotent)
REM ----------------------------
echo Creating data directory structure...
mkdir "%MESH_DATA%\memorycache"         >nul 2>&1
mkdir "%MESH_DATA%\objectstorage"       >nul 2>&1
mkdir "%MESH_DATA%\telemetry"           >nul 2>&1
mkdir "%MESH_DATA%\telemetry\logging"   >nul 2>&1
mkdir "%MESH_DATA%\telemetry\metrics"   >nul 2>&1
mkdir "%MESH_DATA%\telemetry\observability" >nul 2>&1
mkdir "%MESH_DATA%\telemetry\tracing"   >nul 2>&1

echo.
echo Done:
echo   %MESH_DATA%\memorycache
echo   %MESH_DATA%\objectstorage
echo   %MESH_DATA%\telemetry\logging
echo   %MESH_DATA%\telemetry\metrics
echo   %MESH_DATA%\telemetry\observability
echo   %MESH_DATA%\telemetry\tracing
echo.
pause
endlocal
