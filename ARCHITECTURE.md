# LeafLock Radio Architecture

## Production Shape

LeafLock Radio should be built as a custom website and CMS wrapped around a dedicated radio engine.

- Public app: Next.js, TypeScript, Tailwind, SSR for public pages, PWA support for mobile listening
- Database: PostgreSQL for shows, episodes, clips, hosts, schedule blocks, analytics snapshots, publishing jobs, roles, and audit logs
- Queue: Redis-backed workers for media processing and platform publishing
- Storage: S3-compatible object storage for audio, video, artwork, transcripts, waveforms, and clip exports
- Radio: AzuraCast for 24/7 AutoDJ, station scheduling, playlists, media library, DJ accounts, stream mounts, and live takeovers
- Podcast: RSS-first publishing flow suitable for Apple Podcasts validation and Spotify distribution
- Video: YouTube Data API and Live Streaming API workflows for live events, full uploads, clips, thumbnails, chapters, tags, descriptions, and stats

Reference docs:

- AzuraCast APIs: https://azuracast.com/docs/developers/apis/
- AzuraCast Now Playing Data APIs: https://www.azuracast.com/docs/developers/now-playing-data/
- Apple Podcasts RSS requirements: https://podcasters.apple.com/support/823-podcast-requirements
- YouTube Live Streaming API overview: https://developers.google.com/youtube/v3/live/getting-started

## Core Data Model

- Show: title, slug, description, cover art, hosts, tags, preferred platforms, schedule slots
- Episode: title, summary, show, hosts, guests, publish date, duration, audio asset, optional video asset, transcript, chapter markers, platform links, related clips
- Clip: source episode, title, captions, vertical video asset, thumbnail, state, platform destinations
- Host: bio, socials, shows, guest appearances, contact and booking settings
- ScheduleBlock: start time, end time, timezone, recurrence rule, label, show, playlist, live/replay/upcoming state
- PublishingJob: item type, item id, job type, state, attempts, last error, next retry
- AuditLog: actor, action, entity, before/after snapshot, timestamp

## Radio Logic

AzuraCast should own the actual stream and playlist rules. The app should store editorial schedule metadata, then sync relevant windows and playlist assignments to AzuraCast.

Playlist classes:

- Station IDs / sweepers
- Music beds
- Evergreen interviews
- Product reviews
- Event recaps
- Sponsor spots
- Community submissions
- Late night chill
- Morning recap
- Weekend replay
- Live takeover
- Emergency filler

Operational rules:

- Hard time blocks for named shows
- AutoDJ fallback when no live source is connected
- Legal station ID at the configured interval
- Sponsor spot insertion at the configured interval
- Priority-based playlist stacking
- Emergency filler when no eligible media exists

## Publishing Workflow

One master recording should fan out into:

- Full audio for podcast RSS
- Full video for YouTube
- Episode page on the website
- Short clips for social platforms
- Replay/archive entry for the radio stream

States:

- Draft
- Ready for Review
- Approved
- Scheduled
- Published
- Archived
- Failed

Worker jobs:

- Audio normalization
- Waveform generation
- Transcript generation
- Clip extraction
- Thumbnail generation
- RSS feed regeneration
- YouTube upload or livestream scheduling
- Social post draft generation
- Analytics pullback

## Admin Roles

- Super Admin
- Producer
- Host
- Editor
- DJ / Streamer
- Sponsor Manager
- Analytics Viewer

## MVP Phases

Phase 1 should ship the public website, live player, schedule, show pages, episode pages, admin CMS, AzuraCast integration, RSS feed generation, YouTube embeds, and manual Spotify/Apple submission via RSS.

Phase 2 should add direct YouTube API publishing, transcript automation, clip generation, live chat sync, email capture, and sponsor inventory.

Phase 3 should add a mobile app, listener accounts, favorites, reminders, push notifications, community submissions, merch, and premium content.
