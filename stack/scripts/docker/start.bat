@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Docker Desktop START - Windows Batch
REM Location: stack\scripts\docker\start.bat
REM
REM Starts Docker Desktop and waits for the daemon to be ready.
REM   App path: C:\Program Files\Docker\Docker\Docker Desktop.exe
REM             (falls back to %LOCALAPPDATA%\Programs\Docker\Docker\
REM              for user-scoped installs)
REM   Polling:  `docker version` at 3-second intervals for up to
REM             40 attempts (120 seconds max)
REM
REM Safe to run when Docker is already running — exits immediately.
REM ============================================================

REM Check if already running
docker version >nul 2>&1
if not errorlevel 1 (
  echo Docker Desktop is already running.
  echo.
  docker version
  goto :end
)

REM System-wide install (default); falls back to user-scoped install if not found
set "DOCKER_APP=C:\Program Files\Docker\Docker\Docker Desktop.exe"
if not exist "!DOCKER_APP!" set "DOCKER_APP=%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe"

if not exist "!DOCKER_APP!" (
  echo ERROR: Docker Desktop not found at either install location.
  echo   System: C:\Program Files\Docker\Docker\Docker Desktop.exe
  echo   User:   %LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe
  echo Install Docker Desktop from https://www.docker.com/products/docker-desktop
  pause
  exit /b 1
)

echo.
echo Starting Docker Desktop...
start "" "!DOCKER_APP!"
echo.
echo Waiting for Docker daemon (this may take up to 120 seconds)...

set "ATTEMPTS=0"
:wait_loop
set /a "ATTEMPTS=!ATTEMPTS!+1"
if !ATTEMPTS! gtr 40 (
  echo.
  echo ERROR: Docker did not become ready within 120 seconds.
  echo Check Docker Desktop manually, then re-run.
  pause
  exit /b 1
)
%SystemRoot%\system32\timeout.exe /t 3 /nobreak >nul
docker version >nul 2>&1
if errorlevel 1 goto :wait_loop

echo.
echo Docker is ready (took ~!ATTEMPTS! x 3 seconds).
echo.
docker version

:end
echo.
endlocal
