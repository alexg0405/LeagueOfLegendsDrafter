param(
  [string]$Endpoint = $env:AZURE_SIGNING_ENDPOINT,
  [string]$AccountName = $env:AZURE_SIGNING_ACCOUNT_NAME,
  [string]$CertificateProfileName = $env:AZURE_SIGNING_CERTIFICATE_PROFILE_NAME,
  [string]$SignToolPath = $env:SIGNTOOL_PATH,
  [string]$DlibPath = $env:AZURE_CODESIGNING_DLIB_PATH,
  [string]$Version = $env:NEXUS_DRAFT_SIGN_VERSION,
  [switch]$IncludeTauri,
  [switch]$TauriOnly
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:AZURE_CONFIG_DIR)) {
  $localAzureConfig = Join-Path (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')) '.azure-cli'
  if (Test-Path -LiteralPath $localAzureConfig) {
    $env:AZURE_CONFIG_DIR = $localAzureConfig
  }
}

if ([string]::IsNullOrWhiteSpace($Endpoint)) {
  $Endpoint = 'https://eus.codesigning.azure.net'
}

if ([string]::IsNullOrWhiteSpace($AccountName)) {
  $AccountName = 'NexusDraft'
}

if ([string]::IsNullOrWhiteSpace($CertificateProfileName)) {
  $CertificateProfileName = 'NexusDraft'
}

function Resolve-SignTool {
  param([string]$ExplicitPath)

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
    if (Test-Path -LiteralPath $ExplicitPath) {
      return (Resolve-Path -LiteralPath $ExplicitPath).Path
    }

    throw "SIGNTOOL_PATH does not exist: $ExplicitPath"
  }

  $sdkRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
  $tools = Get-ChildItem -LiteralPath $sdkRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
    Sort-Object FullName -Descending

  if ($tools.Count -gt 0) {
    return $tools[0].FullName
  }

  throw 'Could not find x64 signtool.exe. Install the Windows SDK or set SIGNTOOL_PATH.'
}

function Resolve-ArtifactSigningDlib {
  param([string]$ExplicitPath)

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
    if (Test-Path -LiteralPath $ExplicitPath) {
      return (Resolve-Path -LiteralPath $ExplicitPath).Path
    }

    throw "AZURE_CODESIGNING_DLIB_PATH does not exist: $ExplicitPath"
  }

  $roots = @(
    'C:\Users\Public\Documents\MicrosoftTrustedSigningClientTools',
    (Join-Path $env:LOCALAPPDATA 'Microsoft\MicrosoftArtifactSigningClientTools'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\MicrosoftTrustedSigningClientTools'),
    (Join-Path $env:USERPROFILE 'Microsoft.Trusted.Signing.Client'),
    'C:\Program Files',
    'C:\Program Files (x86)'
  )
  $dlls = foreach ($root in $roots) {
    if (Test-Path -LiteralPath $root) {
      Get-ChildItem -LiteralPath $root -Recurse -Filter Azure.CodeSigning.Dlib.dll -ErrorAction SilentlyContinue
    }
  }

  $dll = $dlls | Where-Object { $_.FullName -match '\\x64\\Azure\.CodeSigning\.Dlib\.dll$' } | Select-Object -First 1
  if ($dll) {
    return $dll.FullName
  }

  $dll = $dlls | Select-Object -First 1
  if ($dll) {
    return $dll.FullName
  }

  throw 'Could not find Azure.CodeSigning.Dlib.dll. Install Microsoft.Azure.ArtifactSigningClientTools or set AZURE_CODESIGNING_DLIB_PATH.'
}

function Resolve-AppBuilder {
  $appBuilderPath = Join-Path (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')) 'node_modules\app-builder-bin\win\x64\app-builder.exe'
  if (Test-Path -LiteralPath $appBuilderPath) {
    return (Resolve-Path -LiteralPath $appBuilderPath).Path
  }

  throw "Could not find app-builder.exe at $appBuilderPath. Run npm install first."
}

function Get-FileSha512Base64 {
  param([string]$Path)

  $sha512 = [System.Security.Cryptography.SHA512]::Create()
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
      return [Convert]::ToBase64String($sha512.ComputeHash($stream))
    }
    finally {
      $stream.Dispose()
    }
  }
  finally {
    $sha512.Dispose()
  }
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Content
  )

  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Update-LatestYml {
  param(
    [string]$LatestYmlPath,
    [string]$ArtifactPath
  )

  $sha512 = Get-FileSha512Base64 -Path $ArtifactPath
  $size = (Get-Item -LiteralPath $ArtifactPath).Length
  $latestYml = Get-Content -LiteralPath $LatestYmlPath -Raw
  $latestYml = $latestYml -replace '(?m)^(\s*sha512:\s*).+$', "`${1}$sha512"
  $latestYml = $latestYml -replace '(?m)^(\s*size:\s*)\d+.*$', "`${1}$size"
  Write-Utf8NoBom -Path $LatestYmlPath -Content $latestYml
}

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$releaseDir = Join-Path $repoRoot 'release'
$packageJsonPath = Join-Path $repoRoot 'package.json'

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
}

