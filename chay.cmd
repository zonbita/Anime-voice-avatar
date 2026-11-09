@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PY=C:\Python312\python.exe"
if not exist "%PY%" set "PY=python"

set "VIET_DIR=%~dp0..\SpeechTiengViet"

echo Starting Anime TTS UI   http://127.0.0.1:5173/
start "Anime TTS UI :5173" /D "%~dp0" cmd /k "%PY%" -u Frontend\server.py

if exist "%VIET_DIR%\.venv\Scripts\python.exe" (
  echo Starting SpeechTiengViet  http://127.0.0.1:8765/
  start "SpeechTiengViet :8765" /D "%VIET_DIR%" cmd /k .venv\Scripts\python.exe app.py serve
) else (
  echo [skip] SpeechTiengViet not found
)

timeout /t 2 /nobreak >nul
start http://127.0.0.1:5173/
echo Keep both CMD windows open.
