// OpenBlocker stand-in for Google Analytics (analytics.js)
(function () {
  'use strict';
  var noop = function () {};
  var tracker = { get: noop, set: noop, send: noop };
  var gaName = window.GoogleAnalyticsObject || 'ga';
  var old = window[gaName];
  var ga = function () {
    var len = arguments.length;
    if (len === 0) return;
    var args = Array.from(arguments);
    var last = args[len - 1];
    var cb;
    if (last instanceof Object && typeof last.hitCallback === 'function') cb = last.hitCallback;
    else if (typeof last === 'function') { setTimeout(function () { try { last(tracker); } catch (e) {} }, 1); return; }
    else {
      var i = args.indexOf('hitCallback');
      if (i !== -1 && typeof args[i + 1] === 'function') cb = args[i + 1];
    }
    if (cb) setTimeout(function () { try { cb(); } catch (e) {} }, 1);
  };
  ga.create = function () { return tracker; };
  ga.getByName = function () { return tracker; };
  ga.getAll = function () { return [tracker]; };
  ga.remove = noop;
  ga.loaded = true;
  window[gaName] = ga;
  var dl = window.dataLayer;
  if (dl instanceof Object && dl.hide instanceof Object && typeof dl.hide.end === 'function') { dl.hide.end(); dl.hide.end = noop; }
  if (old instanceof Function && Array.isArray(old.q)) old.q.forEach(function (a) { ga.apply(window, a); });
})();
