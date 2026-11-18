// OpenBlocker - converts Adblock Plus / uBlock Origin / AdGuard filter lists into:
//   * Chrome declarativeNetRequest rules (block / allow / redirect-to-stub)
//   * cosmetic data: CSS hiding, CSS injection, procedural hiding, scriptlets

const SAS_TYPE_MAP = {
  script: "script", image: "image", stylesheet: "stylesheet", css: "stylesheet",
  object: "object", xmlhttprequest: "xmlhttprequest", xhr: "xmlhttprequest",
  subdocument: "sub_frame", frame: "sub_frame", ping: "ping", beacon: "ping",
  media: "media", font: "font", websocket: "websocket", other: "other", webrtc: "webrtc",
};

// $redirect=<name> -> file in /resources (anything else just blocks)
const SAS_REDIRECTS = {
  "noop.js": "noop.js", "noopjs": "noop.js", "abp-resource:blank-js": "noop.js",
  "noop.txt": "noop.txt", "nooptext": "noop.txt", "abp-resource:blank-text": "noop.txt",
  "noop.html": "noop.html", "noopframe": "noop.html", "abp-resource:blank-html": "noop.html",
  "noop.json": "noop.json", "noopjson": "noop.json",
  "1x1.gif": "1x1.gif", "1x1-transparent.gif": "1x1.gif", "abp-resource:1x1-transparent-gif": "1x1.gif",
  "2x2.png": "2x2.png", "2x2-transparent.png": "2x2.png", "3x2.png": "2x2.png", "3x2-transparent.png": "2x2.png",
  "32x32.png": "2x2.png", "32x32-transparent.png": "2x2.png", "abp-resource:2x2-transparent-png": "2x2.png",
  "noop-vmap1.0.xml": "noop-vmap.xml", "noopvmap-1.0": "noop-vmap.xml", "noop-vast2.xml": "noop-vast.xml",
  "noop-vast3.xml": "noop-vast.xml", "noop-vast4.xml": "noop-vast.xml", "noopvast-2.0": "noop-vast.xml",
  "noopvast-3.0": "noop-vast.xml", "noopvast-4.0": "noop-vast.xml",
  "googlesyndication_adsbygoogle.js": "adsbygoogle.js", "googlesyndication.com/adsbygoogle.js": "adsbygoogle.js",
  "googlesyndication-adsbygoogle": "adsbygoogle.js",
  "googletagservices_gpt.js": "gpt.js", "googletagservices.com/gpt.js": "gpt.js", "googletagservices-gpt": "gpt.js",
  "google-analytics_analytics.js": "analytics.js", "google-analytics.com/analytics.js": "analytics.js",
  "google-analytics": "analytics.js",
  "google-analytics_ga.js": "ga.js", "google-analytics.com/ga.js": "ga.js", "google-analytics-ga": "ga.js",
  "googletagmanager_gtm.js": "gtm.js", "googletagmanager.com/gtm.js": "gtm.js", "googletagmanager-gtm": "gtm.js",
  "amazon_apstag.js": "apstag.js", "amazon-apstag": "apstag.js",
  "scorecardresearch_beacon.js": "scorecard.js", "scorecardresearch-beacon": "scorecard.js",
};

