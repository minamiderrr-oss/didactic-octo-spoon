@echo off
setlocal
title LoL Pick Advisor - Windows Starter
echo === LoL Pick Advisor (Windows Start) ===
echo 1) Checking Node and npm ...
where node >nul 2>nul || (
  echo ERROR: Node.js not found. Please install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul || (
  echo ERROR: npm not found (Node.js install failed?).
  pause
  exit /b 1
)
echo 2) Installing dependencies (first run only) ...
npm i || (
  echo ERROR: npm install failed. Check internet connection or antivirus.
  pause
  exit /b 1
)
echo 3) Starting app ...
npm run dev
echo.
echo Finished. Press any key to exit.
pause
