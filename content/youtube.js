// OpenBlocker - YouTube ad handling (isolated world)
//
// YouTube punishes players whose ad data has been tampered with (the video stays black), and it
// sometimes stitches ads into the main video stream. So OpenBlocker never edits YouTube's ad data
// and never seeks. Instead it:
//   * clicks "Skip" as soon as it appears,
//   * plays unskippable ads muted at 16x, so they are over in about a second,
//   * restores the viewer's own volume, mute and speed afterwards,
//   * hides ad slots on the page with CSS (youtube.css).
(() => {
  let enabled = true;
  const root = document.documentElement;

  function refresh() {
    chrome.storage.local.get({ enabled: true, whitelist: [] }, (s) => {
      enabled = s.enabled && !s.whitelist.some((w) => location.hostname === w || location.hostname.endsWith("." + w));
      root.classList.toggle("sas-on", enabled);
      try { if (enabled) localStorage.removeItem("__sas_off"); else localStorage.setItem("__sas_off", "1"); } catch (_) {}
      if (!enabled) endAd();
    });
  }
  refresh();
  chrome.storage.onChanged.addListener((c) => { if (c.enabled || c.whitelist) refresh(); });

  const SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-slot button",
    "button.ytp-ad-skip-button-container",
    ".videoAdUiSkipButton",
    ".ytp-ad-overlay-close-button",
  ];

  // State saved when an ad starts, restored when it ends
  let adVideo = null;
  let saved = null;

  function startAd(video) {
    if (adVideo !== video) {
      if (adVideo) endAd();
      adVideo = video;
      saved = { muted: video.muted, rate: video.playbackRate };
      chrome.runtime.sendMessage({ type: "adSkipped", count: 1 }).catch(() => {});
    }
    if (!video.muted) video.muted = true;
    if (video.playbackRate !== 16) { try { video.playbackRate = 16; } catch (_) {} }
  }

  function endAd() {
    if (!adVideo || !saved) { adVideo = null; saved = null; return; }
    try {
      adVideo.playbackRate = saved.rate && saved.rate !== 16 ? saved.rate : 1;
      adVideo.muted = saved.muted;
    } catch (_) {}
    adVideo = null;
    saved = null;
  }

  function handle() {
    if (!enabled) return;
    const player = document.querySelector("#movie_player, .html5-video-player");
    if (!player) return;
    const video = player.querySelector("video");
    const inAd = player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");

    if (inAd) {
      for (const sel of SKIP_SELECTORS) {
        document.querySelectorAll(sel).forEach((btn) => { if (btn.offsetParent !== null) btn.click(); });
      }
      if (video) startAd(video);
    } else if (adVideo) {
      endAd();
    }

    // Close the "ad blockers are not allowed" dialog if it appears, and resume playback
    const wall = document.querySelector("ytd-enforcement-message-view-model");
    if (wall) {
      const dialog = wall.closest("tp-yt-paper-dialog") || wall;
      dialog.remove();
      document.querySelectorAll("tp-yt-iron-overlay-backdrop").forEach((b) => b.remove());
      if (video && video.paused) video.play().catch(() => {});
    }
  }

  // If the viewer changes the speed themselves while no ad is playing, nothing is touched.
  // If an ad ends while the tab is in the background, the next check restores the settings.
  function start() {
    const mo = new MutationObserver(handle);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    setInterval(handle, 250);
    handle();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
