// OpenBlocker - YouTube ad handling (isolated world)
//
// YouTube punishes players whose ad data has been tampered with (the video stays black), and it
// sometimes stitches ads into the main video stream. So OpenBlocker never edits YouTube's ad data
// and never seeks. Instead it:
//   * clicks "Skip" as soon as it appears,
//   * plays unskippable ads muted at 16x, so they are over in about a second,
//   * hides the ad picture while it plays (youtube.css),
//   * restores the viewer's own volume, mute and speed afterwards.
//
// Robustness:
//   * The ad is handled BEFORE any extension API call, and every extension API call is guarded,
//     so the skipper keeps working even if the extension was updated while this tab stayed open
//     (Chrome cuts such "orphaned" scripts off from the extension).
//   * When OpenBlocker updates, the background re-injects this script into open YouTube tabs;
//     the newest copy takes over and older copies stop.
//   * Every video player on the page is checked, not just the first one found.
(() => {
  const ME = Math.random().toString(36).slice(2);
  const root = document.documentElement;
  root.dataset.obYt = ME; // the newest copy of this script wins
  const isCurrent = () => root.dataset.obYt === ME;

  let enabled = true;
  const safe = (fn) => { try { return fn(); } catch (_) { return undefined; } };

  function refresh() {
    safe(() => chrome.storage.local.get({ enabled: true, whitelist: [] }, (s) => {
      if (chrome.runtime.lastError || !s) return;
      enabled = s.enabled && !s.whitelist.some((w) => location.hostname === w || location.hostname.endsWith("." + w));
      root.classList.toggle("sas-on", enabled);
      safe(() => { if (enabled) localStorage.removeItem("__sas_off"); else localStorage.setItem("__sas_off", "1"); });
      if (!enabled) endAll();
    }));
  }
  refresh();
  safe(() => chrome.storage.onChanged.addListener((c) => { if (c.enabled || c.whitelist) refresh(); }));

  const SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-slot button",
    "button.ytp-ad-skip-button-container",
    ".videoAdUiSkipButton",
    ".ytp-ad-overlay-close-button",
  ];

  // video element -> the viewer's settings saved when its ad started
  const saved = new Map();

  function startAd(video) {
    if (!saved.has(video)) {
      saved.set(video, { muted: video.muted, rate: video.playbackRate === 16 ? 1 : video.playbackRate });
      safe(() => chrome.runtime.sendMessage({ type: "adSkipped", count: 1 }).catch(() => {}));
    }
    if (!video.muted) video.muted = true;
    if (video.playbackRate !== 16) safe(() => { video.playbackRate = 16; });
  }

  function endAd(video) {
    const s = saved.get(video);
    if (!s) return;
    saved.delete(video);
    safe(() => { video.playbackRate = s.rate || 1; video.muted = s.muted; });
  }
  function endAll() { [...saved.keys()].forEach(endAd); }

  function handle() {
    if (!isCurrent()) { stop(); return; }
    if (!enabled) return;
    const players = document.querySelectorAll("#movie_player, .html5-video-player");
    let anyAd = false;
    for (const player of players) {
      const video = player.querySelector("video");
      const inAd = player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
      if (inAd) {
        anyAd = true;
        if (video) startAd(video);
        for (const sel of SKIP_SELECTORS) {
          player.querySelectorAll(sel).forEach((btn) => { if (btn.offsetParent !== null) btn.click(); });
        }
      } else if (video && saved.has(video)) {
        endAd(video);
      }
    }
    if (!anyAd) for (const v of [...saved.keys()]) if (!v.isConnected) saved.delete(v);

    // Close the "ad blockers are not allowed" dialog if it appears, and resume playback
    const wall = document.querySelector("ytd-enforcement-message-view-model");
    if (wall) {
      const dialog = wall.closest("tp-yt-paper-dialog") || wall;
      dialog.remove();
      document.querySelectorAll("tp-yt-iron-overlay-backdrop").forEach((b) => b.remove());
      const v = document.querySelector("#movie_player video");
      if (v && v.paused) v.play().catch(() => {});
    }
  }

  let mo = null, timer = null;
  function stop() {
    if (mo) mo.disconnect();
    clearInterval(timer);
  }
  function start() {
    mo = new MutationObserver(handle);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    timer = setInterval(handle, 200);
    handle();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
