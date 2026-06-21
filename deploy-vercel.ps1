# LeafLock FM — deploy to Vercel + fm.leaflock.com.au
#
# ONE-TIME SETUP
#   1. npx vercel login
#   2. Run this script
#   3. Vercel dashboard → Project → Settings → Environment Variables (Production):
#        YOUTUBE_API_KEY
#        FM_PLAYLIST_ID=PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va
#        NEXT_PUBLIC_YOUTUBE_PLAYLIST_ID=PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va
#        FM_ADMIN_SECRET=(your secret)
#        APP_URL=https://fm.leaflock.com.au
#        NEXT_PUBLIC_APP_URL=https://fm.leaflock.com.au
#        NEXT_PUBLIC_STREAM_URL=https://stream.leaflock.com.au/main
#   4. Vercel dashboard → Project → Settings → Domains → Add: fm.leaflock.com.au
#   5. At your domain registrar (where leaflock.com.au DNS is managed), add:
#        Type: CNAME
#        Name/Host: fm
#        Value/Target: cname.vercel-dns.com
#        TTL: 300 (or Auto)
#   6. Wait 5–30 min for DNS, then open https://fm.leaflock.com.au/fm
#
# NOTE: fm.leaflock.com.au = this player website.
#       stream.leaflock.com.au = AzuraCast live stream (point that subdomain at your radio server).

$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location $PSScriptRoot

Write-Host "Building LeafLock FM..."
npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying to Vercel (production)..."
npx.cmd vercel deploy --prod --yes
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Login required? Run:  npx vercel login"
  Write-Host "Then run this script again."
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Deployed. Final steps:"
Write-Host "  1. Add env vars in Vercel (see comments at top of deploy-vercel.ps1)"
Write-Host "  2. Add domain fm.leaflock.com.au in Vercel → Settings → Domains"
Write-Host "  3. Add DNS CNAME:  fm  ->  cname.vercel-dns.com"
Write-Host ""
Write-Host "Friends link: https://fm.leaflock.com.au/fm"