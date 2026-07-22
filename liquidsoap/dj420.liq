# DJ420 — LeafLock FM 104.2 continuous radio encoder
#
# Crossfade is performed HERE on the server (not on every phone).
# Listeners play one permanent stream: https://stream.leaflock.com.au/live.mp3
#
# Run (example):
#   liquidsoap /app/liquidsoap/dj420.liq
#
# Env overrides (optional):
#   ICECAST_HOST, ICECAST_PORT, ICECAST_PASSWORD, ICECAST_MOUNT
#   DJ420_PLAYLIST=/app/playlists/main.m3u

settings.init.allow_root.set(true)
settings.log.level.set(3)

enable_autocue_metadata()

playlist_path =
  try
    environment.get("DJ420_PLAYLIST")
  catch _ do
    "/app/playlists/main.m3u"
  end

icecast_host =
  try
    environment.get("ICECAST_HOST")
  catch _ do
    "stream.leaflock.com.au"
  end

icecast_port =
  try
    int_of_string(environment.get("ICECAST_PORT"))
  catch _ do
    8000
  end

icecast_password =
  try
    environment.get("ICECAST_PASSWORD")
  catch _ do
    "hackme"
  end

icecast_mount =
  try
    environment.get("ICECAST_MOUNT")
  catch _ do
    "/live.mp3"
  end

# Main rotation — randomize + reload when the m3u changes.
main_rotation = playlist(
  mode="randomize",
  reload_mode="watch",
  playlist_path
)

# Never go silent if a file is missing / decode fails.
safe_rotation = mksafe(main_rotation)

# Server-side crossfade (public Live Radio must NOT redo this per listener).
dj420 = crossfade(
  fade_in=4.0,
  fade_out=4.0,
  safe_rotation
)

# Optional: blank detection / safety net
dj420 = mksafe(dj420)

output.icecast(
  %mp3(bitrate=128, samplerate=44100, stereo=true),
  host=icecast_host,
  port=icecast_port,
  password=icecast_password,
  mount=icecast_mount,
  name="LeafLock FM 104.2",
  description="DJ420 — Locked In Radio",
  genre="Hip-Hop / Radio",
  url="https://fm.leaflock.com.au/fm",
  public=true,
  dj420
)
