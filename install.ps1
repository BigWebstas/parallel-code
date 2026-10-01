#Requires -Version 5.1
<#
.SYNOPSIS
  Builds Parallel Code for Windows and launches the installer.

.DESCRIPTION
  Windows counterpart to install.sh (which covers macOS/Linux): builds the
  nsis setup exe from this checkout via `npm run build -- --win`, then
  launches it. Requires Node.js 22 and npm.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host 'Building release for Windows...'
Get-ChildItem "$scriptDir\release\*.exe" -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue
npm run build -- --win

$setup = Get-ChildItem "$scriptDir\release\*.exe" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $setup) {
  Write-Error 'Error: no setup .exe found in release/'
  exit 1
}

Write-Host "Launching $($setup.FullName)..."
Start-Process -FilePath $setup.FullName
