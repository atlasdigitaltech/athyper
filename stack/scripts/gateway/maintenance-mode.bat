@echo off
setlocal
node "%~dp0maintenance-mode.mjs" %*
exit /b %ERRORLEVEL%
