"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

type Show = {
  title: string;
  slug: string;
  description: string;
  coverArtUrl: string;
  tags: string[];
  preferredPlatforms: string[];
  hosts: string[];
};

type Episode = {
  title: string;
  slug: string;
  summary: string;
  publishDate: string;
  duration: string;
  state: string;
  show: string;
  hosts: string[];
  chapters: unknown[];
};

type Clip = {
  title: string;
  slug: string;
  caption: string;
  state: string;
  source: string;
};

type ScheduleBlock = {
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  recurrence: string | null;
  label: string;
  show: string;
};

export type HomeData = {
  station: {
    name: string;
    primaryStreamUrl: string;
    fallbackStreamUrl: string;
    timezone: string;
    featuredEpisode: {
      title: string;
      summary: string;
    } | null;
  };
  nowPlaying: {
    isOnline: boolean;
    live: { isLive: boolean; streamerName?: string | null };
    nowPlaying: { title: string; artist?: string | null; art?: string | null };
    listeners: { current: number; unique?: number; total?: number };
    station: { name: string; listenUrl: string };
  } | null;
  analytics: { liveListeners: number; avgSessionSec: number; podcastDownloads: number } | null;
  shows: Show[];
  episodes: Episode[];
  clips: Clip[];
  scheduleBlocks: ScheduleBlock[];
};

const platforms = [
  ["AzuraCast", "Station, AutoDJ, playlists, scheduler, mount points, and DJ accounts.", "Connect stream URL"],
  ["YouTube", "Livestream scheduling, full episode uploads, clips, thumbnails, chapters, stats.", "Prepare OAuth app"],
  ["Spotify", "RSS-based podcast distribution with optional video workflow support.", "Validate feed"],
  ["Apple Podcasts", "Required RSS tags, artwork, media checks, and submission checklist.", "Run checklist"],
  ["Object Storage", "Artwork, audio, video masters, transcripts, waveforms, and clip exports.", "Set bucket policy"],
  ["Workers", "FFmpeg normalization, transcript generation, RSS rebuilds, retry queues.", "Queue jobs"]
] as const;

const seedChat = [
  "Nia: Morning Canopy is live. Send your picks.",
  "LeafLock Desk: Sponsor block clears at 08:30 AEST.",
  "Marlon: Replay sounded clean on mobile."
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Australia/Brisbane"
  }).format(new Date(value));
}

