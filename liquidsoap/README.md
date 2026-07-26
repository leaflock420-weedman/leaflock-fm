# DJ420 continuous Locked In Radio (Xiaohongshu model)

## Architecture

```
Liquidsoap playlist + 5s crossfade
        ↓
Icecast /live.mp3  (never-ending stream)
        ↓
https://fm.leaflock.com.au/live.mp3  (optional same-origin proxy)
        ↓
Native HTML <audio id="leaflockRadio">  (one element, fixed URL)
        ↓
Chrome Media Session → pull-down / lock screen keeps working after you leave
```

This is the same pattern Xiaohongshu uses for browser media: **native HTML media + direct continuous file/stream**, not a cross-origin YouTube iframe.

| Mode | Engine |
|------|--------|
| **Locked In Radio (live)** | Continuous Icecast stream only |
| **Private jukebox** | YouTube dual-deck + client DJ blend |

Do **not**:

- Put live music in YouTube iframes
- Proxy one YouTube track at a time through Next.js / yt-dlp
- Cache-bust the stream with `?t=Date.now()`
- Use a silent audio bridge for live radio

## Quick start (Docker)

```bash
cd liquidsoap
export ICECAST_SOURCE_PASSWORD='your-strong-password'
# Put MP3/AAC files under ../media and list them in ../playlists/main.m3u
docker compose up -d
```

Icecast listen URL:

`http://YOUR_HOST:8000/live.mp3`

Put TLS in front (Caddy/nginx) so clients use:

`https://stream.leaflock.com.au/live.mp3`

## Render env (LeafLock web app)

```
DJ420_UPSTREAM_URL=https://stream.leaflock.com.au/live.mp3
PRIMARY_STREAM_URL=https://stream.leaflock.com.au/live.mp3
NEXT_PUBLIC_STREAM_URL=https://fm.leaflock.com.au/live.mp3
```

`/live.mp3` on the main site **proxies** the upstream Icecast mount (same-origin for phones).

## Liquidsoap

See `dj420.liq` — playlist + equal-power style crossfade + Icecast MP3 output.

## Media Session branding

The phone UI shows:

- **Title:** LeafLock Radio  
- **Artist:** Locked In Radio  
- **Album:** LeafLock FM 104.2  

Song titles can still appear in the website UI; they are **not** required on the lock screen.
