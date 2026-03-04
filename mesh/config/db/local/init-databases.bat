@echo off
REM ========================================================
REM athyper Mesh - Database Initialization Script
REM Creates application and IAM databases with user grants
REM ========================================================
setlocal enabledelayedexpansion

echo === Creating athyperauth_dev1 database ===
psql -v ON_ERROR_STOP=1 --username "%POSTGRES_USER%" --dbname "%POSTGRES_DB%" -c "CREATE DATABASE athyperauth_dev1;"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to create athyperauth_dev1 database
    exit /b 1
)

echo === Granting privileges ===
psql -v ON_ERROR_STOP=1 --username "%POSTGRES_USER%" --dbname "%POSTGRES_DB%" -c "GRANT ALL PRIVILEGES ON DATABASE athyper_dev1 TO athyperadmin; GRANT ALL PRIVILEGES ON DATABASE athyperauth_dev1 TO athyperadmin;"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to grant privileges
    exit /b 1
)

echo === Database initialization complete ===
echo   - athyper_dev1 (application database)
echo   - athyperauth_dev1 (IAM/Keycloak database)

endlocal
