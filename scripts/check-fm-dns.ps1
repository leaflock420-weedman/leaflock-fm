# Quick DNS + SSL check for fm.leaflock.com.au
Write-Host "=== fm.leaflock.com.au DNS (Google) ===" -ForegroundColor Cyan
$dns = Invoke-RestMethod "https://dns.google/resolve?name=fm.leaflock.com.au&type=CNAME"
if ($dns.Answer) {
  $dns.Answer | ForEach-Object { Write-Host "  CNAME -> $($_.data)" -ForegroundColor Green }
} else {
  Write-Host "  No CNAME found — add: fm -> leaflock-fm.onrender.com in GoDaddy" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Render app (should be 200) ===" -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest "https://leaflock-fm.onrender.com/fm" -UseBasicParsing -TimeoutSec 20
  Write-Host "  leaflock-fm.onrender.com/fm -> $($r.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "  leaflock-fm.onrender.com failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Custom domain (403 = add + verify in Render dashboard) ===" -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest "https://fm.leaflock.com.au/fm" -UseBasicParsing -TimeoutSec 20
  Write-Host "  fm.leaflock.com.au/fm -> $($r.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "  fm.leaflock.com.au -> $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "  Fix: Render -> leaflock-fm -> Settings -> Custom Domains -> Add fm.leaflock.com.au -> Verify" -ForegroundColor Yellow
}