@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - Config Deploy Script
REM Location:
REM   stack\scripts\setup\setup-config.bat
REM Usage:
REM   setup-config.bat [local|staging|production] [--diff|--update]
REM
REM Modes:
REM   (no flag)   First-deploy: copy each file only if absent. Safe to re-run.
REM   --diff      Report which live files differ from templates. No writes.
REM   --update    Update repo-managed files automatically (with backup);
REM               prompt before operator-managed files.
REM
REM Operator-managed files (never auto-updated; --update will prompt):
REM   gateway\dynamic\athyper.tls.yml
REM   gateway\dynamic\athyper.workbench.yml
REM   gateway\dynamic\athyper.api.yml
REM
REM LIVE_CFG is read from ATHYPER_CONFIG_ROOT in stack\env\.env.
REM For local dev D:\Stack\athyper\config; for staging/prod systemd sets it.
REM ============================================================

REM ----------------------------
REM Resolve base directories
REM ----------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "ENV_DIR=%STACK_DIR%\env"
set "ENV_FILE=%ENV_DIR%\.env"
set "REPO_CFG=%STACK_DIR%\config"

REM ----------------------------
REM Read ATHYPER_CONFIG_ROOT from .env
REM ----------------------------
set "_CR_FROM_ENV="

if exist "%ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    set "K=%%A"
    set "V=%%B"
    for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
    if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
      set "V=!V:"=!"
      for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
      for /f "tokens=* delims= " %%V in ("!V!") do set "V=%%V"
      if /I "!K!"=="ATHYPER_CONFIG_ROOT" if "!_CR_FROM_ENV!"=="" set "_CR_FROM_ENV=!V!"
    )
  )
)

if not "!ATHYPER_CONFIG_ROOT!"=="" goto :sc_skip_cr
if not "!_CR_FROM_ENV!"==""        (set "ATHYPER_CONFIG_ROOT=!_CR_FROM_ENV!" & goto :sc_skip_cr)
set "ATHYPER_CONFIG_ROOT=%STACK_DIR%\config"
:sc_skip_cr

set "LIVE_CFG=!ATHYPER_CONFIG_ROOT!"

REM ----------------------------
REM Parse arguments
REM ----------------------------
set "ENV_NAME=%~1"
set "MODE=%~2"

if "!ENV_NAME!"=="" (
  echo.
  echo Available environments: local, staging, production
  echo.
  set /p "ENV_NAME=Select environment (blank=local): "
  if "!ENV_NAME!"=="" set "ENV_NAME=local"
)

REM Validate
set "VALID=0"
if /I "!ENV_NAME!"=="local"      set "VALID=1"
if /I "!ENV_NAME!"=="staging"    set "VALID=1"
if /I "!ENV_NAME!"=="production" set "VALID=1"
if "!VALID!"=="0" (
  echo ERROR: Invalid environment "!ENV_NAME!". Must be: local, staging, or production
  exit /b 1
)

REM ----------------------------
REM Environment-variant source selection
REM ----------------------------
if /I "!ENV_NAME!"=="staging" (
  set "MEMORYCACHE_SRC=memorycache\environments\cache.staging.conf"
  set "DOCRENDER_SRC=render\environments\docrender.staging.conf"
  set "DOCPARSER_SRC=render\environments\docparser-config.staging.xml"
  set "GATEWAY_TLS_SRC=gateway\environments\athyper.tls.staging.yml"
  set "WORKBENCH_SRC=gateway\environments\neon-workbench-routes.staging.yml"
  set "METRICS_CONFIG_SRC=telemetry\metrics\config.staging.yml"
)
if /I "!ENV_NAME!"=="production" (
  set "MEMORYCACHE_SRC=memorycache\environments\cache.production.conf"
  set "DOCRENDER_SRC=render\environments\docrender.production.conf"
  set "DOCPARSER_SRC=render\environments\docparser-config.production.xml"
  set "GATEWAY_TLS_SRC=gateway\environments\athyper.tls.production.yml"
  set "WORKBENCH_SRC=gateway\environments\neon-workbench-routes.prod.yml"
  set "METRICS_CONFIG_SRC=telemetry\metrics\config.production.yml"
)
if /I "!ENV_NAME!"=="local" (
  set "MEMORYCACHE_SRC=memorycache\cache.conf"
  set "DOCRENDER_SRC=render\docrender.conf"
  set "DOCPARSER_SRC=render\docparser-config.xml"
  set "GATEWAY_TLS_SRC=gateway\dynamic\athyper.tls.yml"
  set "WORKBENCH_SRC=gateway\dynamic\athyper.workbench.yml"
  set "METRICS_CONFIG_SRC=telemetry\metrics\config.yml"
)

