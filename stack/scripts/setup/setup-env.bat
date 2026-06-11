@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper — Setup Environment Files
REM Location:
REM   stack\scripts\setup\setup-env.bat
REM
REM Usage:
REM   setup-env.bat [environment] [target]
REM
REM   environment : local (default) ^| staging ^| production
REM   target      : all (default)  ^| stack   ^| runtime ^| server ^| apps
REM
REM Targets:
REM   all     -- stack + server + apps  (single-server / local dev)
REM   stack   -- stack Docker env only  (stack-only server)
REM   runtime -- server + apps          (split-server: app machine)
REM   server  -- server only
REM   apps    -- apps/web only
REM
REM Template resolution:
REM   stack   -> stack\env\{env}.env.example   (falls back to .env.example for local)
REM   server  -> server\{env}.env.example      (falls back to .env.example)
REM   apps    -> apps\web\{env}.env.example    (falls back to .env.example)
REM
REM Split-server deployment:
REM   Stack machine  : setup-env.bat staging stack
REM   Runtime machine: setup-env.bat staging runtime
REM
REM Examples:
REM   setup-env.bat                     -- local env, all targets
REM   setup-env.bat local               -- local env, all targets
REM   setup-env.bat local server        -- local env, server only
REM   setup-env.bat staging runtime     -- staging env, server + apps
REM   setup-env.bat staging stack       -- staging env, stack only
REM   setup-env.bat production all      -- production env, all targets
REM ============================================================

REM ----------------------------
REM Resolve base directories
REM ----------------------------
set "SCRIPT_DIR=%~dp0"
if "!SCRIPT_DIR:~-1!"=="\" set "SCRIPT_DIR=!SCRIPT_DIR:~0,-1!"

pushd "!SCRIPT_DIR!\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

pushd "!STACK_DIR!\.." >nul
set "ROOT_DIR=%CD%"
popd >nul

set "ENV_DIR=!STACK_DIR!\env"
set "SERVER_DIR=!ROOT_DIR!\server"
set "WEB_DIR=!ROOT_DIR!\apps\web"

REM ----------------------------
REM Parse arguments
REM ----------------------------
set "ENV_NAME=%~1"
set "TARGET=%~2"

if "!ENV_NAME!"=="" (
  echo.
  echo Available environments: local, staging, production
  set /p "ENV_NAME=Select environment (blank=local): "
  if "!ENV_NAME!"=="" set "ENV_NAME=local"
)

if "!TARGET!"=="" (
  echo.
  echo Available targets: all, stack, runtime, server, apps
  set /p "TARGET=Select target (blank=all): "
  if "!TARGET!"=="" set "TARGET=all"
)

REM ----------------------------
REM Validate environment
REM ----------------------------
set "ENV_VALID=0"
if /I "!ENV_NAME!"=="local"      set "ENV_VALID=1"
if /I "!ENV_NAME!"=="staging"    set "ENV_VALID=1"
if /I "!ENV_NAME!"=="production" set "ENV_VALID=1"

if "!ENV_VALID!"=="0" (
  echo ERROR: Invalid environment "!ENV_NAME!". Must be: local, staging, or production
  exit /b 1
)

REM ----------------------------
REM Validate target
REM ----------------------------
set "TGT_VALID=0"
if /I "!TARGET!"=="all"     set "TGT_VALID=1"
if /I "!TARGET!"=="stack"   set "TGT_VALID=1"
if /I "!TARGET!"=="runtime" set "TGT_VALID=1"
if /I "!TARGET!"=="server"  set "TGT_VALID=1"
if /I "!TARGET!"=="apps"    set "TGT_VALID=1"

if "!TGT_VALID!"=="0" (
  echo ERROR: Invalid target "!TARGET!". Must be: all, stack, runtime, server, or apps
  exit /b 1
)

echo.
echo ==================================
echo Environment : !ENV_NAME!
echo Target      : !TARGET!
echo ==================================
echo.

REM ----------------------------
REM Dispatch
REM ----------------------------
if /I "!TARGET!"=="all"     goto do_all
if /I "!TARGET!"=="stack"   goto do_stack
if /I "!TARGET!"=="runtime" goto do_runtime
if /I "!TARGET!"=="server"  goto do_server
if /I "!TARGET!"=="apps"    goto do_apps
goto done

:do_all
  call :fn_stack
  if errorlevel 1 exit /b 1
  call :fn_server
  if errorlevel 1 exit /b 1
  call :fn_apps
  if errorlevel 1 exit /b 1
  goto done

:do_stack
  call :fn_stack
  if errorlevel 1 exit /b 1
  goto done

:do_runtime
  call :fn_server
  if errorlevel 1 exit /b 1
  call :fn_apps
  if errorlevel 1 exit /b 1
  goto done

:do_server
  call :fn_server
  if errorlevel 1 exit /b 1
  goto done

:do_apps
  call :fn_apps
  if errorlevel 1 exit /b 1
  goto done

