param(
  [switch]$Start,
  [switch]$InstallAutostart
)

$ErrorActionPreference = "Stop"

function Has-Command([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Host "Syncthing Windows setup"
Write-Host "Repo path: $PSScriptRoot\\.."
Write-Host ""

if (-not (Has-Command "winget")) {
  Write-Warning "winget not found. Install Syncthing manually or install winget (App Installer from Microsoft Store)."
  Write-Host "Manual install: https://syncthing.net/downloads/"
  exit 1
}

# Install (id is stable in winget, but can change; if this fails, install manually).
Write-Host "Installing Syncthing via winget..."
winget install --id Syncthing.Syncthing --source winget --accept-package-agreements --accept-source-agreements

if ($Start) {
  if (-not (Has-Command "syncthing")) {
    Write-Warning "syncthing not found on PATH after install. You may need to restart your terminal/session."
    exit 1
  }

  Write-Host "Starting syncthing (first run will create config and open GUI on http://localhost:8384)..."
  # Syncthing v2 uses GNU-style long flags.
  Start-Process -FilePath "syncthing" -ArgumentList @("--no-browser", "--no-restart") -WindowStyle Hidden

  Start-Sleep -Seconds 2
  Start-Process "http://localhost:8384"
}

if ($InstallAutostart) {
  if (-not (Has-Command "syncthing")) {
    Write-Warning "syncthing not found on PATH. Restart your terminal/session and re-run with -InstallAutostart."
    exit 1
  }

  $taskName = "Syncthing"
  $exe = (Get-Command syncthing).Source

  Write-Host ""
  Write-Host "Creating Scheduled Task '$taskName' to start Syncthing at logon..."

  # Run minimized/hidden and avoid auto-restart loops. GUI stays reachable on localhost:8384.
  $action = New-ScheduledTaskAction -Execute $exe -Argument "--no-browser --no-restart"
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew

  try {
    # Per-user task (should not require admin, but can fail on locked-down systems).
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
    Write-Host "Scheduled Task created."
  } catch {
    Write-Warning "Failed to create Scheduled Task (often requires elevated permissions on some systems): $($_.Exception.Message)"
    Write-Host "Falling back to Startup folder shortcut (per-user, no admin)..."

    $startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
    $shortcutPath = Join-Path $startupDir "Syncthing.lnk"

    $wsh = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $exe
    $shortcut.Arguments = "--no-browser --no-restart"
    $shortcut.WorkingDirectory = Split-Path -Parent $exe
    $shortcut.WindowStyle = 7 # Minimized
    $shortcut.Description = "Start Syncthing at login"
    $shortcut.Save()

    Write-Host "Startup shortcut created at: $shortcutPath"
    Write-Host "If you later want a Scheduled Task instead: run PowerShell as Administrator and re-run with -InstallAutostart."
  }
}

Write-Host ""
Write-Host "Next steps (GUI):"
Write-Host "1) Open http://localhost:8384"
Write-Host "2) Add your Raspberry Pi as Remote Device (Device ID)"
Write-Host "3) Add Folder pointing at this repo and set it to Send Only"
Write-Host "4) Ensure ignore patterns include the repo root .stignore"
