# LeafLock FM — put YouTube player on fm.leaflock.com.au (no Vercel)
#
# OPTION A — Render.com (recommended, free, PC can be off)
#   1. Sign up: https://render.com
#   2. Push this project to GitHub (or use Render "Deploy from Git" after uploading)
#   3. New → Blueprint → connect repo → uses render.yaml in this folder
#   4. Add secret env vars in Render dashboard:
#        YOUTUBE_API_KEY, FM_ADMIN_SECRET
#   5. Render gives you a URL like leaflock-fm.onrender.com
#   6. At your DNS for leaflock.com.au, set:
#        CNAME  fm  →  leaflock-fm.onrender.com
#   7. Render dashboard → Settings → Custom Domains → add fm.leaflock.com.au
#   8. Share: https://fm.leaflock.com.au
#
# OPTION B — Cloudflare Tunnel (if leaflock.com.au DNS is on Cloudflare)
#   1. Run: winget install Cloudflare.cloudflared
#   2. Run: cloudflared tunnel login
#   3. Run: cloudflared tunnel create leaflock-fm
#   4. Run: cloudflared tunnel route dns leaflock-fm fm.leaflock.com.au
#   5. Edit cloudflared-fm.yml below with your tunnel ID, then:
#        cloudflared tunnel --config cloudflared-fm.yml run leaflock-fm
#   6. Keep this PC on with: npm run build && node .next/standalone/server.js
#
# OPTION C — Any VPS with Docker
#   docker build -t leaflock-fm .
#   docker run -d -p 3000:3000 --env-file .env.production leaflock-fm
#   Point fm.leaflock.com.au A record to server IP, nginx proxy to :3000

$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location $PSScriptRoot

Write-Host "Building production app..."
npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Build OK. Standalone server:"
Write-Host "  node .next/standalone/server.js"
Write-Host ""
Write-Host "Local test: http://localhost:3000/fm"
Write-Host ""
Write-Host "For fm.leaflock.com.au without Vercel, use Render (Option A) — see top of this script."
Write-Host "Open setup instructions: notepad setup-fm-subdomain.ps1"