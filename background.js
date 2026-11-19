// OpenBlocker v4 - background service worker
importScripts("filters.js", "scriptlets.js");

const STATIC_RULESET = "ad_rules";
const PARAMS_RULESET = "tracking_params";
const DISABLE_RULE_ID = 1000000;   // allow-everything rule used when blocking is off
const WHITELIST_BASE_ID = 1000001; // per-site pause rules

// Rule id ranges (see filters.js)
const isUserRuleId = (id) => (id >= 300000 && id < 400000) || (id >= 900000 && id < DISABLE_RULE_ID);
const isListRuleId = (id) => id < DISABLE_RULE_ID && !isUserRuleId(id);
const isAllowRuleId = (id) => id >= 500000 && id < DISABLE_RULE_ID;
const isModifyRuleId = (id) => (id >= 220000 && id < 230000) || (id >= 370000 && id < 380000);
// blocks, redirects and regex blocks count as "blocked"; allows and tracking-param/CSP rules don't
const isCountedRule = (id) => id < 500000 && !isModifyRuleId(id);

// Filter lists. `on` = enabled by default. `trusted` = may use uBO trusted scriptlets.
// Domain-only lists are packed 1,000 domains per rule, so they barely count toward Chrome's limits.
const FILTER_LISTS = [
  { id: "easylist", name: "EasyList", desc: "The main list of ads, used by almost every ad blocker.", group: "Ads", on: true, urls: ["https://easylist.to/easylist/easylist.txt"] },
  { id: "ubo-filters", name: "uBlock filters", desc: "uBlock Origin's own fixes for ads that slip past EasyList.", group: "Ads", on: true, trusted: true, urls: ["https://ublockorigin.github.io/uAssets/filters/filters.txt"] },
  { id: "ubo-quick", name: "uBlock Quick fixes (YouTube & anti-adblock)", desc: "Fast-changing fixes for YouTube ads and ad-blocker walls.", group: "Ads", on: true, trusted: true, urls: ["https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt"] },
  { id: "ubo-unbreak", name: "uBlock Unbreak", desc: "Exceptions that keep sites working when other lists go too far.", group: "Ads", on: true, trusted: true, urls: ["https://ublockorigin.github.io/uAssets/filters/unbreak.txt"] },
  { id: "adguard-base", name: "AdGuard Base", desc: "AdGuard's main ad list, catches many regional ads.", group: "Ads", on: true, urls: ["https://filters.adtidy.org/extension/chromium/filters/2.txt"] },
  { id: "adguard-mobile", name: "AdGuard Mobile Ads", desc: "Ads on mobile-style pages and in-app web views.", group: "Ads", on: true, urls: ["https://filters.adtidy.org/extension/chromium/filters/11.txt"] },
  { id: "easyprivacy", name: "EasyPrivacy", desc: "Trackers and analytics that follow you between sites.", group: "Privacy", on: true, urls: ["https://easylist.to/easylist/easyprivacy.txt"] },
  { id: "ubo-privacy", name: "uBlock Privacy", desc: "uBlock Origin's extra tracker rules.", group: "Privacy", on: true, trusted: true, urls: ["https://ublockorigin.github.io/uAssets/filters/privacy.txt"] },
  { id: "adguard-tracking", name: "AdGuard Tracking Protection", desc: "AdGuard's tracker list, including hidden first-party trackers.", group: "Privacy", on: true, urls: ["https://filters.adtidy.org/extension/chromium/filters/3.txt"] },
  { id: "adguard-urltracking", name: "AdGuard URL Tracking", desc: "Removes tracking codes from web addresses (thousands of site-specific ones).", group: "Privacy", on: true, urls: ["https://filters.adtidy.org/extension/chromium/filters/17.txt"] },
  { id: "ubo-badware", name: "uBlock Badware risks (scam & malware sites)", desc: "Warns off scam, fake-download and malware sites.", group: "Security", on: true, trusted: true, urls: ["https://ublockorigin.github.io/uAssets/filters/badware.txt"] },
  { id: "pgl", name: "Peter Lowe's list", desc: "A compact list of ad and tracking servers.", group: "Domains", on: true, urls: ["https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext"] },
  {
    id: "d3host", name: "d3Host (ad-block test hosts)", desc: "The tracker hosts checked by popular ad-block test sites.", group: "Domains", on: true, plainDomains: true,
    urls: [
      "https://raw.githubusercontent.com/d3ward/toolz/master/src/d3host.txt",
      "https://raw.githubusercontent.com/d3ward/toolz/master/src/d3host.adblock",
      "https://cdn.jsdelivr.net/gh/d3ward/toolz@master/src/d3host.txt",
    ],
  },
  { id: "stevenblack", name: "StevenBlack hosts", desc: "A large hosts list of ad, tracking and malware domains.", group: "Domains", on: true, urls: ["https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"] },
  // Optional (off by default)
  { id: "cookies", name: "EasyList Cookie notices", desc: "Hides cookie-consent banners.", group: "Annoyances", on: false, urls: ["https://secure.fanboy.co.nz/fanboy-cookiemonster.txt", "https://easylist-downloads.adblockplus.org/easylist-cookie.txt"] },
  { id: "adguard-cookies", name: "AdGuard Cookie notices", desc: "AdGuard's cookie-banner list (pick one cookie list).", group: "Annoyances", on: false, urls: ["https://filters.adtidy.org/extension/chromium/filters/18.txt"] },
  { id: "adguard-popups", name: "AdGuard Popups (newsletter & push prompts)", desc: "Newsletter sign-ups, push-notification prompts and similar pop-ups.", group: "Annoyances", on: false, urls: ["https://filters.adtidy.org/extension/chromium/filters/19.txt"] },
  { id: "ubo-annoyances", name: "uBlock Annoyances", desc: "uBlock Origin's annoyance rules: chat widgets, 'app' banners and more.", group: "Annoyances", on: false, trusted: true, urls: ["https://ublockorigin.github.io/uAssets/filters/annoyances-others.txt", "https://ublockorigin.github.io/uAssets/filters/annoyances.txt"] },
  { id: "fanboy-annoyance", name: "Fanboy Annoyances", desc: "A broad annoyances list. Can occasionally hide things you want.", group: "Annoyances", on: false, urls: ["https://secure.fanboy.co.nz/fanboy-annoyance.txt"] },
  { id: "fanboy-social", name: "Fanboy Social widgets", desc: "Like, share and follow buttons from social networks.", group: "Annoyances", on: false, urls: ["https://easylist.to/easylist/fanboy-social.txt", "https://secure.fanboy.co.nz/fanboy-social.txt"] },
];

