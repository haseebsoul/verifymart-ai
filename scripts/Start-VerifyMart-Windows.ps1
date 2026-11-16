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

function Write-EnvFile {
  param([string]$Path, [string[]]$Lines)

  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText(
    $Path,
    (($Lines -join [Environment]::NewLine) + [Environment]::NewLine),
    $encoding
  )
}

function Read-EnvMap {
  param([string]$Path)

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $match = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$')
    if (-not $match.Success) {
      continue
    }

    $key = $match.Groups[1].Value
    $value = $match.Groups[2].Value.Trim()

    if ($value.Length -ge 2) {
      $first = $value.Substring(0, 1)
      $last = $value.Substring($value.Length - 1, 1)
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    $values[$key] = $value
  }

  return $values
}

function Get-PublicIPv4 {
  try {
    $value = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 8).ToString().Trim()
    $pattern = '^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$'
    if ($value -match $pattern) {
      return $value
    }
  }
  catch {
    Write-Warning 'Could not detect this PC public IPv4 automatically.'
  }

  return $null
}

try {
  $nodeOutput = & node --version 2>$null
  if (-not $nodeOutput) {
    throw 'Node.js is missing. Install Node.js 20.19 or newer, then reopen PowerShell.'
  }

  $nodeVersion = [version]($nodeOutput.TrimStart('v'))
  if ($nodeVersion -lt [version]'20.19.0') {
    throw "Node.js 20.19+ is required. Detected $nodeOutput."
  }

  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'npm.cmd is missing. Reinstall Node.js with npm enabled, then reopen PowerShell.'
  }

  if (-not (Test-Path -LiteralPath $envPath)) {
    $randomBytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
      $rng.GetBytes($randomBytes)
    }
    finally {
      $rng.Dispose()
    }

    $jwtSecret = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')

    Write-EnvFile -Path $envPath -Lines @(
      'NODE_ENV=development',
      'PORT=5000',
      "JWT_ACCESS_SECRET=$jwtSecret",
      'JWT_ACCESS_TTL=15m',
      'COOKIE_SECURE=false',
      'CORS_ORIGIN=http://localhost:5173',
      'MONGODB_DB_NAME=verifymart_dev',
      'MONGODB_APP_NAME=VerifyMart-Dev',
      'MONGODB_URI=',
      'MONGODB_AUDIT_URI=',
      'MONGODB_AUDIT_READ_URI=',
      'VITE_API_URL=/api',
      'DEMO_PASSWORD='
    )

    Write-Host 'Created backend/.env and generated a local development JWT secret.' -ForegroundColor Green
    Write-Host 'The secret is stored locally and is excluded by the repository .gitignore.'
  }

  $envValues = Read-EnvMap -Path $envPath

  if ($envValues['MONGODB_DB_NAME'] -ne 'verifymart_dev') {
    throw 'Safety stop: backend/.env must contain MONGODB_DB_NAME=verifymart_dev. Do not use verifymart_v14, staging, or production.'
  }

  $missing = @()
  foreach ($name in @('MONGODB_URI', 'MONGODB_AUDIT_URI', 'MONGODB_AUDIT_READ_URI')) {
    $value = [string]$envValues[$name]
    if ([string]::IsNullOrWhiteSpace($value) -or $value.Contains('<') -or $value.Contains('>') -or $value -notmatch '^mongodb(\+srv)?://') {
      $missing += $name
    }
  }

  $jwt = [string]$envValues['JWT_ACCESS_SECRET']
  if ([string]::IsNullOrWhiteSpace($jwt) -or $jwt.Length -lt 32 -or $jwt -match 'replace-with') {
    $missing += 'JWT_ACCESS_SECRET'
  }

  if ($missing.Count -gt 0) {
    $publicIp = Get-PublicIPv4

    Write-Host ''
    Write-Host 'Atlas development setup is not complete yet.' -ForegroundColor Yellow

    if ($publicIp) {
      Write-Host "This PC public IPv4: $publicIp" -ForegroundColor Cyan
      Write-Host 'Add this single address in Atlas > Security > Network Access. Do not use 0.0.0.0/0.'
    }

    Write-Host ('Open this local file in Notepad: ' + $envPath)
    Write-Host 'Set MONGODB_URI to the dedicated app user URI for verifymart_dev.'
    Write-Host 'Set MONGODB_AUDIT_URI to the insert-only audit writer URI for auditLog.'
    Write-Host 'Set MONGODB_AUDIT_READ_URI to the find-only audit reader URI for auditLog.'
    Write-Host 'Keep MONGODB_DB_NAME=verifymart_dev.'
    Write-Host ('Missing or invalid configuration: ' + ($missing -join ', ')) -ForegroundColor Red
    exit 2
  }

  Push-Location $repoRoot
  try {
    if (-not $SkipInstall) {
      Write-Host 'Installing workspace dependencies...' -ForegroundColor Cyan
      & npm.cmd install
      if ($LASTEXITCODE -ne 0) {
        throw 'npm install failed.'
      }
    }

    if (-not $SkipSeed) {
      Write-Host 'Running the development-only Atlas seed against verifymart_dev...' -ForegroundColor Cyan
      & npm.cmd run seed
      if ($LASTEXITCODE -ne 0) {
        throw 'Atlas development seed failed. Review the error above.'
      }
    }

    if (-not $SkipBuild) {
      Write-Host 'Building shared, backend and frontend workspaces...' -ForegroundColor Cyan
      & npm.cmd run build
      if ($LASTEXITCODE -ne 0) {
        throw 'Project build failed.'
      }
    }

    Write-Host ''
    Write-Host 'Starting VerifyMart. Web UI: http://localhost:5173' -ForegroundColor Green
    Write-Host 'API: http://localhost:5000/api/health'
    Write-Host 'Database readiness: http://localhost:5000/api/ready'
    Write-Host 'Press Ctrl+C in this window to stop the local application.'

    & npm.cmd run dev
    if ($LASTEXITCODE -ne 0) {
      throw 'VerifyMart stopped with an error.'
    }
  }
  finally {
    Pop-Location
  }
}
catch {
  Write-Error $_
  exit 1
}
