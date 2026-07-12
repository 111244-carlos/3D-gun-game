@echo off
setlocal
cd /d "%~dp0"
title 3D Gun Game Server

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo PowerShell was not found on this computer.
  echo.
  pause
  exit /b 1
)

echo Starting 3D Gun Game...
echo.
echo Keep this window open while playing.
echo Game URL: http://127.0.0.1:5173/
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul ^& start http://127.0.0.1:5173/"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-server.ps1"

echo.
echo The game server stopped or could not start.
echo If another window is already running the game, close it and try again.
echo.
pause
