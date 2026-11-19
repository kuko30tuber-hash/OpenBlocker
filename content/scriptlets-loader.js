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
  if (Array.isArray(list) && list.length) run(list);
})();