REM ============================================================
REM fn_stack — resolves stack/env/{env}.env.example
REM ============================================================
:fn_stack
  REM local falls back to .env.example (no local.env.example in stack/env)
  set "STK_TPL=!ENV_DIR!\!ENV_NAME!.env.example"
  if /I "!ENV_NAME!"=="local" (
    if not exist "!STK_TPL!" (
      set "STK_TPL=!ENV_DIR!\.env.example"
    )
  )

  if not exist "!STK_TPL!" (
    echo ERROR: Stack template not found: "!STK_TPL!"
    echo Available templates:
    dir /b "!ENV_DIR!\*.example" 2>nul
    exit /b 1
  )

  if exist "!ENV_DIR!\.env" (
    for /f "tokens=*" %%T in ('powershell -NoProfile -Command "[datetime]::UtcNow.ToString(\"yyyyMMdd-HHmmss\")"') do set "_TS=%%T"
    copy /Y "!ENV_DIR!\.env" "!ENV_DIR!\.env.bak.!_TS!" >nul
    echo   Backing up stack .env ^-^> .env.bak.!_TS!
  )
  copy /Y "!STK_TPL!" "!ENV_DIR!\.env" >nul
  REM *.env* files are stored as LF in git (gitattributes: eol=lf).
  REM cmd.exe for /f cannot parse LF-only files on Windows -- it reads the
  REM entire file as one line and filters it out because it starts with '#'.
  REM Convert to CRLF so api-up.bat / web-up.bat for /f loops work correctly.
  set "_wf=!ENV_DIR!\.env"
  powershell -NoProfile -Command "[IO.File]::WriteAllLines('%_wf%',[IO.File]::ReadAllLines('%_wf%'),[Text.UTF8Encoding]::new($false))" >nul 2>&1
  set "_wf="
  echo   [stack]
  echo     src : !STK_TPL!
  echo     dst : !ENV_DIR!\.env
  exit /b 0

REM ============================================================
REM fn_server — resolves server/{env}.env.example
REM ============================================================
:fn_server
  if /I "!ENV_NAME!"=="local" (
    echo   [server] skipped -- edit server\.env manually for local dev ^(pnpm does not inherit batch env^)
    exit /b 0
  )
  set "SRV_TPL=!SERVER_DIR!\!ENV_NAME!.env.example"
  if not exist "!SRV_TPL!" set "SRV_TPL=!SERVER_DIR!\.env.example"

  if not exist "!SRV_TPL!" (
    echo ERROR: Server template not found.
    echo   Tried: !SERVER_DIR!\!ENV_NAME!.env.example
    echo   Tried: !SERVER_DIR!\.env.example
    exit /b 1
  )

  if exist "!SERVER_DIR!\.env" (
    for /f "tokens=*" %%T in ('powershell -NoProfile -Command "[datetime]::UtcNow.ToString(\"yyyyMMdd-HHmmss\")"') do set "_TS=%%T"
    copy /Y "!SERVER_DIR!\.env" "!SERVER_DIR!\.env.bak.!_TS!" >nul
    echo   Backing up server .env ^-^> .env.bak.!_TS!
  )
  copy /Y "!SRV_TPL!" "!SERVER_DIR!\.env" >nul
  echo   [server]
  echo     src : !SRV_TPL!
  echo     dst : !SERVER_DIR!\.env
  exit /b 0

REM ============================================================
REM fn_apps — resolves apps/web/{env}.env.example
REM ============================================================
:fn_apps
  if /I "!ENV_NAME!"=="local" (
    echo   [apps/web] skipped -- web-up.bat reads stack\env\.env directly ^(no .env.local needed^)
    exit /b 0
  )
  set "WEB_TPL=!WEB_DIR!\!ENV_NAME!.env.example"
  if not exist "!WEB_TPL!" set "WEB_TPL=!WEB_DIR!\.env.example"

  if not exist "!WEB_TPL!" (
    echo ERROR: Web template not found.
    echo   Tried: !WEB_DIR!\!ENV_NAME!.env.example
    echo   Tried: !WEB_DIR!\.env.example
    exit /b 1
  )

  if exist "!WEB_DIR!\.env.local" (
    for /f "tokens=*" %%T in ('powershell -NoProfile -Command "[datetime]::UtcNow.ToString(\"yyyyMMdd-HHmmss\")"') do set "_TS=%%T"
    copy /Y "!WEB_DIR!\.env.local" "!WEB_DIR!\.env.local.bak.!_TS!" >nul
    echo   Backing up apps/web .env.local ^-^> .env.local.bak.!_TS!
  )
  copy /Y "!WEB_TPL!" "!WEB_DIR!\.env.local" >nul
  echo   [apps/web]
  echo     src : !WEB_TPL!
  echo     dst : !WEB_DIR!\.env.local
  exit /b 0

REM ----------------------------
:done
echo.
echo Done.
echo.
echo Next steps:
if /I "!TARGET!"=="all"     echo   - stack    : Open stack\env\.env and fill in any ${VAR} placeholders.
if /I "!TARGET!"=="stack"   echo   - stack    : Open stack\env\.env and fill in any ${VAR} placeholders.
if /I "!ENV_NAME!"=="local" (
  if /I "!TARGET!"=="all"     echo   - server   : server\.env must exist for local dev ^(pnpm does not inherit batch env^).
  if /I "!TARGET!"=="all"     echo   - stack    : stack\env\.env is used by Docker Compose and web-up.bat.
) else (
  if /I "!TARGET!"=="all"     echo   - server   : Open server\.env -- set credentials and external service URLs.
  if /I "!TARGET!"=="runtime" echo   - server   : Open server\.env -- set credentials and external service URLs.
  if /I "!TARGET!"=="server"  echo   - server   : Open server\.env -- set credentials and external service URLs.
  if /I "!TARGET!"=="all"     echo   - apps/web : Open apps\web\.env.local -- verify RUNTIME_API_URL and KEYCLOAK_BASE_URL.
  if /I "!TARGET!"=="runtime" echo   - apps/web : Open apps\web\.env.local -- verify RUNTIME_API_URL and KEYCLOAK_BASE_URL.
  if /I "!TARGET!"=="apps"    echo   - apps/web : Open apps\web\.env.local -- verify RUNTIME_API_URL and KEYCLOAK_BASE_URL.
)
echo.

endlocal
