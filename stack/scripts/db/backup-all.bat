@echo off
setlocal EnableDelayedExpansion

:: ============================================================
:: athyper Stack — DATABASE BACKUP
:: Location:
::   stack\scripts\db\backup-all.bat
:: Usage:
::   backup-all.bat                 (auto-detects .env)
::   backup-all.bat --no-upload     (dump only, skip S3 push)
::   backup-all.bat --upload-only   (skip dump, re-push latest)
::
:: Windows companion to backup-all.sh
:: Requires Git Bash — uses backup-all.sh via Git Bash.
::
:: Tools required in Git Bash / PATH:
::   pg_dump, mc (MinIO client), sha256sum
::
:: Exit codes:
::   0 -- backup completed
::   1 -- error
:: ============================================================

set "BASH_EXE="

:: 1. Well-known system-scope Git Bash locations
for %%P in (
    "C:\Program Files\Git\bin\bash.exe"
    "C:\Program Files (x86)\Git\bin\bash.exe"
) do if "!BASH_EXE!"=="" if exist "%%~P" set "BASH_EXE=%%~P"

:: 2. User-scope Git install (winget / scoop default)
if "!BASH_EXE!"=="" if exist "!LOCALAPPDATA!\Programs\Git\bin\bash.exe" (
    set "BASH_EXE=!LOCALAPPDATA!\Programs\Git\bin\bash.exe"
)

:: 3. Any bash on PATH that is NOT the WSL relay at System32\bash.exe
if "!BASH_EXE!"=="" (
    for /f "delims=" %%B in ('where bash 2^>nul') do (
        if "!BASH_EXE!"=="" (
            echo "%%B" | findstr /i /c:"System32\bash" >nul 2>&1
            if errorlevel 1 set "BASH_EXE=%%B"
        )
    )
)

if not "!BASH_EXE!"=="" (
    "!BASH_EXE!" "%~dp0backup-all.sh" %*
    exit /b !errorlevel!
)

:: ----------------------------
:: No Git Bash found
:: ----------------------------
echo.
echo ERROR: Git Bash not found.
echo.
echo backup-all.bat requires Git Bash to run backup-all.sh, which uses
echo pg_dump, mc (MinIO client), and sha256sum.
echo.
echo Options:
echo   1. Install Git for Windows (https://gitforwindows.org/) — includes bash, pg_dump via PATH, and sha256sum.
echo   2. Install mc (MinIO client) and ensure it is on PATH.
echo   3. Run the backup directly on the staging/production server via SSH:
echo        bash /opt/products/athyper/stack/scripts/db/backup-all.sh
echo.
exit /b 1
