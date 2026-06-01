param(
  [switch]$NoStopDev,
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$ReleaseExe = Join-Path $Root 'release\win-unpacked\NexusDraft.exe'
$DevElectronExe = Join-Path $Root 'node_modules\electron\dist\electron.exe'

if (-not (Test-Path -LiteralPath $ReleaseExe)) {
  throw "NexusDraft.exe was not found at $ReleaseExe. Run `npm run dist:win` first."
}

if (-not $NoStopDev) {
  $devProcesses = @()
  try {
    $devProcesses = Get-CimInstance Win32_Process |
      Where-Object {
        $_.Name -ieq 'electron.exe' -and
        (
          $_.ExecutablePath -ieq $DevElectronExe -or
          ($_.CommandLine -and $_.CommandLine.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase) -ge 0)
        )
      }
  } catch {
    $devProcesses = Get-Process electron -ErrorAction SilentlyContinue |
      Where-Object { $_.Path -ieq $DevElectronExe }
  }

  foreach ($process in $devProcesses) {
    $id = if ($process.ProcessId) { $process.ProcessId } else { $process.Id }
    if ($id) {
      Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    }
  }
}

if ($NoLaunch) {
  Write-Host "Ready to launch $ReleaseExe"
  exit 0
}

Start-Process -FilePath $ReleaseExe -WorkingDirectory (Split-Path -Parent $ReleaseExe)
Write-Host "Started $ReleaseExe"
