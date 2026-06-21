const station = {
  name: "LeafLock Radio",
  url: window.location.href,
  primaryStreamUrl: "https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one",
  fallbackStreamUrl: "https://stream.live.vc.bbcmedia.co.uk/bbc_6music",
  timezone: "Australia/Brisbane",
};

const shows = [
  { title: "Morning Canopy", slug: "morning-canopy", host: "Nia Vale", tags: ["news", "interviews", "new music"], schedule: "Weekdays 08:00 AEST", platforms: "Radio, RSS, YouTube", image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80" },
  { title: "Green Room", slug: "green-room", host: "Marlo Finch", tags: ["longform", "artists", "behind the scenes"], schedule: "Wednesdays 14:00 AEST", platforms: "Podcast, YouTube", image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80" },
  { title: "Late Night Chill", slug: "late-night-chill", host: "AutoDJ", tags: ["lofi", "replays", "beds"], schedule: "Daily 23:00 AEST", platforms: "Radio", image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80" },
];

const episodes = [
  { title: "Field Notes 018: Building a scene that lasts", show: "Green Room", host: "Marlo Finch", publishDate: "2026-04-18", duration: "54:12", state: "Scheduled", summary: "A practical conversation about venues, community submissions, sponsor trust, and local discovery.", chapters: "00:00 Open, 08:24 Scene maps, 21:16 Sponsor reads, 42:30 Replay radio" },
  { title: "Morning Canopy: Label IDs and listener rituals", show: "Morning Canopy", host: "Nia Vale", publishDate: "2026-04-12", duration: "38:44", state: "Published", summary: "How hourly IDs, clips, and live chat keep a 24/7 station feeling hosted.", chapters: "00:00 Open, 05:10 Legal IDs, 16:50 Live chat, 31:02 Clip queue" },
  { title: "Weekend Replay: Event recaps", show: "Weekend Replay", host: "LeafLock Producers", publishDate: "2026-04-06", duration: "47:20", state: "Published", summary: "A replay-ready edit with transcript, waveform, sponsor inventory, and archive metadata.", chapters: "00:00 Open, 11:15 Field tape, 26:48 Archive playlist, 39:33 YouTube upload" },
];

const schedule = [
  { day: "Monday", time: "08:00", title: "Morning Canopy", host: "Nia Vale", type: "Live" },
  { day: "Monday", time: "10:00", title: "Evergreen Interviews", host: "AutoDJ", type: "Replay" },
  { day: "Monday", time: "12:00", title: "Sponsor + Station IDs", host: "Clock Rules", type: "AutoDJ" },
  { day: "Tuesday", time: "18:00", title: "Product Review Hour", host: "LeafLock Desk", type: "Upcoming" },
  { day: "Wednesday", time: "14:00", title: "Green Room", host: "Marlo Finch", type: "Live" },
  { day: "Friday", time: "21:00", title: "Weekend Launch", host: "DJ Takeover", type: "Live" },
  { day: "Saturday", time: "16:00", title: "Community Submissions", host: "Producer Queue", type: "Upcoming" },
  { day: "Daily", time: "23:00", title: "Late Night Chill", host: "AutoDJ", type: "Replay" },
];

const clips = [
  { title: "Why station IDs still matter", source: "Morning Canopy", state: "Approved" },
  { title: "The 30-second sponsor read", source: "Field Notes 018", state: "Ready for Review" },
  { title: "AutoDJ fallback explained", source: "Weekend Replay", state: "Scheduled" },
];

const platforms = [
  { name: "AzuraCast", note: "Station, AutoDJ, playlists, scheduler, mount points, and DJ accounts.", action: "Connect stream URL" },
  { name: "YouTube", note: "Livestream scheduling, full episode uploads, clips, thumbnails, chapters, stats.", action: "Prepare OAuth app" },
  { name: "Spotify", note: "RSS-based podcast distribution with optional video workflow support.", action: "Validate feed" },
  { name: "Apple Podcasts", note: "Required RSS tags, artwork, media checks, and submission checklist.", action: "Run checklist" },
  { name: "Object Storage", note: "Artwork, audio, video masters, transcripts, waveforms, and clip exports.", action: "Set bucket policy" },
  { name: "Workers", note: "FFmpeg normalization, transcript generation, RSS rebuilds, retry queues.", action: "Queue jobs" },
];

const seedChat = [
  ["Nia", "Morning Canopy is live. Send your picks."],
  ["LeafLock Desk", "Sponsor block clears at 08:30 AEST."],
  ["Marlon", "Replay sounded clean on mobile."],
];

const workflowKey = "leaflock-workflow";
let scheduleView = "daily";

function loadWorkflow() {
  try {
    return JSON.parse(localStorage.getItem(workflowKey)) || [];
  } catch {
    return [];
  }
}

function saveWorkflow(items) {
  localStorage.setItem(workflowKey, JSON.stringify(items));
}

function renderShows() {
  const grid = document.querySelector("#showGrid");
  grid.innerHTML = "";
  shows.forEach((show) => {
    const card = document.createElement("article");
    card.className = "content-card";
    card.innerHTML = `
      <img src="${show.image}" alt="${show.title} cover art">
      <div>
        <span class="label">${show.schedule}</span>
        <h3>${show.title}</h3>
        <p>${show.host}</p>
        <p>${show.tags.join(" / ")}</p>
        <span>${show.platforms}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderEpisodes() {
  const list = document.querySelector("#episodeList");
  list.innerHTML = "";
  episodes.forEach((episode) => {
    const item = document.createElement("article");
    item.className = "episode-row";
    item.innerHTML = `
      <div>
        <span class="label">${episode.state}</span>
        <h3>${episode.title}</h3>
        <p>${episode.summary}</p>
        <span>${episode.show} - ${episode.host} - ${episode.publishDate} - ${episode.duration}</span>
      </div>
      <div>
        <strong>Chapters</strong>
        <p>${episode.chapters}</p>
        <a class="mini-link" href="#platforms">Platform links</a>
      </div>
    `;
    list.appendChild(item);
  });
}

function renderSchedule() {
  const grid = document.querySelector("#scheduleGrid");
  grid.innerHTML = "";
  const items = scheduleView === "daily" ? schedule.filter((slot) => slot.day === "Monday" || slot.day === "Daily") : schedule;
  items.forEach((slot) => {
    const card = document.createElement("article");
    card.className = "schedule-card";
    card.innerHTML = `
      <time>${slot.day} - ${slot.time} ${station.timezone}</time>
      <strong>${slot.title}</strong>
      <span>${slot.host}</span>
      <span class="label">${slot.type}</span>
    `;
    grid.appendChild(card);
  });
}

function renderClips() {
  const grid = document.querySelector("#clipGrid");
  grid.innerHTML = "";
  clips.forEach((clip) => {
    const card = document.createElement("article");
    card.className = "clip-card";
    card.innerHTML = `<span class="label">${clip.state}</span><h3>${clip.title}</h3><p>${clip.source}</p><button class="mini-button" type="button">Draft Social Post</button>`;
    grid.appendChild(card);
  });
}

function renderPlatforms() {
  const grid = document.querySelector("#platformGrid");
  grid.innerHTML = "";
  platforms.forEach((platform) => {
    const card = document.createElement("article");
    card.className = "platform-card";
    card.innerHTML = `<div><strong>${platform.name}</strong><span>${platform.note}</span></div><button class="mini-button" type="button">${platform.action}</button>`;
    grid.appendChild(card);
  });
}

function renderWorkflow() {
  const list = document.querySelector("#workflowList");
  const workflow = loadWorkflow();
  list.innerHTML = "";
  if (!workflow.length) {
    const empty = document.createElement("li");
    empty.innerHTML = "<strong>No content queued yet.</strong><span class='queue-meta'>Add a master recording or metadata item to start the workflow.</span>";
    list.appendChild(empty);
    return;
  }
  workflow.forEach((item, index) => {
    const row = document.createElement("li");
    row.innerHTML = `
      <strong>${item.title}</strong>
      <span class="queue-meta">${item.type} - ${item.owner} - ${item.state} - ${item.fileName}</span>
      <span>${item.notes || "Jobs: normalize audio, generate transcript, build RSS, prepare YouTube upload, create clips."}</span>
      <div class="queue-actions">
        <button class="mini-button" data-action="advance" data-index="${index}" type="button">Advance State</button>
        <button class="mini-button" data-action="share" data-index="${index}" type="button">Copy Brief</button>
        <button class="mini-button" data-action="remove" data-index="${index}" type="button">Remove</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function renderChat() {
  const list = document.querySelector("#chatList");
  list.innerHTML = "";
  seedChat.forEach(([name, message]) => {
    const row = document.createElement("li");
    row.textContent = `${name}: ${message}`;
    list.appendChild(row);
  });
}

async function shareText(title, body) {
  if (navigator.share) {
    await navigator.share({ title, text: body, url: station.url });
    return;
  }
  await navigator.clipboard.writeText(`${body}\n${station.url}`);
  alert("Share text copied to clipboard.");
}

document.querySelector("#shareStation").addEventListener("click", () => {
  shareText(station.name, `${station.name} is live now.`);
});

document.querySelector("#volumeControl").addEventListener("input", (event) => {
  document.querySelector("#radioPlayer").volume = Number(event.currentTarget.value);
});

document.querySelector("#fallbackPlayer").addEventListener("click", () => {
  const player = document.querySelector("#radioPlayer");
  const note = document.querySelector("#streamNote");
  const usingFallback = player.src === station.fallbackStreamUrl;
  player.src = usingFallback ? station.primaryStreamUrl : station.fallbackStreamUrl;
  note.textContent = usingFallback ? "Primary stream selected." : "Fallback stream selected. Use this pattern for AzuraCast secondary mounts.";
});

document.querySelectorAll("[data-schedule-view]").forEach((button) => {
  button.addEventListener("click", () => {
    scheduleView = button.dataset.scheduleView;
    document.querySelectorAll("[data-schedule-view]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    renderSchedule();
  });
});

document.querySelector("#contentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const file = form.masterRecording.files[0];
  const workflow = loadWorkflow();
  workflow.unshift({
    type: form.contentType.value,
    title: form.contentTitle.value.trim() || "Untitled LeafLock Item",
    owner: form.contentOwner.value.trim() || "Producer",
    state: form.contentState.value,
    notes: form.contentNotes.value.trim(),
    fileName: file ? file.name : "No master recording attached",
    createdAt: new Date().toISOString(),
  });
  saveWorkflow(workflow);
  form.reset();
  renderWorkflow();
});

document.querySelector("#workflowList").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const states = ["Draft", "Ready for Review", "Approved", "Scheduled", "Published", "Archived"];
  const workflow = loadWorkflow();
  const index = Number(button.dataset.index);
  const item = workflow[index];
  if (!item) return;
  if (button.dataset.action === "remove") {
    workflow.splice(index, 1);
  }
  if (button.dataset.action === "advance") {
    const nextIndex = Math.min(states.indexOf(item.state) + 1, states.length - 1);
    item.state = states[nextIndex] || "Ready for Review";
  }
  if (button.dataset.action === "share") {
    shareText(item.title, `${item.title}: ${item.type}, ${item.state}. Jobs: podcast RSS, YouTube asset, clips, replay radio.`);
  }
  saveWorkflow(workflow);
  renderWorkflow();
});

document.querySelector("#clearWorkflow").addEventListener("click", () => {
  localStorage.removeItem(workflowKey);
  renderWorkflow();
});

document.querySelector("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#chatMessage");
  const message = input.value.trim();
  if (!message) return;
  seedChat.push(["You", message]);
  input.value = "";
  renderChat();
});

document.querySelector("#contactForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const subject = encodeURIComponent("LeafLock Radio submission");
  const body = encodeURIComponent(`Name: ${data.get("name")}\nEmail: ${data.get("email")}\n\n${data.get("pitch")}`);
  window.location.href = `mailto:radio@example.com?subject=${subject}&body=${body}`;
});

renderShows();
renderEpisodes();
renderSchedule();
renderClips();
renderPlatforms();
renderWorkflow();
renderChat();
