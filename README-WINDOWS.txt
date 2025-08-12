LoL Pick Advisor Pro++ — v4 (Windows starter fix)

Quick Start (Windows):
1) Right-click the ZIP -> Extract All...
2) Open the extracted folder
3) Double-click: start-windows.bat  (keeps window open)
   - If it says "Node.js not found", install Node.js LTS from https://nodejs.org/
4) After the app window opens, go to LoL champ select. Header badge will show "Lobby connected".

Troubleshooting:
- Open Command Prompt in this folder (click the address bar, type cmd, Enter), then run:
  node -v
  npm -v
  npm i
  npm run dev
- If any command says "not recognized", Node.js/npm is not installed or PATH is not set.
