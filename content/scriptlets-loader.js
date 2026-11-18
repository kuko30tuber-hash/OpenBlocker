// OpenBlocker - runs this site's cached scriptlets at document_start, before any site script.
// (scriptlets.js, loaded just before this file in the same page world, defines sasRunScriptlets.)
(() => {
  const run = window.sasRunScriptlets;
  try { delete window.sasRunScriptlets; } catch (_) {}
  if (typeof run !== "function") return;
  let list = null;
  try {
    if (localStorage.getItem("__sas_off") === "1") return;
    list = JSON.parse(localStorage.getItem("__sas_sl") || "null");
  } catch (_) { return; }
  // Same rule as the background: on YouTube only fixes that don't touch video/ad data may run
  // (protects against fixes cached by older versions).
  const yt = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtubekids\.com|youtu\.be)$/.test(location.hostname);
  if (yt && Array.isArray(list)) {
    const safe = ["no-window-open-if", "remove-attr", "remove-class", "set-attr", "addEventListener-defuser", "nofab", "nobab", "window.name-defuser"];
    list = list.filter((it) => Array.isArray(it) && safe.includes(it[0]));
  }
  if (Array.isArray(list) && list.length) run(list);
})();
