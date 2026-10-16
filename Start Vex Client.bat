@echo off
cd /d "%~dp0"
set "PATH=%PATH%;%ProgramFiles%\nodejs"
start "" /min cmd /c "npm start"
