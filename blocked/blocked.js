const url = decodeURIComponent(location.hash.slice(1));
let host = "";
try { host = new URL(url).hostname; } catch (_) {}
document.getElementById("host").textContent = host || url;
document.title = (host || "Site") + " blocked – OpenBlocker";

document.getElementById("back").addEventListener("click", async () => {
  // The blocked page and Chrome's error page are the last two history entries
  if (history.length > 2) history.go(-2);
  else {
    const tab = await chrome.tabs.getCurrent();
    chrome.tabs.update(tab.id, { url: "chrome://newtab/" });
  }
});
document.getElementById("proceed").addEventListener("click", async () => {
  if (!/^https?:/.test(url)) return;
  const tab = await chrome.tabs.getCurrent();
  await chrome.runtime.sendMessage({ type: "allowBlockedSite", url, tabId: tab.id });
});