// ---------------- Settings / state ----------------
async function getState() {
  return chrome.storage.local.get({ enabled: true, whitelist: [], trackingParams: true });
}
async function getListSettings() {
  const { listSettings } = await chrome.storage.local.get({ listSettings: {} });
  const out = {};
  for (const l of FILTER_LISTS) out[l.id] = listSettings[l.id] !== undefined ? listSettings[l.id] : l.on;
  return out;
}

function isPaused(host, whitelist) {
  return whitelist.some((w) => host === w || host.endsWith("." + w));
}

async function applyState() {
  const { enabled, whitelist, trackingParams } = await getState();
  const enable = [], disable = [];
  (enabled ? enable : disable).push(STATIC_RULESET);
  (enabled && trackingParams ? enable : disable).push(PARAMS_RULESET);
  await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: enable, disableRulesetIds: disable });

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const add = [];
  if (!enabled) {
    add.push({
      id: DISABLE_RULE_ID, priority: 1000, action: { type: "allowAllRequests" },
      condition: { resourceTypes: ["main_frame", "sub_frame"] },
    });
  }
  whitelist.forEach((h, i) => add.push({
    id: WHITELIST_BASE_ID + i, priority: 1000, action: { type: "allowAllRequests" },
    condition: { requestDomains: [h], resourceTypes: ["main_frame", "sub_frame"] },
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.filter((r) => r.id >= DISABLE_RULE_ID).map((r) => r.id),
    addRules: add,
  });
  registerUserScripts();
  const v = enabled ? "" : "-off";
  chrome.action.setIcon({ path: { 16: `icons/icon16${v}.png`, 32: `icons/icon32${v}.png`, 48: `icons/icon48${v}.png` } }).catch(() => {});
  refreshAllBadges();
}

