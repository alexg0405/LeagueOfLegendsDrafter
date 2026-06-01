param(
  [string]$ExePath = "$PSScriptRoot\..\release\NexusDraft.exe",
  [int]$TimeoutSeconds = 20
)

$ErrorActionPreference = 'Stop'
$resolvedExe = Resolve-Path -LiteralPath $ExePath

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class NexusDraftWindowProbe {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  public static string[] VisibleTitlesForProcess(uint pid) {
    var titles = new List<string>();
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) {
        return true;
      }
      uint windowPid;
      GetWindowThreadProcessId(hWnd, out windowPid);
      if (windowPid != pid) {
        return true;
      }
      var title = new StringBuilder(512);
      GetWindowText(hWnd, title, title.Capacity);
      var value = title.ToString();
      if (!String.IsNullOrWhiteSpace(value)) {
        titles.Add(value);
      }
      return true;
    }, IntPtr.Zero);
    return titles.ToArray();
  }
}
"@

$oldSmoke = $env:NEXUS_DRAFT_SMOKE_OPEN_OVERLAY
$env:NEXUS_DRAFT_SMOKE_OPEN_OVERLAY = '1'
$proc = $null
try {
  $proc = Start-Process -FilePath $resolvedExe -WorkingDirectory (Split-Path -Parent $resolvedExe) -PassThru
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $titles = @()
  do {
    Start-Sleep -Milliseconds 500
    $proc.Refresh()
    $titles = [NexusDraftWindowProbe]::VisibleTitlesForProcess([uint32]$proc.Id)
    if ($titles -contains 'Nexus Draft' -and $titles -contains 'Nexus Draft Overlay') {
      break
    }
  } while ((Get-Date) -lt $deadline -and -not $proc.HasExited)

  if ($proc.HasExited) {
    throw "NexusDraft exited before smoke checks completed."
  }
  if ($proc.ProcessName -ne 'NexusDraft') {
    throw "Expected process name NexusDraft, got $($proc.ProcessName)."
  }
  if ($titles -notcontains 'Nexus Draft') {
    throw "Main window was not visible. Titles: $($titles -join ', ')"
  }
  if ($titles -notcontains 'Nexus Draft Overlay') {
    throw "Overlay window was not visible. Titles: $($titles -join ', ')"
  }

  Write-Host "Tauri overlay smoke passed for PID $($proc.Id): $($titles -join ', ')"
}
finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
  }
  if ($null -eq $oldSmoke) {
    Remove-Item Env:NEXUS_DRAFT_SMOKE_OPEN_OVERLAY -ErrorAction SilentlyContinue
  } else {
    $env:NEXUS_DRAFT_SMOKE_OPEN_OVERLAY = $oldSmoke
  }
}
