@echo off
start "Competitor Watcher - API" cmd /k "cd /d %~dp0 && venv\Scripts\activate && python app.py"
start "Competitor Watcher - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5174"
