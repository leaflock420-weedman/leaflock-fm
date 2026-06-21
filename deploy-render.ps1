# Prepare LeafLock FM for Render.com deploy (GoDaddy DNS → fm.leaflock.com.au)
$env:Path = "C:\Program Files\Git\cmd;C:\Program Files\nodejs;" + $env:Path
Set-Location $PSScriptRoot

if (-not (Test-Path .git)) {
    git init
    git add .
    git commit -m "LeafLock FM — YouTube shuffle player for fm.leaflock.com.au"
    Write-Host "Git repo created." -ForegroundColor Green
} else {
    Write-Host "Git repo already exists." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next steps (one-time):" -ForegroundColor Cyan
Write-Host "  1. Create empty repo on GitHub, e.g. leaflock-fm"
Write-Host "  2. Run:"
Write-Host "       git remote add origin https://github.com/YOUR_USER/leaflock-fm.git"
Write-Host "       git branch -M main"
Write-Host "       git push -u origin main"
Write-Host "  3. Render.com → New → Blueprint → connect that repo"
Write-Host "  4. Add env vars in Render: YOUTUBE_API_KEY, FM_ADMIN_SECRET"
Write-Host "  5. Run godaddy-fm-dns.ps1 for GoDaddy CNAME instructions"
Write-Host ""