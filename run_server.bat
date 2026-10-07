@echo off
cd /d "%~dp0"
set PYTHONPATH=%~dp0
.venv\Scripts\python -m flask --app backend/app.py run --host=0.0.0.0 --port=5000 --debug
pause
