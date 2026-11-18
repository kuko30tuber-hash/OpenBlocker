// OpenBlocker stand-in for comScore beacon.js
(function () {
  'use strict';
  window.COMSCORE = { beacon: function () {}, purge: function () { window._comscore = []; } };
})();
