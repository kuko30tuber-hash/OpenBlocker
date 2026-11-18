// OpenBlocker - YouTube ad handling (isolated world)
//
// What YouTube does today:
//   * It punishes players whose ad data was tampered with (the video stays black).
//   * It makes viewers wait out an unskippable ad in real time: if the ad is sped up or skipped
//     ahead, the player just sits on a black screen until the ad would have ended.
//
// So OpenBlocker never edits YouTube's data, never seeks and never speeds ads up. Instead it:
//   * clicks "Skip" the moment YouTube offers it (a normal skip, which really saves time),
//   * mutes unskippable ads and covers them with an OpenBlocker card counting down to the video,
//   * restores the viewer's own volume and mute state as soon as the video starts.
//
// Robustness:
//   * The ad is handled before any extension API call, and all extension API calls are guarded,
//     so this keeps working in tabs that stayed open while OpenBlocker updated.
//   * After an update the background re-injects this script into open YouTube tabs; the newest
//     copy takes over and older copies stop.
//   * Every video player on the page is checked, not just the first one found.
(() => {
  const ME = Math.random().toString(36).slice(2);
  const root = document.documentElement;
  root.dataset.obYt = ME;
  const isCurrent = () => root.dataset.obYt === ME;

  let enabled = true;
  const safe = (fn) => { try { return fn(); } catch (_) { return undefined; } };
  const logoUrl = safe(() => chrome.runtime.getURL("icons/logo256.png")) || "";

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

  // video element -> { muted } saved when its ad started
  const saved = new Map();
  // player element -> cover card
  const covers = new Map();

  function cover(player) {
    let c = covers.get(player);
    if (c && c.isConnected) return c;
    c = document.createElement("div");
    c.className = "ob-ad-cover";
    c.setAttribute("aria-live", "polite");
    // Built with DOM APIs: YouTube enforces Trusted Types, so innerHTML would throw here
    const card = document.createElement("div");
    card.className = "ob-card";
    if (logoUrl) { const img = document.createElement("img"); img.alt = ""; img.src = logoUrl; card.appendChild(img); }
    const text = document.createElement("div");
    const title = document.createElement("b"); title.textContent = "Ad muted and hidden";
    const time = document.createElement("span"); time.className = "ob-time";
    text.append(title, time);
    card.appendChild(text);
    c.appendChild(card);
    player.appendChild(c);
    covers.set(player, c);
    return c;
  }
  function uncover(player) {
    const c = covers.get(player);
    if (c) c.remove();
    covers.delete(player);
  }

  function startAd(player, video) {
    if (!saved.has(video)) {
      saved.set(video, { muted: video.muted });
      safe(() => chrome.runtime.sendMessage({ type: "adSkipped", count: 1 }).catch(() => {}));
    }
    if (!video.muted) video.muted = true;
    const c = safe(() => cover(player));
    if (!c) return; // no card -> leave the (muted) ad visible rather than show a black screen
    if (video.style.opacity !== "0") video.style.setProperty("opacity", "0", "important");
    const left = isFinite(video.duration) && video.duration > 0 ? Math.max(0, Math.ceil(video.duration - video.currentTime)) : null;
    const t = c.querySelector(".ob-time");
    const text = left === null ? "Your video starts shortly" : `Your video starts in ${left} s`;
    if (t && t.textContent !== text) t.textContent = text;
  }

  function endAd(player, video) {
    if (video) {
      const s = saved.get(video);
      saved.delete(video);
      safe(() => { video.style.removeProperty("opacity"); if (s) video.muted = s.muted; });
    }
    if (player) uncover(player);
  }
  function endAll() {
    document.querySelectorAll("#movie_player, .html5-video-player").forEach((p) => endAd(p, p.querySelector("video")));
    saved.clear();
  }

  function handle() {
    if (!isCurrent()) { stop(); return; }
    if (!enabled) return;
    for (const player of document.querySelectorAll("#movie_player, .html5-video-player")) {
      const video = player.querySelector("video");
      const inAd = player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
      if (inAd) {
        for (const sel of SKIP_SELECTORS) {
          player.querySelectorAll(sel).forEach((btn) => { if (btn.offsetParent !== null) btn.click(); });
        }
        if (video) startAd(player, video);
      } else if ((video && (saved.has(video) || video.style.opacity === "0")) || covers.has(player)) {
        endAd(player, video);
      }
      // Repair players left with a sped-up rate by older OpenBlocker versions
      if (!inAd && video && video.playbackRate === 16) safe(() => { video.playbackRate = 1; });
    }

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
  function stop() { if (mo) mo.disconnect(); clearInterval(timer); }
  function start() {
    mo = new MutationObserver(handle);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    timer = setInterval(handle, 250);
    handle();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
