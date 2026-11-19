// OpenBlocker - YouTube video ad skipper
(() => {
  let enabled = true;
  let skipped = 0;

  const root = document.documentElement;

  function refresh() {
    chrome.storage.local.get({ enabled: true, whitelist: [] }, (s) => {
      enabled = s.enabled && !s.whitelist.some((w) => location.hostname === w || location.hostname.endsWith("." + w));
      root.classList.toggle("sas-on", enabled);
      // Tell the page-context script (yt-main.js) whether to strip ad data on the next load
      try { localStorage.setItem("__sas_off", enabled ? "0" : "1"); } catch (_) {}
    });
  }
  refresh();
  chrome.storage.onChanged.addListener(refresh);

  const SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-slot button",
    "button.ytp-ad-skip-button-container",
    ".videoAdUiSkipButton",
    ".ytp-ad-overlay-close-button",
  ];

  let wasInAd = false;

  function handleAd() {
    if (!enabled) return;
    const player = document.querySelector("#movie_player, .html5-video-player");
    if (!player) return;

    const inAd = player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
    const video = player.querySelector("video");

    // 1) Click any visible skip / close button
    for (const sel of SKIP_SELECTORS) {
      document.querySelectorAll(sel).forEach((btn) => {
        if (btn.offsetParent !== null) btn.click();
      });
    }

    if (inAd && video) {
      // 2) Mute and fast-forward unskippable ads to the end
      video.muted = true;
      try { video.playbackRate = 16; } catch (_) {}
      if (isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.1) {
        video.currentTime = video.duration - 0.05;
      }
      if (video.paused) video.play().catch(() => {});
      if (!wasInAd) {
        skipped++;
        chrome.runtime.sendMessage({ type: "adSkipped", count: 1 }).catch(() => {});
      }
      wasInAd = true;
    } else if (wasInAd && video) {
      // 3) Restore normal playback after the ad
      video.muted = false;
      video.playbackRate = 1;
      wasInAd = false;
    }

    // 4) Dismiss "ad blockers are not allowed" style popups if they appear
    document.querySelectorAll("ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)").forEach((el) => {
      el.remove();
      const backdrop = document.querySelector("tp-yt-iron-overlay-backdrop");
      if (backdrop) backdrop.remove();
      const v = document.querySelector("video");
      if (v && v.paused) v.play().catch(() => {});
    });
  }

  const observer = new MutationObserver(handleAd);
  function start() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    setInterval(handleAd, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
