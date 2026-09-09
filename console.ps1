#Requires -Version 7.0
<#
.SYNOPSIS
  Start the Verstaan console service if it is not running, then open it in the browser.
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
} else {
  $env:VERSTAAN_CONSOLE_PORT = "$Port"
  Start-Process -FilePath 'node' -ArgumentList 'tools\console\src\serve.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Minimized
  Start-Sleep -Seconds 1
  Write-Host "console: started at $url"
}

if (-not $NoBrowser) { Start-Process $url }
