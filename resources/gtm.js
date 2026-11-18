// OpenBlocker stand-in for Google Tag Manager (gtm.js)
(function () {
  'use strict';
  var noop = function () {};
  var w = window;
  w.ga = w.ga || noop;
  var dl = w.dataLayer;
  if (!(dl instanceof Object)) return;
  if (dl.hide instanceof Object && typeof dl.hide.end === 'function') { dl.hide.end(); dl.hide.end = noop; }
  var run = function (o) {
    if (o instanceof Object === false) return;
    var cb = o.eventCallback || o.event_callback;
    if (o.length !== undefined && o[2] instanceof Object) cb = o[2].event_callback || o[2].eventCallback;
    if (typeof cb === 'function') setTimeout(function () { try { cb(); } catch (e) {} }, 1);
  };
  if (Array.isArray(dl)) {
    dl.push = function () { for (var i = 0; i < arguments.length; i++) run(arguments[i]); return Array.prototype.push.apply(this, arguments); };
    dl.forEach(run);
  }
})();
