@echo off
setlocal
title Vex Client setup
cd /d "%~dp0"
echo Installing everything Vex Client needs. Windows may ask for permission a few times, click Yes.
echo.
where winget >nul 2>nul
if errorlevel 1 (
  echo winget was not found. Update "App Installer" in the Microsoft Store, then run this again.
  pause
  exit /b 1
)
call :install OpenJS.NodeJS.LTS
call :install EclipseAdoptium.Temurin.21.JRE
call :install EclipseAdoptium.Temurin.17.JRE
call :install EclipseAdoptium.Temurin.8.JRE
set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js did not install. Restart your PC and run this setup again.
  pause
  exit /b 1
)
echo.
echo Installing launcher files, this takes a minute...
call npm install
if errorlevel 1 (
  echo npm install failed. Send a screenshot of this window.
  pause
  exit /b 1
)
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Vex Client.lnk');$s.TargetPath='%~dp0Start Vex Client.bat';$s.WorkingDirectory='%~dp0';$s.Save()"
echo.
echo Done. Use the Vex Client shortcut on your desktop from now on.
start "" "%~dp0Start Vex Client.bat"
pause
exit /b 0

:install
echo Installing %1 ...
winget install -e --id %1 --silent --accept-package-agreements --accept-source-agreements
exit /b 0
