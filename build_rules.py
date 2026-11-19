# Generates rules.json: the built-in rules that work immediately, before the filter lists download.
# Run: python3 build_rules.py
import json

# Each entry also blocks all of its subdomains.
DOMAINS = """
doubleclick.net googlesyndication.com googleadservices.com adservice.google.com
adservice.google.co.uk adservice.google.de adservice.google.sk adservice.google.cz
googletagservices.com imasdk.googleapis.com app-measurement.com google-analytics.com
googletagmanager.com analytics.google.com click.googleanalytics.com
afs.googlesyndication.com pagead2.googleadservices.com partnerad.l.doubleclick.net
adnxs.com adnxs-simple.com advertising.com amazon-adsystem.com aax.amazon-adsystem.com
adsrvr.org rubiconproject.com pubmatic.com openx.net openx.com criteo.com criteo.net
casalemedia.com indexww.com taboola.com taboolasyndication.com outbrain.com outbrainimg.com
revcontent.com mgid.com media.net smartadserver.com adform.net adform.com bidswitch.net
contextweb.com sharethrough.com teads.tv yieldmo.com 33across.com triplelift.com 3lift.com
gumgum.com sovrn.com lijit.com spotxchange.com spotx.tv springserve.com adcolony.com
applovin.com applvn.com inmobi.com mopub.com zedo.com adroll.com popads.net popcash.net
propellerads.com exoclick.com exosrv.com juicyads.com trafficjunky.net trafficjunky.com
adsterra.com hilltopads.net admaven.com clickadu.com onclickads.net adskeeper.co.uk
adskeeper.com yieldlove.com adition.com stickyadstv.com moatads.com moatpixel.com
serving-sys.com flashtalking.com eyeota.net bluekai.com demdex.net krxd.net rlcdn.com
quantserve.com quantcount.com scorecardresearch.com zemanta.com adtech.de yieldlab.net
smaato.net adsafeprotected.com doubleverify.com imrworldwide.com chartbeat.net chartbeat.com
adtago.s3.amazonaws.com analyticsengine.s3.amazonaws.com analytics.s3.amazonaws.com
advice-ads.s3.amazonaws.com adservetx.media.net static.media.net
hotjar.com hotjar.io mouseflow.com freshmarketer.com luckyorange.com luckyorange.net
crazyegg.com fullstory.com clarity.ms inspectlet.com smartlook.com sessioncam.com
stats.wp.com pixel.wp.com
bugsnag.com notify.bugsnag.com sessions.bugsnag.com browser.sentry-cdn.com
app.getsentry.com ingest.sentry.io sentry-cdn.com js.sentry-cdn.com sentry.io getsentry.com
d2wy8f7a9ursnm.cloudfront.net bugsnag.io trackjs.com logrocket.com logrocket.io lr-ingest.io rollbar.com raygun.io
pixel.facebook.com an.facebook.com
static.ads-twitter.com ads-twitter.com ads-api.twitter.com analytics.twitter.com
ads.linkedin.com analytics.pointdrive.linkedin.com px.ads.linkedin.com
ads.pinterest.com log.pinterest.com analytics.pinterest.com trk.pinterest.com ct.pinterest.com
events.reddit.com events.redditmedia.com alb.reddit.com
ads.youtube.com
ads-api.tiktok.com analytics.tiktok.com ads-sg.tiktok.com analytics-sg.tiktok.com
business-api.tiktok.com ads.tiktok.com log.byteoversea.com
ads.yahoo.com analytics.yahoo.com geo.yahoo.com udc.yahoo.com udcm.yahoo.com
analytics.query.yahoo.com partnerads.ysm.yahoo.com log.fc.yahoo.com gemini.yahoo.com
adtech.yahooinc.com advertising.yahoo.com
extmaps-api.yandex.net appmetrica.yandex.ru adfstat.yandex.ru metrika.yandex.ru
mc.yandex.ru mc.yandex.com offerwall.yandex.net adfox.yandex.ru an.yandex.ru
auction.unityads.unity3d.com webview.unityads.unity3d.com config.unityads.unity3d.com
adserver.unityads.unity3d.com unityads.unity3d.com
iot-eu-logser.realme.com iot-logser.realme.com bdapi-ads.realmemobile.com bdapi-in-ads.realmemobile.com
api.ad.xiaomi.com data.mistat.xiaomi.com data.mistat.india.xiaomi.com data.mistat.rus.xiaomi.com
sdkconfig.ad.xiaomi.com sdkconfig.ad.intl.xiaomi.com tracking.rus.miui.com
adsfs.oppomobile.com adx.ads.oppomobile.com ck.ads.oppomobile.com data.ads.oppomobile.com
metrics.data.hicloud.com metrics2.data.hicloud.com logservice.hicloud.com logservice1.hicloud.com
logbak.hicloud.com click.oneplus.cn open.oneplus.net
samsungads.com smetrics.samsung.com nmetrics.samsung.com samsung-com.112.2o7.net
analytics-api.samsunghealthcn.com
iadsdk.apple.com metrics.icloud.com metrics.mzstatic.com api-adservices.apple.com
books-analytics-events.apple.com weather-analytics-events.apple.com notes-analytics-events.apple.com
2o7.net omtrdc.net everesttech.net mookie1.com mathtag.com tapad.com agkn.com
adsymptotic.com ml314.com crwdcntrl.net exelator.com addthis.com addthisedge.com
sharethis.com bounceexchange.com bouncex.net cdn.permutive.com permutive.com
liadm.com rfihub.com rfihub.net turn.com w55c.net adgrx.com simpli.fi sitescout.com
adsymptotic.com dotomi.com emxdgt.com adkernel.com adtelligent.com aniview.com
undertone.com connatix.com primis.tech vidazoo.com seedtag.com ogury.com ogury.io
improvedigital.com 360yield.com richaudience.com adyoulike.com onetag-sys.com
districtm.io e-planning.net smilewanted.com justpremium.com
nativeads.com nativo.com plista.com ligatus.com adspirit.de
adzerk.net adzerk.com carbonads.com carbonads.net buysellads.com buysellads.net
infolinks.com vibrantmedia.com intellitxt.com kontera.com skimresources.com skimlinks.com
viglink.com
adblade.com content.ad contentabc.com zergnet.com
popmyads.com adcash.com adcash.network ad-maven.com a-ads.com coinzilla.com bitmedia.io
pushcrew.com pushengage.com onesignal.com subscribers.com izooto.com
newrelic.com nr-data.net bam.nr-data.net
optimizely.com cdn.optimizely.com
mixpanel.com segment.io segment.com cdn.segment.com amplitude.com heapanalytics.com
kissmetrics.com kissmetrics.io statcounter.com histats.com clicky.com getclicky.com
woopra.com mxpnl.com
branch.io app.link adjust.com adjust.io appsflyer.com kochava.com
widgets.pinterest.com adsdk.yandex.ru adsdk.yandex.net yandexadexchange.net
appmetrica.yandex.com mobile.yandexadexchange.net adfstat.yandex.com
advertising-api-eu.amazon.com affiliationjs.s3.amazonaws.com fls-na.amazon.com
device-metrics-us.amazon.com device-metrics-us-2.amazon.com mads-eu.amazon.com
adsmoloco.com ads.mopub.com supersonicads.com ironsrc.mobi vungle.com chartboost.com
tapjoy.com tapjoyads.com fyber.com startapp.com startappservice.com pangle.io pangleglobal.com
analytics.oneplus.cn data.mistat.intl.xiaomi.com tracking.intl.miui.com
fwtracks.freshmarketer.com claritybt.freshmarketer.com
popmyads.com propellerclick.com onclkds.com monetag.com zeropark.com trafficstars.com tsyndicate.com
realsrv.com galaksion.com clickaine.com richpush.co
yieldoptimizer.com adhigh.net adsco.re ad.gt adlightning.com confiant-integrations.net
""".split()

