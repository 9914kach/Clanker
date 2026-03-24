param(
    [string]$PiHoleIP = "192.168.1.50",
    [string]$SshHost = "pi@raspberrypi",
    [switch]$SkipSsh
)

$ErrorActionPreference = "Stop"

function Test-NslookupContains {
    param(
        [string]$Domain,
        [string]$Server,
        [string[]]$ExpectedPatterns
    )

    $output = nslookup $Domain $Server 2>&1 | Out-String
    $ok = $false
    foreach ($pattern in $ExpectedPatterns) {
        if ($output -match $pattern) {
            $ok = $true
            break
        }
    }

    [PSCustomObject]@{
        Domain = $Domain
        Ok = $ok
        Output = $output.Trim()
    }
}

Write-Host "Pi-hole healthcheck startar..." -ForegroundColor Cyan
Write-Host "DNS server: $PiHoleIP`n"

# 1) Tillaten doman ska ge en riktig IP (inte 0.0.0.0 / ::)
$google = Test-NslookupContains -Domain "google.com" -Server $PiHoleIP -ExpectedPatterns @("Address:\s+\d+\.\d+\.\d+\.\d+", "Addresses:\s+\d+\.\d+\.\d+\.\d+")
$googleBlocked = ($google.Output -match "0\.0\.0\.0|::\s*$")
$googleOk = $google.Ok -and -not $googleBlocked

if ($googleOk) {
    Write-Host "[OK] google.com resolvear normalt" -ForegroundColor Green
} else {
    Write-Host "[FAIL] google.com ser inte frisk ut" -ForegroundColor Red
    Write-Host $google.Output
}

# 2) Blockerad doman ska hamna i 0.0.0.0 / NXDOMAIN
$flurry = Test-NslookupContains -Domain "flurry.com" -Server $PiHoleIP -ExpectedPatterns @("0\.0\.0\.0", "NXDOMAIN", "0:0:0:0:0:0:0:0", "Addresses:\s+::")
if ($flurry.Ok) {
    Write-Host "[OK] flurry.com blockeras" -ForegroundColor Green
} else {
    Write-Host "[FAIL] flurry.com verkar inte blockeras" -ForegroundColor Red
    Write-Host $flurry.Output
}

# 3) Fjarrkoll via SSH (valfri)
if (-not $SkipSsh) {
    Write-Host "`nKontrollerar container via SSH ($SshHost)..." -ForegroundColor Cyan
    try {
        $remote = ssh $SshHost "docker inspect -f '{{.State.Status}}' clanker-pihole 2>/dev/null || echo missing" 2>&1 | Out-String
        if ($remote -match "running") {
            Write-Host "[OK] Docker-container 'clanker-pihole' ar running" -ForegroundColor Green
        } elseif ($remote -match "missing") {
            Write-Host "[WARN] Kunde inte hitta container 'clanker-pihole'" -ForegroundColor Yellow
        } else {
            Write-Host "[WARN] Okant containersvar: $($remote.Trim())" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[WARN] SSH-kontroll misslyckades: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "`nKlar." -ForegroundColor Cyan