echo.
echo ENV_NAME = !ENV_NAME!
echo REPO_CFG = %REPO_CFG%
echo LIVE_CFG = !LIVE_CFG!
echo MODE     = !MODE!
echo.

REM ── File map: CALL :pf "src_rel" "dst_rel" operator_managed ──────────────────
REM   operator_managed: 1 = prompt before overwrite in --update; 0 = auto-update

REM apps — kernel config (keep env-specific filename at the runtime location
REM so $ATHYPER_KERNEL_CONFIG_PATH in stack/env/.env points to the same file
REM this script just wrote; otherwise the runtime reads a stale orphan).
call :pf "apps\kernel.config.!ENV_NAME!.parameter.json" "apps\kernel.config.!ENV_NAME!.parameter.json" 0

REM gateway (operator-managed — deployed once, then operator edits live copy)
call :pf "!GATEWAY_TLS_SRC!" "gateway\dynamic\athyper.tls.yml" 1
call :pf "!WORKBENCH_SRC!" "gateway\dynamic\athyper.workbench.yml" 1
call :pf "gateway\dynamic\athyper.api.yml" "gateway\dynamic\athyper.api.yml" 1

REM db — compose mounts db/${ENVIRONMENT:-local}/ so every environment needs its own
REM     postgresql.conf, pg_hba.conf, and init-databases.sh deployed to that path.
call :pf "db\!ENV_NAME!\postgresql.conf" "db\!ENV_NAME!\postgresql.conf" 0
call :pf "db\!ENV_NAME!\pg_hba.conf" "db\!ENV_NAME!\pg_hba.conf" 0
call :pf "db\!ENV_NAME!\init-databases.sh" "db\!ENV_NAME!\init-databases.sh" 0

REM db pgbouncer configs — local uses flat dbpool/; staging/production use env-specific paths
REM (DBPOOL_APPS_CONFIG / DBPOOL_SESSION_CONFIG in .env point to the correct subpath)
if /I "!ENV_NAME!"=="local" (
  call :pf "db\local\dbpool\pgbouncer-apps.ini" "db\local\dbpool\pgbouncer-apps.ini" 0
  call :pf "db\local\dbpool\pgbouncer-auth.ini" "db\local\dbpool\pgbouncer-auth.ini" 0
  call :pf "db\local\dbpool\pgbouncer-session.ini" "db\local\dbpool\pgbouncer-session.ini" 0
  call :pf "db\local\dbpool\userlist.txt" "db\local\dbpool\userlist.txt" 0
)
if /I "!ENV_NAME!"=="staging" (
  call :pf "db\staging\dbpool\apps\pgbouncer-apps.ini" "db\staging\dbpool\apps\pgbouncer-apps.ini" 0
  call :pf "db\staging\dbpool\session\pgbouncer-session.ini" "db\staging\dbpool\session\pgbouncer-session.ini" 0
)
if /I "!ENV_NAME!"=="production" (
  call :pf "db\production\dbpool\apps\pgbouncer-apps.ini" "db\production\dbpool\apps\pgbouncer-apps.ini" 0
  call :pf "db\production\dbpool\session\pgbouncer-session.ini" "db\production\dbpool\session\pgbouncer-session.ini" 0
)

REM iam
call :pf "iam\realm-athyper.json" "iam\realm-athyper.json" 0
call :pf "iam\realm-athyper-demosetup.json" "iam\realm-athyper-demosetup.json" 0
call :pf "iam\realm-platform-control.json" "iam\realm-platform-control.json" 0
call :pf "iam\realm-platform-control-demosetup.json" "iam\realm-platform-control-demosetup.json" 0

