# dev-phone.ps1 — start local dev server + Cloudflare tunnel for phone testing
#
# Usage: .\dev-phone.ps1
#
# Requires: Node.js, good-api running via docker compose

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$GoodApiDir = Join-Path $ScriptDir "..\good-api"

# ── 1. Start Vite in background ───────────────────────────────────────────────
Write-Host "Starting Vite dev server..." -ForegroundColor Cyan
$ViteProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host" -WorkingDirectory $ScriptDir -PassThru -NoNewWindow

Start-Sleep -Seconds 3

# ── 2. Start Cloudflare tunnel, capture URL ───────────────────────────────────
Write-Host "Starting Cloudflare tunnel..." -ForegroundColor Cyan
$TunnelLog = Join-Path $env:TEMP "cloudflared-tunnel.log"
$TunnelErrLog = Join-Path $env:TEMP "cloudflared-tunnel-err.log"
$TunnelProc = Start-Process -FilePath "npx.cmd" -ArgumentList "cloudflared", "tunnel", "--url", "http://localhost:5173" -PassThru -NoNewWindow -RedirectStandardOutput $TunnelLog -RedirectStandardError $TunnelErrLog

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
    exit 1
}

Write-Host "✓ Tunnel URL: $TunnelUrl" -ForegroundColor Green

# ── 3. Restart good-api with tunnel origin allowed ────────────────────────────
Write-Host "Allowing tunnel origin in good-api CORS..." -ForegroundColor Cyan
$cors = "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:3000,$TunnelUrl"
$env:CORS_ALLOWED_ORIGINS = $cors
Push-Location $GoodApiDir
docker compose up -d --force-recreate api
Pop-Location

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "  Open on your phone: $TunnelUrl" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop everything."

# ── 4. Wait and clean up on exit ─────────────────────────────────────────────
try {
    Wait-Process -Id $ViteProc.Id
} finally {
    Write-Host "Stopping..." -ForegroundColor Cyan
    Stop-Process -Id $ViteProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $TunnelProc.Id -Force -ErrorAction SilentlyContinue
    Remove-Item $TunnelLog -ErrorAction SilentlyContinue
    Remove-Item $TunnelErrLog -ErrorAction SilentlyContinue
}
