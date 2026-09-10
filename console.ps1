#Requires -Version 7.0
<#
.SYNOPSIS
  Start the Verstaan console (apps/console) if it is not running, then open it in the browser.
  Installs dependencies and builds it on the first run, or after its source changes (issue 99).
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

if (-not (Test-Path (Join-Path $appDir 'node_modules'))) {
  Write-Host 'console: installing dependencies (first run only)...'
  Push-Location $appDir
  npm ci
  Pop-Location
}

$distIndex = Join-Path $appDir 'dist\index.html'
$distServer = Join-Path $appDir 'dist-server\server\src\index.js'
$needBuild = -not (Test-Path $distIndex) -or -not (Test-Path $distServer)
if (-not $needBuild) {
  $distTime = (Get-Item $distIndex).LastWriteTimeUtc
  $newestSource = Get-ChildItem -Recurse (Join-Path $appDir 'client\src'), (Join-Path $appDir 'server\src') -File |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if ($newestSource -and $newestSource.LastWriteTimeUtc -gt $distTime) { $needBuild = $true }
}
if ($needBuild) {
  Write-Host 'console: building...'
  Push-Location $appDir
  npm run build
  Pop-Location
}

$env:VERSTAAN_CONSOLE_PORT = "$Port"
Start-Process -FilePath 'node' -ArgumentList "dist-server\server\src\index.js --port $Port" -WorkingDirectory $appDir -WindowStyle Minimized
Start-Sleep -Seconds 1
Write-Host "console: started at $url"

if (-not $NoBrowser) { Start-Process $url }
