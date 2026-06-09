@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM athyper Stack - VALIDATE ENVIRONMENT - Windows Batch
REM Location:
REM   stack\scripts\setup\validate-env.bat
REM Usage:
REM   validate-env.bat              (auto-detects .env)
REM   validate-env.bat C:\path\.env (explicit env file)
REM
REM Validates that all required environment variables are set and
REM consistent before docker compose up. Called automatically by
REM stack\scripts\stack-profile\up.bat. Can also be run standalone.
REM
REM Exit codes:
REM   0 - all checks pass
REM   1 - fatal: missing required vars (stack will not start)
REM   2 - warnings only (non-blocking, informational)
REM ============================================================

goto :main

REM ----------------------------
REM Subroutine: require_var
REM ----------------------------
:require_var
set "_val=!ENV_%~1!"
set "_rv_ok=1"
if "!_val!"=="" (
  echo   FAIL  %~1 is not set
  set /a ERRORS+=1
  set "_rv_ok=0"
)
if "!_rv_ok!"=="1" if "!_val:~0,2!"=="${" if "!_val:~-1!"=="}" (
  echo   FAIL  %~1 = !_val! ^(placeholder not resolved - inject from secrets manager^)
  set /a ERRORS+=1
)
goto :eof

REM ----------------------------
REM Subroutine: require_file_path  %1=path  %2=label
REM ----------------------------
:require_file_path
set "_rf_path=%~1"
set "_rf_label=%~2"
if "!_rf_path!"=="" (
  echo   FAIL  !_rf_label! path is empty
  set /a ERRORS+=1
  goto :eof
)
if exist "!_rf_path!\*" (
  echo   FAIL  !_rf_label! is a directory, expected a file: !_rf_path!
  echo         Run stack\scripts\setup\setup-config.bat !ENVIRONMENT! --update to repair live config.
  set /a ERRORS+=1
  goto :eof
)
if not exist "!_rf_path!" (
  echo   FAIL  !_rf_label! not found: !_rf_path!
  echo         Run stack\scripts\setup\setup-config.bat !ENVIRONMENT! --update to deploy live config.
  set /a ERRORS+=1
)
goto :eof

REM ----------------------------
REM Subroutine: parse_env  %1=env-file-path
REM Isolates nested for/f loop in its own call frame so that CMD's
REM compound-block state does not bleed into subsequent call :label
REM lookups in the main script body.
REM ----------------------------
:parse_env
for /f "usebackq tokens=1,* delims==" %%A in ("%~1") do (
  set "K=%%A"
  set "V=%%B"
  for /f "tokens=* delims= " %%K in ("!K!") do set "K=%%K"
  if not "!K!"=="" if /I not "!K:~0,1!"=="#" (
    set "V=!V:"=!"
    for /f "tokens=1 delims=#" %%C in ("!V!") do set "V=%%C"
    for /f "tokens=* delims= " %%V in ("!V!") do set "V=%%V"
    set "ENV_!K!=!V!"
  )
)
goto :eof

:main
REM ----------------------------
REM Resolve paths
REM ----------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

set "ENV_DIR=%STACK_DIR%\env"
if "%~1"=="" (
  set "ENV_FILE=%ENV_DIR%\.env"
) else (
  set "ENV_FILE=%~1"
)

if not exist "%ENV_FILE%" (
  echo FATAL: env file not found: %ENV_FILE%
  echo Run setup-env.bat first or copy an .env.example template.
  exit /b 1
)

REM ----------------------------
REM Parse .env into ENV_<KEY> variables
REM ----------------------------
set "ERRORS=0"
set "WARNINGS=0"
set "ENVIRONMENT="

call :parse_env "%ENV_FILE%"

set "ENVIRONMENT=!ENV_ENVIRONMENT!"
REM Strip trailing spaces from ENVIRONMENT (for /f trims leading only)
:env_trim_loop
if not "!ENVIRONMENT!"=="" if "!ENVIRONMENT:~-1!"==" " set "ENVIRONMENT=!ENVIRONMENT:~0,-1!" & goto :env_trim_loop

echo.
echo ==========================================
echo   athyper Stack - Environment Validation
echo   File: %ENV_FILE%
echo   Environment: !ENVIRONMENT!
echo ==========================================
echo.

REM ----------------------------
REM 1. Core identity
REM ----------------------------
echo [1/6] Core identity...
call :require_var ENVIRONMENT
call :require_var COMPOSE_PROJECT_NAME

