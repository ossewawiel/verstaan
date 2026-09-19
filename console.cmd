@echo off
rem Verstaan console: start the local service if it is not running, then open it in the browser.
rem Double-click this file, or run it from any terminal with an optional port: console.cmd 7900.
rem Safe to run twice. The console is now a Node/React app under apps/console (issue 99);
rem apps\console\server\scripts\build-if-stale.mjs decides both the install and the build: it
rem installs when node_modules is missing or the lockfile moved since the last known-good install,
rem and rebuilds when the client or server source is newer than the last build (issue 179 -- this
rem script no longer tests for node_modules or the build itself).
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=7864"
where node >nul 2>nul || (echo console: node is not on PATH. Install Node 20 or later. & exit /b 1)
rem -m 2: a wedged service must not hang the double-click waiting for a health answer.
curl -s -m 2 -o nul http://127.0.0.1:%PORT%/health 2>nul
if %errorlevel%==0 (
  echo console: already running at http://127.0.0.1:%PORT%
  start "" http://127.0.0.1:%PORT%/
  endlocal
  exit /b 0
)

rem Install, then rebuild, when either is stale -- the one decision console.sh and POST
rem /api/restart also make through this same script (issues 162 and 179), so no launcher can drift
rem from another on when an install or a build is due.
node apps\console\server\scripts\build-if-stale.mjs apps\console
if errorlevel 1 (
  echo console: install or build failed; see above. 1>&2
  endlocal
  exit /b 1
)

start "Verstaan console" /min cmd /c "cd apps\console && node dist-server\server\src\index.js --port %PORT%"
echo console: started at http://127.0.0.1:%PORT%
timeout /t 1 /nobreak >nul
start "" http://127.0.0.1:%PORT%/
endlocal
