@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper - Docker Desktop STOP - Windows Batch
REM Location: stack\scripts\docker\stop.bat
REM
REM Gracefully stops Docker Desktop via DockerCli.exe -Shutdown.
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
pause
endlocal