REM ----------------------------
REM 2. Required variables (all environments)
REM ----------------------------
echo [2/6] Required variables...
call :require_var DATABASE_URL
call :require_var REDIS_URL
call :require_var PUBLIC_BASE_URL
call :require_var PUBLIC_WEB_URL
call :require_var APPS_ATHYPER_WEB_HOST
call :require_var APPS_ATHYPER_NEON_HOST
call :require_var APPS_ATHYPER_MESH_HOST
call :require_var APPS_ATHYPER_ADMIN_HOST
call :require_var APPS_ATHYPER_API_HOST
call :require_var APPS_ATHYPER_WEB_UPSTREAM_URL
call :require_var APPS_ATHYPER_NEON_UPSTREAM_URL
call :require_var APPS_ATHYPER_MESH_UPSTREAM_URL
call :require_var APPS_ATHYPER_ADMIN_UPSTREAM_URL
call :require_var GATEWAY_HOST
call :require_var IAM_HOST
call :require_var ALERTMANAGER_HOST
call :require_var IAM_ISSUER_URL
call :require_var ATHYPER_KERNEL_CONFIG_PATH

set "LIVE_CONFIG_ROOT=!ENV_ATHYPER_CONFIG_ROOT!"
if "!LIVE_CONFIG_ROOT!"=="" set "LIVE_CONFIG_ROOT=!ENV_ATHYPER_CONFIG!"
if "!LIVE_CONFIG_ROOT!"=="" set "LIVE_CONFIG_ROOT=%STACK_DIR%\config"
echo   Live config root: !LIVE_CONFIG_ROOT!
call :require_file_path "!LIVE_CONFIG_ROOT!\telemetry\alertmanager\config.yml.tpl" "Alertmanager live template"
call :require_file_path "!LIVE_CONFIG_ROOT!\telemetry\metrics\config.yml" "Prometheus live config"
call :require_file_path "!LIVE_CONFIG_ROOT!\gateway\dynamic\athyper.workbench.yml" "Gateway workbench live config"
call :require_file_path "!LIVE_CONFIG_ROOT!\!ENV_ATHYPER_KERNEL_CONFIG_PATH!" "Kernel live config"

REM ----------------------------
REM 3. Non-local secrets (must not be missing or placeholders)
REM ----------------------------
echo [3/6] Secrets check...
if /I "!ENVIRONMENT!"=="local" goto :sec3_local
  echo   Checking non-local secrets ^(must not be missing or placeholders^)...
  call :require_var CREDENTIAL_MASTER_KEY
  call :require_var DB_ADMIN_PASSWORD
  call :require_var DB_HOST
  call :require_var DBPOOL_APPS_PASSWORD
  call :require_var DBPOOL_SESSION_PASSWORD
  call :require_var IAM_ADMIN_PASSWORD
  call :require_var IAM_CLIENT_SECRET
  call :require_var ADMIN_WEB_CLIENT_SECRET
  call :require_var ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET
  call :require_var NEON_SVC_BFF_CLIENT_SECRET
  call :require_var AUTH_DISCOVERY_SHARED_SECRET
  call :require_var VAPID_SUBJECT
  call :require_var VAPID_PUBLIC_KEY
  call :require_var VAPID_PRIVATE_KEY
  call :require_var MEMORYCACHE_PASSWORD
  call :require_var REDIS_EXPORTER_PASSWORD
  call :require_var REDIS_GLITCHTIP_PASSWORD
  call :require_var REDIS_INFISICAL_PASSWORD
  call :require_var REDIS_ADMIN_PASSWORD
  call :require_var S3_ACCESS_KEY
  call :require_var S3_SECRET_KEY
  call :require_var RENDERER_INTERNAL_TOKEN
  call :require_var GATEWAY_DASHBOARD_HTPASSWD
  call :require_var INFISICAL_ENCRYPTION_KEY
  call :require_var INFISICAL_AUTH_SECRET
  call :require_var TELEMETRY_ADMIN_USER
  call :require_var TELEMETRY_ADMIN_PASSWORD
  call :require_var ALERTMANAGER_SMTP_SMARTHOST
  call :require_var ALERTMANAGER_SMTP_FROM
  call :require_var ALERTMANAGER_SMTP_REQUIRE_TLS
  call :require_var ALERTMANAGER_PLATFORM_EMAIL
  call :require_var ALERTMANAGER_CRITICAL_EMAIL
  call :require_var ALERTMANAGER_FINANCE_EMAIL
  call :require_var ALERTMANAGER_COMPLIANCE_EMAIL
  call :require_var ALERTMANAGER_SECURITY_EMAIL
  call :require_var NEON_ALLOWED_HOSTS
  call :require_var NEON_GATEWAY_ORIGIN
  call :require_var MESH_ALLOWED_HOSTS
  call :require_var MESH_GATEWAY_ORIGIN
  call :require_var ADMIN_ALLOWED_HOSTS
  call :require_var ADMIN_GATEWAY_ORIGIN
  call :require_var APP_S3_ACCESS_KEY
  call :require_var APP_S3_SECRET_KEY
  call :require_var BACKUP_S3_ACCESS_KEY
  call :require_var BACKUP_S3_SECRET_KEY
  goto :sec3_done
