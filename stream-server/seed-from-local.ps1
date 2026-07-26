# Download station playlist tracks on a residential IP and seed leaflock-stream cache.
# Usage: powershell -File stream-server/seed-from-local.ps1 [-MaxTracks 50]

param(
  [int]$MaxTracks = 80,
  [string]$StreamBase = "https://leaflock-stream.onrender.com",
  [string]$AdminSecret = "leaflock-fm-desk-2026",
  [string]$PlaylistId = "PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va",
  [string]$YtApiKey = "AIzaSyD4f1Oc6R9xC58TSiS99BvayekV29rZO2A"
)

$ErrorActionPreference = "Continue"
$seedDir = Join-Path $PSScriptRoot "seed-cache"
New-Item -ItemType Directory -Force -Path $seedDir | Out-Null
$node = (Get-Command node -ErrorAction Stop).Source
$ytDlp = (Get-Command yt-dlp -ErrorAction Stop).Source

Write-Host "Listing playlist $PlaylistId ..."
$ids = [System.Collections.Generic.List[string]]::new()
$page = $null
do {
  $url = "https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=$PlaylistId&key=$YtApiKey"
  if ($page) { $url += "&pageToken=$page" }
  $r = Invoke-RestMethod $url -TimeoutSec 30
  foreach ($it in $r.items) {
    $vid = $it.contentDetails.videoId
    if ($vid -and -not $ids.Contains($vid)) { [void]$ids.Add($vid) }
  }
  $page = $r.nextPageToken
} while ($page -and $ids.Count -lt $MaxTracks)

if ($ids.Count -gt $MaxTracks) {
  $ids = $ids.GetRange(0, $MaxTracks)
}
Write-Host "Unique tracks to seed: $($ids.Count)"

$ok = 0
$fail = 0
$skip = 0
$i = 0
foreach ($vid in $ids) {
  $i++
  $out = Join-Path $seedDir "$vid.m4a"
  Write-Host "[$i/$($ids.Count)] $vid"

  if (-not ((Test-Path $out) -and (Get-Item $out).Length -gt 50000)) {
    & $ytDlp -f "140/bestaudio/best" -o $out --no-playlist --no-warnings `
      --js-runtimes "node:$node" `
      --extractor-args "youtube:player_client=android_vr,web" `
      "https://www.youtube.com/watch?v=$vid" 2>&1 | Out-Null
  }

  if (-not ((Test-Path $out) -and (Get-Item $out).Length -gt 50000)) {
    Write-Host "  download failed"
    $fail++
    continue
  }

  try {
    $bytes = [System.IO.File]::ReadAllBytes($out)
    $uri = "$StreamBase/admin/seed?videoId=$vid&ext=m4a"
    $req = [System.Net.HttpWebRequest]::Create($uri)
    $req.Method = "POST"
    $req.ContentType = "application/octet-stream"
    $req.Headers.Add("x-stream-secret", $AdminSecret)
    $req.Timeout = 180000
    $req.ReadWriteTimeout = 180000
    $req.ContentLength = $bytes.Length
    $s = $req.GetRequestStream()
    $s.Write($bytes, 0, $bytes.Length)
    $s.Close()
    $resp = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $body = $reader.ReadToEnd()
    $reader.Close(); $resp.Close()
    Write-Host "  seeded $($bytes.Length) -> $body"
    $ok++
  } catch {
    Write-Host "  upload fail $($_.Exception.Message)"
    $fail++
  }
}

Write-Host "Done ok=$ok fail=$fail skip=$skip"
try {
  $h = Invoke-RestMethod "$StreamBase/health" -TimeoutSec 20
  "health cachedTracks=$($h.cachedTracks) build=$($h.build) lastSource=$($h.lastSource)"
} catch {
  "health check failed: $($_.Exception.Message)"
}
