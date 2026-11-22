@echo off
rem Double-click this file to start the Time Tracker server on Windows.
rem Leave the window open while you want the phone to sync; close it to stop.
title Time Tracker server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

echo Checking packages...
call npm install --no-audit --no-fund --loglevel=error || goto :error

echo Building the app...
call npm run build || goto :error

rem Share the server over HTTPS on your tailnet. Tailscale remembers this,
rem so running it every time is harmless.
where tailscale >nul 2>nul
if not errorlevel 1 (
  tailscale serve --bg 8787
) else if exist "%ProgramFiles%\Tailscale\tailscale.exe" (
  "%ProgramFiles%\Tailscale\tailscale.exe" serve --bg 8787
) else (
  echo Tailscale was not found, so the iPhone can't reach this server yet. See README.md.
)

call npm start
echo.
echo The server stopped.
pause
goto :eof

:error
echo.
echo Something went wrong. Read the messages above.
pause
