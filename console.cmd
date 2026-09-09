@echo off
rem Verstaan console: start the local service if it is not running, then open it in the browser.
rem Double-click this file, or run it from any terminal with an optional port: console.cmd 7900.
rem Safe to run twice.
setlocal
cd /d "%~dp0"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=7864"
where node >nul 2>nul || (echo console: node is not on PATH. Install Node 20 or later. & exit /b 1)
rem -m 2: a wedged service must not hang the double-click waiting for a health answer.
curl -s -m 2 -o nul http://127.0.0.1:%PORT%/health 2>nul
if %errorlevel%==0 (
  echo console: already running at http://127.0.0.1:%PORT%
) else (
  start "Verstaan console" /min cmd /c "node tools\console\src\serve.mjs --port %PORT%"
  echo console: started at http://127.0.0.1:%PORT%
  timeout /t 1 /nobreak >nul
)
start "" http://127.0.0.1:%PORT%/
endlocal