REM memorycache (env-variant source).
REM redis-acl.conf is a derived artifact — rendered from the .tpl with SHA-256
REM password hashes AFTER the directory copies complete (see render block below).
REM Mirrors the .sh ordering so a later file/dir copy failure doesn't leave a
REM freshly-rendered ACL pointing at a half-deployed config tree.
call :pf "!MEMORYCACHE_SRC!" "memorycache\cache.conf" 0

REM telemetry
call :pf "telemetry\logging\config.yml" "telemetry\logging\config.yml" 0
call :pf "telemetry\logging\alloy.alloy" "telemetry\logging\alloy.alloy" 0
call :pf "telemetry\alertmanager\config.yml.tpl" "telemetry\alertmanager\config.yml.tpl" 0
call :pf "!METRICS_CONFIG_SRC!" "telemetry\metrics\config.yml" 0
call :pf "telemetry\metrics\recording-rules.yml" "telemetry\metrics\recording-rules.yml" 0
call :pf "telemetry\metrics\governance-alerts.yml" "telemetry\metrics\governance-alerts.yml" 0
call :pf "telemetry\metrics\redis-alerts.yml" "telemetry\metrics\redis-alerts.yml" 0
call :pf "telemetry\metrics\document-registry-alerts.yml" "telemetry\metrics\document-registry-alerts.yml" 0
call :pf "telemetry\metrics\api-alerts.yml" "telemetry\metrics\api-alerts.yml" 0
call :pf "telemetry\metrics\document-registry-slo.yml" "telemetry\metrics\document-registry-slo.yml" 0
call :pf "telemetry\tracing\config.yml" "telemetry\tracing\config.yml" 0
call :pf "telemetry\provisioning.env\dashboards.!ENV_NAME!.yml" "telemetry\provisioning.env\dashboards.!ENV_NAME!.yml" 0

REM render (env-variant source)
call :pf "!DOCRENDER_SRC!" "render\docrender.conf" 0
call :pf "!DOCPARSER_SRC!" "render\docparser-config.xml" 0

REM ── Directory copies: CALL :pd "dir_rel" ─────────────────────────────────────
REM Repo-managed outage bundle: always refresh it on config deployment.
call :pds "gateway\fallback"
call :pd "iam\themes\neon"
call :pd "telemetry\provisioning"

if /I "!MODE!" NEQ "--diff" (
  echo.
  echo Rendering Redis ACL...
  node "%STACK_DIR%\..\tools\scripts\render-redis-acl.cjs" --env-file "%ENV_FILE%" --stack-dir "%STACK_DIR%"
  if errorlevel 1 (
    echo   FAIL  Redis ACL render failed
    exit /b 1
  )

  echo.
  echo Applying IAM realm policy for !ENV_NAME!...
  node "%STACK_DIR%\..\tools\scripts\apply-iam-realm-policy.cjs" --environment "!ENV_NAME!" --root "!LIVE_CFG!\iam" --write
  if errorlevel 1 exit /b 1
)

REM ── MANIFEST (server only: LIVE_CFG != REPO_CFG, skipped for --diff) ─────────
if /I "!MODE!"=="--diff" goto :sc_no_manifest

set "_LIVE_NORM=!LIVE_CFG:\=/!"
set "_REPO_NORM=%REPO_CFG:\=/%"

if /I "!_LIVE_NORM!"=="!_REPO_NORM!" goto :sc_no_manifest

REM Parent of LIVE_CFG (e.g. D:\Stack\athyper from D:\Stack\athyper\config)
for %%P in ("!LIVE_CFG!") do set "STACK_RUNTIME_ROOT=%%~dpP"
if "!STACK_RUNTIME_ROOT:~-1!"=="\" set "STACK_RUNTIME_ROOT=!STACK_RUNTIME_ROOT:~0,-1!"
set "MANIFEST_FILE=!STACK_RUNTIME_ROOT!\MANIFEST"

if not exist "!STACK_RUNTIME_ROOT!" goto :sc_no_manifest

set "GIT_SHA=unknown"
for /f "tokens=*" %%G in ('git -C "%STACK_DIR%" rev-parse --short HEAD 2^>nul') do set "GIT_SHA=%%G"

