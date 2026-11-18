const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

const GROUP_NOTES = {
  Ads: "Blocks ads and the scripts that load them.",
  Privacy: "Blocks trackers and analytics.",
  Security: "Protects you from known scam and malware sites.",
  Domains: "Large lists of ad and tracking servers. They use very little of Chrome's rule budget.",
  Annoyances: "Optional. These hide things that aren't ads but get in the way, and can occasionally hide something you wanted.",
};

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " minutes ago";
  const h = Math.round(m / 60);
  return h < 24 ? h + (h === 1 ? " hour ago" : " hours ago") : Math.round(h / 24) + " days ago";
}

let saved = {};   // list id -> enabled, as stored
let rendered = false;

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, attrs || {});
  e.append(...kids.filter((k) => k !== null && k !== undefined));
  return e;
}

function updateSaveBar() {
  const changed = [...document.querySelectorAll("#listGroups input")].some((cb) => cb.checked !== saved[cb.dataset.id]);
  $("listsBar").hidden = !changed;
}

async function load() {
  const s = await send({ type: "getSettings" });
  const ls = s.listStatus;
  const results = {};
  if (ls && ls.results) ls.results.forEach((r) => (results[r.id] = r));

  $("total").innerHTML = "";
  $("total").append(el("b", { textContent: (s.blockedTotal || 0).toLocaleString() }), "ads and trackers blocked");

  const status = $("listStatus");
  if (!ls) status.textContent = "Lists haven't been downloaded yet. They download automatically shortly after install.";
  else if (ls.state === "updating") status.textContent = "Downloading and converting lists…";
  else if (ls.state === "error") status.textContent = "The last download failed " + ago(ls.at) + ". Check your internet connection and press Update now.";
  else status.textContent = `${ls.networkRules.toLocaleString()} network rules covering ${ls.blockedDomains.toLocaleString()} domains, ` +
    `${ls.hideRules.toLocaleString()} hiding rules, ${(ls.scriptletRules || 0).toLocaleString()} page fixes and ` +
    `${(ls.removeparams || 0).toLocaleString()} link-cleaning rules. Updated ${ago(ls.at)}.`;
  $("update").disabled = !!(ls && ls.state === "updating");
  $("update").textContent = ls && ls.state === "updating" ? "Updating…" : "Update now";

  // Keep the user's unsaved toggles if we re-render
  const pendingState = {};
  document.querySelectorAll("#listGroups input").forEach((cb) => (pendingState[cb.dataset.id] = cb.checked));
  saved = {};
  const groups = new Map();
  for (const l of s.lists) {
    saved[l.id] = l.enabled;
    if (!groups.has(l.group)) groups.set(l.group, []);
    groups.get(l.group).push(l);
  }
  const box = $("listGroups");
  box.innerHTML = "";
  for (const [group, lists] of groups) {
    box.append(el("h3", { textContent: group }), el("p", { className: "group-note", textContent: GROUP_NOTES[group] || "" }));
    const listbox = el("div", { className: "listbox glass" });
    for (const l of lists) {
      const r = results[l.id];
      const state = r && l.enabled
        ? el("span", { className: "state " + (r.ok ? "ok" : "fail"), textContent: r.ok ? "Up to date" : "Download failed" })
        : null;
      const cb = el("input", { type: "checkbox", role: "switch", checked: rendered && l.id in pendingState ? pendingState[l.id] : l.enabled });
      cb.dataset.id = l.id;
      cb.setAttribute("aria-label", l.name);
      cb.addEventListener("change", updateSaveBar);
      listbox.append(el("div", { className: "row" },
        el("div", null, el("b", { textContent: l.name }), state, el("p", { textContent: l.desc })),
        el("label", { className: "switch" }, cb, el("span"))));
    }
    box.append(listbox);
  }
  rendered = true;
  updateSaveBar();
  if (typeof markActive === "function") markActive();

  renderUserScripts(s.userScriptsState);
  $("trackingParams").checked = s.trackingParams;
  if (document.activeElement !== $("userFilters") && !$("userFilters").dataset.dirty) $("userFilters").value = s.userFilters;
  if (document.activeElement !== $("whitelist") && !$("whitelist").dataset.dirty) $("whitelist").value = s.whitelist.join("\n");
}

