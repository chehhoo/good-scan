# dev-phone.ps1 -- start local dev server + Cloudflare tunnel for phone testing
#
# Usage: .\dev-phone.ps1
#
# Requires: Node.js, good-api running via docker compose

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$GoodApiDir = Join-Path $ScriptDir "..\good-api"
$VitePort = 5173

function Stop-VitePorts {
    Get-NetTCPConnection -LocalPort 5173,5174,5175,5176 -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Get-Process -Name "node" -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -eq "" } |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# -- 0. Free Vite ports if anything is using them -----------------------------
Write-Host "Freeing Vite ports..." -ForegroundColor Cyan
Stop-VitePorts

# -- 1. Start Vite in background -----------------------------------------------
Write-Host "Starting Vite dev server on port $VitePort..." -ForegroundColor Cyan
$ViteProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host", "--port", "$VitePort" -WorkingDirectory $ScriptDir -PassThru -NoNewWindow
Start-Sleep -Seconds 4

# -- 2. Start Cloudflare tunnel, capture URL -----------------------------------
Write-Host "Starting Cloudflare tunnel..." -ForegroundColor Cyan
$TunnelLog = Join-Path $env:TEMP "cloudflared-tunnel.log"
$TunnelErrLog = Join-Path $env:TEMP "cloudflared-tunnel-err.log"
Remove-Item $TunnelLog, $TunnelErrLog -ErrorAction SilentlyContinue
$TunnelProc = Start-Process -FilePath "npx.cmd" -ArgumentList "cloudflared", "tunnel", "--url", "http://localhost:$VitePort" -PassThru -NoNewWindow -RedirectStandardOutput $TunnelLog -RedirectStandardError $TunnelErrLog

Write-Host "Waiting for tunnel URL..."
$TunnelUrl = ""
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $TunnelErrLog) {
        $content = Get-Content $TunnelErrLog -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
            $TunnelUrl = $Matches[0]
            break
        }
    }
}

if (-not $TunnelUrl) {
    Write-Host "ERROR: Could not get tunnel URL." -ForegroundColor Red
    if (Test-Path $TunnelErrLog) { Get-Content $TunnelErrLog }
    Stop-Process -Id $ViteProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $TunnelProc.Id -Force -ErrorAction SilentlyContinue
    Stop-VitePorts
    exit 1
}

Write-Host "Tunnel URL: $TunnelUrl" -ForegroundColor Green

# -- 3. Restart good-api with tunnel origin allowed ----------------------------
Write-Host "Allowing tunnel origin in good-api CORS..." -ForegroundColor Cyan
$cors = "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:3000,$TunnelUrl"
$env:CORS_ALLOWED_ORIGINS = $cors
Push-Location $GoodApiDir
docker compose up -d --force-recreate api
Pop-Location

# -- 4. Wait for good-api to be ready ------------------------------------------
Write-Host "Waiting for good-api to be ready..." -ForegroundColor Cyan
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8090/api/register/event-info" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -lt 500) { Write-Host "good-api is ready." -ForegroundColor Green; break }
    } catch {}
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "------------------------------------------------------" -ForegroundColor Yellow
Write-Host "  Open on your phone: $TunnelUrl" -ForegroundColor Yellow
Write-Host "------------------------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop everything."

# -- 5. Wait and clean up on exit ----------------------------------------------
try {
    Wait-Process -Id $ViteProc.Id
} finally {
    Write-Host "Stopping..." -ForegroundColor Cyan
    Stop-Process -Id $ViteProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $TunnelProc.Id -Force -ErrorAction SilentlyContinue
    Stop-VitePorts
    Remove-Item $TunnelLog -ErrorAction SilentlyContinue
    Remove-Item $TunnelErrLog -ErrorAction SilentlyContinue
    Write-Host "All processes stopped." -ForegroundColor Green
}