:sec3_local
  echo   Skipping ^(ENVIRONMENT=local^)
:sec3_done

REM ----------------------------
REM Redis ACL render
REM ----------------------------
echo [3b/6] Redis ACL render...
where node >nul 2>&1
if errorlevel 1 (
  echo   FAIL  node is required to render Redis ACL hashes
  set /a ERRORS+=1
) else (
  node "%STACK_DIR%\..\tools\scripts\render-redis-acl.cjs" --env-file "%ENV_FILE%" --stack-dir "%STACK_DIR%"
  if errorlevel 1 (
    set /a ERRORS+=1
  )
)

REM ----------------------------
REM 4. Kernel config hostname parity
REM    Note: full JSON parsing not available in batch without jq.
REM    A partial check is performed via findstr for the three URL keys.
REM ----------------------------
echo [4/6] Kernel config hostname parity...
set "KERNEL_CONFIG_PATH=!ENV_ATHYPER_KERNEL_CONFIG_PATH!"
if not "!KERNEL_CONFIG_PATH!"=="" (
  set "KERNEL_FILE=!LIVE_CONFIG_ROOT!\!KERNEL_CONFIG_PATH!"
  if exist "!KERNEL_FILE!" (
    set "ENV_BASE_URL=!ENV_PUBLIC_BASE_URL!"
    set "ENV_ISSUER_URL=!ENV_IAM_ISSUER_URL!"
    REM Extract publicBaseUrl value from JSON (simple findstr — matches if value appears anywhere on the line)
    set "KC_BASE_URL_LINE="
    for /f "usebackq tokens=*" %%L in (`findstr /C:"publicBaseUrl" "!KERNEL_FILE!" 2^>nul`) do set "KC_BASE_URL_LINE=%%L"
    if not "!KC_BASE_URL_LINE!"=="" (
      echo !KC_BASE_URL_LINE! | findstr /C:"!ENV_BASE_URL!" >nul 2>&1
      if errorlevel 1 (
        echo   WARN  publicBaseUrl in kernel config may differ from PUBLIC_BASE_URL=!ENV_BASE_URL!
        echo         Verify !KERNEL_FILE! manually (batch JSON parse is limited^)
        set /a WARNINGS+=1
      )
    )
    set "KC_ISSUER_LINE="
    for /f "usebackq tokens=*" %%L in (`findstr /C:"issuerUrl" "!KERNEL_FILE!" 2^>nul`) do set "KC_ISSUER_LINE=%%L"
    if not "!KC_ISSUER_LINE!"=="" (
      echo !KC_ISSUER_LINE! | findstr /C:"!ENV_ISSUER_URL!" >nul 2>&1
      if errorlevel 1 (
        echo   WARN  issuerUrl in kernel config may differ from IAM_ISSUER_URL=!ENV_ISSUER_URL!
        echo         Verify !KERNEL_FILE! manually (batch JSON parse is limited^)
        set /a WARNINGS+=1
      )
    )
    if !WARNINGS! EQU 0 echo   OK
  ) else (
    echo   WARN  Kernel config not found: !KERNEL_FILE!
    set /a WARNINGS+=1
  )
) else (
  echo   WARN  ATHYPER_KERNEL_CONFIG_PATH not set - skipping kernel parity check
  set /a WARNINGS+=1
)