function renderUserScripts(us) {
  const state = $("usState"), text = $("usText");
  $("usOpen").hidden = true; $("usCheck").hidden = true;
  if (!us) { state.className = "state"; state.textContent = ""; text.textContent = "Checking…"; return; }
  if (!us.available) {
    state.className = "state warn"; state.textContent = "Needs one permission";
    text.textContent = "Page fixes currently start a moment late on a site's first visit. To run them before the site's own code every time, open the extension's details and turn on \u201cAllow User Scripts\u201d, then press Check again.";
    $("usOpen").hidden = false; $("usCheck").hidden = false;
  } else if (us.error) {
    state.className = "state fail"; state.textContent = "Error";
    text.textContent = "Chrome refused the page fixes: " + us.error;
    $("usCheck").hidden = false;
  } else {
    state.className = "state ok"; state.textContent = "On";
    text.textContent = us.domains
      ? `Page fixes run before each site's own code, on every visit, for ${us.domains.toLocaleString()} sites.`
      : "Ready. Page fixes will be set up when the filter lists finish downloading.";
  }
}
$("usOpen").addEventListener("click", () => send({ type: "openExtensionDetails" }));
$("usCheck").addEventListener("click", async () => { renderUserScripts(null); renderUserScripts(await send({ type: "refreshUserScripts" })); });

$("update").addEventListener("click", async () => { await send({ type: "updateLists" }); setTimeout(load, 300); });

$("saveLists").addEventListener("click", async () => {
  const listSettings = {};
  document.querySelectorAll("#listGroups input").forEach((cb) => (listSettings[cb.dataset.id] = cb.checked));
  await send({ type: "saveListSettings", listSettings });
  rendered = false;
  setTimeout(load, 300);
});

$("trackingParams").addEventListener("change", (e) => send({ type: "setTrackingParams", on: e.target.checked }));

for (const id of ["userFilters", "whitelist"]) $(id).addEventListener("input", () => ($(id).dataset.dirty = "1"));

$("saveFilters").addEventListener("click", async () => {
  const r = await send({ type: "setUserFilters", text: $("userFilters").value });
  delete $("userFilters").dataset.dirty;
  $("filtersMsg").textContent = `Saved. ${r.networkRules} blocking rules active. Reload open pages to see hiding rules.`;
});

$("saveWhitelist").addEventListener("click", async () => {
  const whitelist = $("whitelist").value.split(/\s+/).map((x) => x.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean);
  await send({ type: "setWhitelist", whitelist });
  delete $("whitelist").dataset.dirty;
  $("whitelist").value = whitelist.join("\n");
  $("wlMsg").textContent = whitelist.length ? `Saved. Ads are allowed on ${whitelist.length} site${whitelist.length === 1 ? "" : "s"}.` : "Saved. Ads are blocked on every site.";
});

// Highlight the section in view
const links = [...document.querySelectorAll("nav a")];
const sections = [...document.querySelectorAll("main section")];
function markActive() {
  const line = Math.min(window.innerHeight * 0.3, 140);
  let current = sections[0];
  for (const sec of sections) if (sec.getBoundingClientRect().top <= line) current = sec;
  if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = sections[sections.length - 1];
  links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + current.id));
}
window.addEventListener("scroll", markActive, { passive: true });
window.addEventListener("resize", markActive);
markActive();

chrome.storage.onChanged.addListener((c) => { if (c.listStatus || c.blockedTotal || c.whitelist || c.userScriptsState) load(); });
window.addEventListener("focus", () => send({ type: "refreshUserScripts" })); // re-check after visiting chrome://extensions
load();
