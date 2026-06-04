param(
  [string]$Version = $env:NEXUS_DRAFT_RELEASE_VERSION,
  [switch]$SkipBuild,
  [switch]$PortableOnly,
  [switch]$StageWebsitePortable,
  [switch]$CleanTarget
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$packageJsonPath = Join-Path $repoRoot 'package.json'
$releaseDir = Join-Path $repoRoot 'release'
$targetDir = Join-Path $repoRoot 'target'
$rawExePath = Join-Path $targetDir 'release\NexusDraft.exe'
$nsisDir = Join-Path $targetDir 'release\bundle\nsis'
$publicDownloadsDir = Join-Path $repoRoot 'src\renderer\public\downloads'

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
}

if (-not (Test-Path -LiteralPath $releaseDir)) {
  New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

if (-not $SkipBuild) {
  if ([string]::IsNullOrWhiteSpace($env:CARGO_BUILD_JOBS)) {
    $env:CARGO_BUILD_JOBS = '1'
  }

  Push-Location $repoRoot
  try {
    if ($PortableOnly) {
      $tauriCli = Join-Path $repoRoot 'node_modules\.bin\tauri.cmd'
      if (-not (Test-Path -LiteralPath $tauriCli)) {
        throw "Tauri CLI not found at $tauriCli. Run npm install first."
      }
      & $tauriCli build --no-bundle
    } else {
      $tauriCli = Join-Path $repoRoot 'node_modules\.bin\tauri.cmd'
      if (-not (Test-Path -LiteralPath $tauriCli)) {
        throw "Tauri CLI not found at $tauriCli. Run npm install first."
      }
      & $tauriCli build
    }
    if ($LASTEXITCODE -ne 0) {
      throw "tauri build failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $rawExePath)) {
  throw "Tauri executable not found: $rawExePath"
}

$portableReleasePath = Join-Path $releaseDir "Nexus-Draft-Tauri-Portable-$Version.exe"
$plainReleasePath = Join-Path $releaseDir 'NexusDraft.exe'

Copy-Item -LiteralPath $rawExePath -Destination $plainReleasePath -Force
Copy-Item -LiteralPath $rawExePath -Destination $portableReleasePath -Force
Write-Host "Staged Tauri portable: $portableReleasePath"
Write-Host "Staged direct Tauri exe: $plainReleasePath"

if (Test-Path -LiteralPath $nsisDir) {
  $installer = Get-ChildItem -LiteralPath $nsisDir -Filter '*.exe' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($installer) {
    $installerReleasePath = Join-Path $releaseDir "Nexus-Draft-Tauri-Setup-$Version.exe"
    Copy-Item -LiteralPath $installer.FullName -Destination $installerReleasePath -Force
    Write-Host "Staged Tauri installer: $installerReleasePath"
  }
}

if ($StageWebsitePortable) {
  if (-not (Test-Path -LiteralPath $publicDownloadsDir)) {
    New-Item -ItemType Directory -Path $publicDownloadsDir | Out-Null
  }

  $websitePortablePath = Join-Path $publicDownloadsDir "Nexus-Draft-Portable-$Version.exe"
  Get-ChildItem -LiteralPath $publicDownloadsDir -Filter 'Nexus-Draft-Portable-*.exe' |
    Where-Object { $_.FullName -ne $websitePortablePath } |
    Remove-Item -Force
  Copy-Item -LiteralPath $rawExePath -Destination $websitePortablePath -Force
  Write-Host "Staged website portable download: $websitePortablePath"
}

if ($CleanTarget -and (Test-Path -LiteralPath $targetDir)) {
  Remove-Item -LiteralPath $targetDir -Recurse -Force
  Write-Host "Removed Rust target directory: $targetDir"
}
