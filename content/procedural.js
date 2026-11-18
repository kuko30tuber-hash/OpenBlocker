// OpenBlocker - procedural cosmetic filters (uBO / ABP / AdGuard extended CSS subset).
// Supports: :has-text() :-abp-contains() :contains() :upward() :nth-ancestor() :min-text-length()
//           :matches-css() :matches-css-before() :matches-css-after() :matches-attr() :matches-path()
//           :xpath() :has()/:not()/:if()/:if-not() with procedural content, :remove() :style()
//           :remove-attr() :remove-class(), and CSS combinators between procedural steps.
// eslint-disable-next-line no-unused-vars
function sasProceduralRun(filters) {
  const PROC = ["has-text", "-abp-contains", "contains", "upward", "nth-ancestor", "min-text-length", "matches-css",
    "matches-css-before", "matches-css-after", "matches-attr", "matches-path", "xpath", "remove", "style",
    "remove-attr", "remove-class", "has", "not", "if", "if-not", "watch-attr", "others"];

  const toRegex = (s) => {
    s = s.trim();
    const m = /^\/(.+)\/([gimsu]*)$/.exec(s);
    if (m) { try { return new RegExp(m[1], m[2]); } catch (_) { return null; } }
    if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
    return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  };

  // find the matching ")" for the "(" at index i
  const closeParen = (s, i) => {
    let depth = 0, q = "";
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (q) { if (c === "\\") j++; else if (c === q) q = ""; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0) return j; }
    }
    return -1;
  };

  const isProcedural = (s) => PROC.some((op) => op !== "has" && op !== "not" && s.includes(":" + op + "("));

  // Compile "base:op(arg)rest" into { steps: [...] }
  function compile(src) {
    const steps = [];
    let css = "", i = 0;
    while (i < src.length) {
      if (src[i] === ":") {
        const m = /^:([a-z-]+)\(/.exec(src.slice(i));
        if (m && PROC.includes(m[1])) {
          const op = m[1];
          const open = i + m[0].length - 1;
          const close = closeParen(src, open);
          if (close < 0) return null;
          const arg = src.slice(open + 1, close);
          if ((op === "has" || op === "not") && !isProcedural(arg)) { css += src.slice(i, close + 1); i = close + 1; continue; }
          if (css.trim()) { steps.push({ op: "css", arg: css.trim() }); }
          css = "";
          steps.push({ op, arg });
          i = close + 1;
          continue;
        }
      }
      css += src[i++];
    }
    if (css.trim()) steps.push({ op: "css", arg: css.trim() });
    if (!steps.length) return null;
    // prepare args
    for (const s of steps) {
      if (s.op === "has-text" || s.op === "-abp-contains" || s.op === "contains") { s.re = toRegex(s.arg); if (!s.re) return null; }
      else if (s.op === "matches-path") { s.re = toRegex(s.arg); if (!s.re) return null; }
      else if (s.op.startsWith("matches-css")) {
        const k = s.arg.indexOf(":");
        if (k < 0) return null;
        s.prop = s.arg.slice(0, k).trim();
        s.re = toRegex(s.arg.slice(k + 1).trim().replace(/^\^|\$$/g, (x) => x));
        s.pseudo = s.op === "matches-css-before" ? "::before" : s.op === "matches-css-after" ? "::after" : null;
      } else if (s.op === "matches-attr") {
        const m = /^"?(.+?)"?\s*=\s*"?(.*?)"?$/.exec(s.arg) || [null, s.arg, ""];
        s.nameRe = toRegex(m[1]); s.valRe = m[2] ? toRegex(m[2]) : null;
      } else if (["has", "not", "if", "if-not"].includes(s.op)) {
        s.sub = compile(s.arg.trim());
        if (!s.sub) return null;
      } else if (s.op === "upward" || s.op === "nth-ancestor") {
        s.n = /^\d+$/.test(s.arg.trim()) ? parseInt(s.arg, 10) : null;
      } else if (s.op === "min-text-length") s.n = parseInt(s.arg, 10) || 0;
    }
    return steps;
  }

  function query(root, sel) {
    try {
      if (root === document) return [...document.querySelectorAll(sel)];
      const s = /^[>+~]/.test(sel) ? ":scope " + sel : ":scope " + sel;
      return [...root.querySelectorAll(s)];
    } catch (_) { return []; }
  }

  // Returns matched elements for compiled steps starting from `roots`
  function exec(steps, roots) {
    let nodes = roots;
    let first = true;
    for (const s of steps) {
      let next = [];
      switch (s.op) {
        case "css":
          if (first && nodes.length === 1 && nodes[0] === document) next = query(document, s.arg);
          else for (const n of nodes) {
            if (/^[+~]/.test(s.arg)) {
              // sibling combinators: test candidates from parent
              const p = n.parentElement;
              if (p) {
                n.setAttribute("data-sas-tmp", "");
                next.push(...query(p, "> [data-sas-tmp] " + s.arg));
                n.removeAttribute("data-sas-tmp");
              }
            } else next.push(...query(n === document ? document : n, s.arg));
          }
          break;
        case "has-text": case "-abp-contains": case "contains":
          next = nodes.filter((n) => s.re.test(n.textContent || ""));
          break;
        case "min-text-length":
          next = nodes.filter((n) => (n.textContent || "").length >= s.n);
          break;
        case "matches-path":
          next = s.re.test(location.pathname + location.search) ? nodes : [];
          break;
        case "matches-css": case "matches-css-before": case "matches-css-after":
          next = nodes.filter((n) => { try { return s.re.test(getComputedStyle(n, s.pseudo)[s.prop] || getComputedStyle(n, s.pseudo).getPropertyValue(s.prop)); } catch (_) { return false; } });
          break;
        case "matches-attr":
          next = nodes.filter((n) => n.attributes && [...n.attributes].some((a) => s.nameRe.test(a.name) && (!s.valRe || s.valRe.test(a.value))));
          break;
        case "upward": case "nth-ancestor":
          for (const n of nodes) {
            let p = null;
            if (s.n !== null) { p = n; for (let k = 0; k < s.n && p; k++) p = p.parentElement; }
            else { try { p = n.parentElement && n.parentElement.closest(s.arg); } catch (_) { p = null; } }
            if (p && p !== document.documentElement && p !== document.body) next.push(p);
          }
          break;
        case "xpath":
          for (const n of nodes) {
            try {
              const r = document.evaluate(s.arg, n === document ? document : n, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
              for (let k = 0; k < r.snapshotLength; k++) { const x = r.snapshotItem(k); if (x.nodeType === 1) next.push(x); }
            } catch (_) {}
          }
          break;
        case "has": case "if":
          next = nodes.filter((n) => exec(s.sub, [n]).length > 0);
          break;
        case "not": case "if-not":
          next = nodes.filter((n) => exec(s.sub, [n]).length === 0);
          break;
        default: // actions & no-ops keep the node set
          next = nodes;
      }
      nodes = [...new Set(next)];
      first = false;
      if (!nodes.length) break;
    }
    return nodes;
  }

  const compiled = [];
  for (const f of filters) {
    const steps = compile(f);
    if (!steps) continue;
    const last = steps[steps.length - 1];
    let action = "hide", actionArg = "";
    if (["remove", "style", "remove-attr", "remove-class"].includes(last.op)) { action = last.op; actionArg = last.arg; steps.pop(); }
    compiled.push({ steps, action, actionArg });
  }
  if (!compiled.length) return;

  let styleSheet = null, styleId = 0;
  const styleFor = new Map();
  const addStyle = (decl) => {
    if (!styleFor.has(decl)) {
      styleFor.set(decl, "sas" + (styleId++));
      if (!styleSheet) { styleSheet = document.createElement("style"); (document.head || document.documentElement).appendChild(styleSheet); }
      styleSheet.textContent += `[data-sas-style~="${styleFor.get(decl)}"]{${decl}}\n`;
    }
    return styleFor.get(decl);
  };

  const run = () => {
    for (const c of compiled) {
      const startRoots = [document];
      let nodes;
      try { nodes = exec(c.steps, startRoots); } catch (_) { continue; }
      for (const n of nodes) {
        if (!(n instanceof Element) || n === document.documentElement || n === document.body) continue;
        switch (c.action) {
          case "hide":
            if (n.style.getPropertyValue("display") !== "none") n.style.setProperty("display", "none", "important");
            break;
          case "remove": n.remove(); break;
          case "style": {
            const id = addStyle(c.actionArg);
            const cur = n.getAttribute("data-sas-style") || "";
            if (!cur.split(" ").includes(id)) n.setAttribute("data-sas-style", (cur + " " + id).trim());
            break;
          }
          case "remove-attr": c.actionArg.split("|").forEach((a) => n.removeAttribute(a.trim())); break;
          case "remove-class": c.actionArg.split("|").forEach((a) => n.classList.remove(a.trim())); break;
        }
      }
    }
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; run(); }, 120);
  };
  const start = () => {
    run();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