// Procedural (non-CSS) operators handled by content/procedural.js
const SAS_PROCEDURAL_RE = /:(?:has-text|-abp-contains|contains|upward|remove|style|matches-css(?:-before|-after)?|min-text-length|xpath|matches-path|remove-attr|remove-class|if|if-not|matches-attr|matches-prop|watch-attr|others|nth-ancestor)\(/;
const SAS_UNSUPPORTED_COSMETIC = /[{}]|^\^|:-abp-properties|:matches-media\(|:shadow\(/;

const SAS_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const SAS_HOSTS_RE = /^(?:0\.0\.0\.0|127\.0\.0\.1|::1?|::)\s+(\S+)/;
const SAS_PURE_DOMAIN_KEY = JSON.stringify([false, 1, "", "", ""]);

// Pre-parsing directives (!#if env_chromium ...). We are Chromium + MV3, not uBO's full engine.
const SAS_ENV = {
  env_chromium: true, env_chrome: true, env_mv3: true, env_edge: false, env_firefox: false, env_safari: false,
  env_mobile: false, env_legacy: false, cap_html_filtering: false, cap_user_stylesheet: true,
  cap_ipaddress: false, false: false, true: true, ext_ublock: true, ext_ubol: true, ext_devbuild: false,
  adguard: false, adguard_app_windows: false, adguard_app_mac: false, adguard_app_android: false,
  adguard_ext_chromium: false, adguard_ext_chromium_mv3: false, adguard_ext_firefox: false,
  adguard_ext_edge: false, adguard_ext_safari: false, adguard_ext_opera: false, adguard_ext_android_cb: false,
};
function sasEvalIf(expr) {
  // supports !, &&, ||, parentheses
  const toks = expr.match(/!|&&|\|\||\(|\)|[\w.-]+/g) || [];
  let i = 0;
  const primary = () => {
    const t = toks[i++];
    if (t === "!") return !primary();
    if (t === "(") { const v = orExpr(); i++; return v; }
    return !!SAS_ENV[t];
  };
  const andExpr = () => { let v = primary(); while (toks[i] === "&&") { i++; v = primary() && v; } return v; };
  const orExpr = () => { let v = andExpr(); while (toks[i] === "||") { i++; v = andExpr() || v; } return v; };
  try { return orExpr(); } catch (_) { return false; }
}

// uBO "entity" syntax (google.*) -> expand to common public suffixes
const SAS_TLDS = ["com", "net", "org", "info", "biz", "io", "co", "me", "tv", "cc", "to", "ws", "xyz", "top", "site", "online",
  "de", "fr", "it", "es", "nl", "be", "at", "ch", "pl", "cz", "sk", "hu", "ro", "bg", "gr", "pt", "se", "no", "dk", "fi",
  "ie", "uk", "co.uk", "ru", "ua", "tr", "il", "ae", "in", "pk", "id", "my", "sg", "ph", "vn", "th", "jp", "co.jp", "kr",
  "tw", "hk", "cn", "au", "com.au", "nz", "co.nz", "ca", "us", "mx", "com.mx", "br", "com.br", "ar", "com.ar", "cl", "pe",
  "za", "co.za", "eg", "ng", "lt", "lv", "ee", "si", "hr", "rs", "ba", "is", "lu"];
function sasExpandDomains(list) {
  const out = [];
  for (const d of list) {
    const neg = d[0] === "~", base = neg ? d.slice(1) : d;
    if (base.endsWith(".*") && !base.slice(0, -2).includes("*")) {
      for (const t of SAS_TLDS) out.push((neg ? "~" : "") + base.slice(0, -1) + t);
    } else out.push(d);
  }
  return out;
}

function sasNewParseState() {
  return {
    popupDomains: new Set(),
    domainGroups: new Map(), // key -> Set(domains)  (pure "||domain^" filters, grouped)
    blockRules: [],
    allowRules: [],
    redirectRules: [],
    modifyRules: [],       // removeparam / csp
    regexRules: [],        // /regex/ network filters (validated by Chrome before use)
    genericRemoveParams: new Set(),
    seen: new Set(),
    generic: new Set(),
    specific: new Map(),     // domain -> Set(css selectors)
    exceptions: new Map(),   // domain -> Set(selectors / procedural strings)
    procedural: new Map(),   // domain -> Set(procedural selectors)
    css: new Map(),          // domain -> Set("selector { declarations }")
    scriptlets: new Map(),   // domain -> Set(JSON [name, ...args])
    scriptletExceptions: new Map(), // domain -> Set(JSON) ; "*" = all scriptlets disabled
    includes: [],
  };
}

function sasPush(map, key, val) {
  let s = map.get(key);
  if (!s) map.set(key, (s = new Set()));
  s.add(val);
}

// split "a, b\, c, 'd, e'" -> ["a", "b, c", "d, e"]
function sasSplitArgs(s) {
  const out = [];
  let cur = "", q = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && (s[i + 1] === "," || s[i + 1] === q)) { cur += s[++i]; continue; }
    if (q) { if (c === q) { q = ""; continue; } cur += c; continue; }
    if ((c === "'" || c === '"') && cur.trim() === "") { q = c; cur = ""; continue; }
    if (c === ",") { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

const SAS_SCRIPTLET_ALIAS = {
  "aopr": "abort-on-property-read", "aopw": "abort-on-property-write", "acs": "abort-current-script",
  "acis": "abort-current-script", "abort-current-inline-script": "abort-current-script",
  "aost": "abort-on-stack-trace", "set": "set-constant", "nostif": "no-setTimeout-if",
  "prevent-setTimeout": "no-setTimeout-if", "setTimeout-defuser": "no-setTimeout-if",
  "nosiif": "no-setInterval-if", "prevent-setInterval": "no-setInterval-if", "setInterval-defuser": "no-setInterval-if",
  "aeld": "addEventListener-defuser", "prevent-addEventListener": "addEventListener-defuser",
  "ra": "remove-attr", "rc": "remove-class", "nowoif": "no-window-open-if", "prevent-window-open": "no-window-open-if",
  "window.open-defuser": "no-window-open-if", "nano-sib": "adjust-setInterval", "nano-setInterval-booster": "adjust-setInterval",
  "nano-stb": "adjust-setTimeout", "nano-setTimeout-booster": "adjust-setTimeout",
  "prevent-fetch": "no-fetch-if", "prevent-xhr": "no-xhr-if", "rmnt": "remove-node-text",
  "rpnt": "trusted-replace-node-text", "prevent-fab-3.2.0": "nofab", "fuckadblock.js-3.2.0": "nofab",
  "prevent-bab": "nobab", "bab-defuser": "nobab", "prevent-eval-if": "noeval-if", "noeval-silent": "noeval",
  "set-local-storage-item": "set-local-storage-item", "set-session-storage-item": "set-session-storage-item",
  "cookie-remover": "remove-cookie", "prevent-refresh": "refresh-defuser", "norafif": "no-requestAnimationFrame-if",
  "prevent-requestAnimationFrame": "no-requestAnimationFrame-if", "rnt": "remove-node-text",
  "trusted-rpnt": "trusted-replace-node-text", "trusted-set": "trusted-set-constant",
  "trusted-rpfr": "trusted-replace-fetch-response", "trusted-rpxr": "trusted-replace-xhr-response",
  "set-attr": "set-attr", "close-window": "window-close-if", "nowebrtc": "nowebrtc",
};
function sasNormScriptletName(n) {
  n = n.trim().replace(/^ubo-/, "").replace(/\.js$/, "");
  return SAS_SCRIPTLET_ALIAS[n] || n;
}

const SAS_COSMETIC_RE = /^([^#$\s]*?)(##|#@#|#\?#|#@\?#|#\$#|#@\$#|#%#|#@%#|#\$\?#|#@\$\?#)(.+)$/;

// opts.plainDomains: treat bare "example.com" lines as domains (domain-list format)
// opts.trusted: list may use uBO "trusted-*" scriptlets (only uBO's own lists and the user's filters)
function sasParseFilterList(text, out, opts) {
  out = out || sasNewParseState();
  const plain = opts && opts.plainDomains;
  const trusted = opts && opts.trusted;
  const lines = text.split(/\r?\n/);
  const ifStack = []; // booleans
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // ---------- pre-parsing directives ----------
    if (line.startsWith("!#if ")) { ifStack.push(sasEvalIf(line.slice(5))); continue; }
    if (line.startsWith("!#else")) { if (ifStack.length) ifStack[ifStack.length - 1] = !ifStack[ifStack.length - 1]; continue; }
    if (line.startsWith("!#endif")) { ifStack.pop(); continue; }
    if (ifStack.length && ifStack.includes(false)) continue;
    if (line.startsWith("!#include ")) { out.includes.push(line.slice(10).trim()); continue; }
    if (line[0] === "!" || line[0] === "[" || line.includes("$$")) continue;

    // ---------- hosts-file format ----------
    const hm = line.match(SAS_HOSTS_RE);
    if (hm) {
      const d = hm[1].toLowerCase();
      if (SAS_DOMAIN_RE.test(d) && d !== "localhost" && !d.endsWith(".localdomain")) sasPush(out.domainGroups, SAS_PURE_DOMAIN_KEY, d);
      continue;
    }
    if (line[0] === "#" && !/^#[@?$%]*#/.test(line)) continue;
    if (plain && SAS_DOMAIN_RE.test(line.toLowerCase())) {
      sasPush(out.domainGroups, SAS_PURE_DOMAIN_KEY, line.toLowerCase());
      continue;
    }

    // ---------- cosmetic / scriptlet filters ----------
    const cm = line.match(SAS_COSMETIC_RE);
    if (cm && !/^[|@/]/.test(cm[1])) {
      sasParseCosmetic(cm[1], cm[2], cm[3].trim(), out, trusted);
      continue;
    }

    sasParseNetwork(line, out);
  }
  return out;
}

function sasParseCosmetic(doms, sep, body, out, trusted) {
  const isException = sep.includes("@");
  let parts = doms ? doms.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean) : [];
  parts = sasExpandDomains(parts);
  if (parts.some((d) => d.includes("*") || d.startsWith("/"))) return;
  const pos = parts.filter((d) => d[0] !== "~");
  const neg = parts.filter((d) => d[0] === "~").map((d) => d.slice(1));
  if (!body || body.length > 1000) return;

  // ----- scriptlets: uBO "##+js(name, args)" and AdGuard "#%#//scriptlet('name', 'args')" -----
  let scriptlet = null;
  if ((sep === "##" || sep === "#@#") && body.startsWith("+js(") && body.endsWith(")")) {
    const inner = body.slice(4, -1);
    if (inner.trim() === "") {
      if (isException) pos.forEach((d) => sasPush(out.scriptletExceptions, d, "*"));
      return;
    }
    scriptlet = sasSplitArgs(inner);
  } else if ((sep === "#%#" || sep === "#@%#") && body.startsWith("//scriptlet(") && body.endsWith(")")) {
    scriptlet = sasSplitArgs(body.slice(12, -1));
  } else if (sep === "#%#" || sep === "#@%#") {
    return; // raw AdGuard JS injection: not supported
  }
  if (scriptlet) {
    if (!scriptlet[0]) return;
    scriptlet[0] = sasNormScriptletName(scriptlet[0]);
    if (scriptlet[0].startsWith("trusted-") && !trusted) return;
    while (scriptlet.length > 1 && scriptlet[scriptlet.length - 1] === "") scriptlet.pop();
    const key = JSON.stringify(scriptlet);
    if (isException) { pos.forEach((d) => sasPush(out.scriptletExceptions, d, key)); return; }
    if (!pos.length) return; // generic scriptlets are not supported (same as uBO)
    pos.forEach((d) => sasPush(out.scriptlets, d, key));
    neg.forEach((d) => sasPush(out.scriptletExceptions, d, key));
    return;
  }

  // ----- AdGuard CSS injection "#$#selector { declarations }" -----
  if (sep === "#$#" || sep === "#@$#" || sep === "#$?#" || sep === "#@$?#") {
    if (isException || !pos.length) return;
    const m = body.match(/^(.+?)\s*\{([^{}]+)\}\s*$/);
    if (!m || SAS_PROCEDURAL_RE.test(m[1])) return;
    const rule = m[1] + "{" + m[2] + "}";
    pos.forEach((d) => sasPush(out.css, d, rule));
    return;
  }

  // ----- element hiding (plain CSS or procedural) -----
  let sel = body
    .replace(/:-abp-has\(/g, ":has(")
    .replace(/:-abp-contains\(/g, ":has-text(");
  if (SAS_UNSUPPORTED_COSMETIC.test(sel)) return;

  // "selector:style(declarations)" with a plain selector -> CSS injection
  const sm = sel.match(/^(.*?):style\(([^()]*)\)$/);
  if (sm && !SAS_PROCEDURAL_RE.test(sm[1]) && sm[1] && !isException) {
    if (!pos.length) return;
    pos.forEach((d) => sasPush(out.css, d, sm[1] + "{" + sm[2] + "}"));
    return;
  }

  const procedural = SAS_PROCEDURAL_RE.test(sel);
  if (isException) {
    if (pos.length) pos.forEach((d) => sasPush(out.exceptions, d, sel));
    else if (!neg.length && !procedural) out.generic.delete(sel);
    return;
  }
  if (procedural) {
    if (!pos.length) return; // generic procedural filters are too expensive (uBO ignores them too)
    pos.forEach((d) => sasPush(out.procedural, d, sel));
    neg.forEach((d) => sasPush(out.exceptions, d, sel));
    return;
  }
  if (pos.length) pos.forEach((d) => sasPush(out.specific, d, sel));
  else {
    out.generic.add(sel);
    neg.forEach((d) => sasPush(out.exceptions, d, sel));
  }
}

function sasParseNetwork(line, out) {
  let l = line, isAllow = false;
  if (l.startsWith("@@")) { isAllow = true; l = l.slice(2); }

  let pattern = l, opts = [];
  const di = l.lastIndexOf("$");
  if (di >= 0) {
    const o = l.slice(di + 1);
    const before = l.slice(0, di);
    const regexEnd = before.startsWith("/") && o.endsWith("/") && !o.includes("="); // "$" was a regex anchor
    if (!regexEnd) { pattern = l.slice(0, di); opts = sasSplitOpts(o); }
  }
  const isRegex = pattern.length > 2 && pattern.startsWith("/") && pattern.endsWith("/");
  if (!isRegex && !/^[\x21-\x7e]*$/.test(pattern)) return;

  if (!isAllow && opts.some((o) => o.toLowerCase() === "popup")) {
    const pm = pattern.match(/^\|\|([a-z0-9.\-]+)\^?$/i);
    if (pm && SAS_DOMAIN_RE.test(pm[1].toLowerCase())) out.popupDomains.add(pm[1].toLowerCase());
    return;
  }

  const cond = {};
  let priority = isAllow ? 2 : 1;
  const types = [], notTypes = [];
  let redirect = null, removeparam = null, csp = null, isDocument = false;
  for (const op of opts) {
    const eq = op.indexOf("=");
    const key = (eq >= 0 ? op.slice(0, eq) : op).toLowerCase();
    const val = eq >= 0 ? op.slice(eq + 1) : "";
    const neg = key.startsWith("~");
    const name = neg ? key.slice(1) : key;
    if (name === "third-party" || name === "3p") cond.domainType = neg ? "firstParty" : "thirdParty";
    else if (name === "first-party" || name === "1p") cond.domainType = neg ? "thirdParty" : "firstParty";
    else if ((name === "domain" || name === "from") && val) {
      const inc = [], exc = [];
      for (const d of sasExpandDomains(val.split("|"))) {
        if (!d || d.includes("*") || !/^~?[a-z0-9.\-]+$/i.test(d)) continue;
        if (d[0] === "~") exc.push(d.slice(1).toLowerCase()); else inc.push(d.toLowerCase());
      }
      if (inc.length) cond.initiatorDomains = inc;
      if (exc.length) cond.excludedInitiatorDomains = exc;
      if (!inc.length && !exc.length) return;
    } else if (name === "important") { if (!isAllow) priority = 3; }
    else if (name === "match-case") cond.isUrlFilterCaseSensitive = true;
    else if (name === "all") { if (!neg) { isDocument = true; } }
    else if (name === "document" || name === "doc") { if (neg) continue; isDocument = true; }
    else if (name === "redirect" || name === "rewrite") {
      if (isAllow) return;
      const r = val.replace(/:\d+$/, "");
      redirect = SAS_REDIRECTS[r] || ""; // unknown resource -> plain block
    } else if (name === "empty") { redirect = "noop.txt"; }
    else if (name === "mp4") { /* treat as block */ }
    else if (name === "removeparam" || name === "queryprune") {
      if (isAllow || !val || val.startsWith("~") || val.startsWith("/") || !/^[\w.\-\[\]%]+$/.test(val)) return;
      removeparam = val;
    } else if (name === "csp") {
      if (isAllow || !val || /report-(?:uri|to)/i.test(val)) return;
      csp = val;
    }
    else if (SAS_TYPE_MAP[name]) (neg ? notTypes : types).push(SAS_TYPE_MAP[name]);
    else return; // unsupported option (redirect-rule, header, permissions, elemhide, ...)
  }

  // ----- tracking parameter removal -----
  if (removeparam) {
    const p = pattern.replace(/^\*$/, "");
    if (!p && !cond.initiatorDomains && !cond.excludedInitiatorDomains && !cond.domainType) {
      out.genericRemoveParams.add(removeparam);
      return;
    }
    if (p && sasBadUrlFilter(p)) return;
    const c = { ...cond, resourceTypes: types.length ? types.filter((t) => ["main_frame", "sub_frame", "xmlhttprequest"].includes(t)) : ["main_frame", "sub_frame", "xmlhttprequest"] };
    if (!c.resourceTypes.length) return;
    c.urlFilter = p ? p : removeparam + "=";
    out.modifyRules.push({ priority: 1, action: { type: "redirect", redirect: { transform: { queryTransform: { removeParams: [removeparam] } } } }, condition: c });
    return;
  }

  // ----- Content-Security-Policy injection (blocks inline scripts / pop-unders on specific sites) -----
  if (csp) {
    if (!cond.initiatorDomains && !(pattern && pattern !== "*")) return; // never site-wide for the whole web
    const c = { resourceTypes: ["main_frame", "sub_frame"] };
    if (pattern && pattern !== "*") { if (sasBadUrlFilter(pattern)) return; c.urlFilter = pattern; }
    else c.requestDomains = cond.initiatorDomains;
    if (cond.excludedInitiatorDomains) c.excludedRequestDomains = cond.excludedInitiatorDomains;
    out.modifyRules.push({ priority: 1, action: { type: "modifyHeaders", responseHeaders: [{ header: "content-security-policy", operation: "append", value: csp }] }, condition: c });
    return;
  }

  // ----- whole-site rules: block a page (scam/malware) or disable blocking on a page -----
  if (isDocument) {
    const dm = pattern.match(/^\|\|([a-z0-9][a-z0-9.\-]*\.[a-z0-9\-]{2,})\^?\|?$/i);
    if (isAllow) {
      if (!dm && !cond.initiatorDomains) return;
      const c = { resourceTypes: ["main_frame", "sub_frame"] };
      if (dm) c.requestDomains = [dm[1].toLowerCase()]; else c.requestDomains = cond.initiatorDomains;
      out.allowRules.push({ priority: 5, action: { type: "allowAllRequests" }, condition: c }); // beats built-in tracker blocks (3) and stand-ins (4)
      return;
    }
    if (types.length || notTypes.length) types.push("main_frame"); // e.g. $doc,script
    else if (dm && SAS_DOMAIN_RE.test(dm[1].toLowerCase()) && !cond.initiatorDomains && !cond.excludedInitiatorDomains) {
      // block every request to the domain, including opening it
      const key = JSON.stringify([false, priority, cond.domainType || "", ["main_frame", "sub_frame", "script", "image", "stylesheet", "xmlhttprequest", "media", "font", "object", "ping", "websocket", "other"], ""]);
      sasPush(out.domainGroups, key, dm[1].toLowerCase());
      return;
    } else types.push("main_frame");
  }

  if (types.length) cond.resourceTypes = [...new Set(types)];
  else if (notTypes.length) cond.excludedResourceTypes = [...new Set([...notTypes, "main_frame"])];

  // ----- regular-expression filters -----
  if (isRegex) {
    if (redirect) return;
    const re = pattern.slice(1, -1);
    if (/\(\?[=!<]|\\[1-9]|\\[bB]/.test(re) || !/^[\x20-\x7e]+$/.test(re) || re.length > 200) return; // RE2 can't do lookarounds/backrefs
    const { isUrlFilterCaseSensitive, ...rest } = cond;
    out.regexRules.push({ priority, action: { type: isAllow ? "allow" : "block" }, condition: { regexFilter: re, isUrlFilterCaseSensitive: !!isUrlFilterCaseSensitive, ...rest } });
    return;
  }

  if (sasBadUrlFilter(pattern)) return;

  if (redirect) {
    if (!cond.resourceTypes) cond.resourceTypes = sasRedirectTypes(redirect);
    const rule = { priority: priority + 1, action: { type: "redirect", redirect: { extensionPath: "/resources/" + redirect } }, condition: { urlFilter: pattern, ...cond } };
    const sig = JSON.stringify(rule);
    if (!out.seen.has(sig)) { out.seen.add(sig); out.redirectRules.push(rule); }
    return;
  }

  const dm = pattern.match(/^\|\|([a-z0-9][a-z0-9.\-]*\.[a-z0-9\-]{2,})\^?\|?$/i);
  if (dm && !SAS_DOMAIN_RE.test(dm[1].toLowerCase())) return;
  if (dm && !cond.initiatorDomains && !cond.excludedInitiatorDomains && !cond.isUrlFilterCaseSensitive) {
    const key = JSON.stringify([isAllow, priority, cond.domainType || "", cond.resourceTypes || "", cond.excludedResourceTypes || ""]);
    sasPush(out.domainGroups, key, dm[1].toLowerCase());
    return;
  }

  const rule = { priority, action: { type: isAllow ? "allow" : "block" }, condition: { urlFilter: pattern, ...cond } };
  const sig = JSON.stringify(rule);
  if (out.seen.has(sig)) return;
  out.seen.add(sig);
  (isAllow ? out.allowRules : out.blockRules).push(rule);
}

// options are comma separated, but csp=... values may contain commas inside quotes? (they don't in practice) -> plain split
function sasSplitOpts(o) { return o.split(","); }

function sasBadUrlFilter(pattern) {
  if (!pattern || pattern.startsWith("||*")) return true;
  let inner = pattern;
  if (inner.startsWith("||")) inner = inner.slice(2); else if (inner.startsWith("|")) inner = inner.slice(1);
  if (inner.endsWith("|")) inner = inner.slice(0, -1);
  if (inner.includes("|")) return true;
  return inner.replace(/[\^*]/g, "").length < 4;
}

function sasRedirectTypes(file) {
  if (file.endsWith(".js")) return ["script"];
  if (file.endsWith(".gif") || file.endsWith(".png")) return ["image"];
  if (file.endsWith(".html")) return ["sub_frame"];
  if (file.endsWith(".xml") || file.endsWith(".json") || file.endsWith(".txt")) return ["xmlhttprequest", "other"];
  return ["other"];
}

// Rule id ranges
//   list: block 1..199999, redirect 200000..209999, regex 210000..210999, modify 220000..229999,
//         split spares 230000..249999, allow 500000..899999
//   user: block 300000..349999, redirect 350000..359999, regex 360000..360999, modify 370000..379999,
//         split spares 380000..399999, allow 900000..999999
const SAS_LIST_BASES = { block: 1, redirect: 200000, regex: 210000, modify: 220000, allow: 500000, spare: 230000 };
const SAS_USER_BASES = { block: 300000, redirect: 350000, regex: 360000, modify: 370000, allow: 900000, spare: 380000 };

// Built-in tracking parameters (same list as rules_params.json); merged into list rules because
// Chrome applies only one redirect rule per request.
const SAS_STATIC_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "utm_name", "utm_reader", "utm_referrer", "utm_social", "utm_brand", "utm_place", "utm_pubreferrer", "utm_swu", "utm_viz_id", "utm_cid", "utm_source_platform", "utm_creative_format", "utm_marketing_tactic", "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "msclkid", "mc_eid", "mc_cid", "igshid", "igsh", "yclid", "_hsenc", "_hsmi", "__hssc", "__hstc", "__hsfp", "hsCtaTracking", "twclid", "ttclid", "li_fat_id", "mkt_tok", "oly_anon_id", "oly_enc_id", "rb_clickid", "s_cid", "vero_conv", "vero_id", "wickedid", "_openstat", "ga_source", "ga_medium", "ga_campaign", "ga_content", "ga_term", "srsltid", "epik", "pk_campaign", "pk_kwd", "piwik_campaign", "piwik_kwd", "mtm_campaign", "mtm_kwd", "mtm_source", "mtm_medium", "mtm_content", "mtm_cid", "mtm_group", "mtm_placement"];

// caps: { total, unsafe, regex }
function sasBuildDnrRules(out, caps, bases) {
  if (typeof caps === "number") caps = { total: caps, unsafe: 4500, regex: 900 };
  bases = bases || SAS_LIST_BASES;
  const blocks = [], allows = [];
  for (const [key, set] of out.domainGroups) {
    const [isAllow, priority, domainType, rt, ert] = JSON.parse(key);
    const doms = [...set];
    for (let i = 0; i < doms.length; i += 1000) {
      const c = { requestDomains: doms.slice(i, i + 1000) };
      if (domainType) c.domainType = domainType;
      if (rt) c.resourceTypes = rt;
      if (ert) c.excludedResourceTypes = ert;
      (isAllow ? allows : blocks).push({ priority, action: { type: isAllow ? "allow" : "block" }, condition: c });
    }
  }
  const domainRuleCount = blocks.length + allows.length;
  allows.push(...out.allowRules);
  blocks.push(...out.blockRules);

  // Tracking parameters. All link-cleaning rules use priority 1, so at equal priority Chrome's
  // precedence (allow > block > redirect) means they can never override a block or an exception.
  //  * generic parameters: small regex-gated rules that only match when such a parameter is present;
  //    each removes the whole generic set, so it doesn't matter which one wins.
  //  * site-specific parameters: their own rule; after one redirect Chrome evaluates the new URL again,
  //    so remaining parameters are removed by the next matching rule.
  const modify = [];
  const paramRegex = [];
  const genericNames = [...out.genericRemoveParams].filter((n) => /^[\w.\-\[\]%]+$/.test(n));
  const generic = [...new Set([...SAS_STATIC_PARAMS, ...genericNames])].slice(0, 1000);
  for (let i = 0; i < genericNames.length; i += 8) {
    const alt = genericNames.slice(i, i + 8).map((n) => n.replace(/[.\[\]\\]/g, "\\$&")).join("|");
    paramRegex.push({ priority: 1, action: { type: "redirect", redirect: { transform: { queryTransform: { removeParams: generic } } } },
      condition: { regexFilter: `[?&](?:${alt})=`, isUrlFilterCaseSensitive: true, resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest"] } });
  }
  for (const r of out.modifyRules) { r.priority = 1; modify.push(r); }
  const unsafe = Math.max(0, caps.unsafe);
  const redirectKeep = out.redirectRules.slice(0, Math.min(out.redirectRules.length, Math.floor(unsafe * 0.55)));
  const paramRegexKeep = paramRegex.slice(0, Math.min(paramRegex.length, 150, Math.floor(caps.regex / 4)));
  const modifyKeep = modify.slice(0, Math.max(0, unsafe - redirectKeep.length - paramRegexKeep.length));
  const regexKeep = out.regexRules.slice(0, Math.max(0, Math.min(caps.regex - paramRegexKeep.length, 999)));
  const budget = Math.max(0, caps.total - redirectKeep.length - modifyKeep.length - regexKeep.length);
  const allowKeep = allows.slice(0, Math.min(allows.length, Math.floor(budget * 0.3)));
  const blockKeep = blocks.slice(0, Math.max(0, budget - allowKeep.length));

  let bid = bases.block, rid = bases.redirect, gid = bases.regex, mid = bases.modify, aid = bases.allow;
  return {
    rules: [
      ...blockKeep.map((r) => ({ id: bid++, ...r })),
      ...redirectKeep.map((r) => ({ id: rid++, ...r })),
      ...modifyKeep.map((r) => ({ id: mid++, ...r })),
      ...allowKeep.map((r) => ({ id: aid++, ...r })),
    ],
    // regex rules are validated by the caller (chrome.declarativeNetRequest.isRegexSupported) before adding
    regexRules: [
      ...regexKeep.map((r) => ({ id: r.action.type === "allow" ? aid++ : gid++, ...r })),
      ...paramRegexKeep.map((r) => ({ id: mid++, ...r })),
    ],
    stats: {
      domainRuleCount,
      blockedDomains: [...out.domainGroups.values()].reduce((n, s) => n + s.size, 0),
      totalAvailable: blocks.length + allows.length + out.redirectRules.length + modify.length + out.regexRules.length,
      kept: blockKeep.length + allowKeep.length + redirectKeep.length + modifyKeep.length + regexKeep.length + paramRegexKeep.length,
      redirects: redirectKeep.length,
      removeparams: modifyKeep.filter((r) => r.action.type === "redirect").length + paramRegexKeep.length,
      csp: modifyKeep.filter((r) => r.action.type === "modifyHeaders").length,
      regex: regexKeep.length,
    },
  };
}

function sasSerializeCosmetic(out) {
  const obj = (m) => Object.fromEntries([...m].map(([k, v]) => [k, [...v]]));
  return {
    generic: [...out.generic], specific: obj(out.specific), exceptions: obj(out.exceptions),
    procedural: obj(out.procedural), css: obj(out.css),
    scriptlets: obj(out.scriptlets), scriptletExceptions: obj(out.scriptletExceptions),
    popupDomains: [...out.popupDomains],
  };
}

function sasCss(selectors) {
  // One rule per selector so a single unsupported selector can't break the others
  let css = "";
  for (const s of selectors) css += s + "{display:none!important}\n";
  return css;
}

if (typeof module !== "undefined") {
  module.exports = { sasNewParseState, sasParseFilterList, sasBuildDnrRules, sasSerializeCosmetic, sasCss, sasSplitArgs, sasEvalIf, SAS_LIST_BASES, SAS_USER_BASES };
}