REM ----------------------------
REM 5. Security checks (non-local only)
REM ----------------------------
echo [5/6] Security checks...
if /I "!ENVIRONMENT!"=="local" goto :sec5_local

  REM CREDENTIAL_MASTER_KEY: length >= 32
  set "CMK=!ENV_CREDENTIAL_MASTER_KEY!"
  if not "!CMK!"=="" if "!CMK:~31!"=="" (
    echo   FAIL  CREDENTIAL_MASTER_KEY is too short ^(need ^>= 32 chars^)
    set /a ERRORS+=1
  )

  REM NODE_TLS_REJECT_UNAUTHORIZED must be 1 in non-local
  if /I not "!ENV_NODE_TLS_REJECT_UNAUTHORIZED!"=="1" (
    echo   FAIL  NODE_TLS_REJECT_UNAUTHORIZED=!ENV_NODE_TLS_REJECT_UNAUTHORIZED! ^(must be 1 in !ENVIRONMENT!^)
    set /a ERRORS+=1
  )

  REM NODE_ENV must be production in non-local
  if /I not "!ENV_NODE_ENV!"=="production" (
    echo   FAIL  NODE_ENV=!ENV_NODE_ENV! ^(must be 'production' in !ENVIRONMENT!^)
    set /a ERRORS+=1
  )

  REM AUTH_DEBUG_EXPOSE_TOKENS must not be true in non-local
  if /I "!ENV_AUTH_DEBUG_EXPOSE_TOKENS!"=="true" (
    echo   FAIL  AUTH_DEBUG_EXPOSE_TOKENS=true in !ENVIRONMENT!
    set /a ERRORS+=1
  )

  REM Dev passwords must not appear in non-local
  for %%V in (DB_ADMIN_PASSWORD MEMORYCACHE_PASSWORD REDIS_EXPORTER_PASSWORD REDIS_GLITCHTIP_PASSWORD REDIS_INFISICAL_PASSWORD REDIS_ADMIN_PASSWORD IAM_ADMIN_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY IAM_CLIENT_SECRET ADMIN_WEB_CLIENT_SECRET ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET NEON_SVC_BFF_CLIENT_SECRET VAPID_PRIVATE_KEY ALERTMANAGER_SMTP_AUTH_PASSWORD) do (
    if "!ENV_%%V!"=="athyperadmin" (
      echo   FAIL  %%V = 'athyperadmin' in !ENVIRONMENT! ^(dev password in non-local^)
      set /a ERRORS+=1
    )
  )

  REM Scoped S3 credentials must not be dev defaults
  for %%V in (APP_S3_ACCESS_KEY APP_S3_SECRET_KEY BACKUP_S3_ACCESS_KEY BACKUP_S3_SECRET_KEY) do (
    if "!ENV_%%V!"=="athyperadmin" (
      echo   FAIL  %%V = 'athyperadmin' in !ENVIRONMENT! ^(dev credential in non-local; inject from secrets manager^)
      set /a ERRORS+=1
    )
  )

  echo !ENV_ALERTMANAGER_SMTP_SMARTHOST! | findstr /B /C:"mailtrap:" >nul
  if not errorlevel 1 (
    echo   FAIL  ALERTMANAGER_SMTP_SMARTHOST=!ENV_ALERTMANAGER_SMTP_SMARTHOST! in !ENVIRONMENT! ^(mailtrap is local-only^)
    set /a ERRORS+=1
  )
  if /I not "!ENV_ALERTMANAGER_SMTP_REQUIRE_TLS!"=="true" (
    echo   FAIL  ALERTMANAGER_SMTP_REQUIRE_TLS=!ENV_ALERTMANAGER_SMTP_REQUIRE_TLS! in !ENVIRONMENT! ^(must be true outside local^)
    set /a ERRORS+=1
  )

  REM BACKUP_S3_BUCKET must be configured for the daily pg_dump backup
  if "!ENV_BACKUP_S3_BUCKET!"=="" (
    echo   FAIL  BACKUP_S3_BUCKET is not set in !ENVIRONMENT!
    echo         Required for the daily pg_dump backup ^(control.cron_schedule: platform-backup-daily^).
    echo         Create a dedicated bucket in your object store and set this variable.
    set /a ERRORS+=1
  )

  REM P2.4 - Traefik plane upstreams must NOT use host.docker.internal outside local
  for %%U in (APPS_ATHYPER_WEB_UPSTREAM_URL APPS_ATHYPER_NEON_UPSTREAM_URL APPS_ATHYPER_MESH_UPSTREAM_URL APPS_ATHYPER_ADMIN_UPSTREAM_URL) do (
    echo !ENV_%%U! | findstr /C:"host.docker.internal" >nul
    if not errorlevel 1 (
      echo   FAIL  %%U=!ENV_%%U! in !ENVIRONMENT! ^(host.docker.internal is dev-only^)
      set /a ERRORS+=1
    )
  )

  REM P2.4 - RFC 5737 TEST-NET CIDRs are deploy-blocker fail-safes in plane templates
  set "WB_FILE=%STACK_DIR%\config\gateway\dynamic\athyper.workbench.yml"
  if exist "!WB_FILE!" (
    findstr /R /C:"\"192\.0\.2\.0/24\"" /C:"\"198\.51\.100\.0/24\"" /C:"\"203\.0\.113\.0/24\"" "!WB_FILE!" >nul
    if not errorlevel 1 (
      echo   FAIL  !WB_FILE! contains RFC 5737 TEST-NET CIDR in !ENVIRONMENT!
      echo         Deploy the env-specific template from
      echo         stack\config\gateway\environments\ and replace the allowlist
      echo         with real VPN CIDR^(s^) before bringing the stack up.
      set /a ERRORS+=1
    )
  )

  REM P2.10 - Tempo storage backend must be s3 outside local
  if /I "!ENV_TEMPO_STORAGE_BACKEND!"=="s3" goto :tempo_s3_ok
    echo   FAIL  TEMPO_STORAGE_BACKEND=!ENV_TEMPO_STORAGE_BACKEND! in !ENVIRONMENT! ^(must be 's3' outside local^)
    set /a ERRORS+=1
    goto :tempo_done
