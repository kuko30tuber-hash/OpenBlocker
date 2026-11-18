// OpenBlocker - element picker ("Block an element").
// Hover to highlight, click to choose, adjust with Wider/Narrower, then Block.
(() => {
  if (window.__sasPickerActive) return;
  window.__sasPickerActive = true;

  const host = document.createElement("sas-picker");
  const shadow = host.attachShadow({ mode: "closed" });
  // Built with DOM APIs: some sites (YouTube) enforce Trusted Types, so innerHTML would throw
  const el = (tag, props, ...kids) => { const e = document.createElement(tag); Object.assign(e, props || {}); e.append(...kids); return e; };
  const style = el("style"); style.textContent = `
      .box { position: fixed; pointer-events: none; z-index: 2147483646; border-radius: 6px;
             background: rgba(240,87,58,.16); outline: 2px solid rgba(240,87,58,.95); transition: all .08s ease; }
      .panel { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; width: 360px; padding: 16px; border-radius: 26px;
               color: #F5F5F7; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
               background: linear-gradient(180deg, rgba(70,48,50,.74), rgba(32,20,22,.7));
               -webkit-backdrop-filter: blur(30px) saturate(180%); backdrop-filter: blur(30px) saturate(180%);
               border: 1px solid rgba(255,255,255,.16);
               box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 18px 50px rgba(0,0,0,.35); }
      .panel b { display: block; margin-bottom: 4px; font: 700 16px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; letter-spacing: -.01em; }
      .hint { color: rgba(235,235,245,.66); margin-bottom: 10px; }
      textarea { width: 100%; box-sizing: border-box; height: 56px; resize: vertical; font: 12px/1.5 "SF Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
                 background: rgba(0,0,0,.28); color: #F5F5F7; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 8px 10px; }
      textarea:focus { outline: none; border-color: rgba(255,154,98,.85); }
      .row { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
      button { font: 600 13px/1 inherit; font-family: inherit; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 8px 14px; cursor: pointer;
               background: rgba(255,255,255,.12); color: #F5F5F7; box-shadow: inset 0 1px 0 rgba(255,255,255,.14); }
      button:hover { background: rgba(255,255,255,.18); }
      button.primary { background: linear-gradient(180deg, #E35A3B, #B22F2A); border-color: transparent; box-shadow: inset 0 1px 0 rgba(255,255,255,.35); }
      button:disabled { opacity: .45; cursor: default; }
      .count { margin-left: auto; color: rgba(235,235,245,.6); font-size: 12px; }
    `;
  const btn = (id, label, cls) => { const b = el("button", { id, textContent: label }); if (cls) b.className = cls; return b; };
  shadow.append(
    style,
    el("div", { className: "box", hidden: true }),
    el("div", { className: "panel" },
      el("b", { textContent: "Block an element" }),
      el("div", { className: "hint", id: "hint", textContent: "Click the ad or box you want to remove. Esc to cancel." }),
      el("textarea", { id: "sel", spellcheck: false, placeholder: "CSS selector" }),
      el("div", { className: "row" }, btn("wider", "Wider"), btn("narrower", "Narrower"), el("span", { className: "count", id: "count" })),
      el("div", { className: "row" }, btn("block", "Block", "primary"), btn("cancel", "Cancel"))
    )
  );
  ["wider", "narrower", "block"].forEach((id) => (shadow.getElementById(id).disabled = true));
  document.documentElement.appendChild(host);
  const $ = (id) => shadow.getElementById(id);
  const box = shadow.querySelector(".box");
  const panel = shadow.querySelector(".panel");

  let hovered = null, chosen = null, chain = [];

  const esc = (s) => CSS.escape(s);
  const goodClass = (c) => c && !/\d{3,}|^(?:active|hover|focus|selected|open|visible|show|hidden|js-|is-)/.test(c) && c.length < 40;
  function part(el) {
    if (el.id && !/\d{3,}/.test(el.id) && el.id.length < 50) return "#" + esc(el.id);
    let s = el.localName;
    const classes = [...el.classList].filter(goodClass).slice(0, 3);
    if (classes.length) s += classes.map((c) => "." + esc(c)).join("");
    for (const a of ["data-ad", "data-ad-slot", "data-testid", "aria-label", "data-type"]) {
      if (el.hasAttribute(a) && el.getAttribute(a).length < 40) { s += `[${a}="${el.getAttribute(a).replace(/"/g, '\\"')}"]`; break; }
    }
    return s;
  }
  function selectorFor(el) {
    const parts = [];
    let cur = el;
    for (let depth = 0; cur && cur !== document.documentElement && depth < 5; depth++) {
      let p = part(cur);
      if (!p.startsWith("#") && cur.parentElement && !/[.[]/.test(p)) {
        const same = [...cur.parentElement.children].filter((c) => c.localName === cur.localName);
        if (same.length > 1) p += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      parts.unshift(p);
      const sel = parts.join(" > ");
      try { if (document.querySelectorAll(sel).length === 1 || p.startsWith("#")) return sel; } catch (_) {}
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }
  function show(el) {
    if (!el) { box.hidden = true; return; }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    box.hidden = false;
  }
  function updateCount() {
    let n = 0;
    try { n = document.querySelectorAll($("sel").value).length; } catch (_) { n = -1; }
    $("count").textContent = n < 0 ? "invalid selector" : n + " element" + (n === 1 ? "" : "s");
    $("block").disabled = n <= 0;
  }
  function choose(el) {
    chosen = el;
    $("sel").value = selectorFor(el);
    $("hint").textContent = "Check the highlighted area, then press Block.";
    $("wider").disabled = !el.parentElement || el.parentElement === document.body;
    $("narrower").disabled = chain.length === 0;
    show(el);
    updateCount();
  }

  const onMove = (e) => {
    if (chosen) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host || el === document.documentElement || el === document.body) return;
    hovered = el;
    show(el);
  };
  const onClick = (e) => {
    if (e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (hovered) { chain = []; choose(hovered); }
  };
  const swallow = (e) => { if (!e.composedPath().includes(host)) { e.preventDefault(); e.stopPropagation(); } };
  const onKey = (e) => { if (e.key === "Escape") quit(); };

  function quit() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("mousedown", swallow, true);
    document.removeEventListener("mouseup", swallow, true);
    document.removeEventListener("keydown", onKey, true);
    host.remove();
    window.__sasPickerActive = false;
  }

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("mousedown", swallow, true);
  document.addEventListener("mouseup", swallow, true);
  document.addEventListener("keydown", onKey, true);

  $("sel").addEventListener("input", () => {
    updateCount();
    try { const els = document.querySelectorAll($("sel").value); show(els[0] || null); } catch (_) {}
  });
  $("wider").addEventListener("click", () => { if (chosen && chosen.parentElement) { chain.push(chosen); choose(chosen.parentElement); } });
  $("narrower").addEventListener("click", () => { if (chain.length) choose(chain.pop()); });
  $("cancel").addEventListener("click", quit);
  $("block").addEventListener("click", () => {
    const sel = $("sel").value.trim();
    if (!sel) return;
    try { document.querySelectorAll(sel).forEach((el) => el.style.setProperty("display", "none", "important")); } catch (_) { return; }
    chrome.runtime.sendMessage({ type: "addUserFilter", filter: location.hostname.replace(/^www\./, "") + "##" + sel });
    quit();
  });
})();
