@echo off
setlocal EnableDelayedExpansion

:: ============================================================
:: athyper Stack — SMOKE TEST (launcher)
:: Location:
::   stack\scripts\smoke-staging.bat
:: Usage:
::   smoke-staging.bat                          (auto-detect env, all checks)
::   smoke-staging.bat C:\path\.env             (single env file)
::   smoke-staging.bat C:\path\.env C:\path\secrets.env  (two-file)
::   smoke-staging.bat --insecure               (skip TLS verify on non-local)
::
:: Thin launcher: prefers Git Bash (runs smoke-staging.sh), falls back to
:: smoke-staging.ps1 when Git Bash is not present.
::
:: Exit codes:
::   0 -- all checks passed
::   1 -- one or more failures
:: ============================================================

:: ----------------------------
:: Prefer Git Bash; skip WSL relay (System32\bash.exe requires a distro).
:: ----------------------------
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
    "!BASH_EXE!" "%~dp0smoke-staging.sh" %*
    exit /b !errorlevel!
)

:: ----------------------------
:: Fallback: PowerShell (.ps1)
:: ----------------------------
set "PS1=%~dp0smoke-staging.ps1"
if not exist "%PS1%" (
    echo FATAL: neither Git Bash nor "%PS1%" available
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
exit /b %errorlevel%
