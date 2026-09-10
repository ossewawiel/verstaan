@echo off
rem Verstaan console: start the local service if it is not running, then open it in the browser.
rem Double-click this file, or run it from any terminal with an optional port: console.cmd 7900.
rem Safe to run twice. The console is now a Node/React app under apps/console (issue 99); this
rem script installs its dependencies and builds it the first time, then just starts it.
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

if not exist "apps\console\node_modules" (
  echo console: installing dependencies (first run only)...
  pushd apps\console
  call npm ci
  popd
)

rem Rebuild whenever the client or server source is newer than the last build. forfiles' /D +1
rem only compares whole days, so this instead compares the dist folder's own timestamp against
rem the newest source file with a small PowerShell one-liner -- still no extra dependency.
set "NEED_BUILD=0"
if not exist "apps\console\dist\index.html" set "NEED_BUILD=1"
if not exist "apps\console\dist-server\server\src\index.js" set "NEED_BUILD=1"
if "%NEED_BUILD%"=="0" (
  for /f %%r in ('powershell -NoProfile -Command "$dist = (Get-Item 'apps\console\dist\index.html').LastWriteTimeUtc; $newest = (Get-ChildItem -Recurse 'apps\console\client\src','apps\console\server\src' -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc; if ($newest -gt $dist) { 'stale' } else { 'fresh' }"') do set "BUILD_STATE=%%r"
  rem enabledelayedexpansion (above) makes !BUILD_STATE! read the value the `for` just set, in
  rem this same parenthesised block; %BUILD_STATE% would have been expanded at parse time,
  rem before the `for` ran, and always empty -- this branch would never fire.
  if "!BUILD_STATE!"=="stale" set "NEED_BUILD=1"
)
if "%NEED_BUILD%"=="1" (
  echo console: building...
  pushd apps\console
  call npm run build
  popd
)

start "Verstaan console" /min cmd /c "cd apps\console && node dist-server\server\src\index.js --port %PORT%"
echo console: started at http://127.0.0.1:%PORT%
timeout /t 1 /nobreak >nul
start "" http://127.0.0.1:%PORT%/
endlocal
