const $ = (id) => document.getElementById(id);
let tab = null, host = null;

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  return h < 24 ? h + " h ago" : Math.round(h / 24) + " days ago";
}
const paused = (h, list) => !!h && list.some((w) => h === w || h.endsWith("." + w));

async function render() {
  const info = await chrome.runtime.sendMessage({ type: "getTabInfo", tabId: tab ? tab.id : -1 });
  const isPaused = paused(host, info.whitelist);
  const header = document.body;

  if (!info.enabled) {
    header.className = "state-off";
    $("title").textContent = "Blocking is off";
    $("subtitle").textContent = "Ads are allowed on every site";
    $("siteToggle").textContent = "Turn blocking on";
    $("siteToggle").className = "pill filled";
    $("siteToggle").disabled = false;
    $("siteToggle").dataset.action = "enable";
  } else if (isPaused) {
    header.className = "state-paused";
    $("title").textContent = "Paused";
    $("subtitle").textContent = "Ads are allowed on " + host;
    $("siteToggle").textContent = "Resume blocking on this site";
    $("siteToggle").className = "pill filled";
    $("siteToggle").disabled = false;
    $("siteToggle").dataset.action = "toggleSite";
  } else {
    header.className = "state-on";
    $("title").textContent = "Protected";
    $("subtitle").textContent = host ? "on " + host : "Nothing to block on this page";
    $("siteToggle").textContent = "Pause on this site";
    $("siteToggle").className = "pill";
    $("siteToggle").disabled = !host;
    $("siteToggle").dataset.action = "toggleSite";
  }

  const active = info.enabled && !isPaused && !!host;
  $("pageCount").hidden = !active;
  $("pageCount").textContent = info.count.toLocaleString();
  $("pageLabel").textContent = active ? "blocked on this page" : host ? "Not blocking this page" : "No website in this tab";
  $("totalCount").textContent = info.blockedTotal.toLocaleString();
  $("enabled").checked = info.enabled;
  $("picker").disabled = !host || !info.enabled || isPaused;

  const ls = info.listStatus, el = $("lists");
  el.className = "foot";
  if (!ls) el.textContent = "Filter lists download in the first minute after install.";
  else if (ls.state === "updating") el.textContent = "Updating filter lists…";
  else if (ls.state === "error") { el.className = "foot warn"; el.textContent = "Filter lists couldn't be downloaded. Check your connection, then use Update in Settings."; }
  else {
    const ok = ls.results.filter((r) => r.ok).length;
    if (ok < ls.results.length) {
      el.className = "foot warn";
      el.textContent = `${ls.results.length - ok} of ${ls.results.length} filter lists failed to update. See Settings.`;
    } else el.textContent = `${ok} filter lists, updated ${ago(ls.at)}`;
  }
}

chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => {
  tab = t || null;
  try {
    const u = new URL(tab.url);
    if (/^https?:$/.test(u.protocol)) host = u.hostname;
  } catch (_) {}
  render();
});

$("siteToggle").addEventListener("click", async (e) => {
  if (e.currentTarget.dataset.action === "enable") await chrome.runtime.sendMessage({ type: "setEnabled", enabled: true });
  else {
    const { whitelist } = await chrome.storage.local.get({ whitelist: [] });
    const entry = whitelist.find((w) => host === w || host.endsWith("." + w)) || host.replace(/^www\./, "");
    await chrome.runtime.sendMessage({ type: "toggleSite", host: entry });
  }
  await render();
  if (tab) chrome.tabs.reload(tab.id);
});

$("enabled").addEventListener("change", async (e) => {
  await chrome.runtime.sendMessage({ type: "setEnabled", enabled: e.target.checked });
  await render();
  if (tab) chrome.tabs.reload(tab.id);
});

$("picker").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "startPicker" });
  window.close();
});
$("settings").addEventListener("click", () => { chrome.runtime.openOptionsPage(); window.close(); });

chrome.storage.onChanged.addListener(() => render());
setInterval(() => { if (tab) render(); }, 1500); // live page count