:tempo_s3_ok
    call :require_var TEMPO_S3_BUCKET
    call :require_var TEMPO_S3_ENDPOINT
    call :require_var TEMPO_S3_ACCESS_KEY
    call :require_var TEMPO_S3_SECRET_KEY
:tempo_done

  REM I-21 - Infisical encryption key: format + default rejection
  set "IEK=!ENV_INFISICAL_ENCRYPTION_KEY!"
  if "!IEK!"=="6c1fe4e49cb45b9115d42b127bc5db17" (
    echo   FAIL  INFISICAL_ENCRYPTION_KEY = local default in !ENVIRONMENT!
    echo         Rotate: openssl rand -hex 16
    set /a ERRORS+=1
  )
  if not "!IEK!"=="6c1fe4e49cb45b9115d42b127bc5db17" if not "!IEK!"=="" if "!IEK:~31!"=="" (
    echo   FAIL  INFISICAL_ENCRYPTION_KEY too short ^(need 32-char hex string^)
    echo         Generate: openssl rand -hex 16
    set /a ERRORS+=1
  )
  if not "!IEK!"=="6c1fe4e49cb45b9115d42b127bc5db17" if not "!IEK!"=="" if not "!IEK:~32!"=="" (
    echo   FAIL  INFISICAL_ENCRYPTION_KEY too long ^(need 32-char hex string^)
    echo         Generate: openssl rand -hex 16
    set /a ERRORS+=1
  )

  REM I-21 - Infisical auth secret default rejection
  echo !ENV_INFISICAL_AUTH_SECRET! | findstr /C:"change-me" >nul
  if not errorlevel 1 (
    echo   FAIL  INFISICAL_AUTH_SECRET = local default in !ENVIRONMENT!
    echo         Rotate: openssl rand -base64 32
    set /a ERRORS+=1
  )
  if "!ENV_INFISICAL_AUTH_SECRET:~0,12!"=="athyperadmin" (
    echo   FAIL  INFISICAL_AUTH_SECRET = local default in !ENVIRONMENT!
    echo         Rotate: openssl rand -base64 32
    set /a ERRORS+=1
  )

  REM I-18 - cronwatch secret key default rejection
  echo !ENV_CRONWATCH_SECRET_KEY! | findstr /C:"change-me" >nul
  if not errorlevel 1 (
    echo   FAIL  CRONWATCH_SECRET_KEY = local default in !ENVIRONMENT! ^(rotate to a random string^)
    set /a ERRORS+=1
  )
  if "!ENV_CRONWATCH_SECRET_KEY:~0,12!"=="athyperadmin" (
    echo   FAIL  CRONWATCH_SECRET_KEY = local default in !ENVIRONMENT! ^(rotate to a random string^)
    set /a ERRORS+=1
  )

  REM Meilisearch master key default rejection
  echo !ENV_MEILI_MASTER_KEY! | findstr /C:"change-me" >nul
  if not errorlevel 1 (
    echo   FAIL  MEILI_MASTER_KEY = local default in !ENVIRONMENT! ^(rotate to a random string^)
    set /a ERRORS+=1
  )
  if "!ENV_MEILI_MASTER_KEY:~0,12!"=="athyperadmin" (
    echo   FAIL  MEILI_MASTER_KEY = local default in !ENVIRONMENT! ^(rotate to a random string^)
    set /a ERRORS+=1
  )

  REM I-03 - Traefik dashboard default htpasswd hash rejection
  echo !ENV_GATEWAY_DASHBOARD_HTPASSWD! | findstr /C:"NVCnGffZfFqIT" >nul
  if not errorlevel 1 (
    echo   FAIL  GATEWAY_DASHBOARD_HTPASSWD = local default in !ENVIRONMENT!
    echo         Rotate: htpasswd -nbB ^<user^> ^<newpassword^>
    set /a ERRORS+=1
  )

  REM I-20 - ClamAV: freshclam daemon must NOT be disabled outside local dev
  if /I "!ENV_FRESHCLAM_NO_DAEMON!"=="true" (
    echo   FAIL  FRESHCLAM_NO_DAEMON=true in !ENVIRONMENT! ^(stale virus definitions -- unset or set to 'false'^)
    set /a ERRORS+=1
  )

  REM Track B4 - analytics profile (analyticsboard) governance gate
  set "STACK_PROFILE_VAL=!ENV_STACK_PROFILE!"
  if "!STACK_PROFILE_VAL!"=="" set "STACK_PROFILE_VAL=core"
  echo .!STACK_PROFILE_VAL!. | findstr /C:"analytics" >nul
  if not errorlevel 1 (
    if /I not "!ENV_ANALYTICSBOARD_GOVERNANCE_APPROVED!"=="approved" (
      echo   FAIL  STACK_PROFILE=!STACK_PROFILE_VAL! includes 'analytics' but ANALYTICSBOARD_GOVERNANCE_APPROVED='!ENV_ANALYTICSBOARD_GOVERNANCE_APPROVED!'
      echo         Read stack/compose/analytics/README.md, complete the four
      echo         governance bullets, then set ANALYTICSBOARD_GOVERNANCE_APPROVED=approved.
      set /a ERRORS+=1
    )
    set "MBDB=!ENV_MB_DB_TYPE!"
    if "!MBDB!"=="" set "MBDB=h2"
    if /I not "!MBDB!"=="postgres" (
      echo   FAIL  MB_DB_TYPE=!MBDB! in !ENVIRONMENT! ^(analytics profile requires postgres app DB; H2 is local-only^)
      set /a ERRORS+=1
    )
    if "!ENV_MB_DB_CONNECTION_URI!"=="" (
      echo   FAIL  MB_DB_CONNECTION_URI is not set ^(required when analytics profile is enabled^)
      set /a ERRORS+=1
    )
  )

  if !ERRORS! EQU 0 echo   OK
  goto :sec5_done

