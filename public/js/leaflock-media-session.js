(function () {
  const ARTWORK = "/leaflock-logo.png";

  function getPlayer() {
    return window.LeafLockPlayer;
  }

  function updateMetadata(track) {
    if (!("mediaSession" in navigator)) return;

    const artwork = track?.artwork || ARTWORK;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track?.title || "LeafLock FM 104.2",
      artist: track?.artist || "Locked In Radio",
      album: track?.album || "LeafLock FM",
      artwork: [
        { src: artwork, sizes: "96x96", type: "image/png" },
        { src: artwork, sizes: "128x128", type: "image/png" },
        { src: artwork, sizes: "192x192", type: "image/png" },
        { src: artwork, sizes: "512x512", type: "image/png" }
      ]
    });
  }

  function setMediaState(intent) {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState =
      intent === "playing" ? "playing" : "paused";
  }

  function safeAction(action, handler) {
    if (!("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (error) {
      console.warn("Media Session action not supported:", action);
    }
  }

  async function onMediaPlay() {
    const player = getPlayer();
    if (!player) return;

    if (player.getMode() === "live") {
      await player.resyncLive();
      await player.play();
    } else {
      await player.play();
    }

    player.setPlaybackIntent("playing");
    updateMetadata(player.getCurrentTrack());
    setMediaState("playing");
  }

  async function onMediaPause() {
    const player = getPlayer();
    if (!player) return;

    await player.pause();
    player.setPlaybackIntent("paused");
    setMediaState("paused");
  }

  async function onMediaStop() {
    const player = getPlayer();
    if (!player) return;

    await player.stop();
    player.setPlaybackIntent("stopped");
    setMediaState("paused");
  }

  async function onMediaNext() {
    const player = getPlayer();
    if (!player) return;

    if (player.getMode() === "live") {
      await player.resyncLive();
      return;
    }

    await player.next();
    player.setPlaybackIntent("playing");
    updateMetadata(player.getCurrentTrack());
    setMediaState("playing");
  }

  async function onMediaPrevious() {
    const player = getPlayer();
    if (!player) return;

    if (player.getMode() === "live") {
      await player.resyncLive();
      return;
    }

    await player.previous();
    player.setPlaybackIntent("playing");
    updateMetadata(player.getCurrentTrack());
    setMediaState("playing");
  }

  async function onMediaSeekBlocked() {
    const player = getPlayer();
    if (!player) return;

    if (player.getMode() === "live") {
      await player.resyncLive();
    }
  }

  function setupMediaSession() {
    if (!("mediaSession" in navigator)) {
      console.warn("Media Session API not supported in this browser");
      return;
    }

    const player = getPlayer();
    if (!player) {
      window.setTimeout(setupMediaSession, 500);
      return;
    }

    updateMetadata(player.getCurrentTrack());

    safeAction("play", onMediaPlay);
    safeAction("pause", onMediaPause);
    safeAction("stop", onMediaStop);
    safeAction("nexttrack", onMediaNext);
    safeAction("previoustrack", onMediaPrevious);
    safeAction("seekforward", onMediaSeekBlocked);
    safeAction("seekbackward", onMediaSeekBlocked);
    safeAction("seekto", onMediaSeekBlocked);

    setMediaState(player.getPlaybackIntent());
  }

  window.LeafLockMediaSession = {
    setup: setupMediaSession,
    updateMetadata: updateMetadata,
    setMediaState: setMediaState
  };

  window.onLeafLockTrackChanged = function (newTrack) {
    const player = getPlayer();
    if (!player) return;

    player.setCurrentTrack({
      title: newTrack?.title || "LeafLock FM 104.2",
      artist: newTrack?.artist || "Locked In Radio",
      album: "LeafLock FM",
      artwork: newTrack?.artwork || ARTWORK
    });

    const intent = player.getPlaybackIntent();

    if (intent === "playing") {
      void player.play();
    } else {
      updateMetadata(player.getCurrentTrack());
      setMediaState("paused");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupMediaSession);
  } else {
    setupMediaSession();
  }

  window.addEventListener("leaflock:trackchange", function (event) {
    updateMetadata(event.detail);

    const player = getPlayer();
    if (!player) return;

    setMediaState(player.getPlaybackIntent());
  });
})();