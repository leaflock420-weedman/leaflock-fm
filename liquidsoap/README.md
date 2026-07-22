# DJ420 Liquidsoap (continuous Live Radio)

Crossfades run **once on the server**. Phones play the permanent element:

`https://fm.leaflock.com.au/live.mp3`

(same-origin on the main site — no `stream.` DNS required for the app).

Optional: point `DJ420_UPSTREAM_URL` at your Icecast/Liquidsoap encoder
(e.g. `https://stream.leaflock.com.au/live.mp3`) so `/live.mp3` proxies real radio.

## Quick start (Docker)

```bash
cd liquidsoap
export ICECAST_SOURCE_PASSWORD='your-strong-password'
# Put MP3/AAC files under ../media and list them in ../playlists/main.m3u
docker compose up -d
```

Icecast listen URL (raw):

`http://YOUR_HOST:8000/live.mp3`

**DNS (required):** create an A/CNAME record for `stream.leaflock.com.au` pointing at this host.
Without DNS, `nslookup stream.leaflock.com.au` fails and the app cannot use Liquidsoap.

Terminate TLS (Caddy/nginx) so clients use:

`https://stream.leaflock.com.au/live.mp3`

## Env for LeafLock FM (Render)

```
PRIMARY_STREAM_URL=https://stream.leaflock.com.au/live.mp3
NEXT_PUBLIC_STREAM_URL=https://stream.leaflock.com.au/live.mp3
```

## Liquidsoap config

See `dj420.liq` — playlist + 4s crossfade + Icecast MP3 output.

## Notes

- Do **not** run DJ Blend crossfade on every Live Radio listener phone.
- Private jukebox still uses YouTube + client DJ Blend.
- Fill `playlists/main.m3u` with real audio file paths Liquidsoap can read.