// ---------------- Adding rules safely ----------------
async function addRulesSafely(rules, spareBase = 230000) {
  // Add in batches; if a batch is rejected, split until the bad rule is isolated and skipped.
  let added = 0;
  let spareId = spareBase;
  async function tryAdd(batch) {
    if (!batch.length) return;
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: batch });
      added += batch.length;
    } catch (e) {
      if (batch.length === 1) {
        const r = batch[0], doms = r.condition.requestDomains;
        if (doms && doms.length > 1) {
          const mid = Math.floor(doms.length / 2);
          await tryAdd([{ ...r, condition: { ...r.condition, requestDomains: doms.slice(0, mid) } }]);
          await tryAdd([{ ...r, id: spareId++, condition: { ...r.condition, requestDomains: doms.slice(mid) } }]);
        }
        return;
      }
      const mid = Math.floor(batch.length / 2);
      await tryAdd(batch.slice(0, mid));
      await tryAdd(batch.slice(mid));
    }
  }
  for (let i = 0; i < rules.length; i += 2000) await tryAdd(rules.slice(i, i + 2000));
  return added;
}

// ---------------- Filter lists ----------------
async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

let updating = false;
async function updateFilterLists() {
  if (updating) return;
  updating = true;
  try {
    await chrome.storage.local.set({ listStatus: { state: "updating", at: Date.now() } });
    const settings = await getListSettings();
    const lists = FILTER_LISTS.filter((l) => settings[l.id]);
    const out = sasNewParseState();
    const results = [];

    const fetched = await Promise.all(lists.map(async (list) => {
      let lastErr = "";
      for (const url of list.urls) {
        try {
          const t = await fetchText(url);
          if (t.length < 100) throw new Error("empty list");
          return { list, url, text: t };
        } catch (e) { lastErr = String(e.message || e); }
      }
      return { list, error: lastErr };
    }));

    for (const { list, url, text, error } of fetched) {
      if (!text) { results.push({ id: list.id, name: list.name, ok: false, error }); continue; }
      const opts = { plainDomains: !!list.plainDomains, trusted: !!list.trusted };
      out.includes = [];
      sasParseFilterList(text, out, opts);
      // !#include sub-files (uBO lists are split into several files)
      const pending = out.includes.map((inc) => new URL(inc, url).href);
      out.includes = [];
      const subTexts = await Promise.all(pending.map((u) => fetchText(u).catch(() => "")));
      for (const t of subTexts) if (t) { out.includes = []; sasParseFilterList(t, out, opts); }
      results.push({ id: list.id, name: list.name, ok: true });
    }
    if (!results.some((r) => r.ok)) {
      await chrome.storage.local.set({ listStatus: { state: "error", at: Date.now(), results } });
      return;
    }

    const before = await chrome.declarativeNetRequest.getDynamicRules();
    const userRules = before.filter((r) => isUserRuleId(r.id));
    const D = chrome.declarativeNetRequest;
    const caps = {
      total: (D.MAX_NUMBER_OF_DYNAMIC_RULES || 5000) - 600 - userRules.length,
      unsafe: (D.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES || 5000) - 300 - userRules.filter((r) => r.action.type === "redirect" || r.action.type === "modifyHeaders").length,
      regex: (D.MAX_NUMBER_OF_REGEX_RULES || 1000) - 60 - userRules.filter((r) => r.condition.regexFilter).length,
    };
    const { rules, regexRules, stats } = sasBuildDnrRules(out, caps);
    const goodRegex = await validRegexRules(regexRules);

    const oldIds = before.filter((r) => isListRuleId(r.id)).map((r) => r.id);
    if (oldIds.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: oldIds });
    // Link-cleaning rules follow the "Remove tracking codes" switch
    const isParamRule = (r) => r.action.type === "redirect" && !!r.action.redirect.transform;
    const all = [...rules, ...goodRegex];
    const paramRules = all.filter(isParamRule);
    const { trackingParams } = await getState();
    const added = await addRulesSafely(all.filter((r) => trackingParams || !isParamRule(r)));
    await chrome.storage.local.set({ paramRules });

    const cos = sasSerializeCosmetic(out);
    const count = (o) => Object.values(o).reduce((n, a) => n + a.length, 0);
    await chrome.storage.local.set({
      cosmetic: cos,
      listStatus: {
        state: "ok", at: Date.now(), results,
        networkRules: added, blockedDomains: stats.blockedDomains, redirects: stats.redirects,
        regexRules: goodRegex.length, removeparams: stats.removeparams, cspRules: stats.csp,
        hideRules: cos.generic.length + count(cos.specific) + count(cos.procedural) + count(cos.css),
        scriptletRules: count(cos.scriptlets),
      },
    });
    cosmeticCache = null;
    popupSet = null;
    await registerUserScripts();
  } finally {
    updating = false;
  }
}