# Ad-related URL patterns (urlFilter syntax)
URL_PATTERNS = [
    "||youtube.com/pagead/",
    "||youtube.com/ptracking",
    "||youtube.com/api/stats/ads",
    "||youtube.com/api/stats/qoe?*adformat",
    "||youtube.com/get_midroll_",
    "||youtube.com/pcs/activeview",
    "||youtube.com/youtubei/v1/log_event?*adunit",
    "||connect.facebook.net^*/fbevents.js",
    "||facebook.com/tr/",
    "||facebook.com/tr?",
    "||bing.com/bat.js",
    "||bat.bing.com^",
    "/adsbygoogle.js",
    "/pagead/js/",
    "/gpt.js",
    "/pubads_impl",
    "/prebid.js",
    "/prebid-",
    "/prebid.min.js",
    "/ads/ad-",
    "/adserver/",
    "/adframe.",
    "/ad_banner",
    "/ad-banner.",
    "/adbanner.",
    "/banner_ad.",
    "/ads/banner",
    "/advertisement.js",
    "/advert.js",
    "/adsense.",
    "/ad-loader.",
    "/adloader.",
    "/ad_iframe.",
    "/adtag.",
    "/adtags.",
    "/ads.js?",
    "/show_ads.js",
    "/doubleclick.js",
    "/gtag/js?id=",
    "/analytics.js",
    "/ga.js",
    "/fbevents.js",
    "/hotjar-",
    "/matomo.js",
    "/piwik.js",
    "/clarity.js",
    # error-monitoring scripts served from generic CDNs
    "/bugsnag.min.js",
    "/bugsnag.js",
    "/bugsnag-",
    "/sentry.min.js",
    "/raven.min.js",
    "/raven.js",
    "/bundle.tracing.replay.min.js",
    "/rollbar.min.js",
    "/logrocket.min.js",
    # banner files with ad names (including ones served from the site itself)
    "_ads_banner.",
    "-ads-banner.",
    "/ads_banner.",
    "/ads-banner.",
    "_advertising_ads_",
    "/advertising_banner",
    "/banners/ads_",
    "/banners/ad_",
    "/ads/ads.js",
    "/ads/banner.",
]