set "INIT_AT="
set "INIT_COMMIT="
if exist "!MANIFEST_FILE!" (
  for /f "usebackq tokens=1,* delims==" %%A in ("!MANIFEST_FILE!") do (
    if /I "%%A"=="initialized_at"            if "!INIT_AT!"==""     set "INIT_AT=%%B"
    if /I "%%A"=="initialized_from_commit"   if "!INIT_COMMIT!"=="" set "INIT_COMMIT=%%B"
  )
)
if "!INIT_AT!"=="" (
  for /f "tokens=*" %%T in ('powershell -NoProfile -Command "[datetime]::UtcNow.ToString(\"yyyy-MM-ddTHH:mm:ssZ\")"') do set "INIT_AT=%%T"
)
if "!INIT_COMMIT!"=="" set "INIT_COMMIT=!GIT_SHA!"
for /f "tokens=*" %%T in ('powershell -NoProfile -Command "[datetime]::UtcNow.ToString(\"yyyy-MM-ddTHH:mm:ssZ\")"') do set "NOW=%%T"

pushd "%STACK_DIR%\..\.." >nul
set "PRODUCT_ROOT=%CD%"
popd >nul

(
  echo product_root=!PRODUCT_ROOT!
  echo initialized_at=!INIT_AT!
  echo initialized_from_commit=!INIT_COMMIT!
  echo last_setup_config_run=!NOW!
  echo last_setup_config_commit=!GIT_SHA!
  echo schema_version=11
) > "!MANIFEST_FILE!"
echo.
echo MANIFEST updated: !MANIFEST_FILE!

:sc_no_manifest
echo.
echo Done. Run with --diff to check for future drift.
goto :eof

REM ── Subroutine :pf ───────────────────────────────────────────────────────────
REM   Process one file: compare src (repo) → dst (live).
REM   %1 = src_rel (relative to REPO_CFG)
REM   %2 = dst_rel (relative to LIVE_CFG)
REM   %3 = operator_managed (1 = prompt before overwrite; 0 = auto)

:pf
setlocal
set "SRC_REL=%~1"
set "DST_REL=%~2"
set "OM=%~3"
set "SRC=%REPO_CFG%\!SRC_REL!"
set "DST=!LIVE_CFG!\!DST_REL!"

if not exist "!SRC!" (
  echo   WARN: template not found: !SRC_REL!
  endlocal & exit /b 0
)

REM Skip when source and destination resolve to the same path (local=repo)
set "_S=!SRC:\=/!"
set "_D=!DST:\=/!"
if /I "!_S!"=="!_D!" (
  echo   OK       !DST_REL!  (local=repo^)
  endlocal & exit /b 0
)

if /I "!MODE!"=="--diff" (
  if exist "!DST!\*" (
    echo   BLOCKED  !DST_REL!  (directory at file path^)
  ) else if not exist "!DST!" (
    echo   MISSING  !DST_REL!
  ) else (
    fc /b "!SRC!" "!DST!" >nul 2>&1
    if errorlevel 1 (
      echo   DRIFTED  !DST_REL!
      if "!OM!"=="1" echo   operator-managed file drifted; use --update to review this file.
    ) else (
      echo   OK       !DST_REL!
    )
  )
  endlocal & exit /b 0
)

if /I "!MODE!"=="--update" (
  if exist "!DST!\*" (
    for /f "tokens=*" %%T in ('powershell -NoProfile -Command "[datetime]::UtcNow.ToString(\"yyyyMMdd-HHmmss\")"') do set "_TS=%%T"
    move /Y "!DST!" "!DST!.dir.bak.!_TS!" >nul
    echo   BACKUPD !DST_REL!  (directory moved to .dir.bak.!_TS!^)
  )
  if "!OM!"=="1" (
    REM Operator-managed: only prompt if files actually differ
    if exist "!DST!" (
      fc /b "!SRC!" "!DST!" >nul 2>&1
      if not errorlevel 1 (
        echo   OK      !DST_REL!
        endlocal & exit /b 0
      )
    )
    set "_ANS="
    set /p "_ANS=  OPERATOR-MANAGED !DST_REL! differs from template. Overwrite? [y/N]: "
    if /I not "!_ANS!"=="y" (
      echo   SKIPPED !DST_REL!
      endlocal & exit /b 0
    )
  )
  if exist "!DST!" (
    for /f "tokens=*" %%T in ('powershell -NoProfile -Command "[datetime]::UtcNow.ToString(\"yyyyMMdd-HHmmss\")"') do set "_TS=%%T"
    copy /Y "!DST!" "!DST!.bak.!_TS!" >nul
  )
  for %%D in ("!DST!") do if not exist "%%~dpD" mkdir "%%~dpD"
  copy /Y "!SRC!" "!DST!" >nul
  echo   UPDATED !DST_REL!
  echo           -^> !DST!
  endlocal & exit /b 0
)

