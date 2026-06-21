import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ThemeToggle from "@/components/ThemeToggle";

export default async function AdminPage() {
  const user = await requireUser();
  const [episodes, clips, jobs, analytics, scheduleBlocks] = await Promise.all([
    prisma.episode.findMany({ include: { show: true }, orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.clip.findMany({ include: { episode: true }, orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.publishingJob.findMany({ orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.analyticsSnapshot.findFirst({ orderBy: { capturedAt: "desc" } }),
    prisma.scheduleBlock.findMany({ include: { show: true }, orderBy: { startsAt: "asc" }, take: 12 })
  ]);

  return (
    <main className="admin-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Authenticated admin</p>
          <h1>Run the station desk</h1>
          <p className="form-note">Signed in as {user.name} ({user.role.replaceAll("_", " ")}).</p>
        </div>
        <div className="admin-actions">
          <a className="secondary-button" href="/">Public site</a>
          <form action="/api/auth/logout" method="post">
            <button className="mini-button" type="submit">Sign out</button>
          </form>
        </div>
      </div>

      <section className="dashboard-grid">
        <article className="metric-card"><span>Live listeners</span><strong>{analytics?.liveListeners || 0}</strong><p>Latest station analytics snapshot.</p></article>
        <article className="metric-card"><span>Podcast downloads</span><strong>{analytics?.podcastDownloads || 0}</strong><p>RSS and platform rollup.</p></article>
        <article className="metric-card"><span>Queued jobs</span><strong>{jobs.filter((job) => job.state === "QUEUED").length}</strong><p>Redis worker backlog.</p></article>
        <article className="metric-card"><span>Schedule blocks</span><strong>{scheduleBlocks.length}</strong><p>Upcoming station clock windows.</p></article>
      </section>

      <section className="studio-layout">
        <form className="studio-panel" action="/api/admin/content" method="post">
          <h3>Create content item</h3>
          <label>Content type <select name="contentType"><option value="EPISODE">Episode</option><option value="CLIP">Clip</option><option value="SHOW">Show</option><option value="BLOG_POST">Blog / News</option><option value="SPONSOR_SPOT">Sponsor Spot</option><option value="PLAYLIST_BLOCK">Playlist Block</option></select></label>
          <label>Title <input name="title" type="text" placeholder="Field Notes 019" required /></label>
          <label>Owner <input name="owner" type="text" placeholder="Producer, host, or sponsor manager" /></label>
          <label>Publishing state <select name="state"><option value="DRAFT">Draft</option><option value="READY_FOR_REVIEW">Ready for Review</option><option value="APPROVED">Approved</option><option value="SCHEDULED">Scheduled</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option><option value="FAILED">Failed</option></select></label>
          <label>Master recording key <input name="mediaKey" type="text" placeholder="masters/field-notes-019.mp4" /></label>
          <label>Notes <textarea name="notes" rows={4} placeholder="Transcript, clips, RSS, YouTube, replay radio" /></label>
          <button className="primary-button" type="submit">Add to Workflow</button>
          <p className="form-note">Creating an item also queues normalization, transcript, RSS, clip, YouTube, analytics, and AzuraCast sync jobs as appropriate.</p>
        </form>

        <div className="queue-panel">
          <div className="panel-title"><h3>Publishing jobs</h3><a className="mini-link" href="/rss.xml">View RSS</a></div>
          <ul className="queue-list">
            {jobs.length ? jobs.map((job) => (
              <li key={job.id}>
                <strong>{job.type.replaceAll("_", " ")}</strong>
                <span className="queue-meta">{job.state} - attempts {job.attempts}</span>
                <span>{job.lastError || "Waiting for worker pickup."}</span>
              </li>
            )) : <li><strong>No jobs yet.</strong><span className="queue-meta">Create a content item to queue publishing work.</span></li>}
          </ul>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><p className="eyebrow">CMS</p><h2>Episodes and clips</h2><p>Database-backed content states for podcast, video, clip, and replay workflows.</p></div>
        <div className="admin-table">
          <table>
            <thead>
              <tr><th>Type</th><th>Title</th><th>Show / Source</th><th>State</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {episodes.map((episode) => (
                <tr key={episode.id}>
                  <td>Episode</td>
                  <td>{episode.title}</td>
                  <td>{episode.show.title}</td>
                  <td>{episode.state.replaceAll("_", " ")}</td>
                  <td>{episode.updatedAt.toLocaleDateString("en-AU")}</td>
                </tr>
              ))}
              {clips.map((clip) => (
                <tr key={clip.id}>
                  <td>Clip</td>
                  <td>{clip.title}</td>
                  <td>{clip.episode?.title || "Standalone"}</td>
                  <td>{clip.state.replaceAll("_", " ")}</td>
                  <td>{clip.updatedAt.toLocaleDateString("en-AU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ThemeToggle className="floating" />
    </main>
  );
}
