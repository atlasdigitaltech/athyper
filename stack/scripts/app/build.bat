@echo off
REM ============================================================
REM athyper - Full Application Build - Windows guard
REM Location: stack\scripts\app\build.bat
REM
REM This script is staging/production-only and runs on the server,
REM not on a developer Windows workstation. The .bat shell here is
REM a guard to prevent accidental local invocation; the real script
REM is build.sh, executed on the Linux staging/production host.
REM
REM From a Windows workstation, SSH to the staging server and run:
REM
REM   ssh athyper@vmi2836875
REM   bash /opt/products/athyper/stack/scripts/app/build.sh
REM
REM Available flags (run on the server):
REM   --no-cache       Force a clean rebuild (slow but resets cache).
REM   --service=LIST   Narrow scope (api,worker,scheduler,neon,mesh,admin,web or all).
REM                    web means all three web planes.
REM ============================================================

echo.
echo ERROR: build.bat is a guard. Run build.sh on the staging server instead.
echo.
echo From this workstation:
echo     ssh athyper@^<staging-host^>
echo     bash /opt/products/athyper/stack/scripts/app/build.sh
echo.
exit /b 1
