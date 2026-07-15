@echo off
REM Developer reset: keeps shared schema and skips shared reseed so local resets are faster.
call "%~dp0seed-db.bat" --reset --keep-shared --skip-shared %*
