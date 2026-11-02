@echo off
chcp 65001 >nul
cd /d "%~dp0"
python --version >nul 2>&1
if errorlevel 1 (
  echo 请先安装并启用 Python 3.10 或更新版本。
  pause
  exit /b 1
)
python learning_agent_server.py --port 8922 --with-team-ai --with-local-gateway --open-team
pause