export function HomeClient({ data }: { data: HomeData }) {
  const [streamUrl, setStreamUrl] = useState(data.nowPlaying?.station.listenUrl || data.station.primaryStreamUrl);
  const [scheduleView, setScheduleView] = useState<"daily" | "weekly">("daily");
  const [chatMessages, setChatMessages] = useState(seedChat);
  const [chatDraft, setChatDraft] = useState("");

  const schedule = useMemo(() => {
    if (scheduleView === "weekly") return data.scheduleBlocks;
    return data.scheduleBlocks.slice(0, 4);
  }, [data.scheduleBlocks, scheduleView]);

  async function shareStation() {
    const body = `${data.station.name} is live now.`;
    if (navigator.share) {
      await navigator.share({ title: data.station.name, text: body, url: window.location.href });
      return;
    }
    await navigator.clipboard.writeText(`${body}\n${window.location.href}`);
    alert("Share text copied to clipboard.");
  }

  async function createWorkflow(formData: FormData) {
    const response = await fetch("/api/admin/content", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData
    });
    if (!response.ok) {
      alert("Workflow item could not be created. Check your login and server logs.");
      return;
    }
    alert("Workflow item created and publishing jobs queued.");
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="LeafLock Radio home">
          <span className="brand-mark">LLR</span>
          <span>LeafLock Radio</span>
        </a>
        <nav className="nav" aria-label="Main navigation">
          <Link href="/fm#shuffle">YouTube Shuffle</Link>
          <Link href="/fm">Listen Live</Link>
          <a href="#listen">Listen</a>
          <a href="#shows">Shows</a>
          <a href="#episodes">Episodes</a>
          <a href="#schedule">Schedule</a>
          <a href="#clips">Clips</a>
          <a href="/admin">Admin</a>
        </nav>
        <ThemeToggle />
      </header>

      <main id="home">
        <section id="listen" className="live-section">
          <div className="live-copy">
            <p className="eyebrow">24/7 AutoDJ and live takeovers</p>
            <h1>Stay locked on the culture, all day.</h1>
            <p>
              Live radio, weekly shows, podcast drops, video episodes, and clips from one publishing desk.
              Built around AzuraCast for the radio engine and RSS-first podcast distribution.
            </p>
            <div className="live-actions">
              <button className="primary-button" onClick={shareStation} type="button">Share Station</button>
              <a className="secondary-button" href="/admin">Open Admin</a>
            </div>
            <div className="subscribe-row" aria-label="Subscribe links">
              <a href="#platforms">YouTube</a>
              <a href="#platforms">Spotify</a>
              <a href="#platforms">Apple Podcasts</a>
              <a href="/rss.xml">RSS</a>
            </div>
          </div>

          <aside className="player-shell" aria-label="Live radio player">
            <img
              className="cover-art"
              src={data.nowPlaying?.nowPlaying.art || "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1000&q=80"}
              alt="Crowd at a live music event"
            />
            <div className="player-content">
              <p className="status-pill"><span className="pulse-dot" /> {data.nowPlaying?.live.isLive ? "Live now" : "AutoDJ"}</p>
              <h2>{data.nowPlaying?.nowPlaying.title || "Morning Canopy"}</h2>
              <p>{data.nowPlaying?.nowPlaying.artist || "Nia Vale - interviews, sponsor spots, IDs, and new releases"}</p>
              <audio controls preload="none" src={streamUrl} />
              <div className="player-actions">
                <button
                  className="mini-button"
                  onClick={() => setStreamUrl((current) => (current === data.station.fallbackStreamUrl ? data.station.primaryStreamUrl : data.station.fallbackStreamUrl))}
                  type="button"
                >
                  Try Fallback
                </button>
              </div>
              <p className="stream-note">Connected to the configured AzuraCast public mount when credentials are available.</p>
            </div>
          </aside>
        </section>

        <section className="status-row" aria-label="Station status">
          <div><strong>{data.nowPlaying?.isOnline ? "On air" : "Ready"}</strong><span>fallback AutoDJ ready</span></div>
          <div><strong>{data.nowPlaying?.listeners.current || data.analytics?.liveListeners || 0}</strong><span>current listeners</span></div>
          <div><strong>{schedule[0]?.title || "Green Room"}</strong><span>next show in {data.station.timezone}</span></div>
          <div><strong>RSS-ready</strong><span>Apple and Spotify checklist</span></div>
        </section>

        <section className="section-block split-band">
          <div className="section-heading">
            <p className="eyebrow">Featured episode</p>
            <h2>{data.station.featuredEpisode?.title || "Field Notes 018: Building a scene that lasts"}</h2>
            <p>{data.station.featuredEpisode?.summary || "A flagship studio conversation with chapter markers, transcript support, podcast metadata, YouTube embed space, related clips, and platform links."}</p>
            <a className="secondary-button" href="#episodes">View Episode</a>
          </div>
          <div className="chat-panel" aria-label="Live chat module">
            <div className="panel-title"><h3>Live Chat</h3><span className="label live">Broadcasting</span></div>
            <ul className="chat-list">
              {chatMessages.map((message) => <li key={message}>{message}</li>)}
            </ul>
            <form
              className="chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!chatDraft.trim()) return;
                setChatMessages((messages) => [...messages, `You: ${chatDraft.trim()}`]);
                setChatDraft("");
              }}
            >
              <label className="sr-only" htmlFor="chatMessage">Chat message</label>
              <input id="chatMessage" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={120} placeholder="Send a shoutout" />
              <button className="mini-button" type="submit">Send</button>
            </form>
          </div>
        </section>

        <section id="shows" className="section-block">
          <div className="section-heading"><p className="eyebrow">Shows</p><h2>Recurring programming</h2><p>Every show includes hosts, tags, scheduled slots, latest episodes, latest clips, and preferred platforms.</p></div>
          <div className="card-grid">
            {data.shows.map((show) => (
              <article className="content-card" key={show.slug}>
                <img src={show.coverArtUrl} alt={`${show.title} cover art`} />
                <div>
                  <span className="label">{show.hosts.join(", ") || "LeafLock Radio"}</span>
                  <h3>{show.title}</h3>
                  <p>{show.description}</p>
                  <p>{show.tags.join(" / ")}</p>
                  <span>{show.preferredPlatforms.join(", ")}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="episodes" className="section-block alt-band">
          <div className="section-heading"><p className="eyebrow">Episodes</p><h2>Podcast and video archive</h2><p>Episode pages support audio, video embeds, transcripts, chapters, guests, platform links, and related clips.</p></div>
          <div className="feature-list">
            {data.episodes.map((episode) => (
              <article className="episode-row" key={episode.slug}>
                <div>
                  <span className="label">{episode.state.replaceAll("_", " ")}</span>
                  <h3>{episode.title}</h3>
                  <p>{episode.summary}</p>
                  <span>{episode.show} - {episode.hosts.join(", ")} - {new Date(episode.publishDate).toLocaleDateString("en-AU")} - {episode.duration}</span>
                </div>
                <div>
                  <strong>Chapters</strong>
                  <p>{episode.chapters.length ? JSON.stringify(episode.chapters) : "Transcript and chapter jobs are queued from the admin workflow."}</p>
                  <a className="mini-link" href="#platforms">Platform links</a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="schedule" className="section-block">
          <div className="section-heading"><p className="eyebrow">Schedule</p><h2>Timezone-aware station clock</h2><p>Hard show blocks sit on top of AutoDJ, sponsor inserts, legal IDs, late-night chill, replays, and emergency filler.</p></div>
          <div className="toolbar" role="group" aria-label="Schedule view controls">
            <button className={`mini-button ${scheduleView === "daily" ? "is-active" : ""}`} onClick={() => setScheduleView("daily")} type="button">Daily</button>
            <button className={`mini-button ${scheduleView === "weekly" ? "is-active" : ""}`} onClick={() => setScheduleView("weekly")} type="button">Weekly</button>
          </div>
          <div className="schedule-grid" aria-live="polite">
            {schedule.map((slot) => (
              <article className="schedule-card" key={`${slot.title}-${slot.startsAt}`}>
                <time>{formatDate(slot.startsAt)} {slot.timezone}</time>
                <strong>{slot.title}</strong>
                <span>{slot.show}</span>
                <span className="label">{slot.label}</span>
              </article>
            ))}
          </div>
        </section>

        <section id="clips" className="section-block split-band">
          <div><p className="eyebrow">Clips</p><h2>Shorts, highlights, and social drafts</h2><p>One master recording can produce a live replay, podcast audio, YouTube upload, transcript, waveform, thumbnail, and clip queue for approval.</p></div>
          <div className="clip-grid">
            {data.clips.map((clip) => (
              <article className="clip-card" key={clip.slug}>
                <span className="label">{clip.state.replaceAll("_", " ")}</span>
                <h3>{clip.title}</h3>
                <p>{clip.source}</p>
                <button className="mini-button" type="button">Draft Social Post</button>
              </article>
            ))}
          </div>
        </section>

        <section id="admin" className="section-block admin-section">
          <div className="section-heading"><p className="eyebrow">Admin dashboard</p><h2>Run the station desk</h2><p>Monitor stream health, uploads, approvals, scheduled content, analytics, audit events, and failed jobs.</p></div>
          <div className="dashboard-grid">
            <article className="metric-card"><span>Stream health</span><strong>{data.nowPlaying?.isOnline ? "Healthy" : "Waiting"}</strong><p>AzuraCast mount reachable when configured, AutoDJ has eligible fallback media.</p></article>
            <article className="metric-card"><span>Podcast downloads</span><strong>{data.analytics?.podcastDownloads || 0}</strong><p>RSS and platform analytics roll up here.</p></article>
            <article className="metric-card"><span>Pending approvals</span><strong>{data.clips.filter((clip) => clip.state === "READY_FOR_REVIEW").length}</strong><p>Clips, sponsor reads, and episode metadata are queued.</p></article>
            <article className="metric-card"><span>Avg session</span><strong>{Math.round((data.analytics?.avgSessionSec || 0) / 60)}m</strong><p>Listener analytics roll up from stream and platform reports.</p></article>
          </div>
          <div className="studio-layout">
            <form
              className="studio-panel"
              onSubmit={async (event) => {
                event.preventDefault();
                await createWorkflow(new FormData(event.currentTarget));
                event.currentTarget.reset();
              }}
            >
              <h3>Create content item</h3>
              <label>Content type <select name="contentType"><option value="EPISODE">Episode</option><option value="CLIP">Clip</option><option value="SHOW">Show</option><option value="BLOG_POST">Blog / News</option><option value="SPONSOR_SPOT">Sponsor Spot</option><option value="PLAYLIST_BLOCK">Playlist Block</option></select></label>
              <label>Title <input name="title" type="text" placeholder="Field Notes 019" required /></label>
              <label>Owner <input name="owner" type="text" placeholder="Producer, host, or sponsor manager" /></label>
              <label>Publishing state <select name="state"><option value="DRAFT">Draft</option><option value="READY_FOR_REVIEW">Ready for Review</option><option value="APPROVED">Approved</option><option value="SCHEDULED">Scheduled</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option><option value="FAILED">Failed</option></select></label>
              <label>Master recording key <input name="mediaKey" type="text" placeholder="masters/field-notes-019.mp4" /></label>
              <label>Notes <textarea name="notes" rows={4} placeholder="Transcript, clips, RSS, YouTube, replay radio" /></label>
              <button className="primary-button" type="submit">Add to Workflow</button>
              <p className="form-note">Production writes to PostgreSQL and queues Redis worker jobs.</p>
            </form>
            <div className="queue-panel">
              <div className="panel-title"><h3>Publishing workflow</h3><a className="mini-link" href="/admin">Review all</a></div>
              <ul className="queue-list" aria-live="polite">
                <li><strong>Database-backed workflow</strong><span className="queue-meta">Use the authenticated admin view for full approvals, retry queues, and audit logs.</span></li>
              </ul>
            </div>
          </div>
        </section>

        <section id="platforms" className="section-block">
          <div className="section-heading"><p className="eyebrow">Integrations</p><h2>Radio, podcast, and video distribution</h2><p>AzuraCast handles 24/7 radio. RSS is the source of truth for podcast distribution. YouTube is the video platform.</p></div>
          <div className="platform-grid">
            {platforms.map(([name, note, action]) => (
              <article className="platform-card" key={name}>
                <div><strong>{name}</strong><span>{note}</span></div>
                <button className="mini-button" type="button">{action}</button>
              </article>
            ))}
          </div>
        </section>

        <section id="contact" className="ops-section">
          <img src="https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=80" alt="Singer performing on a lit stage" />
          <div>
            <p className="eyebrow">Submit / Contact</p>
            <h2>Send music, sponsor ideas, guest pitches, and community submissions</h2>
            <form className="contact-form" action="mailto:radio@example.com">
              <label>Name <input name="name" type="text" placeholder="Your name" /></label>
              <label>Email <input name="email" type="email" placeholder="you@example.com" /></label>
              <label>Pitch <textarea name="pitch" rows={4} placeholder="Tell us what you want to submit" /></label>
              <button className="primary-button" type="submit">Prepare Email</button>
            </form>
          </div>
        </section>
      </main>

      <footer className="footer"><span>LeafLock Radio</span><span>Public site, live player, publishing workflow, and AzuraCast-ready integration plan.</span></footer>
    </>
  );
}
