(function () {
  const ARTWORK = "/leaflock-logo.png";

  const state = {
    mode: "live",
    playbackIntent: localStorage.getItem("leaflockPlaybackIntent") || "stopped",
    currentTrack: {
      title: "LeafLock FM 104.2",
      artist: "Locked In Radio",
      album: "LeafLock FM",
      artwork: ARTWORK
    }
  };

  function setPlaybackIntent(intent) {
    state.playbackIntent = intent;
    localStorage.setItem("leaflockPlaybackIntent", intent);
    document.documentElement.dataset.leaflockPlayback = intent;

    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState =
        intent === "playing" ? "playing" : "paused";
    }
  }

  function getPlaybackIntent() {
    return state.playbackIntent;
  }

  function setMode(mode) {
    state.mode = mode === "private" ? "private" : "live";
    document.documentElement.dataset.leaflockMode = state.mode;
  }

  function getMode() {
    return state.mode;
  }

  function setCurrentTrack(track) {
    state.currentTrack = {
      title: track?.title || "LeafLock FM 104.2",
      artist: track?.artist || "Locked In Radio",
      album: track?.album || "LeafLock FM",
      artwork: track?.artwork || ARTWORK
    };

    window.dispatchEvent(
      new CustomEvent("leaflock:trackchange", {
        detail: state.currentTrack
      })
    );
  }

  function getCurrentTrack() {
    return state.currentTrack;
  }

  async function play() {
    if (state.mode === "live") {
      if (typeof window.playLiveRoom === "function") {
        await window.playLiveRoom();
      } else if (typeof window.startLiveRadio === "function") {
        await window.startLiveRadio();
      } else {
        console.warn("Missing old live play function");
      }
    } else if (typeof window.playPrivateJukebox === "function") {
      await window.playPrivateJukebox();
    } else if (typeof window.startPrivateJukebox === "function") {
      await window.startPrivateJukebox();
    } else {
      console.warn("Missing old private jukebox play function");
    }

    setPlaybackIntent("playing");
  }

  async function pause() {
    if (typeof window.pauseRadio === "function") {
      await window.pauseRadio();
    } else if (typeof window.pausePlayer === "function") {
      await window.pausePlayer();
    } else {
      console.warn("Missing old pause function");
    }

    setPlaybackIntent("paused");
  }

  async function stop() {
    if (typeof window.stopRadio === "function") {
      await window.stopRadio();
    } else if (typeof window.pauseRadio === "function") {
      await window.pauseRadio();
    }

    setPlaybackIntent("stopped");
  }

  async function next() {
    if (state.mode === "live") {
      await resyncLive();
      return;
    }

    if (typeof window.nextPrivateTrack === "function") {
      await window.nextPrivateTrack();
    } else if (typeof window.skipPrivateJukebox === "function") {
      await window.skipPrivateJukebox();
    } else {
      console.warn("Missing old private next function");
    }

    setPlaybackIntent("playing");
  }

  async function previous() {
    if (state.mode === "live") {
      await resyncLive();
      return;
    }

    if (typeof window.previousPrivateTrack === "function") {
      await window.previousPrivateTrack();
    } else {
      console.warn("Missing old private previous function");
    }

    setPlaybackIntent("playing");
  }

  async function resyncLive() {
    if (typeof window.syncToLiveRoom === "function") {
      await window.syncToLiveRoom();
    } else if (typeof window.resyncLiveRoom === "function") {
      await window.resyncLiveRoom();
    } else {
      console.warn("Missing old live sync function");
    }
  }

  window.LeafLockPlayer = {
    play,
    pause,
    stop,
    next,
    previous,
    resyncLive,
    setMode,
    getMode,
    setCurrentTrack,
    getCurrentTrack,
    setPlaybackIntent,
    getPlaybackIntent
  };

  document.addEventListener("visibilitychange", async function () {
    if (document.hidden) {
      return;
    }

    const player = window.LeafLockPlayer;
    if (!player) return;

    if (player.getPlaybackIntent() !== "playing") {
      return;
    }

    if (player.getMode() === "live") {
      await player.resyncLive();
      await player.play();
      return;
    }

    await player.play();
  });
})();