async function validRegexRules(rules) {
  const ok = [];
  for (const r of rules) {
    try {
      const res = await chrome.declarativeNetRequest.isRegexSupported({ regex: r.condition.regexFilter, isCaseSensitive: !!r.condition.isUrlFilterCaseSensitive });
      if (res.isSupported) ok.push(r);
    } catch (_) {}
  }
  return ok;
}

// ---------------- User filters ("My filters" + element picker) ----------------
let userCosmeticCache = null;
async function getUserCosmetic() {
  if (userCosmeticCache) return userCosmeticCache;
  const { userFilters } = await chrome.storage.local.get({ userFilters: "" });
  userCosmeticCache = prepCosmetic(sasSerializeCosmetic(sasParseFilterList(userFilters, null, { trusted: true })));
  return userCosmeticCache;
}

async function applyUserFilters() {
  const { userFilters } = await chrome.storage.local.get({ userFilters: "" });
  const out = sasParseFilterList(userFilters, null, { trusted: true });
  const { rules, regexRules } = sasBuildDnrRules(out, { total: 5000, unsafe: 250, regex: 50 }, SAS_USER_BASES);
  const goodRegex = await validRegexRules(regexRules);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const oldIds = existing.filter((r) => isUserRuleId(r.id)).map((r) => r.id);
  if (oldIds.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: oldIds });
  const added = await addRulesSafely([...rules, ...goodRegex], SAS_USER_BASES.spare);
  userCosmeticCache = null;
  popupSet = null;
  registerUserScripts();
  return { networkRules: added, total: rules.length };
}

// ---------------- Cosmetic data ----------------
let cosmeticCache = null;
function prepCosmetic(c) {
  c = c || {};
  for (const k of ["specific", "exceptions", "procedural", "css", "scriptlets", "scriptletExceptions"]) c[k] = c[k] || {};
  c.generic = c.generic || [];
  c.popupDomains = c.popupDomains || [];
  c.genericCss = sasCss(c.generic);
  return c;
}
async function getCosmetic() {
  if (cosmeticCache) return cosmeticCache;
  const { cosmetic } = await chrome.storage.local.get({ cosmetic: null });
  cosmeticCache = prepCosmetic(cosmetic);
  return cosmeticCache;
}

function hostSuffixes(host) {
  const parts = host.split(".");
  const out = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join("."));
  return out;
}

function collect(maps, key, host) {
  const out = [];
  for (const m of maps) for (const h of hostSuffixes(host)) if (m[key][h]) out.push(...m[key][h]);
  return out;
}

async function pageData(host) {
  const sources = [await getCosmetic(), await getUserCosmetic()];
  const except = new Set(collect(sources, "exceptions", host));
  const sExcept = new Set(collect(sources, "scriptletExceptions", host));
  const allScriptletsOff = sExcept.has("*");

  let css = "";
  for (const c of sources) {
    css += except.size ? sasCss(c.generic.filter((s) => !except.has(s))) : c.genericCss;
  }
  css += sasCss(collect(sources, "specific", host).filter((s) => !except.has(s)));
  css += collect(sources, "css", host).join("\n");

  const procedural = [...new Set(collect(sources, "procedural", host).filter((s) => !except.has(s)))];
  const scriptlets = allScriptletsOff ? [] :
    [...new Set(collect(sources, "scriptlets", host))].filter((k) => !sExcept.has(k)).map((k) => JSON.parse(k));
  return { css, procedural, scriptlets };
}

async function shouldFilter(url, tabId, frameId) {
  if (!/^https?:/.test(url)) return null;
  const { enabled, whitelist } = await getState();
  if (!enabled) return null;
  let host;
  try { host = new URL(url).hostname; } catch (_) { return null; }
  if (isPaused(host, whitelist)) return null;
  if (frameId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url && isPaused(new URL(tab.url).hostname, whitelist)) return null;
    } catch (_) {}
  }
  return host;
}

