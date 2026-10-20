@echo off
title VEX CLIENT - online setup
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-vex-online.ps1"
