@echo off
set LOG=%~dp0start.log
echo === Start at %DATE% %TIME% === > "%LOG%"
echo Node: >> "%LOG%"
node -v >> "%LOG%" 2>&1
echo npm: >> "%LOG%"
npm -v >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo === npm i === >> "%LOG%"
npm i >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo === npm run dev === >> "%LOG%"
npm run dev >> "%LOG%" 2>&1
pause
