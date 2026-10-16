@echo off
setlocal
title Build Vex Client installer
cd /d "%~dp0"
set "PATH=%PATH%;%ProgramFiles%\nodejs"
where npm >nul 2>nul || (echo Node.js is missing. Run "Setup Vex Client.bat" first. & pause & exit /b 1)
echo Installing build tools...
call npm install --no-audit --no-fund || (echo npm install failed. & pause & exit /b 1)
echo Building the Windows installer, this takes a few minutes...
call npm run dist || (echo The build failed. Send a screenshot of this window. & pause & exit /b 1)
echo.
echo Done. The installer is in the "dist" folder: Vex-Client-Setup-*.exe
start "" "%~dp0dist"
pause