chrome.webNavigation.onCommitted.addListener(async (d) => {
  const host = await shouldFilter(d.url, d.tabId, d.frameId);
  if (!host) return;
  const { css, scriptlets } = await pageData(host);
  const target = { tabId: d.tabId, frameIds: [d.frameId] };
  if (scriptlets.length) {
    chrome.scripting.executeScript({ target, world: "MAIN", injectImmediately: true, func: self.sasRunScriptlets, args: [scriptlets] }).catch(() => {});
  }
  if (css) chrome.scripting.insertCSS({ target, css, origin: "USER" }).catch(() => {});
});

// ---------------- Early page fixes via chrome.userScripts ----------------
// With "Allow User Scripts" on, scriptlets are registered as user scripts that Chrome runs at
// document_start on matching sites, before any of the site's own code - even on the first visit.
function userScriptsAvailable() {
  try { chrome.userScripts.getScripts(); return true; } catch (_) { return false; }
}

// Builds chrome.userScripts registrations: one script per 300 domains, each carrying only its own data.
async function buildUserScripts(whitelist) {
    const sources = [await getCosmetic(), await getUserCosmetic()];
    const map = new Map();          // domain -> Set(json)
    const exc = {};                 // domain -> [json | "*"]
    for (const c of sources) {
      for (const [d, arr] of Object.entries(c.scriptlets)) { if (!map.has(d)) map.set(d, new Set()); arr.forEach((k) => map.get(d).add(k)); }
      for (const [d, arr] of Object.entries(c.scriptletExceptions)) exc[d] = [...new Set([...(exc[d] || []), ...arr])];
    }
    const domains = [...map.keys()].filter((d) => /^[a-z0-9.-]+$/.test(d)).sort();
    const runner = self.sasRunScriptlets.toString();
    const exclude = whitelist.map((w) => `*://*.${w}/*`);
    const scripts = [];
    const BUCKET = 300;
    for (let i = 0; i < domains.length; i += BUCKET) {
      const bucket = domains.slice(i, i + BUCKET);
      const bset = new Set(bucket);
      const M = {};
      bucket.forEach((d) => (M[d] = [...map.get(d)]));
      const X = {};
      for (const [d, arr] of Object.entries(exc)) {
        if (hostSuffixes(d).some((x) => bset.has(x)) || bucket.some((b) => hostSuffixes(b).includes(d))) X[d] = arr;
      }
      const code = `(() => {
  try { if (localStorage.getItem("__sas_off") === "1") return; } catch (e) {}
  const M = ${JSON.stringify(M)}, X = ${JSON.stringify(X)};
  const p = location.hostname.split("."), sfx = [];
  for (let i = 0; i < p.length - 1; i++) sfx.push(p.slice(i).join("."));
  const ex = new Set(); sfx.forEach((s) => (X[s] || []).forEach((k) => ex.add(k)));
  if (ex.has("*")) return;
  const list = []; sfx.forEach((s) => (M[s] || []).forEach((k) => { if (!ex.has(k)) list.push(JSON.parse(k)); }));
  if (list.length) (${runner})(list);
})();`;
      const reg = {
        id: "sas-scriptlets-" + (i / BUCKET), js: [{ code }], world: "MAIN", runAt: "document_start", allFrames: true,
        matches: bucket.map((d) => `*://*.${d}/*`),
      };
      if (exclude.length) reg.excludeMatches = exclude;
      scripts.push(reg);
    }
    return { scripts, domains };
}

let usTimer = null;
function registerUserScripts() {
  clearTimeout(usTimer);
  usTimer = setTimeout(doRegisterUserScripts, 500);
}
async function doRegisterUserScripts() {
  if (!userScriptsAvailable()) { await chrome.storage.local.set({ userScriptsState: { available: false } }); return; }
  try {
    const existing = await chrome.userScripts.getScripts();
    if (existing.length) await chrome.userScripts.unregister({ ids: existing.map((x) => x.id) });
    const { enabled, whitelist } = await getState();
    if (!enabled) { await chrome.storage.local.set({ userScriptsState: { available: true, scripts: 0, domains: 0 } }); return; }

    const { scripts, domains } = await buildUserScripts(whitelist);
    let registered = 0;
    for (const sc of scripts) {
      try { await chrome.userScripts.register([sc]); registered++; } catch (e) {
        // a bad match pattern rejects the whole script: retry without suspicious domains
        sc.matches = sc.matches.filter((m) => /^\*:\/\/\*\.[a-z0-9-]+(\.[a-z0-9-]+)+\/\*$/.test(m));
        try { await chrome.userScripts.register([sc]); registered++; } catch (_) {}
      }
    }
    await chrome.storage.local.set({ userScriptsState: { available: true, scripts: registered, domains: domains.length } });
  } catch (e) {
    await chrome.storage.local.set({ userScriptsState: { available: true, error: String(e.message || e) } });
  }
}

