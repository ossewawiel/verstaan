#Requires -Version 7.0
<#
.SYNOPSIS
  Start the Verstaan console (apps/console) if it is not running, then open it in the browser.
  apps/console/server/scripts/build-if-stale.mjs decides both the install and the build: it
  installs when node_modules is missing or the lockfile moved since the last known-good install,
  and rebuilds when the client or server source changes (issues 99 and 179).
.EXAMPLE
  .\console.ps1
.EXAMPLE
  .\console.ps1 -Port 7900
#>
param([int]$Port = 7864, [switch]$NoBrowser)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'console: node is not on PATH. Install Node 20 or later.'
}

$url = "http://127.0.0.1:$Port"
$running = $false
try { $null = Invoke-WebRequest -Uri "$url/health" -TimeoutSec 1 -UseBasicParsing; $running = $true } catch { $running = $false }

if ($running) {
  Write-Host "console: already running at $url"
  if (-not $NoBrowser) { Start-Process $url }
  return
}

$appDir = Join-Path $PSScriptRoot 'apps\console'

# Install, then rebuild, when either is stale -- the one decision console.sh and POST
# /api/restart also make through this same script (issues 162 and 179), so no launcher can drift
# from another on when an install or a build is due.
node (Join-Path $appDir 'server\scripts\build-if-stale.mjs') $appDir
if ($LASTEXITCODE -ne 0) {
  Write-Error 'console: install or build failed; see above.'
}

$env:VERSTAAN_CONSOLE_PORT = "$Port"
Start-Process -FilePath 'node' -ArgumentList "dist-server\server\src\index.js --port $Port" -WorkingDirectory $appDir -WindowStyle Minimized
Start-Sleep -Seconds 1
Write-Host "console: started at $url"

if (-not $NoBrowser) { Start-Process $url }
