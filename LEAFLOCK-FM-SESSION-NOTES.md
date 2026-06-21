# LeafLock FM — Session Notes (saved Jun 20, 2026)

Use this file to resume work on the YouTube shuffle + DJ blend player.

## Project location

`C:\Users\wordo\OneDrive\Documents\New project`

Next.js 15.5 + React 19 app (`leaflock-radio`).

## Run locally

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location "C:\Users\wordo\OneDrive\Documents\New project"
npm.cmd run dev
```

- **PC:** http://localhost:3000/fm
- **Phone (same Wi‑Fi):** http://172.16.96.40:3000/fm (IP may change — check with `Get-NetIPAddress` on Wi‑Fi)
- Dev server binds to `0.0.0.0` so phones can connect.

## Main pages

| URL | Purpose |
|-----|---------|
| `/fm` | YouTube shuffle player (top) + optional live AzuraCast stream (collapsed) |
| `/playlist` | Same YouTube shuffle experience |
| `/fm-desk` | Private playlist admin (key in `.env.local`) |

## What we built

### YouTube shuffle player (`LeafLockPlayer`)
- Shuffles playlist `PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va` (~196 tracks)
- Play / pause, skip back, skip forward
- 60-minute no-repeat via `localStorage`
- **Seek slider** — scrub like YouTube (current time / duration)
- **Love button** + top loved tracks
- **No visible YouTube iframe** — audio-only UI; players hidden off-screen
- PWA install prompt; manifest starts at `/fm`

### DJ Blend (dual-deck crossfade)
- Two hidden YouTube decks (A/B) for overlapping playback
- **DJ Blend On/Off** toggle (saved in `localStorage` key `leaflock-dj-blend-enabled`)
- ~15s crossfade (3s pre-roll + 12s fade) with smoothstep curve
- Auto-mix starts before track ends using playlist **duration metadata** (fixes YouTube returning duration `0`)
- **Smart track picking** when blend on: same channel, similar length, longer songs, remix-friendly titles; penalizes live/interview clips
- Prefetches next track on inactive deck
- Fallback if second deck fails to start within ~3s

### Live stream (`LeafLockStreamPlayer`)
- AzuraCast URL: `https://fm.leaflock.com.au/main` (was not live — falls back to BBC 6 Music test stream)
- Background / Media Session for lock screen
- Collapsed under “Live radio stream (optional)” on `/fm`

## Key files

| File | Role |
|------|------|
| `src/app/components/LeafLockPlayer.tsx` | Main shuffle + DJ blend + seek UI |
| `src/app/components/LeafLockStreamPlayer.tsx` | AzuraCast stream player |
| `src/lib/dj-blend.ts` | Crossfade math, timing, duration helpers |
| `src/lib/youtube-playlist.ts` | Shuffle logic, `pickBlendFriendlyVideo` |
| `src/lib/youtube-api.ts` | Playlist fetch + duration/channel enrichment |
| `src/lib/fm-store.ts` | Playlist settings, likes |
| `src/app/fm/page.tsx` | FM page layout |
| `.env.local` | API keys (gitignored) |

## Environment (`.env.local`)

```
YOUTUBE_API_KEY=...
NEXT_PUBLIC_YOUTUBE_PLAYLIST_ID=PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va
FM_PLAYLIST_ID=PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va
FM_ADMIN_SECRET=leaflock-fm-desk-2026
```

Rotate/restrict the YouTube API key if it was shared in chat.

## Known limits

- **iPhone / mobile Chrome:** YouTube shuffle cannot play in background; auto-advance at end of track may need a tap. **Skip (▶) while playing** works as a user gesture and triggers blend.
- **True beat-matching** (BPM/key) not possible with YouTube iframe API alone.
- **Home `/`** may 500 without Prisma `DATABASE_URL` — `/fm` and `/playlist` work without DB.
- **AzuraCast** stream not live yet — test stream used as fallback.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No skip buttons | Use **top** player labeled “YouTube shuffle playlist”, not collapsed live stream |
| Phone can’t connect | Same Wi‑Fi, use PC IP not `localhost`, restart `npm run dev` |
| Playlist won’t play | Hard refresh Ctrl+Shift+R; check amber error under controls |
| DJ blend silent / hard cut | Ensure **DJ Blend On**; try **skip forward** while song is playing |
| Old UI cached | Hard refresh or reinstall PWA; service worker is pass-through only |

## Production domain: fm.leaflock.com.au

| Subdomain | Purpose |
|-----------|---------|
| `fm.leaflock.com.au` | Next.js player (deploy to **Vercel**) — share `/fm` |
| `stream.leaflock.com.au` | AzuraCast live stream (`/main` mount) |

### DNS (at your registrar)

| Type | Host | Value |
|------|------|-------|
| CNAME | `fm` | `cname.vercel-dns.com` |

Then in **Vercel → Project → Settings → Domains**, add `fm.leaflock.com.au`.

### Vercel env vars (Production)

```
APP_URL=https://fm.leaflock.com.au
NEXT_PUBLIC_APP_URL=https://fm.leaflock.com.au
YOUTUBE_API_KEY=...
FM_PLAYLIST_ID=PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va
NEXT_PUBLIC_YOUTUBE_PLAYLIST_ID=PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va
FM_ADMIN_SECRET=...
NEXT_PUBLIC_STREAM_URL=https://stream.leaflock.com.au/main
```

Deploy: `npx vercel login` then `.\deploy-vercel.ps1`

**Friends link:** https://fm.leaflock.com.au/fm (or https://fm.leaflock.com.au — home redirects to `/fm`)

## Resume prompt for AI

Copy this when continuing:

> Continue LeafLock FM at `C:\Users\wordo\OneDrive\Documents\New project`. Read `LEAFLOCK-FM-SESSION-NOTES.md`. Focus: YouTube shuffle player with DJ blend, seek slider, `/fm` page. Dev server: `npm run dev` (0.0.0.0). Playlist PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va.

## Full transcript

Cursor/Grok may also have the full chat at:

`C:\Users\wordo\.grok\sessions\C%3A%5CWINDOWS%5Csystem32\019ee3e1-cfbf-7ad0-bff1-44b78ba19cdc\updates.jsonl`