rules = []
rid = 1
for i in range(0, len(DOMAINS), 500):
    chunk = sorted(set(d.lower() for d in DOMAINS[i:i + 500]))
    rules.append({"id": rid, "priority": 1, "action": {"type": "block"},
                  "condition": {"requestDomains": chunk}})
    rid += 1

for p in URL_PATTERNS:
    rules.append({"id": rid, "priority": 1, "action": {"type": "block"},
                  "condition": {"urlFilter": p}})
    rid += 1

# Built-in redirects to harmless stand-ins (so sites relying on these scripts don't break)
REDIRECTS = [
    ("||securepubads.g.doubleclick.net/tag/js/gpt.js", "gpt.js"),
    ("||googletagservices.com/tag/js/gpt.js", "gpt.js"),
    ("||pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "adsbygoogle.js"),
    ("||google-analytics.com/analytics.js", "analytics.js"),
    ("||google-analytics.com/ga.js", "ga.js"),
    ("||googletagmanager.com/gtm.js", "gtm.js"),
    ("||c.amazon-adsystem.com/aax2/apstag.js", "apstag.js"),
    ("||sb.scorecardresearch.com/beacon.js", "scorecard.js"),
]
for flt, res in REDIRECTS:
    rules.append({"id": rid, "priority": 2,
                  "action": {"type": "redirect", "redirect": {"extensionPath": "/resources/" + res}},
                  "condition": {"urlFilter": flt, "resourceTypes": ["script"]}})
    rid += 1

# Tracking parameters stripped from page and frame URLs (separate ruleset, can be turned off)
PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "utm_name",
          "utm_reader", "utm_referrer", "utm_social", "utm_brand", "utm_place", "utm_pubreferrer", "utm_swu",
          "utm_viz_id", "utm_cid", "utm_source_platform", "utm_creative_format", "utm_marketing_tactic",
          "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "msclkid", "mc_eid", "mc_cid", "igshid",
          "igsh", "yclid", "_hsenc", "_hsmi", "__hssc", "__hstc", "__hsfp", "hsCtaTracking", "twclid", "ttclid",
          "li_fat_id", "mkt_tok", "oly_anon_id", "oly_enc_id", "rb_clickid", "s_cid", "vero_conv", "vero_id",
          "wickedid", "_openstat", "ga_source", "ga_medium", "ga_campaign", "ga_content", "ga_term", "srsltid",
          "epik", "pk_campaign", "pk_kwd", "piwik_campaign", "piwik_kwd", "mtm_campaign", "mtm_kwd", "mtm_source",
          "mtm_medium", "mtm_content", "mtm_cid", "mtm_group", "mtm_placement", "si"]
GROUPS = [
    "utm_", "fbclid|gclid|gclsrc|dclid", "gbraid|wbraid|msclkid", "mc_eid|mc_cid|igshid|igsh",
    "yclid|_hsenc|_hsmi|twclid", "__hssc|__hstc|__hsfp|hsCtaTracking", "ttclid|li_fat_id|mkt_tok",
    "oly_anon_id|oly_enc_id|rb_clickid|s_cid", "vero_conv|vero_id|wickedid|_openstat", "ga_source|ga_medium|ga_campaign",
    "ga_content|ga_term|srsltid|epik", "pk_campaign|pk_kwd|piwik_campaign|piwik_kwd", "mtm_",
]
remove = [p for p in PARAMS if p != "si"]
params_rules = []
for i, g in enumerate(GROUPS):
    params_rules.append({"id": i + 1, "priority": 1,
        "action": {"type": "redirect", "redirect": {"transform": {"queryTransform": {"removeParams": remove}}}},
        "condition": {"regexFilter": "[?&](" + g + ")", "isUrlFilterCaseSensitive": True, "resourceTypes": ["main_frame", "sub_frame"]}})
# "si" is only a tracking code on YouTube / Spotify share links
params_rules.append({"id": len(GROUPS) + 1, "priority": 1,
    "action": {"type": "redirect", "redirect": {"transform": {"queryTransform": {"removeParams": ["si"]}}}},
    "condition": {"regexFilter": "[?&]si=", "requestDomains": ["youtube.com", "youtu.be", "open.spotify.com"], "resourceTypes": ["main_frame"]}})
with open("rules_params.json", "w") as f:
    json.dump(params_rules, f, indent=1)

with open("rules.json", "w") as f:
    json.dump(rules, f, indent=1)
print(f"wrote {len(rules)} rules covering {len(set(DOMAINS))} domains + {len(URL_PATTERNS)} URL patterns")