// ---------------- Dangerous-site warning ----------------
// Pages blocked by list rules ($document / badware lists) get a warning page instead of Chrome's error page.
const sessionAllowBase = 2000000;
chrome.webNavigation.onErrorOccurred.addListener(async (d) => {
  if (d.frameId !== 0 || d.error !== "net::ERR_BLOCKED_BY_CLIENT" || !/^https?:/.test(d.url)) return;
  try {
    const r = await chrome.declarativeNetRequest.testMatchOutcome({ url: d.url, type: "main_frame" });
    const ours = r.matchedRules.some((m) => m.rulesetId === STATIC_RULESET || (m.rulesetId === "_dynamic" && isCountedRule(m.ruleId)));
    if (!ours) return;
  } catch (_) {}
  bump(1, d.tabId);
  chrome.tabs.update(d.tabId, { url: chrome.runtime.getURL("blocked/blocked.html") + "#" + encodeURIComponent(d.url) }).catch(() => {});
});

async function allowSiteForSession(url) {
  const host = new URL(url).hostname;
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const id = rules.reduce((m, r) => Math.max(m, r.id), sessionAllowBase) + 1;
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [{ id, priority: 2000, action: { type: "allowAllRequests" }, condition: { requestDomains: [host], resourceTypes: ["main_frame", "sub_frame"] } }],
  });
}

// ---------------- Pop-up / pop-under blocker ----------------
const BUILTIN_POPUP_DOMAINS = [
  "popads.net", "popcash.net", "propellerads.com", "propellerclick.com", "onclickads.net", "onclkds.com",
  "adsterra.com", "adcash.com", "exoclick.com", "exosrv.com", "hilltopads.net", "clickadu.com", "admaven.com",
  "ad-maven.com", "juicyads.com", "trafficjunky.net", "popmyads.com", "adskeeper.co.uk", "mgid.com",
  "richpush.co", "pushame.com", "clickaine.com", "a-ads.com", "galaksion.com", "monetag.com", "zeropark.com",
  "trafficstars.com", "tsyndicate.com", "realsrv.com", "bebi.com", "acint.net", "ad.plus", "adxpansion.com",
];
const popupWatch = new Map();
let popupSet = null;

async function getPopupSet() {
  if (popupSet) return popupSet;
  const c = await getCosmetic(), u = await getUserCosmetic();
  popupSet = new Set([...BUILTIN_POPUP_DOMAINS, ...c.popupDomains, ...u.popupDomains]);
  return popupSet;
}

async function isAdUrl(url, initiator) {
  let host;
  try { host = new URL(url).hostname; } catch (_) { return false; }
  if (!host) return false;
  const set = await getPopupSet();
  if (hostSuffixes(host).some((h) => set.has(h))) return true;
  if (chrome.declarativeNetRequest.testMatchOutcome) {
    try {
      const r = await chrome.declarativeNetRequest.testMatchOutcome({ url, type: "sub_frame", initiator });
      const blocked = r.matchedRules.some((m) => m.rulesetId === STATIC_RULESET || (m.rulesetId === "_dynamic" && isCountedRule(m.ruleId)));
      const allowed = r.matchedRules.some((m) => m.rulesetId === "_dynamic" && isAllowRuleId(m.ruleId));
      return blocked && !allowed;
    } catch (_) {}
  }
  return false;
}

async function checkPopup(tabId, url) {
  const w = popupWatch.get(tabId);
  if (!w || Date.now() > w.until || !/^https?:/.test(url || "")) return;
  const { enabled, whitelist } = await getState();
  if (!enabled) return;
  let initiator;
  try {
    const src = await chrome.tabs.get(w.sourceTabId);
    const u = new URL(src.url);
    if (isPaused(u.hostname, whitelist)) return;
    initiator = u.origin;
  } catch (_) {}
  if (await isAdUrl(url, initiator)) {
    popupWatch.delete(tabId);
    chrome.tabs.remove(tabId).catch(() => {});
    bump(1, w.sourceTabId);
  }
}

