// OpenBlocker - per-page setup (isolated world)
//  * toggles the built-in cosmetic filters
//  * asks the background for this site's procedural filters and scriptlets
//  * caches the scriptlets in the site's localStorage so content/scriptlets-loader.js can run them
//    at the very start of the next page load (before the site's own scripts)
(() => {
  const root = document.documentElement;
  root.classList.add("sas-on"); // assume on until storage says otherwise (avoids ad flash)

  function refresh() {
    chrome.storage.local.get({ enabled: true, whitelist: [] }, (s) => {
      let host = location.hostname;
      try { if (window.top !== window) host = new URL(document.referrer || location.href).hostname; } catch (_) {}
      const paused = s.whitelist.some((w) => host === w || host.endsWith("." + w));
      const on = s.enabled && !paused;
      root.classList.toggle("sas-on", on);
      try {
        if (on) localStorage.removeItem("__sas_off"); else localStorage.setItem("__sas_off", "1");
      } catch (_) {}
    });
  }
  refresh();
  chrome.storage.onChanged.addListener((c) => { if (c.enabled || c.whitelist) refresh(); });

  if (!/^https?:$/.test(location.protocol)) return;
  chrome.runtime.sendMessage({ type: "getPageConfig", url: location.href }, (cfg) => {
    if (chrome.runtime.lastError || !cfg) return;
    // cache scriptlets for an early start next time
    try {
      const json = cfg.scriptlets && cfg.scriptlets.length ? JSON.stringify(cfg.scriptlets) : null;
      if (json === null) localStorage.removeItem("__sas_sl");
      else if (localStorage.getItem("__sas_sl") !== json) localStorage.setItem("__sas_sl", json);
    } catch (_) {}
    if (cfg.procedural && cfg.procedural.length && typeof sasProceduralRun === "function") {
      sasProceduralRun(cfg.procedural);
    }
  });
})();
