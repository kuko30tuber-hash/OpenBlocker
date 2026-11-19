// OpenBlocker - runs in YouTube's own page context before YouTube's scripts.
// Removes ad data from the player responses so the player never schedules ads.
(() => {
  try { if (localStorage.getItem("__sas_off") === "1") return; } catch (_) {}

  const AD_KEYS = ["adPlacements", "adSlots", "playerAds", "adBreakHeartbeatParams", "adBreakParams"];

  function strip(o) {
    if (!o || typeof o !== "object") return;
    for (const k of AD_KEYS) if (k in o) delete o[k];
    if (o.playerResponse && typeof o.playerResponse === "object") strip(o.playerResponse);
    if (o.response && typeof o.response === "object" && o.response.playerResponse) strip(o.response.playerResponse);
  }
  function prune(o) {
    try {
      if (Array.isArray(o)) { if (o.length < 20) o.forEach(strip); }
      else strip(o);
    } catch (_) {}
    return o;
  }
  const hasAds = (o) => o && typeof o === "object" &&
    ("adPlacements" in o || "playerAds" in o || "adSlots" in o || "playerResponse" in o || Array.isArray(o));

  // 1) JSON.parse
  const origParse = JSON.parse;
  JSON.parse = new Proxy(origParse, {
    apply(target, thisArg, args) {
      const r = Reflect.apply(target, thisArg, args);
      if (hasAds(r)) prune(r);
      return r;
    },
  });

  // 2) fetch() responses (player / next endpoints)
  const AD_URL = /\/youtubei\/v1\/(player|next|reel)|\/watch\?|\/get_watch\?/;
  const proto = Response.prototype;
  const origJson = proto.json;
  proto.json = new Proxy(origJson, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args).then((r) => (hasAds(r) ? prune(r) : r));
    },
  });
  const origText = proto.text;
  proto.text = new Proxy(origText, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args).then((t) => {
        try {
          if (!AD_URL.test(thisArg.url || "") || !/adPlacements|playerAds|adSlots/.test(t)) return t;
          const prefix = t.startsWith(")]}'") ? ")]}'\n" : "";
          const o = origParse(prefix ? t.slice(t.indexOf("\n") + 1) : t);
          prune(o);
          return prefix + JSON.stringify(o);
        } catch (_) { return t; }
      });
    },
  });

  // 3) Initial player data embedded in the page
  for (const name of ["ytInitialPlayerResponse", "playerResponse"]) {
    let v;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get() { return v; },
        set(x) { v = prune(x); },
      });
    } catch (_) {}
  }
})();
