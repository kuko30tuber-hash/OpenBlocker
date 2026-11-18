// OpenBlocker - scriptlet library (uBlock Origin / AdGuard compatible subset).
// sasRunScriptlets(list) runs inside the web page (MAIN world). It must be fully self-contained:
// Chrome serialises the function's source when injecting it, so it may not use outer variables.
// list = [ [name, arg1, arg2, ...], ... ]
self.sasRunScriptlets = function sasRunScriptlets(list) {
  const doc = document;
  const KEY = "__sas_scriptlets_ran";
  let ran = doc[KEY];
  if (!ran) {
    ran = new Set();
    try { Object.defineProperty(doc, KEY, { value: ran, enumerable: false }); } catch (_) { return; }
  }

  // ---------------- helpers ----------------
  const magic = "sas" + Math.floor(Math.random() * 1e9).toString(36);
  let errorHandlerInstalled = false;
  const installErrorHandler = () => {
    if (errorHandlerInstalled) return;
    errorHandlerInstalled = true;
    window.addEventListener("error", (e) => {
      if (typeof e.message === "string" && e.message.includes(magic)) e.preventDefault();
    }, true);
  };
  const abort = () => { installErrorHandler(); throw new ReferenceError(magic); };

  const toRegex = (s, flags) => {
    if (s === undefined || s === "") return /^/;
    const m = /^\/(.+)\/([gimsu]*)$/.exec(s);
    if (m) { try { return new RegExp(m[1], m[2] || flags || ""); } catch (_) { return /(?!)/; } }
    return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags || "");
  };
  const matcher = (pattern) => {
    let not = false;
    if (pattern && pattern.startsWith("!")) { not = true; pattern = pattern.slice(1); }
    const re = toRegex(pattern || "");
    return (s) => re.test(String(s)) !== not;
  };
  const fnText = (f) => { try { return typeof f === "function" ? Function.prototype.toString.call(f) : String(f); } catch (_) { return ""; } };
  const onReady = (fn) => {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  };
  const observe = (fn, ms) => {
    let pending = false;
    const run = () => { pending = false; try { fn(); } catch (_) {} };
    onReady(run);
    const mo = new MutationObserver(() => { if (!pending) { pending = true; setTimeout(run, ms || 50); } });
    const start = () => mo.observe(doc.documentElement || doc, { childList: true, subtree: true, attributes: true });
    if (doc.documentElement) start(); else doc.addEventListener("readystatechange", start, { once: true });
  };
  const constValue = (raw, trustedMode) => {
    if (trustedMode) {
      try { return JSON.parse(raw); } catch (_) {}
      if (raw.startsWith("{") ) { try { return JSON.parse(raw).value; } catch (_) {} }
    }
    switch (raw) {
      case "undefined": return undefined;
      case "false": return false;
      case "true": return true;
      case "null": return null;
      case "''": case "emptyStr": case "": return "";
      case "noopFunc": return function () {};
      case "trueFunc": return function () { return true; };
      case "falseFunc": return function () { return false; };
      case "throwFunc": return function () { throw new Error(); };
      case "emptyArr": return [];
      case "emptyObj": return {};
      case "noopCallbackFunc": return function () { return function () {}; };
      case "noopThisFunc": return function () { return this; };
      case "noopPromiseResolve": return function () { return Promise.resolve(); };
      case "noopPromiseReject": return function () { return Promise.reject(); };
      case "yes": case "no": case "on": case "off": case "accept": case "reject": case "accepted": case "rejected": return raw;
      case "-1": return -1;
    }
    if (/^-?\d+$/.test(raw)) { const n = parseInt(raw, 10); if (Math.abs(n) <= 0x7fff || trustedMode) return n; }
    if (trustedMode) return raw;
    return Symbol.for("sas-skip");
  };

  // Trap a property chain like "a.b.c" on window; `makeDesc(owner, prop, current)` builds the final descriptor.
  const trapChain = (chain, makeDesc) => {
    chain = chain.replace(/^window\./, "");
    const trap = (owner, path) => {
      const i = path.indexOf(".");
      if (i === -1) {
        try {
          const d = Object.getOwnPropertyDescriptor(owner, path);
          if (d && d.configurable === false) return;
          const cur = owner[path];
          Object.defineProperty(owner, path, { configurable: true, ...makeDesc(owner, path, cur) });
        } catch (_) {}
        return;
      }
      const prop = path.slice(0, i), rest = path.slice(i + 1);
      let v = owner[prop];
      if (v !== null && (typeof v === "object" || typeof v === "function")) { trap(v, rest); return; }
      try {
        const d = Object.getOwnPropertyDescriptor(owner, prop);
        if (d && d.configurable === false) return;
        Object.defineProperty(owner, prop, {
          configurable: true, enumerable: true,
          get() { return v; },
          set(a) { v = a; if (a !== null && (typeof a === "object" || typeof a === "function")) trap(a, rest); },
        });
      } catch (_) {}
    };
    trap(window, chain);
  };

  const pruneJSON = (obj, prunePaths, needPaths) => {
    if (!obj || typeof obj !== "object") return obj;
    const has = (o, parts) => {
      if (!parts.length) return true;
      if (o === null || typeof o !== "object") return false;
      const [p, ...rest] = parts;
      if (p === "[]" || p === "*") return Object.keys(o).some((k) => has(o[k], rest));
      return p in o && has(o[p], rest);
    };
    const del = (o, parts) => {
      if (o === null || typeof o !== "object") return false;
      const [p, ...rest] = parts;
      let hit = false;
      if (!rest.length) {
        if (p === "[]" || p === "*") return false;
        if (p in o) { delete o[p]; return true; }
        return false;
      }
      if (p === "[]" || p === "*") { for (const k of Object.keys(o)) hit = del(o[k], rest) || hit; return hit; }
      if (p in o) hit = del(o[p], rest);
      return hit;
    };
    const split = (s) => (s || "").split(/\s+/).filter(Boolean).map((x) => x.split("."));
    const need = split(needPaths);
    if (need.length && !need.every((p) => has(obj, p))) return obj;
    for (const p of split(prunePaths)) del(obj, p);
    return obj;
  };
  const namedArgs = (arr) => { const o = {}; for (let i = 0; i + 1 < arr.length; i += 2) o[arr[i]] = arr[i + 1]; return o; };
  const urlMatches = (props, url, method) => {
    if (!props || props === "*") return true;
    return props.split(/\s+/).every((tok) => {
      const i = tok.indexOf(":");
      const k = i > 0 && !/^\/|^https?:/.test(tok) ? tok.slice(0, i) : "url";
      const v = i > 0 && k !== "url" ? tok.slice(i + 1) : (tok.startsWith("url:") ? tok.slice(4) : tok);
      if (k === "url") return matcher(v)(url);
      if (k === "method") return matcher(v)(method || "GET");
      return true;
    });
  };
  const storageValue = (raw) => {
    const ok = ["undefined", "false", "true", "null", "", "yes", "no", "on", "off", "emptyArr", "emptyObj", "$remove$", "accept", "reject", "accepted", "rejected"];
    if (ok.includes(raw)) return raw === "emptyArr" ? "[]" : raw === "emptyObj" ? "{}" : raw;
    if (/^\d+$/.test(raw) && +raw <= 0x7fff) return raw;
    return null;
  };

  // ---------------- scriptlets ----------------
  const S = {
    "set-constant"(chain, raw = "") {
      const value = constValue(raw, false);
      if (value === Symbol.for("sas-skip")) return;
      trapChain(chain, () => ({ get() { return value; }, set() {} }));
    },
    "trusted-set-constant"(chain, raw = "") {
      const value = constValue(raw, true);
      trapChain(chain, () => ({ get() { return value; }, set() {} }));
    },
    "abort-on-property-read"(chain) { trapChain(chain, () => ({ get() { abort(); }, set() {} })); },
    "abort-on-property-write"(chain) {
      trapChain(chain, (o, p, cur) => ({ get() { return cur; }, set() { abort(); } }));
    },
    "abort-on-stack-trace"(chain, needle = "") {
      const m = matcher(needle);
      trapChain(chain, (o, p, cur) => {
        let v = cur;
        const check = () => { if (m(new Error().stack || "")) abort(); };
        return { get() { check(); return v; }, set(a) { check(); v = a; } };
      });
    },
    "abort-current-script"(chain, needle = "", context = "") {
      const reN = toRegex(needle), reC = toRegex(context);
      const self_ = doc.currentScript;
      const text = (e) => (e.textContent && e.textContent.trim()) ? e.textContent : (e.src || "");
      trapChain(chain, (o, p, cur) => {
        let v = cur;
        const check = () => {
          const e = doc.currentScript;
          if (!(e instanceof HTMLScriptElement) || e === self_) return;
          if (needle !== "" && !reN.test(text(e))) return;
          if (context !== "" && !reC.test(e.src || text(e))) return;
          abort();
        };
        return { get() { check(); return v; }, set(a) { check(); v = a; } };
      });
    },
    "no-setTimeout-if"(needle = "", delay = "") { S._timer("setTimeout", needle, delay); },
    "no-setInterval-if"(needle = "", delay = "") { S._timer("setInterval", needle, delay); },
    _timer(name, needle, delay) {
      const m = matcher(needle);
      let dNot = false, d = delay;
      if (d.startsWith("!")) { dNot = true; d = d.slice(1); }
      const dn = d === "" ? null : parseInt(d, 10);
      window[name] = new Proxy(window[name], {
        apply(t, th, args) {
          const [fn, ms] = args;
          const dMatch = dn === null || ((+ms || 0) === dn) !== dNot;
          if (m(fnText(fn)) && dMatch) args[0] = function () {};
          return Reflect.apply(t, th, args);
        },
      });
    },
    "no-requestAnimationFrame-if"(needle = "") {
      const m = matcher(needle);
      window.requestAnimationFrame = new Proxy(window.requestAnimationFrame, {
        apply(t, th, args) { if (m(fnText(args[0]))) args[0] = function () {}; return Reflect.apply(t, th, args); },
      });
    },
    "adjust-setInterval"(needle = "", delay = "1000", boost = "0.05") { S._adjust("setInterval", needle, delay, boost); },
    "adjust-setTimeout"(needle = "", delay = "1000", boost = "0.05") { S._adjust("setTimeout", needle, delay, boost); },
    _adjust(name, needle, delay, boost) {
      const m = matcher(needle === "[native code]" ? "" : needle);
      const d = delay === "*" ? null : parseInt(delay, 10) || 1000;
      let b = parseFloat(boost); if (!isFinite(b) || b <= 0) b = 0.05; b = Math.min(50, Math.max(0.001, b));
      window[name] = new Proxy(window[name], {
        apply(t, th, args) {
          if ((d === null || +args[1] === d) && m(fnText(args[0]))) args[1] = (+args[1] || 0) * b;
          return Reflect.apply(t, th, args);
        },
      });
    },
    "addEventListener-defuser"(type = "", needle = "") {
      const mt = matcher(type), mn = matcher(needle);
      EventTarget.prototype.addEventListener = new Proxy(EventTarget.prototype.addEventListener, {
        apply(t, th, args) {
          if (mt(args[0]) && mn(fnText(args[1]))) return;
          return Reflect.apply(t, th, args);
        },
      });
    },
    "json-prune"(prune = "", need = "", ...rest) {
      const opts = namedArgs(rest);
      const stackM = opts.stackNeedle ? matcher(opts.stackNeedle) : null;
      JSON.parse = new Proxy(JSON.parse, {
        apply(t, th, args) {
          const r = Reflect.apply(t, th, args);
          if (stackM && !stackM(new Error().stack || "")) return r;
          return pruneJSON(r, prune, need);
        },
      });
      Response.prototype.json = new Proxy(Response.prototype.json, {
        apply(t, th, args) { return Reflect.apply(t, th, args).then((o) => (stackM ? o : pruneJSON(o, prune, need))); },
      });
    },
    "json-prune-fetch-response"(prune = "", need = "", ...rest) {
      const opts = namedArgs(rest);
      const realFetch = window.fetch;
      window.fetch = new Proxy(realFetch, {
        apply(t, th, args) {
          const p = Reflect.apply(t, th, args);
          const url = args[0] instanceof Request ? args[0].url : String(args[0]);
          const method = (args[1] && args[1].method) || (args[0] instanceof Request ? args[0].method : "GET");
          if (!urlMatches(opts.propsToMatch, url, method)) return p;
          return p.then((res) => res.clone().text().then((txt) => {
            let o; try { o = JSON.parse(txt); } catch (_) { return res; }
            pruneJSON(o, prune, need);
            const r2 = new Response(JSON.stringify(o), { status: res.status, statusText: res.statusText, headers: res.headers });
            try { Object.defineProperties(r2, { url: { value: res.url }, type: { value: res.type }, redirected: { value: res.redirected } }); } catch (_) {}
            return r2;
          }).catch(() => res));
        },
      });
    },
    "trusted-replace-fetch-response"(pattern = "", replacement = "", props = "") {
      const re = toRegex(pattern, "g");
      window.fetch = new Proxy(window.fetch, {
        apply(t, th, args) {
          const p = Reflect.apply(t, th, args);
          const url = args[0] instanceof Request ? args[0].url : String(args[0]);
          if (!urlMatches(props, url)) return p;
          return p.then((res) => res.clone().text().then((txt) => {
            const out = pattern === "*" ? replacement : txt.replace(re, replacement);
            const r2 = new Response(out, { status: res.status, statusText: res.statusText, headers: res.headers });
            try { Object.defineProperties(r2, { url: { value: res.url }, type: { value: res.type } }); } catch (_) {}
            return r2;
          }).catch(() => res));
        },
      });
    },
    _xhrHook(transform, props) {
      const XHR = window.XMLHttpRequest;
      const store = new WeakMap();
      window.XMLHttpRequest = class extends XHR {
        open(method, url, ...a) { store.set(this, { method, url: String(url), match: urlMatches(props, String(url), method) }); return super.open(method, url, ...a); }
        get response() {
          const s = store.get(this), r = super.response;
          if (!s || !s.match || this.readyState !== 4) return r;
          if (s.out === undefined) {
            const t = this.responseType;
            if (t === "" || t === "text") s.out = transform(r);
            else if (t === "json") { try { s.out = JSON.parse(transform(JSON.stringify(r))); } catch (_) { s.out = r; } }
            else s.out = r;
          }
          return s.out;
        }
        get responseText() {
          const s = store.get(this);
          const t = this.responseType;
          if (!s || !s.match || this.readyState !== 4 || (t !== "" && t !== "text")) return super.responseText;
          return this.response;
        }
      };
    },
    "json-prune-xhr-response"(prune = "", need = "", ...rest) {
      const opts = namedArgs(rest);
      S._xhrHook((txt) => { try { return JSON.stringify(pruneJSON(JSON.parse(txt), prune, need)); } catch (_) { return txt; } }, opts.propsToMatch);
    },
    "trusted-replace-xhr-response"(pattern = "", replacement = "", props = "") {
      const re = toRegex(pattern, "g");
      S._xhrHook((txt) => (pattern === "*" ? replacement : String(txt).replace(re, replacement)), props);
    },
    "no-fetch-if"(props = "", body = "") {
      window.fetch = new Proxy(window.fetch, {
        apply(t, th, args) {
          const url = args[0] instanceof Request ? args[0].url : String(args[0]);
          const method = (args[1] && args[1].method) || (args[0] instanceof Request ? args[0].method : "GET");
          if (props === "" || !urlMatches(props, url, method)) return Reflect.apply(t, th, args);
          const text = body === "emptyObj" ? "{}" : body === "emptyArr" ? "[]" : "";
          const r = new Response(text, { status: 200, statusText: "OK" });
          try { Object.defineProperty(r, "url", { value: url }); } catch (_) {}
          return Promise.resolve(r);
        },
      });
    },
    "no-xhr-if"(props = "", body = "") {
      if (props === "") return;
      const XHR = window.XMLHttpRequest;
      const store = new WeakMap();
      window.XMLHttpRequest = class extends XHR {
        open(method, url, ...a) { store.set(this, urlMatches(props, String(url), method)); return super.open(method, url, ...a); }
        send(...a) {
          if (!store.get(this)) return super.send(...a);
          const text = body === "emptyObj" ? "{}" : body === "emptyArr" ? "[]" : "";
          const def = (k, v) => { try { Object.defineProperty(this, k, { value: v, configurable: true }); } catch (_) {} };
          setTimeout(() => {
            def("readyState", 4); def("status", 200); def("statusText", "OK");
            def("responseText", text); def("response", this.responseType === "json" ? JSON.parse(text || "null") : text);
            this.dispatchEvent(new Event("readystatechange"));
            this.dispatchEvent(new ProgressEvent("load"));
            this.dispatchEvent(new ProgressEvent("loadend"));
          }, 1);
        }
      };
    },
    "no-window-open-if"(needle = "", delay = "", decoy = "") {
      const m = matcher(needle);
      window.open = new Proxy(window.open, {
        apply(t, th, args) {
          if (!m(args[0] || "")) return Reflect.apply(t, th, args);
          const fake = new Proxy(function () {}, { get: (o, k) => (k === "closed" ? false : k === "document" ? doc.implementation.createHTMLDocument("") : typeof k === "symbol" ? undefined : fake), apply: () => fake });
          return fake;
        },
      });
    },
    "remove-attr"(attrs = "", selector = "", behavior = "") {
      const list = attrs.split(/\s*\|\s*/).filter(Boolean);
      if (!list.length) return;
      const sel = selector || list.map((a) => `[${a}]`).join(",");
      const run = () => { try { doc.querySelectorAll(sel).forEach((e) => list.forEach((a) => e.removeAttribute(a))); } catch (_) {} };
      observe(run);
    },
    "remove-class"(classes = "", selector = "", behavior = "") {
      const list = classes.split(/\s*\|\s*/).filter(Boolean);
      if (!list.length) return;
      const sel = selector || list.map((c) => "." + CSS.escape(c)).join(",");
      observe(() => { try { doc.querySelectorAll(sel).forEach((e) => e.classList.remove(...list)); } catch (_) {} });
    },
    "set-attr"(selector = "", attr = "", value = "") {
      if (!selector || !attr || /^on/i.test(attr)) return;
      if (!/^(?:\d+|true|false|)$/.test(value) && !/^\[.+\]$/.test(value)) return;
      observe(() => {
        doc.querySelectorAll(selector).forEach((e) => {
          const v = /^\[(.+)\]$/.test(value) ? e.getAttribute(value.slice(1, -1)) : value;
          if (v !== null && e.getAttribute(attr) !== v) e.setAttribute(attr, v);
        });
      });
    },
    "remove-node-text"(nodeName = "", needle = "") { S._nodeText(nodeName, needle, ""); },
    "trusted-replace-node-text"(nodeName = "", pattern = "", replacement = "") { S._nodeText(nodeName, pattern, replacement, true); },
    _nodeText(nodeName, needle, replacement, replace) {
      const mName = matcher(nodeName === "" ? "" : "/^" + nodeName.replace(/^\/|\/$/g, "") + "$/i");
      const re = toRegex(needle, replace ? "g" : "");
      const handle = (n) => {
        if (!mName(n.nodeName.toLowerCase())) return;
        const t = n.textContent;
        if (!re.test(t)) return;
        re.lastIndex = 0;
        n.textContent = replace ? t.replace(re, replacement) : "";
      };
      const mo = new MutationObserver((recs) => {
        for (const r of recs) for (const n of r.addedNodes) {
          handle(n);
          if (n.nodeType === 1) n.querySelectorAll("*").forEach(handle);
        }
      });
      mo.observe(doc, { childList: true, subtree: true });
    },
    "nobab"() {
      const names = ["BlockAdBlock", "blockAdBlock"];
      class B { constructor() {} check() { return false; } on(d, f) { if (!d && typeof f === "function") setTimeout(f, 1); return this; } onDetected() { return this; } onNotDetected(f) { if (typeof f === "function") setTimeout(f, 1); return this; } setOption() { return this; } emitEvent() { return this; } clearEvent() {} }
      try { Object.defineProperty(window, names[0], { get: () => B, set() {}, configurable: true }); Object.defineProperty(window, names[1], { value: new B(), writable: false, configurable: true }); } catch (_) {}
    },
    "nofab"() {
      class F { constructor() {} check() { return false; } on(d, f) { if (!d && typeof f === "function") setTimeout(f, 1); return this; } onDetected() { return this; } onNotDetected(f) { if (typeof f === "function") setTimeout(f, 1); return this; } setOption() { return this; } emitEvent() { return this; } clearEvent() {} }
      try {
        Object.defineProperty(window, "FuckAdBlock", { get: () => F, set() {}, configurable: true });
        Object.defineProperty(window, "fuckAdBlock", { value: new F(), writable: false, configurable: true });
      } catch (_) {}
    },
    "noeval"() { window.eval = new Proxy(window.eval, { apply() { return undefined; } }); },
    "noeval-if"(needle = "") {
      const m = matcher(needle);
      window.eval = new Proxy(window.eval, { apply(t, th, args) { if (m(String(args[0]))) return undefined; return Reflect.apply(t, th, args); } });
    },
    "set-local-storage-item"(key = "", raw = "") { S._storage(localStorage, key, raw); },
    "set-session-storage-item"(key = "", raw = "") { S._storage(sessionStorage, key, raw); },
    _storage(st, key, raw) {
      if (!key) return;
      const v = storageValue(raw);
      if (v === null) return;
      try { if (v === "$remove$") st.removeItem(key); else st.setItem(key, v); } catch (_) {}
    },
    "set-cookie"(name = "", raw = "", path = "/") {
      if (!/^[\w.\-]+$/.test(name)) return;
      const v = storageValue(raw);
      if (v === null || v === "$remove$") return;
      if (doc.cookie.split(/;\s*/).some((c) => c === name + "=" + encodeURIComponent(v))) return;
      doc.cookie = `${name}=${encodeURIComponent(v)}; path=${path === "none" ? "" : path || "/"}; SameSite=Lax`;
    },
    "remove-cookie"(needle = "") {
      const m = matcher(needle);
      const run = () => {
        doc.cookie.split(";").forEach((c) => {
          const n = c.split("=")[0].trim();
          if (!n || !m(n)) return;
          const parts = location.hostname.split(".");
          for (let i = 0; i < parts.length - 1; i++) {
            const d = parts.slice(i).join(".");
            doc.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`;
          }
          doc.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        });
      };
      run();
      window.addEventListener("beforeunload", run);
    },
    "refresh-defuser"() {
      onReady(() => doc.querySelectorAll('meta[http-equiv="refresh" i]').forEach((m) => m.remove()));
    },
    "disable-newtab-links"() {
      doc.addEventListener("click", (e) => {
        const a = e.target && e.target.closest && e.target.closest("a[target]");
        if (a && a.target !== "_self") a.removeAttribute("target");
      }, true);
    },
    "window.name-defuser"() { if (window === window.top) window.name = ""; },
    "window-close-if"(needle = "") { if (matcher(needle)(location.href)) window.close(); },
    "xml-prune"(selector = "", needle = "", urlPattern = "") {
      // Removes nodes (e.g. ad periods from video manifests / VAST) from XML responses
      if (!selector) return;
      const urlM = matcher(urlPattern);
      const needleRe = toRegex(needle);
      const prune = (txt) => {
        if (typeof txt !== "string" || !/^\s*</.test(txt)) return txt;
        if (needle && !needleRe.test(txt)) return txt;
        try {
          const xdoc = new DOMParser().parseFromString(txt, "text/xml");
          if (xdoc.querySelector("parsererror")) return txt;
          let nodes = [];
          if (selector.startsWith("xpath(") && selector.endsWith(")")) {
            const r = xdoc.evaluate(selector.slice(6, -1), xdoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < r.snapshotLength; i++) nodes.push(r.snapshotItem(i));
          } else nodes = [...xdoc.querySelectorAll(selector)];
          if (!nodes.length) return txt;
          for (const n of nodes) {
            if (n.nodeType === 2 && n.ownerElement) n.ownerElement.removeAttribute(n.nodeName);
            else if (n.parentNode) n.parentNode.removeChild(n);
          }
          return new XMLSerializer().serializeToString(xdoc);
        } catch (_) { return txt; }
      };
      window.fetch = new Proxy(window.fetch, {
        apply(t, th, args) {
          const p = Reflect.apply(t, th, args);
          const url = args[0] instanceof Request ? args[0].url : String(args[0]);
          if (urlPattern && !urlM(url)) return p;
          return p.then((res) => res.clone().text().then((txt) => {
            const out = prune(txt);
            if (out === txt) return res;
            return new Response(out, { status: res.status, statusText: res.statusText, headers: res.headers });
          }).catch(() => res));
        },
      });
      S._xhrHook(prune, urlPattern ? "url:" + urlPattern : "");
    },
    "href-sanitizer"(selector = "", source = "") {
      // Rewrites tracking/redirect links to their real destination
      if (!selector) return;
      const extract = (a) => {
        if (source.startsWith("?")) {
          try { return new URL(a.href).searchParams.get(source.slice(1)); } catch (_) { return null; }
        }
        if (/^\[.+\]$/.test(source)) return a.getAttribute(source.slice(1, -1));
        return (a.textContent || "").trim();
      };
      observe(() => {
        doc.querySelectorAll(selector).forEach((a) => {
          if (a.dataset.sasSanitized) return;
          let v = extract(a);
          if (!v) return;
          try { v = decodeURIComponent(v); } catch (_) {}
          try { const u = new URL(v, location.href); if (!/^https?:$/.test(u.protocol)) return; a.href = u.href; a.dataset.sasSanitized = "1"; } catch (_) {}
        });
      }, 100);
    },
    "trusted-click-element"(selectors = "", extraMatch = "", delay = "") {
      // Clicks elements in order as they appear (e.g. "Reject all" on cookie banners). Gives up after 10 s.
      const list = selectors.split(/\s*,\s*/).filter(Boolean);
      if (!list.length) return;
      const wait = Math.min(Math.max(parseInt(delay, 10) || 0, 0), 5000);
      const end = Date.now() + 10000;
      let i = 0;
      const tick = () => {
        if (i >= list.length || Date.now() > end) return;
        let el = null;
        try { el = doc.querySelector(list[i]); } catch (_) { i = list.length; return; }
        if (el) {
          setTimeout(() => { try { el.click(); } catch (_) {} }, wait);
          i++;
        }
        setTimeout(tick, i < list.length ? 200 : 0);
      };
      onReady(tick);
    },
    "nowebrtc"() {
      const Rtc = window.RTCPeerConnection;
      if (!Rtc) return;
      window.RTCPeerConnection = function () { throw new DOMException("disabled", "NotAllowedError"); };
    },
  };

  for (const item of list) {
    const key = JSON.stringify(item);
    if (ran.has(key)) continue;
    ran.add(key);
    const [name, ...args] = item;
    const fn = S[name];
    if (typeof fn === "function" && !name.startsWith("_")) {
      try { fn.apply(S, args); } catch (_) {}
    }
  }
};
