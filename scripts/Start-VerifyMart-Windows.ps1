[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [switch]$SkipSeed,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot 'backend'
$envPath = Join-Path $backendDir '.env'
$examplePath = Join-Path $repoRoot '.env.example'

function Write-EnvFile([string]$Path, [string[]]$Lines) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, ($Lines -join [Environment]::NewLine) + [Environment]::NewLine, $encoding)
}

function Read-EnvMap([string]$Path) {
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
      $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
  }
  return $values
}

function Get-PublicIPv4 {
  try {
    $value = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 8).ToString().Trim()
    if ($value -match '^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$') {
      return $value
    }
  } catch {
    Write-Warning 'Could not detect this PC public IPv4 automatically.'
  }
  return $null
}

try {
  $node = (& node --version 2>$null)
  if (-not $node) { throw 'Node.js is missing. Install Node.js 20.19 or newer, then reopen PowerShell.' }
  $nodeVersion = [version]($node.TrimStart('v'))
  if ($nodeVersion -lt [version]'20.19.0') {
    throw "Node.js 20.19+ is required. Detected $node."
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm is missing. Reinstall Node.js with npm enabled, then reopen PowerShell.'
  }

  if (-not (Test-Path -LiteralPath $envPath)) {
    if (-not (Test-Path -LiteralPath $examplePath)) { throw 'The repository .env.example file is missing.' }
    $randomBytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($randomBytes) } finally { $rng.Dispose() }
    $jwtSecret = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    Write-EnvFile -Path $envPath -Lines @(
      'NODE_ENV=development',
      'PORT=8000',
      "JWT_ACCESS_SECRET=$jwtSecret",
      'JWT_ACCESS_TTL=15m',
      'COOKIE_SECURE=false',
      'CORS_ORIGIN=http://localhost:5173',
      'MONGODB_DB_NAME=verifymart_dev',
      'MONGODB_APP_NAME=VerifyMart-Dev',
      'MONGODB_URI=',
      'MONGODB_AUDIT_URI=',
      'VITE_API_URL=/api',
      'DEMO_PASSWORD='
    )
    Write-Host 'Created backend/.env and generated a local development JWT secret.' -ForegroundColor Green
    Write-Host 'The secret stays in backend/.env and is excluded by .gitignore.'
  }

  $envValues = Read-EnvMap -Path $envPath
  if ($envValues['MONGODB_DB_NAME'] -ne 'verifymart_dev') {
    throw 'Safety stop: backend/.env must target MONGODB_DB_NAME=verifymart_dev. Do not point this development launcher at staging, production, or verifymart_v14.'
  }

  $missing = @()
  foreach ($name in @('MONGODB_URI','MONGODB_AUDIT_URI')) {
    $value = $envValues[$name]
    if ([string]::IsNullOrWhiteSpace($value) -or $value -match '[<>]' -or $value -notmatch '^mongodb(\+srv)?://') {
      $missing += $name
    }
  }
  if ($missing.Count -gt 0) {
    $publicIp = Get-PublicIPv4
    Write-Host ''
    Write-Host 'Atlas development setup is not complete yet.' -ForegroundColor Yellow
    if ($publicIp) {
      Write-Host "This PC public IPv4: $publicIp" -ForegroundColor Cyan
      Write-Host 'Add this single IP address to Atlas > Network Access. Do not use 0.0.0.0/0.'
    }
    Write-Host ('1. Open backend/.env in Notepad: ' + $envPath)
    Write-Host '2. Set MONGODB_URI to a dedicated app URI scoped to verifymart_dev.'
    Write-Host '3. Set MONGODB_AUDIT_URI to a separate audit URI with find/insert only on auditLog.'
    Write-Host '4. Keep MONGODB_DB_NAME=verifymart_dev. Do not use the legacy verifymart_v14 user.'
    Write-Host '5. Save the file and run this script again.'
    Write-Host ''
    Write-Host ('Missing or invalid: ' + ($missing -join ', ')) -ForegroundColor Red
    exit 2
  }

  $jwt = $envValues['JWT_ACCESS_SECRET']
  if ([string]::IsNullOrWhiteSpace($jwt) -or $jwt.Length -lt 32 -or $jwt -match 'replace-with') {
    throw 'JWT_ACCESS_SECRET must be a non-placeholder secret of at least 32 characters in backend/.env.'
  }

  Push-Location $repoRoot
  try {
    if (-not $SkipInstall) {
      Write-Host 'Installing workspace dependencies...' -ForegroundColor Cyan
      npm.cmd install
      if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    }

    if (-not $SkipSeed) {
      Write-Host 'Running the development-only Atlas seed (verifymart_dev)...' -ForegroundColor Cyan
      npm.cmd run seed
      if ($LASTEXITCODE -ne 0) { throw 'Atlas seed failed. Check the error above; no production database should be used.' }
    }

    if (-not $SkipBuild) {
      Write-Host 'Building shared, backend and frontend workspaces...' -ForegroundColor Cyan
      npm.cmd run build
      if ($LASTEXITCODE -ne 0) { throw 'The project build failed.' }
    }

    Write-Host ''
    Write-Host 'Starting VerifyMart: API http://localhost:8000, web app http://localhost:5173' -ForegroundColor Green
    Write-Host 'Press Ctrl+C in this window to stop both local processes.'
    npm.cmd run dev
    if ($LASTEXITCODE -ne 0) { throw 'VerifyMart stopped with an error.' }
  } finally {
    Pop-Location
  }
} catch {
  Write-Error $_
  exit 1
}
