@echo off
REM =======================================================================
REM Athyper - Mesh Database Seed Script (Windows)
REM Location:
REM   stack\scripts\db\transaction\mesh\seed-db.bat
REM
REM Seeds the standalone athyper_mesh database.
REM
REM Usage:
REM   seed-db.bat                 Run Mesh DDL + shared refs + demo exchange seed
REM   seed-db.bat --ddl-only      Run only Mesh DDL
REM   seed-db.bat --seed-only     Run only shared ref + Mesh seed data
REM   seed-db.bat --status        Show checksum status, no data changes
REM   seed-db.bat --reset         Drop shared/mesh schemas, then re-run
REM                               #   --keep-shared also supported for dev workflows (preserve shared schema).
REM                               #   --skip-shared also supported to avoid reseeding shared DDL.
REM   seed-db.bat --drop-only     Drop shared/mesh schemas only
REM                               #   --keep-shared also supported for dev workflows (preserve shared schema).
REM                               #   --skip-shared also supported to avoid reseeding shared DDL.
REM   seed-db.bat --force         Re-run even when checksums match
REM   seed-db.bat --discover      Print the Mesh file set
REM
REM Environment:
REM   MESH_DATABASE_ADMIN_URL     Direct Postgres URL to athyper_mesh.
REM   DATABASE_ADMIN_URL          Fallback; database name is rewritten to athyper_mesh.
REM   DB_ADMIN_USER/PASSWORD      Final fallback for localhost:5432.
REM
REM DDL requires direct Postgres on 5432. PgBouncer ports 6432/6433 are rejected.
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
echo === Athyper Mesh Database Seed ===

set "DISCOVER_ONLY="
for %%A in (%*) do (
    if /I "%%~A"=="--discover" set "DISCOVER_ONLY=1"
)
if defined DISCOVER_ONLY (
    echo Database : ^(not required for --discover^)
    echo Server   : %SERVER_DIR%
    echo Arguments: %*
    echo.
    goto RUN_PROVISION
)

if "!MESH_DATABASE_ADMIN_URL!"=="" (
    if exist "%ENV_FILE%" (
        for /f "tokens=1* delims==" %%a in ('findstr /B /C:"MESH_DATABASE_ADMIN_URL=" "%ENV_FILE%" 2^>nul') do (
            set "MESH_DATABASE_ADMIN_URL=%%~b"
        )
    )
)

if "!MESH_DATABASE_ADMIN_URL!"=="" (
    if "!DATABASE_ADMIN_URL!"=="" (
        if exist "%ENV_FILE%" (
            for /f "tokens=1* delims==" %%a in ('findstr /B /C:"DATABASE_ADMIN_URL=" "%ENV_FILE%" 2^>nul') do (
                set "DATABASE_ADMIN_URL=%%~b"
            )
        )
    )
    if not "!DATABASE_ADMIN_URL!"=="" (
        set "MESH_DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:/athyper_neon=/athyper_mesh!"
        set "MESH_DATABASE_ADMIN_URL=!MESH_DATABASE_ADMIN_URL:/athyper_dev1=/athyper_mesh!"
    )
)

if "!MESH_DATABASE_ADMIN_URL!"=="" (
    if "!DB_ADMIN_USER!"=="" (
        if exist "%ENV_FILE%" (
            for /f "tokens=1* delims==" %%a in ('findstr /B /C:"DB_ADMIN_USER=" "%ENV_FILE%" 2^>nul') do (
                set "DB_ADMIN_USER=%%~b"
            )
        )
    )
    if "!DB_ADMIN_USER!"=="" set "DB_ADMIN_USER=athyperadmin"

    if "!DB_ADMIN_PASSWORD!"=="" (
        if exist "%ENV_FILE%" (
            for /f "tokens=1* delims==" %%a in ('findstr /B /C:"DB_ADMIN_PASSWORD=" "%ENV_FILE%" 2^>nul') do (
                set "DB_ADMIN_PASSWORD=%%~b"
            )
        )
    )

    if "!DB_ADMIN_PASSWORD!"=="" (
        echo Error: Cannot determine Mesh database credentials.
        echo Set MESH_DATABASE_ADMIN_URL or DB_ADMIN_PASSWORD in stack\env\.env
        exit /b 1
    )

    if "%DB_HOST%"=="" set "DB_HOST=localhost"
    if "%DB_PORT%"=="" set "DB_PORT=5432"
    set "MESH_DATABASE_ADMIN_URL=postgresql://!DB_ADMIN_USER!:!DB_ADMIN_PASSWORD!@!DB_HOST!:!DB_PORT!/athyper_mesh?sslmode=disable"
)

set "MESH_DATABASE_ADMIN_URL=!MESH_DATABASE_ADMIN_URL:@db:=@localhost:!"
set "MESH_DATABASE_ADMIN_URL=!MESH_DATABASE_ADMIN_URL:@athyper-db-1:=@localhost:!"
set "MESH_DATABASE_ADMIN_URL=!MESH_DATABASE_ADMIN_URL:@%COMPOSE_PROJECT_NAME%-db-1:=@localhost:!"

echo !MESH_DATABASE_ADMIN_URL! | findstr /C:":6432" /C:":6433" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo ERROR: MESH_DATABASE_ADMIN_URL appears to use a PgBouncer port ^(:6432 or :6433^).
    echo        Mesh DDL requires direct Postgres ^(port 5432^).
    exit /b 1
)

for /f "tokens=1,2 delims=@" %%x in ("!MESH_DATABASE_ADMIN_URL!") do (
    echo Database : %%y
)
echo Server   : %SERVER_DIR%
echo Arguments: %*
echo.

:RUN_PROVISION
set "MIGRATE_ARGS=%*"
if "!MIGRATE_ARGS!"=="" set "MIGRATE_ARGS=--all"

cd /d "%SERVER_DIR%"
set "MESH_DATABASE_ADMIN_URL=!MESH_DATABASE_ADMIN_URL!"
npx tsx db/scripts/provision-mesh.ts !MIGRATE_ARGS!

if errorlevel 1 (
    echo.
    echo Mesh seed failed!
    exit /b 1
)

echo.
echo === Mesh seed complete ===

endlocal
