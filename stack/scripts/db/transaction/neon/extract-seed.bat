@echo off
REM =======================================================================
REM Athyper — Seed Extractor (Windows)
REM Location:
REM   stack\scripts\db\transaction\neon\extract-seed.bat
REM
REM Rebuilds server\db\seed from the live database.
REM Run AFTER a successful seed-db.bat --reset --all and AFTER renaming
REM seed to seed_backup.
REM
REM Classification:
REM   SIMPLE  files (pure INSERT INTO)  — re-extracted via pg_dump
REM   COMPLEX files (DO blocks, $…$)    — copied from seed_backup
REM
REM Usage:
REM   extract-seed.bat                  # full rebuild
REM   extract-seed.bat --dry-run        # preview only, no writes
REM   extract-seed.bat --simple-only    # extract only; skip copying complex files
REM   extract-seed.bat --complex-only   # copy only; skip re-extracting simple files
REM
REM Environment variables:
REM   DATABASE_ADMIN_URL   Direct Postgres URL (not PgBouncer).
REM                        Resolution: shell env -> stack\env\.env -> local default
REM
REM Requires:
REM   Node.js with tsx
REM   pg_dump 14+   (for --on-conflict-do-nothing)
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
    echo Ensure stack\ and server\ are siblings in the repo.
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
echo === Athyper Seed Extractor ===

REM ---------------------------------------------------------------------------
REM Resolve DATABASE_ADMIN_URL
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
    echo Warning: DATABASE_ADMIN_URL not set — extract-seed.ts will use the local dev default.
    echo          Set DATABASE_ADMIN_URL in shell or stack\env\.env for non-default databases.
)

REM ---------------------------------------------------------------------------
REM Check 900_seed_data_backup exists
REM ---------------------------------------------------------------------------
if not exist "%SERVER_DIR%\db\seed_backup" (
    echo ERROR: seed_backup not found.
    echo.
    echo Rename the source folder first:
    echo   Rename-Item server\db\seed server\db\seed_backup
    exit /b 1
)

REM ---------------------------------------------------------------------------
REM Run extractor
REM ---------------------------------------------------------------------------
echo Database : %DATABASE_ADMIN_URL%
echo Backup   : %SERVER_DIR%\db\seed_backup
echo Output   : %SERVER_DIR%\db\seed
echo Args     : %*
echo.

cd /d "%SERVER_DIR%"
call npx tsx db/scripts/extract.ts %*
set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE% equ 0 (
    echo Extraction complete.
) else (
    echo Extraction failed with exit code %EXIT_CODE%.
)

exit /b %EXIT_CODE%
