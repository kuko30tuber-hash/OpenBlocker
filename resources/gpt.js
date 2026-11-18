// OpenBlocker stand-in for Google Publisher Tag (gpt.js)
(function () {
  'use strict';
  var noop = function () {};
  var noopThis = function () { return this; };
  var noopNull = function () { return null; };
  var noopArr = function () { return []; };
  var noopStr = function () { return ''; };
  var companionAds = { addEventListener: noopThis, enableSyncLoading: noop, setRefreshUnfilledSlots: noop };
  var content = { addEventListener: noopThis, setContent: noop };
  var slot = function () {
    var s = {};
    ['addService','clearCategoryExclusions','clearTargeting','defineSizeMapping','setCategoryExclusion','setClickUrl',
     'setCollapseEmptyDiv','setConfig','setForceSafeFrame','setSafeFrameConfig','setTargeting','updateTargetingFromMap']
      .forEach(function (k) { s[k] = noopThis; });
    ['get','getAdUnitPath','getSlotElementId','getContentUrl','getEscapedQemQueryId'].forEach(function (k) { s[k] = noopStr; });
    ['getAttributeKeys','getCategoryExclusions','getSizes','getTargeting','getTargetingKeys'].forEach(function (k) { s[k] = noopArr; });
    s.getResponseInformation = noopNull;
    s.getSlotId = function () { return { getId: noopStr, getAdUnitPath: noopStr, getDomId: noopStr, getName: noopStr, getInstance: function(){return 0;} }; };
    return s;
  };
  var pubads = {
    addEventListener: noopThis, removeEventListener: noopThis, clear: noop, clearCategoryExclusions: noopThis,
    clearTagForChildDirectedTreatment: noopThis, clearTargeting: noopThis, collapseEmptyDivs: noop, defineOutOfPagePassback: function(){return slot();},
    definePassback: function(){return slot();}, disableInitialLoad: noop, display: noop, enableAsyncRendering: noop,
    enableLazyLoad: noop, enableSingleRequest: noop, enableSyncRendering: noop, enableVideoAds: noop, get: noopNull,
    getAttributeKeys: noopArr, getTargeting: noopArr, getTargetingKeys: noopArr, getSlots: noopArr, isInitialLoadDisabled: function(){return true;},
    refresh: noop, set: noopThis, setCategoryExclusion: noopThis, setCentering: noop, setCookieOptions: noopThis,
    setForceSafeFrame: noopThis, setLocation: noopThis, setPrivacySettings: noopThis, setPublisherProvidedId: noopThis,
    setRequestNonPersonalizedAds: noopThis, setSafeFrameConfig: noopThis, setTagForChildDirectedTreatment: noopThis,
    setTargeting: noopThis, setVideoContent: noopThis, updateCorrelator: noop
  };
  var gt = window.googletag || {};
  var cmd = gt.cmd || [];
  gt.apiReady = true;
  gt.pubadsReady = true;
  gt.companionAds = function () { return companionAds; };
  gt.content = function () { return content; };
  gt.defineOutOfPageSlot = function () { return slot(); };
  gt.defineSlot = function () { return slot(); };
  gt.destroySlots = noop;
  gt.disablePublisherConsole = noop;
  gt.display = noop;
  gt.enableServices = noop;
  gt.getVersion = noopStr;
  gt.pubads = function () { return pubads; };
  gt.setAdIframeTitle = noop;
  gt.setConfig = noop;
  gt.sizeMapping = function () { var b = { addSize: function () { return b; }, build: noopNull }; return b; };
  gt.enums = { OutOfPageFormat: { REWARDED: 'REWARDED', TOP_ANCHOR: 'TOP_ANCHOR', BOTTOM_ANCHOR: 'BOTTOM_ANCHOR', INTERSTITIAL: 'INTERSTITIAL' } };
  gt.cmd = { push: function (fn) { try { fn.call(window); } catch (e) {} return 1; } };
  window.googletag = gt;
  while (cmd.length) { try { cmd.shift().call(window); } catch (e) {} }
})();