chrome.webNavigation.onCreatedNavigationTarget.addListener((d) => {
  popupWatch.set(d.tabId, { until: Date.now() + 8000, sourceTabId: d.sourceTabId });
  checkPopup(d.tabId, d.url);
});
chrome.webNavigation.onBeforeNavigate.addListener((d) => { if (d.frameId === 0 && popupWatch.has(d.tabId)) checkPopup(d.tabId, d.url); });
chrome.webNavigation.onCommitted.addListener((d) => { if (d.frameId === 0 && popupWatch.has(d.tabId)) checkPopup(d.tabId, d.url); });
chrome.tabs.onRemoved.addListener((id) => popupWatch.delete(id));

// ---------------- Counters & toolbar badge ----------------
// Total count is kept in storage; per-tab counts (shown on the badge and in the popup) live in session storage.
const tabCounts = new Map();
let tabCountsLoaded = false, tabSaveTimer = null;
const badgeTimers = new Map();

async function loadTabCounts() {
  if (tabCountsLoaded) return;
  tabCountsLoaded = true;
  try {
    const { tabCounts: saved } = await chrome.storage.session.get({ tabCounts: {} });
    for (const [k, v] of Object.entries(saved)) if (!tabCounts.has(+k)) tabCounts.set(+k, v);
  } catch (_) {}
}
function saveTabCounts() {
  if (tabSaveTimer) return;
  tabSaveTimer = setTimeout(() => {
    tabSaveTimer = null;
    chrome.storage.session.set({ tabCounts: Object.fromEntries(tabCounts) }).catch(() => {});
  }, 1000);
}
const fmtBadge = (n) => (n <= 0 ? "" : n < 1000 ? String(n) : n < 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : Math.floor(n / 1000) + "k");

async function refreshBadge(tabId) {
  if (tabId == null || tabId < 0) return;
  const { enabled, whitelist } = await getState();
  let host = "";
  try { const t = await chrome.tabs.get(tabId); host = new URL(t.url).hostname; } catch (_) {}
  let text = "", color = "#B22F2A";
  if (!enabled) { text = ""; }
  else if (host && isPaused(host, whitelist)) { text = "off"; color = "#7A6E66"; }
  else { await loadTabCounts(); text = fmtBadge(tabCounts.get(tabId) || 0); }
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId, color: "#FFFFFF" }).catch(() => {});
}
function scheduleBadge(tabId) {
  if (badgeTimers.has(tabId)) return;
  badgeTimers.set(tabId, setTimeout(() => { badgeTimers.delete(tabId); refreshBadge(tabId); }, 250));
}
async function refreshAllBadges() {
  const tabs = await chrome.tabs.query({});
  tabs.forEach((t) => refreshBadge(t.id));
}
async function bumpTab(tabId, n) {
  if (tabId == null || tabId < 0) return;
  await loadTabCounts();
  tabCounts.set(tabId, (tabCounts.get(tabId) || 0) + n);
  saveTabCounts();
  scheduleBadge(tabId);
}
chrome.webNavigation.onCommitted.addListener(async (d) => {
  if (d.frameId !== 0) return;
  await loadTabCounts();
  tabCounts.set(d.tabId, 0);
  saveTabCounts();
  refreshBadge(d.tabId);
});
chrome.tabs.onRemoved.addListener((id) => { tabCounts.delete(id); saveTabCounts(); });
chrome.tabs.onActivated.addListener(({ tabId }) => refreshBadge(tabId));

let pending = 0, flushTimer = null;
function bump(n, tabId) {
  if (tabId != null) bumpTab(tabId, n);
  pending += n;
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    const add = pending; pending = 0;
    const { blockedTotal } = await chrome.storage.local.get({ blockedTotal: 0 });
    await chrome.storage.local.set({ blockedTotal: blockedTotal + add });
  }, 1500);
}

if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const { rulesetId, ruleId } = info.rule;
    if (rulesetId === STATIC_RULESET || (rulesetId === "_dynamic" && isCountedRule(ruleId))) bump(1, info.request.tabId);
  });
}

