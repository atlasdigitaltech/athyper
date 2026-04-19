@echo off
REM =======================================================================
REM Athyper — Database Seed Script (Windows)
REM Location:
REM   stack\scripts\db\transaction\neon\seed-db.bat
REM Seeds the application database via the provisioning system.
REM
REM Usage:
REM   seed-db.bat                 # Phase 1+2+3 — DDL + 010_system + 020_blueprint
REM                               #               + 030_tenant + 040_prod_tenant
REM   seed-db.bat --ddl-only      # Phase 1 only — schemas/tables, no seed data
REM   seed-db.bat --system-only   # Phase 2 only — 010_system (system/lookup seed only)
REM                               #               DDL must already exist
REM   seed-db.bat --no-demo       # Phase 1+2   — DDL + 010_system (system/lookup seed)
REM                               #               020_blueprint / 030_tenant / 040_prod_tenant skipped
REM   seed-db.bat --demo-only     # Phase 1+2+3 — all phases; checksum tracking skips already-done files
REM                               #               safe to run on any DB state (fresh or partial)
REM   seed-db.bat --reset         # DROP all schemas + schema_provisions, then re-seed Phase 1+2+3
REM   seed-db.bat --drop-only     # DROP all schemas + schema_provisions only (no re-seed)
REM   seed-db.bat --status        # Read-only report — shows OK / PENDING / CHANGED per file
REM   seed-db.bat --force         # Re-run all phases even if checksum unchanged
REM
REM Phase layout (migrate.ts):
REM   Phase 1 — DDL        : all dirs under server/db/sql/ except 900_seed_data/
REM   Phase 2 — System     : 900_seed_data/010_system/
REM   Phase 3 — Blueprint  : 900_seed_data/020_blueprint/
REM             Tenant     : 900_seed_data/030_tenant/
REM             Prod Tenant: 900_seed_data/040_prod_tenant/
REM
REM Requires: Docker running with athyper-stack-db-1 container
REM =======================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\..\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

pushd "%STACK_DIR%\..\server" >nul 2>&1
if errorlevel 1 (
    echo ERROR: server directory not found at "%STACK_DIR%\..\server"
    echo Ensure the full repo is cloned ^(stack\ and server\ must be siblings^).
    exit /b 1
)
set "SERVER_DIR=%CD%"
popd >nul

if exist "%STACK_DIR%\env\.env" (
    set "ENV_FILE=%STACK_DIR%\env\.env"
) else (
    set "ENV_FILE=%STACK_DIR%\env\.env.example"
)

echo.
echo === Athyper Database Seed ===

REM ---------------------------------------------------------------------------
REM Read DATABASE_ADMIN_URL from .env or environment
REM ---------------------------------------------------------------------------
if "%DATABASE_ADMIN_URL%"=="" (
    if exist "%ENV_FILE%" (
        for /f "tokens=1* delims==" %%a in ('findstr "^DATABASE_ADMIN_URL=" "%ENV_FILE%" 2^>nul') do (
            set "DATABASE_ADMIN_URL=%%b"
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
            for /f "tokens=1* delims==" %%a in ('findstr "^DB_PASSWORD=" "%ENV_FILE%" 2^>nul') do (
                set "DB_PASSWORD=%%b"
                set "DB_PASSWORD=!DB_PASSWORD:"=!"
            )
        )
    )

    if "%DB_PASSWORD%"=="" (
        echo Error: Cannot determine database credentials
        echo Set DATABASE_ADMIN_URL or DB_PASSWORD in stack\env\.env
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
set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:@dbpool-session:=@localhost:!"

REM Show connection target (mask password)
for /f "tokens=1,2 delims=@" %%x in ("!DATABASE_ADMIN_URL!") do (
    echo Database: %%y
)
echo Server directory: %SERVER_DIR%
echo Arguments: %*
echo.

REM ---------------------------------------------------------------------------
REM Pass args directly to migrate.ts — it understands all flags natively:
REM   (no args) / --all / --ddl-only / --system-only / --no-demo / --demo-only
REM   --reset / --drop-only / --status / --force / --phase=N
REM ---------------------------------------------------------------------------
set "MIGRATE_ARGS=%*"
if "!MIGRATE_ARGS!"=="" set "MIGRATE_ARGS=--all"

REM ---------------------------------------------------------------------------
REM Run the provisioner (cd to server/ so node_modules and tsconfig resolve correctly)
REM ---------------------------------------------------------------------------
cd /d "%SERVER_DIR%"
npx tsx db/seed/migrate.ts !MIGRATE_ARGS!

if errorlevel 1 (
    echo.
    echo Seed failed!
    exit /b 1
)

echo.
echo === Seed complete ===

endlocal