if (-not (Test-Path -LiteralPath $releaseDir)) {
  throw "Release directory not found: $releaseDir. Run npm run dist:win first."
}

function Add-ReleaseArtifact {
  param(
    [string]$Name,
    [bool]$Required
  )

  $artifactPath = Join-Path $releaseDir $Name
  if (Test-Path -LiteralPath $artifactPath) {
    return Get-Item -LiteralPath $artifactPath
  }

  if ($Required) {
    throw "Expected release artifact is missing: $artifactPath"
  }

  return $null
}

$artifacts = @()

if (-not $TauriOnly) {
  $artifacts += Add-ReleaseArtifact -Name "Nexus-Draft-Setup-$Version.exe" -Required $true
  $artifacts += Add-ReleaseArtifact -Name "Nexus-Draft-Portable-$Version.exe" -Required $true
}

if ($IncludeTauri -or $TauriOnly) {
  $artifacts += Add-ReleaseArtifact -Name 'NexusDraft.exe' -Required $TauriOnly
  $artifacts += Add-ReleaseArtifact -Name "Nexus-Draft-Tauri-Portable-$Version.exe" -Required $false
  $artifacts += Add-ReleaseArtifact -Name "Nexus-Draft-Tauri-Setup-$Version.exe" -Required $false
}

$artifacts = $artifacts | Where-Object { $_ } | Sort-Object FullName -Unique

if ($artifacts.Count -eq 0) {
  throw "No Nexus Draft release .exe artifacts found in $releaseDir."
}

$resolvedSignTool = Resolve-SignTool -ExplicitPath $SignToolPath
$resolvedDlib = Resolve-ArtifactSigningDlib -ExplicitPath $DlibPath
$correlationId = "nexusdraft-$((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))"
$metadataPath = Join-Path ([System.IO.Path]::GetTempPath()) "nexusdraft-artifact-signing-$PID.json"

$metadata = [ordered]@{
  Endpoint = $Endpoint
  CodeSigningAccountName = $AccountName
  CertificateProfileName = $CertificateProfileName
  CorrelationId = $correlationId
}

$metadataJson = $metadata | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($metadataPath, $metadataJson, [System.Text.UTF8Encoding]::new($false))

try {
  Write-Host "Using SignTool: $resolvedSignTool"
  Write-Host "Using Artifact Signing dlib: $resolvedDlib"
  Write-Host "Using Artifact Signing endpoint: $Endpoint"
  Write-Host "Using Artifact Signing account/profile: $AccountName / $CertificateProfileName"

  foreach ($artifact in $artifacts) {
    $existingSignature = Get-AuthenticodeSignature -LiteralPath $artifact.FullName
    if ($existingSignature.Status -eq 'Valid' -and $existingSignature.SignerCertificate) {
      Write-Host "$($artifact.Name): already signed and valid"
      continue
    }

    Write-Host "Signing $($artifact.Name)..."
    & $resolvedSignTool sign /v /debug /fd SHA256 /tr 'http://timestamp.acs.microsoft.com' /td SHA256 /dlib $resolvedDlib /dmdf $metadataPath $artifact.FullName

    if ($LASTEXITCODE -ne 0) {
      throw "SignTool failed for $($artifact.Name) with exit code $LASTEXITCODE."
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $artifact.FullName
    Write-Host "$($artifact.Name): $($signature.Status)"
  }

  if (-not $TauriOnly) {
    $setupArtifact = Join-Path $releaseDir "Nexus-Draft-Setup-$Version.exe"
    $blockmapPath = "$setupArtifact.blockmap"
    $latestYmlPath = Join-Path $releaseDir 'latest.yml'
    $appBuilder = Resolve-AppBuilder

    Write-Host "Regenerating blockmap for $(Split-Path $setupArtifact -Leaf)..."
    & $appBuilder blockmap --input=$setupArtifact --output=$blockmapPath
    if ($LASTEXITCODE -ne 0) {
      throw "app-builder blockmap failed with exit code $LASTEXITCODE."
    }

    Write-Host "Updating latest.yml hash/size for signed installer..."
    Update-LatestYml -LatestYmlPath $latestYmlPath -ArtifactPath $setupArtifact
  }
}
finally {
  Remove-Item -LiteralPath $metadataPath -Force -ErrorAction SilentlyContinue
}
