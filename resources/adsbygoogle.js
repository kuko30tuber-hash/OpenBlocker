// OpenBlocker stand-in for Google AdSense (adsbygoogle.js)
(function () {
  'use strict';
  var q = window.adsbygoogle;
  var stub = { loaded: true, push: function () {} };
  if (Array.isArray(q)) { q.loaded = true; q.push = stub.push; }
  else { window.adsbygoogle = stub; }
  var fill = function () {
    document.querySelectorAll('ins.adsbygoogle:not([data-ad-status])').forEach(function (ins) {
      ins.setAttribute('data-ad-status', 'unfilled');
      ins.setAttribute('data-adsbygoogle-status', 'done');
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
})();
