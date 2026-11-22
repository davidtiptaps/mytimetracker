@echo off
rem Double-click to download the latest version of the app.
rem Your data in the "data" folder is not touched.
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed. Get it from https://git-scm.com/download/win
  pause
  exit /b 1
)

git pull --ff-only || goto :error
echo.
echo Updated. Close the server window if it is open, then run start-server.bat again.
pause
goto :eof

:error
echo.
echo The update failed. Read the messages above.
pause
