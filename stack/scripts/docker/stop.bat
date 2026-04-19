@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Docker Desktop STOP - Windows Batch
REM Location: stack\scripts\docker\stop.bat
REM
REM Gracefully stops Docker Desktop.
REM   Primary:  C:\Program Files\Docker\Docker\DockerCli.exe -Shutdown
REM   Fallback: taskkill /IM "Docker Desktop.exe" /T
REM             (used when DockerCli.exe is not found at the default path)
REM
REM No-op if Docker is not currently running.
REM ============================================================

docker version >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop is not running.
  goto :end
)

set "DOCKER_CLI=C:\Program Files\Docker\Docker\DockerCli.exe"

echo.
echo Stopping Docker Desktop...

if exist "!DOCKER_CLI!" (
  "!DOCKER_CLI!" -Shutdown
) else (
  echo WARNING: DockerCli.exe not found at default path — falling back to taskkill.
  taskkill /IM "Docker Desktop.exe" /T >nul 2>&1
)

echo Docker Desktop stop initiated.

:end
echo.
endlocal
