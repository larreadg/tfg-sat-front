@echo off
REM tfg-sat-front - Dev server HTTPS con la IP local. Doble clic o: dev.bat
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
