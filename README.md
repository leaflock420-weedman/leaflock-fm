# LeafLock Radio

LeafLock Radio is now scaffolded as a production Next.js web app for a 24/7 online radio and podcast platform. The original static prototype remains in `index.html`, `styles.css`, and `app.js` as the approved UI reference.

## Production app quick start

1. Copy `.env.example` to `.env` and set `AUTH_SECRET`.
2. Start local services with `docker compose up -d`.
3. Install dependencies with `npm install`.
4. Generate Prisma client with `npm run prisma:generate`.
5. Create the database schema with `npm run prisma:migrate`.
6. Seed the admin account and starter content with `npm run db:seed`.
7. Run the app with `npm run dev`.
8. Run publishing workers in a second terminal with `npm run worker:publishing`.

Admin login defaults are controlled by `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`.

## What is implemented

- Next.js App Router public site matching the approved LeafLock UI
- PostgreSQL-backed CMS models via Prisma
- Seeded authenticated admin user and cookie/JWT session auth
- Authenticated admin dashboard with content creation, CMS tables, publishing jobs, and logout
- Live audio player with primary/fallback stream switching
- AzuraCast now-playing integration with environment-driven fallback behavior
- Daily/weekly schedule rendering with timezone copy
- Show cards with hosts, tags, schedules, and platform preferences
- Episode rows with metadata, summaries, durations, states, and chapters
- Clip approval cards
- Admin dashboard metrics for stream health, failed uploads, pending approvals, and listener analytics
- Database publishing workflow queue with content states: Draft, Ready for Review, Approved, Scheduled, Published, Archived, Failed
- BullMQ/Redis publishing worker scaffold for media, RSS, AzuraCast, YouTube, and analytics jobs
- S3-compatible presigned upload endpoint for media storage
- Podcast RSS generation at `/rss.xml`
- Share workflow using Web Share API or clipboard fallback
- Contact form that prepares an email submission
- RadioStation schema markup and Open Graph metadata

## Production architecture target

- Website/CMS: Next.js, TypeScript, Tailwind, PostgreSQL, admin roles, audit logs
- Radio engine: AzuraCast with Icecast-compatible mounts, AutoDJ, scheduled playlists, DJ accounts, and live takeover support
- Workers: Redis queue plus FFmpeg services for normalization, waveform generation, transcripts, clip extraction, thumbnails, RSS regeneration, and platform publishing retries
- Storage: S3-compatible object storage for audio, video, artwork, transcripts, waveforms, and clip exports
- Podcast: RSS-first feed suitable for Apple Podcasts validation and Spotify distribution
- Video: YouTube livestream scheduling, prerecorded uploads, clip uploads, thumbnails, titles, descriptions, tags, chapters, and stats pullback

## Files

- `index.html`: public and admin prototype markup
- `styles.css`: responsive UI styling
- `app.js`: seeded data, player controls, schedule rendering, chat, and workflow queue logic
- `integrations.example.json`: configuration checklist for production services
- `ARCHITECTURE.md`: implementation handoff for the full-stack build
- `rss.example.xml`: starter podcast feed shape for Apple/Spotify validation work
- `prisma/schema.prisma`: database schema for CMS, scheduling, publishing, users, analytics, and audit logs
- `src/app`: Next.js app routes, public UI, admin UI, auth routes, RSS, storage, and radio APIs
- `src/lib`: database, auth, AzuraCast, RSS, storage, queue, and content services
- `src/workers/publishing-worker.ts`: background worker entrypoint
- `docker-compose.yml`: local Postgres, Redis, and MinIO services

## Going live

Replace the demo stream URLs in `index.html` and `app.js` with your AzuraCast public mount URLs. Before accepting public uploads, add authentication, server-side validation, virus scanning, object storage, media quotas, audit logs, backups, and retry queues.

For the production app, set `PRIMARY_STREAM_URL`, `FALLBACK_STREAM_URL`, `AZURACAST_BASE_URL`, `AZURACAST_STATION_SHORTCODE`, and `AZURACAST_API_KEY` in `.env`. The worker currently records or skips external publishing calls when provider credentials are missing, so it is safe to run locally before YouTube, Spotify, Apple, and AzuraCast credentials are live.
