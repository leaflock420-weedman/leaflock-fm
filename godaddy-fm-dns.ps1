# LeafLock FM — GoDaddy DNS fix for fm.leaflock.com.au
# Your API key is already in .env.local and works (196 tracks load locally).
# The player is NOT missing — fm.leaflock.com.au points at your main GoDaddy site, not the app.

$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== LeafLock FM — GoDaddy DNS check ===" -ForegroundColor Cyan
Write-Host ""

$lookup = nslookup fm.leaflock.com.au 2>&1 | Out-String
Write-Host $lookup

if ($lookup -match "Aliases:\s*fm\.leaflock\.com\.au" -or $lookup -match "leaflock\.com\.au") {
    Write-Host "PROBLEM: fm.leaflock.com.au points at your main GoDaddy site (leaflock.com.au)." -ForegroundColor Red
    Write-Host "         That page is NOT your LeafLock FM player." -ForegroundColor Red
} else {
    Write-Host "fm subdomain DNS looks custom — verify it targets your host, not GoDaddy parking." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Your player works right now (while PC + tunnel run) ===" -ForegroundColor Green
Write-Host "  http://localhost:3000/fm"
Write-Host "  Check the cloudflared terminal for the trycloudflare.com URL"
Write-Host ""

Write-Host "=== PERMANENT FIX — GoDaddy + Render (recommended, PC can be off) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "STEP 1 — Deploy on Render (free):"
Write-Host "  1. Push this folder to GitHub (see deploy-render.ps1)"
Write-Host "  2. Go to https://render.com → New → Blueprint → connect repo"
Write-Host "  3. Render reads render.yaml automatically"
Write-Host "  4. In Render dashboard → Environment, add:"
Write-Host "       YOUTUBE_API_KEY = (your key from .env.local)"
Write-Host "       FM_ADMIN_SECRET = (your secret from .env.local)"
Write-Host "  5. Wait for deploy — note URL like leaflock-fm.onrender.com"
Write-Host ""
Write-Host "STEP 2 — GoDaddy DNS (leaflock.com.au):"
Write-Host "  1. GoDaddy → My Products → leaflock.com.au → DNS"
Write-Host "  2. DELETE or EDIT any fm record pointing at leaflock.com.au or 23.227.38.65"
Write-Host "  3. ADD record:"
Write-Host "       Type:  CNAME"
Write-Host "       Name:  fm"
Write-Host "       Value: leaflock-fm.onrender.com   (use YOUR Render hostname)"
Write-Host "       TTL:   600 (or 1 Hour)"
Write-Host ""
Write-Host "STEP 3 — Render custom domain:"
Write-Host "  Render → leaflock-fm → Settings → Custom Domains → Add fm.leaflock.com.au"
Write-Host "  Wait 5–30 min for DNS, then open: https://fm.leaflock.com.au"
Write-Host ""
Write-Host "=== ALTERNATIVE — GoDaddy CNAME + Cloudflare Tunnel (PC must stay on) ===" -ForegroundColor Cyan
Write-Host "  1. cloudflared tunnel login"
Write-Host "  2. cloudflared tunnel create leaflock-fm"
Write-Host "  3. Edit cloudflared-fm.yml with tunnel ID"
Write-Host "  4. GoDaddy CNAME: fm → <TUNNEL-ID>.cfargotunnel.com"
Write-Host "  5. cloudflared tunnel route dns leaflock-fm fm.leaflock.com.au"
Write-Host "  6. npm run build && node .next/standalone/server.js"
Write-Host "  7. cloudflared tunnel --config cloudflared-fm.yml run leaflock-fm"
Write-Host ""

# Quick local API test
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/youtube/playlist" -UseBasicParsing -TimeoutSec 10
    $j = $r.Content | ConvertFrom-Json
    Write-Host "API key OK — $($j.count) tracks loaded from YouTube." -ForegroundColor Green
} catch {
    Write-Host "Start the app first: npm run dev   (or node .next/standalone/server.js)" -ForegroundColor Yellow
}

Write-Host ""