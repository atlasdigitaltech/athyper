@echo off
REM =======================================================================
REM Athyper — Database Seed Script (Windows)
REM Seeds the application database via the provisioning system.
REM
REM Usage:
REM   seed-db.bat                 # Full seed (DDL + standard + demo)
REM   seed-db.bat --no-demo       # Production-like (DDL + standard, no demo data)
REM   seed-db.bat --demo-only     # Demo data only (requires standard already seeded)
REM   seed-db.bat --reset         # Drop all schemas and re-seed from scratch
REM   seed-db.bat --status        # Show provision status
REM
REM Requires: Docker running with athyper-mesh-db-1 container
REM =======================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\.." >nul
set "MESH_DIR=%CD%"
popd >nul

pushd "%MESH_DIR%\..\framework\adapters\db" >nul
set "SEED_DIR=%CD%"
popd >nul

if exist "%MESH_DIR%\env\.env" (
    set "ENV_FILE=%MESH_DIR%\env\.env"
) else (
    set "ENV_FILE=%MESH_DIR%\env\.env.example"
)

echo.
echo === Athyper Database Seed ===

REM ---------------------------------------------------------------------------
REM Read DATABASE_ADMIN_URL from .env or environment
REM ---------------------------------------------------------------------------
if "%DATABASE_ADMIN_URL%"=="" (
    if exist "%ENV_FILE%" (
        for /f "tokens=2 delims==" %%a in ('findstr "DATABASE_ADMIN_URL" "%ENV_FILE%" 2^>nul') do (
            set "DATABASE_ADMIN_URL=%%a"
            set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:"=!"
        )
    )
)

if "%DATABASE_ADMIN_URL%"=="" (
    REM Try individual vars
    if "%DB_HOST%"=="" set "DB_HOST=localhost"
    if "%DB_PORT%"=="" set "DB_PORT=5432"
    if "%DB_NAME%"=="" set "DB_NAME=athyper_dev1"
    if "%DB_USER%"=="" set "DB_USER=athyperadmin"

    if "%DB_PASSWORD%"=="" (
        if exist "%ENV_FILE%" (
            for /f "tokens=2 delims==" %%a in ('findstr "DB_PASSWORD" "%ENV_FILE%" 2^>nul') do (
                set "DB_PASSWORD=%%a"
                set "DB_PASSWORD=!DB_PASSWORD:"=!"
            )
        )
    )

    if "%DB_PASSWORD%"=="" (
        echo Error: Cannot determine database credentials
        echo Set DATABASE_ADMIN_URL or DB_PASSWORD in mesh\env\.env
        echo Example: DATABASE_ADMIN_URL=postgres://user:pass@localhost:5432/athyper_dev1
        exit /b 1
    )

    set "DATABASE_ADMIN_URL=postgres://!DB_USER!:!DB_PASSWORD!@!DB_HOST!:!DB_PORT!/!DB_NAME!"
)

REM ---------------------------------------------------------------------------
REM Rewrite Docker-internal hostnames to localhost (this script runs on the host)
REM The .env file uses Docker service names (e.g. @db:5432) which only resolve
REM inside the Docker network. Replace them with localhost equivalents.
REM ---------------------------------------------------------------------------
set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:@db:=@localhost:!"
set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:@dbpool-apps:=@localhost:!"
set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:@dbpool-auth:=@localhost:!"

REM Show connection target (mask password)
for /f "tokens=1,2 delims=@" %%x in ("!DATABASE_ADMIN_URL!") do (
    echo Database: %%y
)
echo Seed directory: %SEED_DIR%
echo Arguments: %*
echo.

REM ---------------------------------------------------------------------------
REM Run the provisioner
REM ---------------------------------------------------------------------------
cd /d "%SEED_DIR%"
npx tsx src/seed/seed.ts %*

if errorlevel 1 (
    echo.
    echo Seed failed!
    exit /b 1
)

echo.
echo === Seed complete ===

endlocal
