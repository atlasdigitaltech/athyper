@echo off
REM Developer clean reset: destroys and deterministically rebuilds all Neon-owned schemas.
call pnpm.cmd --dir "%~dp0..\..\..\..\..\server\db" run db:verify:authorization-v2-zero-scans
if errorlevel 1 (
  echo REFUSED: repository authorization zero-scans have not passed.
  exit /b 65
)
call "%~dp0seed-db.bat" --reset --confirm LOCAL-AUTH-V2-RESET %*
