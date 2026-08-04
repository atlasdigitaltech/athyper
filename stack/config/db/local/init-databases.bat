@echo off
REM ========================================================
REM athyper Stack - Database Initialization Script
REM Creates all canonical databases with user grants.
REM
REM Frozen DB registry:
REM   athyper_platform, athyper_neon, athyper_mesh, athyper_iam,
REM   athyper_health, athyper_errors, athyper_secrets, athyper_analytics
REM ========================================================
setlocal enabledelayedexpansion

REM Idempotent create — check pg_database before issuing CREATE DATABASE
for %%D in (athyper_platform athyper_mesh athyper_iam athyper_health athyper_errors athyper_secrets athyper_analytics) do (
    set "DB_EXISTS="
    for /f "usebackq" %%E in (`psql -v ON_ERROR_STOP=1 --username "%POSTGRES_USER%" --dbname "%POSTGRES_DB%" -tAc "SELECT 1 FROM pg_database WHERE datname='%%D'" 2^>nul`) do set "DB_EXISTS=%%E"
    if "!DB_EXISTS!"=="1" (
        echo === Database %%D already exists - skipping ===
    ) else (
        echo === Creating %%D database ===
        psql -v ON_ERROR_STOP=1 --username "%POSTGRES_USER%" --dbname "%POSTGRES_DB%" -c "CREATE DATABASE \"%%D\";"
        if errorlevel 1 (
            echo ERROR: Failed to create %%D
            exit /b 1
        )
    )
)

echo === Granting privileges (idempotent) ===
psql -v ON_ERROR_STOP=1 --username "%POSTGRES_USER%" --dbname "%POSTGRES_DB%" -c "GRANT ALL PRIVILEGES ON DATABASE athyper_platform TO %POSTGRES_USER%; GRANT ALL PRIVILEGES ON DATABASE athyper_neon TO %POSTGRES_USER%; GRANT ALL PRIVILEGES ON DATABASE athyper_mesh TO %POSTGRES_USER%; GRANT ALL PRIVILEGES ON DATABASE athyper_iam TO %POSTGRES_USER%; GRANT ALL PRIVILEGES ON DATABASE athyper_health TO %POSTGRES_USER%; GRANT ALL PRIVILEGES ON DATABASE athyper_errors TO %POSTGRES_USER%; GRANT ALL PRIVILEGES ON DATABASE athyper_secrets TO %POSTGRES_USER%; GRANT ALL PRIVILEGES ON DATABASE athyper_analytics TO %POSTGRES_USER%;"
if %ERRORLEVEL% neq 0 (echo ERROR: Failed to grant privileges & exit /b 1)

echo === Database initialization complete ===
echo   - athyper_platform  (platform/control plane)
echo   - athyper_neon      (app runtime)
echo   - athyper_mesh      (future collaboration)
echo   - athyper_iam       (Keycloak IAM)
echo   - athyper_health    (Healthchecks)
echo   - athyper_errors    (GlitchTip)
echo   - athyper_secrets   (Infisical)
echo   - athyper_analytics (Metabase)

endlocal
