// OpenBlocker stand-in for Amazon Publisher Services (apstag.js)
(function () {
  'use strict';
  var noop = function () {};
  var apstag = {
    fetchBids: function (cfg, cb) { if (typeof cb === 'function') setTimeout(function () { try { cb([]); } catch (e) {} }, 1); },
    init: noop, setDisplayBids: noop, targetingKeys: function () { return []; }, renderImp: noop, dpa: noop, rpa: noop, upa: noop,
    _Q: []
  };
  var old = window.apstag;
  window.apstag = apstag;
  if (old && Array.isArray(old._Q)) old._Q.forEach(function (c) { try { if (c[0] === 'f') apstag.fetchBids(c[1][0], c[1][1]); } catch (e) {} });
})();
