// OpenBlocker stand-in for legacy Google Analytics (ga.js)
(function () {
  'use strict';
  var noop = function () {};
  var Tracker = function () {};
  var p = Tracker.prototype;
  ['_addIgnoredOrganic','_addIgnoredRef','_addItem','_addOrganic','_addTrans','_clearIgnoredOrganic','_clearIgnoredRef',
   '_clearOrganic','_cookiePathCopy','_deleteCustomVar','_initData','_link','_linkByPost','_setAllowAnchor','_setAllowHash',
   '_setAllowLinker','_setCampContentKey','_setCampMediumKey','_setCampNOKey','_setCampNameKey','_setCampSourceKey',
   '_setCampTermKey','_setCampaignCookieTimeout','_setCampaignTrack','_setClientInfo','_setCookiePath','_setCookiePersistence',
   '_setCookieTimeout','_setCustomVar','_setDetectFlash','_setDetectTitle','_setDomainName','_setLocalGifPath',
   '_setLocalRemoteServerMode','_setLocalServerMode','_setReferrerOverride','_setRemoteServerMode','_setSampleRate',
   '_setSessionTimeout','_setSiteSpeedSampleRate','_setSessionCookieTimeout','_setVar','_setVisitorCookieTimeout',
   '_trackEvent','_trackPageLoadTime','_trackPageview','_trackSocial','_trackTiming','_trackTrans','_visitCode']
    .forEach(function (k) { p[k] = noop; });
  p._getLinkerUrl = function (a) { return a; };
  var gat = { _anonymizeIP: noop, _createTracker: function () { return new Tracker(); }, _forceSSL: noop,
    _getPlugin: noop, _getTracker: function () { return new Tracker(); }, _getTrackerByName: function () { return new Tracker(); },
    _getTrackers: noop, aa: noop, ab: noop, hb: noop, la: noop, oa: noop, pa: noop, u: noop };
  var gaq = { Na: noop, O: noop, Sa: noop, Ta: noop, Va: noop, _createAsyncTracker: noop, _getAsyncTracker: noop, _getPlugin: noop,
    push: function (a) {
      if (typeof a === 'function') { try { a(); } catch (e) {} return; }
      if (Array.isArray(a) && a[0] === '_link' && typeof a[1] === 'string') { window.location.assign(a[1]); }
      if (Array.isArray(a) && a[0] === '_set' && a[1] === 'hitCallback' && typeof a[2] === 'function') { setTimeout(a[2], 1); }
    } };
  var old = window._gaq;
  window._gat = gat;
  window._gaq = gaq;
  if (Array.isArray(old)) old.forEach(function (a) { gaq.push(a); });
})();
