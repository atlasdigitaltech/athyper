@echo off
setlocal EnableExtensions

REM ============================================================
REM athyper - Local UI UP - Windows Batch
REM Location: stack\scripts\app\local-ui-up.bat
REM
REM Starts Neon, Mesh, and Admin as host Next.js dev servers.
REM No Docker image build. No container rebuild.
REM
REM Expected local routing:
REM   neon.athyper.local  to host.docker.internal:3101
REM   mesh.athyper.local  to host.docker.internal:3102
REM   admin.athyper.local to host.docker.internal:3103
REM ============================================================

echo.
echo Local UI mode: Docker infrastructure + host Next.js dev servers.
echo.
echo Routes expected in stack\env\.env:
echo   neon.athyper.local  -^> host.docker.internal:3101
echo   mesh.athyper.local  -^> host.docker.internal:3102
echo   admin.athyper.local -^> host.docker.internal:3103
echo.
echo If those upstreams were changed after the gateway started, restart gateway once:
echo   docker restart athyper-gateway-1
echo.

call "%~dp0planes-up.bat" all

endlocal
