@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - Reload Redis ACL into live memorycache container
REM Location:
REM   stack\scripts\stack\reload-redis-acl.bat
REM Usage:
REM   reload-redis-acl.bat [container_name]
REM   Default container: athyper-memorycache-1
REM
REM Re-runs `ACL LOAD` inside the container so edits to the mounted
REM redis-acl.conf take effect without restarting Redis (sessions stay).
REM Reads REDIS_ADMIN_PASSWORD from stack\env\.env.
REM ============================================================

set "CONTAINER=%~1"
if "%CONTAINER%"=="" set "CONTAINER=athyper-memorycache-1"

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "ENV_FILE=%STACK_DIR%\env\.env"

if not exist "%ENV_FILE%" (
  echo ERROR: .env not found at %ENV_FILE%
  exit /b 1
)

REM Extract REDIS_ADMIN_PASSWORD (first non-comment match)
set "ADMIN_PWD="
for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  set "K=%%A"
  set "V=%%B"
  for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
  if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
    if /I "!K!"=="REDIS_ADMIN_PASSWORD" if "!ADMIN_PWD!"=="" (
      set "V=!V:"=!"
      for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
      for /f "tokens=* delims= " %%V in ("!V!") do set "ADMIN_PWD=%%V"
    )
  )
)

if "%ADMIN_PWD%"=="" (
  echo ERROR: REDIS_ADMIN_PASSWORD not set in %ENV_FILE%
  exit /b 1
)

echo Reloading ACL in %CONTAINER%...
docker exec %CONTAINER% redis-cli -a "%ADMIN_PWD%" --user admin --no-auth-warning ACL LOAD
if errorlevel 1 (
  echo ERROR: ACL LOAD failed
  exit /b 1
)

echo.
echo Live app user key patterns:
docker exec %CONTAINER% redis-cli -a "%ADMIN_PWD%" --user admin --no-auth-warning ACL GETUSER app

echo.
echo Done.
endlocal
