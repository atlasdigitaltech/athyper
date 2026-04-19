@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Docker Desktop RESTART - Windows Batch
REM Location: stack\scripts\docker\restart.bat
REM
REM Stops Docker Desktop, waits for it to exit, then starts it
REM again and waits for the daemon to be ready.
REM
REM   stop:  DockerCli.exe -Shutdown; falls back to taskkill
REM          if DockerCli.exe is not found at default path
REM   wait:  polls `docker version` at 2s intervals,
REM          up to 30 attempts (60 seconds max)
REM   start: Docker Desktop.exe from default install path;
REM          polls `docker version` at 3s intervals,
REM          up to 40 attempts (120 seconds max)
REM
REM If Docker is not running when called, the stop step is skipped.
REM ============================================================

set "DOCKER_CLI=C:\Program Files\Docker\Docker\DockerCli.exe"
set "DOCKER_APP=C:\Program Files\Docker\Docker\Docker Desktop.exe"

REM ----------------------------
REM Stop (if running)
REM ----------------------------
docker version >nul 2>&1
if not errorlevel 1 (
  echo.
  echo Stopping Docker Desktop...
  if exist "!DOCKER_CLI!" (
    "!DOCKER_CLI!" -Shutdown
  ) else (
    taskkill /IM "Docker Desktop.exe" /T >nul 2>&1
  )
  echo Waiting for Docker to stop...
  set "STOP_ATTEMPTS=0"
  :stop_wait
  set /a "STOP_ATTEMPTS=!STOP_ATTEMPTS!+1"
  if !STOP_ATTEMPTS! gtr 30 (
    echo WARNING: Docker did not stop within 60 seconds — continuing anyway.
    goto :start_docker
  )
  %SystemRoot%\system32\timeout.exe /t 2 /nobreak >nul
  docker version >nul 2>&1
  if not errorlevel 1 goto :stop_wait
  echo Docker stopped.
) else (
  echo Docker is not running — skipping stop step.
)

REM ----------------------------
REM Start
REM ----------------------------
:start_docker
if not exist "!DOCKER_APP!" (
  echo ERROR: Docker Desktop not found at: "!DOCKER_APP!"
  pause
  exit /b 1
)

echo.
echo Starting Docker Desktop...
start "" "!DOCKER_APP!"
echo.
echo Waiting for Docker daemon (this may take up to 120 seconds)...

set "ATTEMPTS=0"
:start_wait
set /a "ATTEMPTS=!ATTEMPTS!+1"
if !ATTEMPTS! gtr 40 (
  echo.
  echo ERROR: Docker did not become ready within 120 seconds.
  pause
  exit /b 1
)
%SystemRoot%\system32\timeout.exe /t 3 /nobreak >nul
docker version >nul 2>&1
if errorlevel 1 goto :start_wait

echo.
echo Docker is ready (took ~!ATTEMPTS! x 3 seconds).
echo.
docker version

echo.
endlocal