:sec5_local
  echo   OK ^(local - skipping production security checks^)
:sec5_done

REM ----------------------------
REM 6. Recommendations
REM ----------------------------
echo [6/6] Recommendations...

REM GATEWAY_DASHBOARD_HTPASSWD: warn if absent in local
if /I "!ENVIRONMENT!"=="local" (
  if "!ENV_GATEWAY_DASHBOARD_HTPASSWD!"=="" (
    echo   WARN  GATEWAY_DASHBOARD_HTPASSWD not set - Traefik dashboard auth not configured
    set /a WARNINGS+=1
  )
)

REM CREDENTIAL_MASTER_KEY: warn if absent in local (optional in dev)
if /I "!ENVIRONMENT!"=="local" (
  if "!ENV_CREDENTIAL_MASTER_KEY!"=="" (
    echo   WARN  CREDENTIAL_MASTER_KEY not set - credential encryption disabled ^(optional in local dev^)
    set /a WARNINGS+=1
  )
)

if !WARNINGS! EQU 0 if !ERRORS! EQU 0 echo   OK

REM ----------------------------
REM Summary
REM ----------------------------
echo.
echo ==========================================
if !ERRORS! GTR 0 goto :summary_failed
if !WARNINGS! GTR 0 goto :summary_warned
  echo   RESULT: PASSED - all checks OK
  echo ==========================================
  echo.
  exit /b 0
:summary_warned
  echo   RESULT: PASSED with !WARNINGS! warning^(s^)
  echo   Stack will start, but review the warnings above.
  echo ==========================================
  echo.
  exit /b 0
:summary_failed
  echo   RESULT: FAILED - !ERRORS! error^(s^), !WARNINGS! warning^(s^)
  echo   Fix the errors above before starting the stack.
  echo ==========================================
  echo.
  exit /b 1