REM Default: first-deploy — copy only if absent
if exist "!DST!\*" (
  echo   BLOCKED !DST_REL!  (directory at file path; run --update to repair^)
) else if not exist "!DST!" (
  for %%D in ("!DST!") do if not exist "%%~dpD" mkdir "%%~dpD"
  copy /Y "!SRC!" "!DST!" >nul
  echo   COPIED  !DST_REL!
  echo           -^> !DST!
) else (
  echo   EXISTS  !DST_REL!  (skipped^)
)
endlocal & exit /b 0

REM ── Subroutine :pd ───────────────────────────────────────────────────────────
REM   Process one directory subtree.
REM   %1 = dir_rel (relative to both REPO_CFG and LIVE_CFG)

:pds
setlocal
set "DIR_REL=%~1"
set "SRC_DIR=%REPO_CFG%\!DIR_REL!"
set "DST_DIR=!LIVE_CFG!\!DIR_REL!"
if not exist "!SRC_DIR!" (
  echo   WARN: dir not found: !DIR_REL!
  endlocal & exit /b 0
)
set "_S=!SRC_DIR:\=/!"
set "_D=!DST_DIR:\=/!"
if /I "!_S!"=="!_D!" (
  echo   OK       !DIR_REL!  (local=repo^)
  endlocal & exit /b 0
)
if /I "!MODE!"=="--diff" (
  if not exist "!DST_DIR!" (echo   MISSING  !DIR_REL!) else echo   CHECK    !DIR_REL!  (run deployment to sync^)
  endlocal & exit /b 0
)
if not exist "!DST_DIR!" mkdir "!DST_DIR!"
if /I "!DIR_REL!"=="gateway\fallback" (
  if exist "!DST_DIR!\index.html" del /Q "!DST_DIR!\index.html"
  if exist "!DST_DIR!\maintenance.html" del /Q "!DST_DIR!\maintenance.html"
)
xcopy "!SRC_DIR!" "!DST_DIR!" /E /I /Y /Q >nul 2>&1
if errorlevel 1 (
  echo   FAIL     !DIR_REL!
  endlocal & exit /b 1
)
echo   SYNCED   !DIR_REL!
endlocal & exit /b 0

:pd
setlocal
set "DIR_REL=%~1"
set "SRC_DIR=%REPO_CFG%\!DIR_REL!"
set "DST_DIR=!LIVE_CFG!\!DIR_REL!"

if not exist "!SRC_DIR!" (
  echo   WARN: dir not found: !DIR_REL!
  endlocal & exit /b 0
)

set "_S=!SRC_DIR:\=/!"
set "_D=!DST_DIR:\=/!"
if /I "!_S!"=="!_D!" (
  echo   EXISTS   !DIR_REL!  (local=repo^)
  endlocal & exit /b 0
)

if /I "!MODE!"=="--diff" (
  echo   CHECK    !DIR_REL!  (run --update to sync^)
  endlocal & exit /b 0
)

if /I "!MODE!"=="--update" (
  xcopy "!SRC_DIR!" "!DST_DIR!" /E /I /Y /Q >nul 2>&1
  echo   UPDATED  !DIR_REL!
  endlocal & exit /b 0
)

REM Default: first-deploy
if not exist "!DST_DIR!" (
  xcopy "!SRC_DIR!" "!DST_DIR!" /E /I /Y /Q >nul 2>&1
  echo   COPIED   !DIR_REL!
) else (
  echo   EXISTS   !DIR_REL!  (skipped^)
)
endlocal & exit /b 0
