@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Docker Desktop STOP - Windows Batch
REM Location: stack\scripts\docker\stop.bat
REM
REM Gracefully stops Docker Desktop.
REM   Primary:  DockerCli.exe -Shutdown
REM             Checks system-wide path first, then user-scoped:
REM               C:\Program Files\Docker\Docker\DockerCli.exe
REM               %LOCALAPPDATA%\Programs\Docker\Docker\DockerCli.exe
REM   Fallback: taskkill /IM "Docker Desktop.exe" /T
REM             (used when DockerCli.exe is not found at either path)
REM
REM No-op if Docker is not currently running.
REM ============================================================

docker version >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop is not running.
  goto :end
)

REM System-wide install (default); falls back to user-scoped install if not found
set "DOCKER_CLI=C:\Program Files\Docker\Docker\DockerCli.exe"
if not exist "!DOCKER_CLI!" set "DOCKER_CLI=%LOCALAPPDATA%\Programs\Docker\Docker\DockerCli.exe"

echo.
echo Stopping Docker Desktop...

if exist "!DOCKER_CLI!" (
  "!DOCKER_CLI!" -Shutdown
) else (
  echo WARNING: DockerCli.exe not found at system or user install path — falling back to taskkill.
  taskkill /IM "Docker Desktop.exe" /T >nul 2>&1
)

echo Docker Desktop stop initiated.

:end
echo.
endlocal