// ---------------- Lifecycle ----------------
chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get({ enabled: true, whitelist: [], blockedTotal: 0, trackingParams: true, userFilters: "" });
  await chrome.storage.local.set(s);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  if (existing.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id) });
  await applyState();
  await applyUserFilters();
  chrome.alarms.create("updateLists", { periodInMinutes: 24 * 60 });
  updateFilterLists();
});

chrome.runtime.onStartup.addListener(applyState);

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "updateLists") updateFilterLists();
});

// ---------------- Messages (popup, options page, content scripts, picker) ----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "setEnabled":
        await chrome.storage.local.set({ enabled: msg.enabled });
        await applyState();
        return sendResponse({ ok: true });
      case "toggleSite": {
        const { whitelist } = await getState();
        const i = whitelist.indexOf(msg.host);
        if (i >= 0) whitelist.splice(i, 1); else whitelist.push(msg.host);
        await chrome.storage.local.set({ whitelist });
        await applyState();
        return sendResponse({ whitelist });
      }
      case "setWhitelist":
        await chrome.storage.local.set({ whitelist: msg.whitelist.filter(Boolean) });
        await applyState();
        return sendResponse({ ok: true });
      case "updateLists":
        updateFilterLists();
        return sendResponse({ ok: true });
      case "getTabInfo": {
        await loadTabCounts();
        const st = await chrome.storage.local.get({ enabled: true, whitelist: [], blockedTotal: 0, listStatus: null });
        return sendResponse({ count: tabCounts.get(msg.tabId) || 0, ...st });
      }
      case "adSkipped":
        bump(msg.count || 1, sender.tab && sender.tab.id);
        return sendResponse({ ok: true });
      case "getPageConfig": {
        const url = (sender.url || msg.url || "");
        const host = await shouldFilter(url, sender.tab && sender.tab.id, sender.frameId);
        if (!host) return sendResponse(null);
        const { procedural, scriptlets } = await pageData(host);
        return sendResponse({ procedural, scriptlets });
      }
      case "addUserFilter": {
        const { userFilters } = await chrome.storage.local.get({ userFilters: "" });
        const text = (userFilters.trim() ? userFilters.trimEnd() + "\n" : "") + msg.filter;
        await chrome.storage.local.set({ userFilters: text });
        await applyUserFilters();
        return sendResponse({ ok: true });
      }
      case "setUserFilters": {
        await chrome.storage.local.set({ userFilters: msg.text });
        const r = await applyUserFilters();
        return sendResponse(r);
      }
      case "allowBlockedSite":
        await allowSiteForSession(msg.url);
        await new Promise((r) => setTimeout(r, 400)); // let Chrome apply the new rule
        if (msg.tabId != null) await chrome.tabs.update(msg.tabId, { url: msg.url });
        return sendResponse({ ok: true });
      case "openExtensionDetails":
        chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });
        return sendResponse({ ok: true });
      case "refreshUserScripts": {
        const { userScriptsState: prev } = await chrome.storage.local.get({ userScriptsState: null });
        if (!(prev && prev.available === userScriptsAvailable() && !prev.error && prev.available)) await doRegisterUserScripts();
        return sendResponse((await chrome.storage.local.get({ userScriptsState: null })).userScriptsState);
      }
      case "getSettings": {
        const st = await chrome.storage.local.get({ enabled: true, whitelist: [], trackingParams: true, userFilters: "", listStatus: null, blockedTotal: 0, userScriptsState: null });
        const settings = await getListSettings();
        return sendResponse({
          ...st,
          lists: FILTER_LISTS.map((l) => ({ id: l.id, name: l.name, desc: l.desc || "", group: l.group, enabled: settings[l.id] })),
        });
      }
      case "saveListSettings":
        await chrome.storage.local.set({ listSettings: msg.listSettings });
        updateFilterLists();
        return sendResponse({ ok: true });
      case "setTrackingParams": {
        await chrome.storage.local.set({ trackingParams: !!msg.on });
        await applyState();
        const { paramRules } = await chrome.storage.local.get({ paramRules: [] });
        const ids = paramRules.map((r) => r.id);
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids }).catch(() => {});
        if (msg.on && paramRules.length) await addRulesSafely(paramRules);
        return sendResponse({ ok: true });
      }
      case "startPicker": {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/picker.js"] }).catch(() => {});
        return sendResponse({ ok: true });
      }
      default:
        return sendResponse(null);
    }
  })();
  return true;
});
