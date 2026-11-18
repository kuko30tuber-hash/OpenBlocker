// OpenBlocker - anti-adblock defuser (runs in the page's own context, before site scripts).
// 1) Neutralises common ad-block detectors (FuckAdBlock, BlockAdBlock, canRunAds bait...).
// 2) Provides harmless stand-ins for blocked ad/analytics scripts so pages don't break
//    (e.g. links that wait for a Google Analytics callback before navigating).
(() => {
  try { if (localStorage.getItem("__sas_off") === "1") return; } catch (_) {}
  const W = window;
  const noop = function () {};

  function lock(name, value) {
    try {
      Object.defineProperty(W, name, { configurable: true, get: () => value, set: () => {} });
    } catch (_) {}
  }
  function soft(name, value) {
    try { if (!(name in W)) W[name] = value; } catch (_) {}
  }

  // ---- FuckAdBlock / BlockAdBlock / SniffAdBlock family: always report "no ad blocker" ----
  class NoAdBlock {
    constructor() { this._ok = []; }
    setOption() { return this; }
    check() { this._ok.forEach((f) => setTimeout(f, 1)); return false; }
    emitEvent() { return this; }
    clearEvent() {}
    on(detected, fn) { if (!detected && typeof fn === "function") setTimeout(fn, 1); return this; }
    onDetected() { return this; }
    onNotDetected(fn) { if (typeof fn === "function") { this._ok.push(fn); setTimeout(fn, 1); } return this; }
  }
  for (const n of ["FuckAdBlock", "BlockAdBlock", "SniffAdBlock"]) lock(n, NoAdBlock);
  for (const n of ["fuckAdBlock", "blockAdBlock", "sniffAdBlock"]) lock(n, new NoAdBlock());

  // ---- Classic bait variables set by "ads.js" style detectors ----
  lock("canRunAds", true);
  lock("canShowAds", true);
  lock("isAdBlockActive", false);
  lock("adblockDetected", false);
  lock("adBlockEnabled", false);

  // ---- Google AdSense stand-in (the real one is blocked) ----
  try {
    if (!W.adsbygoogle) {
      const q = [];
      q.loaded = true;
      q.push = noop;
      W.adsbygoogle = q;
    }
  } catch (_) {}

  // ---- Google Analytics (analytics.js) stand-in: fire hitCallback so links/forms keep working ----
  function fireCallbacks(args) {
    for (const a of args) {
      if (a && typeof a === "object") {
        for (const k of ["hitCallback", "event_callback", "eventCallback"]) {
          if (typeof a[k] === "function") { try { setTimeout(a[k], 1); } catch (_) {} }
        }
      }
    }
  }
  const gaStub = function () { fireCallbacks(arguments); };
  gaStub.create = () => ({ get: noop, set: noop, send: noop });
  gaStub.getByName = () => null;
  gaStub.getAll = () => [];
  gaStub.remove = noop;
  gaStub.loaded = true;
  soft("ga", gaStub);
  soft("__gaTracker", gaStub);

  // ---- gtag / Google Tag Manager dataLayer: run event callbacks that GTM would have run ----
  try {
    const dl = Array.isArray(W.dataLayer) ? W.dataLayer : [];
    const origPush = Array.prototype.push;
    dl.push = function () {
      const r = origPush.apply(this, arguments);
      for (const item of arguments) {
        if (item && typeof item === "object") {
          const args = item.length !== undefined ? Array.from(item) : [item];
          // Only stand in if the real Tag Manager / gtag didn't load (otherwise it runs callbacks itself)
          setTimeout(() => { if (!W.google_tag_manager && !W.google_tag_data) fireCallbacks(args); }, 300);
        }
      }
      return r;
    };
    W.dataLayer = dl;
  } catch (_) {}

  // ---- Facebook pixel stand-in ----
  soft("fbq", Object.assign(noop.bind(null), { callMethod: noop, queue: [], loaded: true, version: "2.0", push: noop }));
})();
