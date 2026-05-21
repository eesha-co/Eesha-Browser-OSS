package org.eesha.browser

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Build
import android.view.GestureDetector
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.*
import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.widget.*
import android.app.Dialog
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import org.json.JSONArray
import org.json.JSONObject
import android.os.Handler
import android.os.Looper
import java.io.File
import java.io.InputStream
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*

/**
 * Eesha Browser - Main Activity
 *
 * A privacy-focused web browser powered by Android WebView (Chromium/Blink).
 * Features:
 * - Comprehensive ad/tracker blocking (500+ domains)
 * - HTTPS-only mode with http:// upgrade
 * - Fingerprint protection via JS injection
 * - Private browsing mode
 * - Bookmarks & History (eesha:// internal pages)
 * - Downloads Manager with BroadcastReceiver
 * - Find in Page
 * - Multi-tab support
 * - Share intent
 * - Address bar autocomplete from bookmarks/history
 * - Touch gesture navigation (swipe back/forward)
 * - Desktop site toggle
 * - Custom Eesha new tab page
 * - Native Eesha Search: SearXNG JSON API with Eesha-branded results page
 */
class EeshaBrowser : AppCompatActivity() {

    companion object {
        // SearXNG JSON API base URL — used by loadSearchResultsPage() for fetch() calls
        const val EESHA_SEARCH_URL = "https://eesha-search.onrender.com"
    }

    private lateinit var webView: WebView
    private lateinit var urlBar: EditText
    private lateinit var progressBar: ProgressBar
    private lateinit var btnHome: ImageButton
    private lateinit var btnNewTab: ImageButton

    // Modern Navigation Bar buttons
    private lateinit var btnBack: ImageButton
    private lateinit var btnForward: ImageButton
    private lateinit var btnRefresh: ImageButton
    private lateinit var btnMenu: ImageButton
    private lateinit var btnClearUrl: ImageButton
    private lateinit var urlSecurityIcon: ImageView

    // Floating menu views
    private lateinit var floatingMenuBtn: ImageButton
    private lateinit var floatingMenuPopup: LinearLayout
    private var isMenuPopupVisible = false
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var privateBanner: LinearLayout
    private lateinit var blockedCountText: TextView
    private lateinit var autocompleteList: ListView
    private lateinit var autocompleteAdapter: ArrayAdapter<String>
    private lateinit var prefs: SharedPreferences
    private lateinit var webViewContainer: FrameLayout

    // Find in Page views
    private lateinit var findBar: LinearLayout
    private lateinit var findInput: EditText
    private lateinit var findCount: TextView
    private lateinit var btnFindPrev: ImageButton
    private lateinit var btnFindNext: ImageButton
    private lateinit var btnFindClose: ImageButton

    // Tab management views
    private lateinit var tabCount: TextView

    private var isPrivateMode = false
    private var blockedCount = 0
    private var currentPageUrl = ""
    private var currentPageTitle = ""
    private var currentSearchEngine = "eesha"
    private var desktopMode = false

    // SearXNG images pages load directly in WebView with software rendering + lazy loading to prevent OOM.

    // Bookmarks stored as JSON string: [{"title":"...","url":"...","timestamp":...}]
    private var bookmarks: MutableList<BookmarkEntry> = mutableListOf()
    // History stored as JSON string: [{"title":"...","url":"...","timestamp":...}]
    private var history: MutableList<HistoryEntry> = mutableListOf()

    // Autocomplete suggestions
    private var autocompleteSuggestions: MutableList<String> = mutableListOf()

    // Tab management
    data class TabInfo(
        val id: Int,
        var title: String,
        var url: String,
        val isPrivate: Boolean,
        val webView: WebView,
        val swipeRefresh: SwipeRefreshLayout,
        var blockedCount: Int = 0,
        var favicon: Bitmap? = null
    )
    private var tabsList: MutableList<TabInfo> = mutableListOf()
    private var activeTabId: Int = 0
    private var tabIdCounter: Int = 0

    // Downloads management
    data class DownloadEntry(
        val filename: String,
        val url: String,
        val downloadId: Long,
        val timestamp: Long
    )
    private var downloadsList: MutableList<DownloadEntry> = mutableListOf()
    private var downloadCompleteReceiver: BroadcastReceiver? = null

    data class BookmarkEntry(val title: String, val url: String, val timestamp: Long)
    data class HistoryEntry(val title: String, val url: String, val timestamp: Long)

    // ─────────────────────────────────────────────────────────────────────
    // COMPREHENSIVE AD/TRACKER BLOCKLIST
    // Extracted from shared/security/blocked-domains.json
    // Categories: ad_networks, tracking, fingerprinting, malware_phishing,
    //             social_tracking, telemetry
    // ─────────────────────────────────────────────────────────────────────
    private val blockedDomains = setOf(
        // ─── Ad Networks ──────────────────────────────────────────────
        "doubleclick.net", "googlesyndication.com", "googleadservices.com",
        "google-analytics.com", "googletagmanager.com", "googleadapis.com",
        "googletagservices.com", "googleoptimize.com",
        "adnxs.com", "adsrvr.org", "adroll.com", "criteo.com",
        "outbrain.com", "taboola.com", "bidswitch.net",
        "rubiconproject.com", "pubmatic.com", "openx.net",
        "casalemedia.com", "indexexchange.com", "sharethrough.com",
        "media.net", "mookie1.com", "revcontent.com",
        "popads.net", "zemanta.com", "lijit.com",
        "adcolony.com", "applovin.com", "unity3d.com",
        "ironsrc.com", "supersonicads.com", "chartboost.com",
        "fyber.com", "inner-active.mobi", "startapp.com",
        "tapjoy.com", "vungle.com", "smaato.net",
        "inmobi.com", "flurry.com", "millennialmedia.com",
        "mobfox.com", "jumptap.com", "mdotm.com",
        "amobee.com", "kontera.com", "vibrantmedia.com",
        "intellitxt.com", "ebdr3.com",
        "exoclick.com", "juicyads.com", "trafficjunky.net",
        "traffichaus.com", "adxpansion.com", "ero-advertising.com",
        "trafficfactory.biz", "adsterra.com", "propellerads.com",
        "hilltopads.com", "popcash.net",
        "propellerpops.com", "zeropop.com", "admaven.com",
        "richpush.com", "pushnotifications.com", "push.js.org",
        "notifpush.com", "pushwoosh.com", "pushe.co",
        "ad-maven.com", "maven.co", "popunder.net",
        "clickadu.com", "bidvertiser.com", "yllix.com",
        "evadav.com", "monetag.com",
        "profitablecpmrate.com", "betteradsnetwork.com",
        "a-ads.com", "coinzilla.com", "cointraffic.io",
        "mellowads.com", "adbiq.com", "adstraight.com",
        "adstargets.com", "advertserve.com", "adzerk.net",
        "buysellads.com", "carbonads.com", "codefund.com",
        "ethicalads.net", "mediaforge.com", "agkn.com",
        "rlcdn.com", "demdex.net", "pippio.com",
        "lotame.com", "krxd.net", "bluekai.com",
        "exelate.com", "eyeota.net", "addthis.com",
        "sharethis.com", "po.st", "ywxi.net",

        // ─── Tracking ─────────────────────────────────────────────────
        "connect.facebook.net", "analytics.facebook.com",
        "ads.yahoo.com", "ad.yieldmanager.com",
        "amazon-adsystem.com", "associates-amazon.com",
        "aax-us-east.amazon-adsystem.com",
        "scorecardresearch.com", "quantserve.com", "moatads.com",
        "adsafeprotected.com", "chartbeat.com", "hotjar.com",
        "mixpanel.com", "segment.io", "segment.com",
        "amplitude.com", "fullstory.com", "crazyegg.com",
        "optimizely.com", "adobedtm.com", "omtrdc.net",
        "2o7.net", "tt.omtrdc.net", "sc.omtrdc.net",
        "everesttech.net", "omniture.com",
        "hit.xiti.com", "ati-host.net", "xiti.com",
        "at-internet.com", "eulerian.net", "eulerian.com",
        "webtrekk.net", "webtrekk.com", "mapp.com",
        "demandbase.com", "6sc.co", "6sense.com",
        "bombora.com", "clearbit.com", "leadiq.com",
        "zoominfo.com", "apollo.io", "lusha.co",
        "hunter.io", "cognism.com", "outreach.io",
        "salesloft.com", "hubspot.com", "marketo.com",
        "marketo.net", "eloqua.com", "pardot.com",
        "act-on.com", "actonsoftware.com", "silverpop.com",
        "ibmmarketingcloud.com", "smartfocus.com",
        "sailthru.com", "bronto.com", "listrak.com",
        "mailchimp.com", "mandrill.com", "campaign-archive.com",
        "customer.io", "iterable.com", "braze.com",
        "appboy.com", "leanplum.com", "airship.com",
        "urbanairship.com", "onesignal.com", "firebase.com",
        "firebaseapp.com", "firebase.google.com",
        "app-measurement.com", "appsflyer.com", "branch.io",
        "adjust.com", "kochava.com", "tune.com",
        "hasoffers.com", "singular.net", "tenjin.com",
        "apsalar.com", "localytics.com", "swrve.com",

        // ─── Fingerprinting ───────────────────────────────────────────
        "fpjs.io", "fpcollect.com", "botd.dev",
        "fingerprintjs.com", "fingerprintjs.pro",
        "fpedge.net", "deviceatlas.com", "px-cdn.net",
        "perimeterx.net", "perimeterx.com", "arcsin.io",
        "arking.com", "iovation.com", "threatmetrix.com",
        "threatmetrix.net", "lexisnexisrisk.com",
        "biocatch.com", "nuance.com", "h-captcha.com",
        "recaptcha.net", "recaptcha.com",
        "kasada.io", "imperva.com", "incapsula.com",
        "distilnetworks.com", "distil.it",

        // ─── Malware / Phishing ──────────────────────────────────────
        "coinhive.com", "coin-hive.com", "jsecoin.com",
        "crypto-loot.com", "minero.cc", "webminepool.com",
        "coinerra.com", "cryptoloot.pro", "coinhave.com",
        "deepminer.com", "webmine.cz", "authedmine.com",
        "cashbeet.com", "bewaslac.com", "pushstack.com",
        "realtimecampaign.com", "blastbomber.com",
        "highstakesdb.com", "redichat.com", "actons.com",
        "adnami.co", "adnami.io",
        "fontsprod.com", "grmtech.com",

        // ─── Social Tracking ─────────────────────────────────────────
        "fbcdn.net",
        "platform.twitter.com", "analytics.twitter.com",
        "t.co", "twimg.com",
        "pinimg.com",
        "tiktokcdn.com", "analytics.tiktok.com",

        // ─── Telemetry ───────────────────────────────────────────────
        "telemetry.mozilla.org", "incoming.telemetry.mozilla.org",
        "firefox.settings.services.mozilla.com",
        "crash-reports.mozilla.com",
        "detectportal.mozilla.net",
        "location.services.mozilla.com",
        "shavar.services.mozilla.com",
        "tracking-protection.mozilla.org",
        "chromereporting-pa.googleapis.com",
        "update.googleapis.com",
        "clientservices.googleapis.com",
        "ssl.google-analytics.com",
        "stats.g.doubleclick.net",
        "www.google-analytics.com",
        "www.googletagmanager.com",
        "region1.google-analytics.com",
        "cm.g.doubleclick.net",
        "ade.googlesyndication.com",
        "pagead2.googlesyndication.com",
        "tpc.googlesyndication.com",
        "s0.2mdn.net", "s1.2mdn.net",
        "ad.doubleclick.net",
        "stats.doubleclick.net",
        "m.doubleclick.net",

        // ─── Additional common ad/tracker domains ─────────────────────
        "adform.net", "adition.com", "adkernel.com",
        "adnologies.com", "adtech.de", "adtech.us",
        "advertising.com", "atdmt.com", "atwola.com",
        "betrad.com", "bluestreak.com", "coremetric.com",
        "drawbrid.ge", "eyeviewads.com", "flashtalking.com",
        "gstatic.com/ad", "heias.com", "intentiq.com",
        "ipredictive.com", "klaviyo.com", "mathtag.com",
        "mediaplex.com", "metrigo.com", "miui.com",
        "moat.com", "nnm2.com", "omtrdc.net",
        "pointroll.com", "rfihub.com", "rubiconproject.com",
        "serving-sys.com", "sitescout.com", "smartadserver.com",
        "smaato.com", "statcounter.com", "tapad.com",
        "tradablebits.com", "turn.com", "undertone.com",
        "valueclick.com", "viglink.com", "xaxis.com",
        "yieldlab.net", "yieldmo.com", "zyncd.com"
    )

    // Fingerprint protection JS (embedded from shared/security/fingerprint-protection.js)
    private val fingerprintJs = """
    (function() {
      'use strict';
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      function addCanvasNoise(canvas, context) {
        try {
          if (canvas.width === 0 || canvas.height === 0) return;
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4 * 37) {
            data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() - 0.5) * 2));
          }
          context.putImageData(imageData, 0, 0);
        } catch (e) {}
      }
      HTMLCanvasElement.prototype.toDataURL = function() {
        try { const ctx = this.getContext('2d'); if (ctx) addCanvasNoise(this, ctx); } catch (e) {}
        return origToDataURL.apply(this, arguments);
      };
      HTMLCanvasElement.prototype.toBlob = function() {
        try { const ctx = this.getContext('2d'); if (ctx) addCanvasNoise(this, ctx); } catch (e) {}
        return origToBlob.apply(this, arguments);
      };
      const getParameterProxyHandler = {
        apply: function(target, thisArg, args) {
          const param = args[0];
          if (param === 0x9245) return 'GPU Vendor';
          if (param === 0x9246) return 'GPU Renderer';
          return target.apply(thisArg, args);
        }
      };
      try {
        const origGetParam = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = new Proxy(origGetParam, getParameterProxyHandler);
        if (typeof WebGL2RenderingContext !== 'undefined') {
          const origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
          WebGL2RenderingContext.prototype.getParameter = new Proxy(origGetParam2, getParameterProxyHandler);
        }
      } catch (e) {}
      try {
        const origGetFloatFreqData = AnalyserNode.prototype.getFloatFrequencyData;
        AnalyserNode.prototype.getFloatFrequencyData = function(array) {
          origGetFloatFreqData.apply(this, arguments);
          for (let i = 0; i < array.length; i++) { array[i] += (Math.random() - 0.5) * 0.001; }
        };
      } catch (e) {}
      try {
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4, configurable: true });
        if ('deviceMemory' in navigator) {
          Object.defineProperty(navigator, 'deviceMemory', { get: () => 4, configurable: true });
        }
      } catch (e) {}
      try {
        const origGetTimezoneOffset = Date.prototype.getTimezoneOffset;
        Date.prototype.getTimezoneOffset = function() { return 0; };
      } catch (e) {}
      try {
        const origMeasureText = CanvasRenderingContext2D.prototype.measureText;
        CanvasRenderingContext2D.prototype.measureText = function(text) {
          const result = origMeasureText.apply(this, arguments);
          const noise = (Math.random() - 0.5) * 0.01;
          return new Proxy(result, {
            get: function(target, prop) {
              if (prop === 'width') return target.width + noise;
              if (prop === 'actualBoundingBoxLeft') return target.actualBoundingBoxLeft + noise;
              if (prop === 'actualBoundingBoxRight') return target.actualBoundingBoxRight + noise;
              return target[prop];
            }
          });
        };
      } catch (e) {}
      try {
        if (navigator.getBattery) {
          navigator.getBattery = () => Promise.resolve({
            charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1,
            addEventListener: function(){}, removeEventListener: function(){}, dispatchEvent: function(){ return true; }
          });
        }
      } catch (e) {}
      try {
        if (navigator.connection) {
          Object.defineProperty(navigator, 'connection', {
            get: () => ({
              effectiveType: '4g', rtt: 100, downlink: 10, saveData: false,
              addEventListener: function(){}, removeEventListener: function(){}, dispatchEvent: function(){ return true; }
            }),
            configurable: true
          });
        }
      } catch (e) {}
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const origEstimate = navigator.storage.estimate;
          navigator.storage.estimate = function() {
            return origEstimate.apply(this, arguments).then(est => ({
              quota: Math.round(est.quota / (1024*1024*1024)) * (1024*1024*1024),
              usage: Math.round(est.usage / (1024*1024)) * (1024*1024)
            }));
          };
        }
      } catch (e) {}
      try {
        const origMathSin = Math.sin;
        const origMathCos = Math.cos;
        const eps = 1e-15;
        Math.sin = function(x) { return origMathSin(x) + (Math.random() - 0.5) * eps; };
        Math.cos = function(x) { return origMathCos(x) + (Math.random() - 0.5) * eps; };
      } catch (e) {}
      try {
        const origRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
        if (origRTCPeerConnection) {
          window.RTCPeerConnection = function(config, constraints) {
            if (config && config.iceServers) { config.iceTransportPolicy = 'relay'; }
            else { config = { iceTransportPolicy: 'relay' }; }
            return new origRTCPeerConnection(config, constraints);
          };
          window.RTCPeerConnection.prototype = origRTCPeerConnection.prototype;
        }
      } catch (e) {}
      try {
        Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true });
        Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true });
      } catch (e) {}
      try {
        if (navigator.userAgentData) {
          Object.defineProperty(navigator, 'userAgentData', { get: () => undefined, configurable: true });
        }
      } catch (e) {}
    })();
    """

    // HTTPS-only JS (embedded from shared/security/https-only.js)
    private val httpsOnlyJs = """
    (function() {
      'use strict';
      const origFetch = window.fetch;
      window.fetch = function(input, init) {
        let url = typeof input === 'string' ? input : input.url;
        if (url && url.startsWith('http://')) {
          url = url.replace('http://', 'https://');
          if (typeof input === 'string') { input = url; }
          else { input = new Request(url, input); }
        }
        return origFetch.call(this, input, init);
      };
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === 'string' && url.startsWith('http://')) {
          url = url.replace('http://', 'https://');
        }
        return origOpen.apply(this, arguments);
      };
      function upgradeLinks() {
        document.querySelectorAll('a[href^="http://"]').forEach(function(link) {
          link.href = link.href.replace('http://', 'https://');
        });
        document.querySelectorAll('form[action^="http://"]').forEach(function(form) {
          form.action = form.action.replace('http://', 'https://');
        });
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', upgradeLinks);
      } else { upgradeLinks(); }
      var observer = new MutationObserver(upgradeLinks);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    })();
    """

    // Global exception handler to prevent crashes from killing the app
    private fun setupUncaughtExceptionHandler() {
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                // Log the crash for debugging
                android.util.Log.e("EeshaBrowser", "Uncaught exception on ${thread.name}", throwable)
                // Try to show a toast instead of crashing
                Handler(Looper.getMainLooper()).post {
                    try {
                        Toast.makeText(this@EeshaBrowser, "Something went wrong. Please try again.", Toast.LENGTH_LONG).show()
                    } catch (_: Exception) {}
                }
            } catch (_: Exception) {}
            // Pass to default handler after our logging
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        // Install crash protection first, before anything else
        setupUncaughtExceptionHandler()

        super.onCreate(savedInstanceState)

        prefs = getSharedPreferences("eesha_prefs", Context.MODE_PRIVATE)
        loadBookmarksFromFile()
        loadHistoryFromFile()
        loadDownloadsList()
        currentSearchEngine = prefs.getString("search_engine", "eesha") ?: "eesha"

        // Check if launching in private mode
        isPrivateMode = intent.getBooleanExtra("private_mode", false)

        // MUST set content view BEFORE any window insets manipulation
        setContentView(R.layout.activity_browser)

        // ── FULL IMMERSIVE MODE: Hide the status bar entirely ──
        // The status bar (time, battery, signal) is completely hidden.
        // User can swipe down from the top edge to temporarily reveal it.
        // Also re-applied in onResume() and onWindowFocusChanged().
        // IMPORTANT: setDecorFitsSystemWindows must be called AFTER setContentView
        // to avoid crashes on some OEM Android implementations.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false)
            }
        } catch (e: Exception) {
            // setDecorFitsSystemWindows failure should not crash
        }
        applyImmersiveMode()

        // Watch for system UI changes — if the status bar reappears (e.g. when keyboard opens),
        // immediately re-apply immersive mode to hide it again.
        window.decorView.setOnSystemUiVisibilityChangeListener { visibility ->
            if (visibility and android.view.View.SYSTEM_UI_FLAG_FULLSCREEN == 0) {
                // Status bar became visible — re-hide it
                applyImmersiveMode()
            }
        }

        // Apply ONLY bottom and side system bar insets as padding.
        // No top padding needed since status bar is hidden entirely.
        // Bottom padding ensures the navigation bar isn't behind the system nav bar.
        try {
            val contentView = findViewById<View>(android.R.id.content)
            val contentFrame = contentView as? android.view.ViewGroup
            val coordinatorLayout = contentFrame?.getChildAt(0) as? android.view.ViewGroup
            coordinatorLayout?.let { root ->
                ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
                    val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                    v.setPadding(
                        systemBars.left,
                        0,  // No top padding: status bar is hidden
                        systemBars.right,
                        systemBars.bottom
                    )
                    insets
                }
            }
        } catch (e: Exception) {
            // WindowInsets listener failure should not crash the app
        }

        // Initialize views
        webView = findViewById(R.id.webView)
        urlBar = findViewById(R.id.urlBar)
        progressBar = findViewById(R.id.progressBar)
        btnHome = findViewById(R.id.btnHome)
        btnNewTab = findViewById(R.id.btnNewTab)

        // Modern Navigation Bar
        btnBack = findViewById(R.id.btnBack)
        btnForward = findViewById(R.id.btnForward)
        btnRefresh = findViewById(R.id.btnRefresh)
        btnMenu = findViewById(R.id.btnMenu)
        btnClearUrl = findViewById(R.id.btnClearUrl)
        urlSecurityIcon = findViewById(R.id.urlSecurityIcon)

        // Floating menu views
        floatingMenuBtn = findViewById(R.id.floatingMenuBtn)
        floatingMenuPopup = findViewById(R.id.floatingMenuPopup)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        privateBanner = findViewById(R.id.privateBanner)
        blockedCountText = findViewById(R.id.blockedCountText)
        autocompleteList = findViewById(R.id.autocompleteList)
        webViewContainer = findViewById(R.id.webViewContainer)

        // Find in Page views
        findBar = findViewById(R.id.findBar)
        findInput = findViewById(R.id.findInput)
        findCount = findViewById(R.id.findCount)
        btnFindPrev = findViewById(R.id.btnFindPrev)
        btnFindNext = findViewById(R.id.btnFindNext)
        btnFindClose = findViewById(R.id.btnFindClose)

        // Tab management views
        tabCount = findViewById(R.id.tabCount)

        // Setup private mode banner
        if (isPrivateMode) {
            privateBanner.isVisible = true
        } else {
            privateBanner.isVisible = false
        }

        // Create initial tab from the XML-defined WebView
        val firstTab = TabInfo(
            id = tabIdCounter++,
            title = "New Tab",
            url = "",
            isPrivate = isPrivateMode,
            webView = webView,
            swipeRefresh = swipeRefresh,
            blockedCount = 0
        )
        tabsList.add(firstTab)
        activeTabId = firstTab.id

        configureWebView(webView)
        setupNavigation()
        setupUrlBar()
        setupAutocomplete()
        setupGestures(webView)
        setupMenu()
        setupModernNavBar()
        setupFindBar()
        setupDownloadReceiver()

        // Set up swipe-to-refresh for the initial tab
        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }

        updateTabCount()

        // Load Eesha new tab page
        try {
            loadEeshaNewTab()
        } catch (e: Exception) {
            // If new tab fails, load a simple fallback
            try {
                webView.loadUrl("about:blank")
            } catch (_: Exception) {}
        }

        // Check for updates on launch (with 24-hour cooldown, auto-update must be enabled)
        try {
            val updateManager = UpdateManager(this)
            if (prefs.getBoolean("auto_update_enabled", true)) {
                updateManager.checkForUpdatesIfDue()
            }
        } catch (_: Exception) {
            // Update check failure should never crash the app
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(wv: WebView) {
        val settings = wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            loadsImagesAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = if (isPrivateMode) WebSettings.LOAD_NO_CACHE else WebSettings.LOAD_DEFAULT
            userAgentString = "Eesha/0.9.9 (Android) " + userAgentString
            setSaveFormData(false)
        }

        if (isPrivateMode) {
            settings.cacheMode = WebSettings.LOAD_NO_CACHE
        }

        wv.webViewClient = EeshaWebViewClient()
        wv.webChromeClient = EeshaWebChromeClient()
        wv.setBackgroundColor(android.graphics.Color.TRANSPARENT)

        // Download listener
        wv.setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
            enqueueDownload(url, userAgent, contentDisposition, mimetype, contentLength)
        }

        // Find listener
        wv.setFindListener { activeMatchOrdinal, numberOfMatches, isDoneCounting ->
            if (isDoneCounting) {
                if (numberOfMatches > 0) {
                    findCount.text = "${activeMatchOrdinal + 1}/$numberOfMatches"
                } else {
                    findCount.text = "0/0"
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Tab Management
    // ─────────────────────────────────────────────────────────────────────

    private fun createNewTab(url: String = "", switchTo: Boolean = true) {
        // Limit tabs to prevent OOM — each WebView uses ~30-50MB
        if (tabsList.size >= 10) {
            Toast.makeText(this, "Maximum 10 tabs", Toast.LENGTH_SHORT).show()
            return
        }

        // Create a new SwipeRefreshLayout + WebView
        val newSwipeRefresh = SwipeRefreshLayout(this)
        val newWebView = WebView(this)
        newSwipeRefresh.addView(newWebView)

        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
        newSwipeRefresh.layoutParams = params
        newSwipeRefresh.isVisible = false // Hidden until switched to

        // Add to the webViewContainer, below the autocomplete overlay
        webViewContainer.addView(newSwipeRefresh, 0)

        val tabId = tabIdCounter++
        val newTab = TabInfo(
            id = tabId,
            title = "New Tab",
            url = url,
            isPrivate = isPrivateMode,
            webView = newWebView,
            swipeRefresh = newSwipeRefresh,
            blockedCount = 0
        )
        tabsList.add(newTab)

        configureWebView(newWebView)

        // Set up swipe-to-refresh for this tab
        newSwipeRefresh.setOnRefreshListener {
            newWebView.reload()
        }

        // Set up gesture detection for this tab's WebView
        setupGestures(newWebView)

        updateTabCount()

        if (switchTo) {
            switchToTab(tabId)
            if (url.isNotEmpty()) {
                if (url.startsWith("eesha://")) {
                    loadInternalPage(url)
                } else {
                    newWebView.loadUrl(url)
                }
            } else {
                loadEeshaNewTab()
            }
        }
    }

    private fun switchToTab(tabId: Int) {
        val targetTab = tabsList.find { it.id == tabId } ?: return

        // Hide current tab
        val currentTab = tabsList.find { it.id == activeTabId }
        currentTab?.swipeRefresh?.isVisible = false
        // Pause the old tab's WebView to stop JS execution and reduce memory
        currentTab?.webView?.onPause()

        // Show target tab
        targetTab.swipeRefresh.isVisible = true
        // Resume the new active tab's WebView
        targetTab.webView.onResume()
        targetTab.swipeRefresh.isRefreshing = false
        activeTabId = tabId

        // Update webView and swipeRefresh references to the active tab
        webView = targetTab.webView
        swipeRefresh = targetTab.swipeRefresh

        // Update UI state
        currentPageUrl = targetTab.url
        currentPageTitle = targetTab.title
        blockedCount = targetTab.blockedCount

        if (targetTab.url.isNotEmpty() && !targetTab.url.startsWith("eesha://newtab")) {
            urlBar.setText(targetTab.url)
        } else {
            urlBar.setText("")
        }

        updateBookmarkButton()
        updateBlockedCount()
        updateTabCount()
        updateNavButtonStates()
        updateSecurityIcon(targetTab.url)

        // Hide find bar when switching tabs
        hideFindBar()
    }

    private fun closeTab(tabId: Int) {
        val tab = tabsList.find { it.id == tabId } ?: return
        val index = tabsList.indexOf(tab)

        // Remove views — must remove from container BEFORE destroying WebView
        // or Android throws "WebView.destroy() called while still attached"
        tab.swipeRefresh.isVisible = false
        tab.favicon = null  // Release bitmap memory
        webViewContainer.removeView(tab.swipeRefresh)
        tab.webView.loadUrl("about:blank")  // Clear page content first
        tab.webView.destroy()

        tabsList.remove(tab)

        if (tabsList.isEmpty()) {
            // Last tab closed — create a new tab
            createNewTab()
        } else {
            // Switch to adjacent tab
            val newIndex = if (index >= tabsList.size) tabsList.size - 1 else index
            switchToTab(tabsList[newIndex].id)
        }

        updateTabCount()
    }

    private fun getActiveTab(): TabInfo? {
        return tabsList.find { it.id == activeTabId }
    }

    private fun updateTabCount() {
        tabCount.text = tabsList.size.toString()
    }

    /**
     * Load a favicon directly from the website's own /favicon.ico.
     * No third-party API used — fully self-reliant.
     * Falls back gracefully if the load fails.
     */
    private fun loadFaviconAsync(url: String, imageView: ImageView) {
        try {
            val urlObj = java.net.URL(url)
            val host = urlObj.host ?: return
            val protocol = urlObj.protocol ?: "https"
            val faviconUrl = "$protocol://$host/favicon.ico"
            Thread {
                try {
                    val connection = URL(faviconUrl).openConnection() as java.net.HttpURLConnection
                    connection.connectTimeout = 3000
                    connection.readTimeout = 3000
                    connection.setRequestProperty("User-Agent", "Eesha/0.9.2")
                    connection.instanceFollowRedirects = true
                    val inputStream: InputStream = connection.getInputStream()
                    val bitmap = android.graphics.BitmapFactory.decodeStream(inputStream)
                    inputStream.close()
                    if (bitmap != null) {
                        // Downsample to 32x32 to save memory (original can be 64x64 or larger)
                        val scaled = if (bitmap.width > 32 || bitmap.height > 32) {
                            val scaled = Bitmap.createScaledBitmap(bitmap, 32, 32, true)
                            bitmap.recycle()
                            scaled
                        } else {
                            bitmap
                        }
                        // Save to tab for caching
                        val tab = tabsList.find { it.url == url }
                        tab?.favicon = scaled
                        // Update ImageView on UI thread
                        Handler(Looper.getMainLooper()).post {
                            imageView.setImageBitmap(scaled)
                            imageView.clearColorFilter()
                        }
                    }
                } catch (e: Exception) {
                    // Favicon load failed — keep the default icon
                }
            }.start()
        } catch (e: Exception) {
            // URL parsing failed — keep the default icon
        }
    }

    private fun showTabSwitcher() {
        val dialog = Dialog(this, android.R.style.Theme_Material_NoActionBar)
        dialog.setContentView(R.layout.tab_switcher_dialog)

        val tabGridContainer = dialog.findViewById<GridLayout>(R.id.tabGridContainer)
        val btnNewTabSwitcher = dialog.findViewById<LinearLayout>(R.id.btnNewTab)
        val btnDone = dialog.findViewById<Button>(R.id.btnDone)

        tabGridContainer.removeAllViews()

        for (tab in tabsList) {
            val cardView = layoutInflater.inflate(R.layout.tab_card_item, tabGridContainer, false)

            val faviconView = cardView.findViewById<ImageView>(R.id.tabFavicon)
            val titleView = cardView.findViewById<TextView>(R.id.tabTitle)
            val urlView = cardView.findViewById<TextView>(R.id.tabUrl)
            val closeBtn = cardView.findViewById<ImageButton>(R.id.btnCloseTab)
            val privateIndicator = cardView.findViewById<ImageView>(R.id.tabPrivateIndicator)

            // Set favicon
            if (tab.favicon != null) {
                faviconView.setImageBitmap(tab.favicon)
                faviconView.clearColorFilter()
            } else if (tab.url.isNotEmpty() && !tab.url.startsWith("eesha://")) {
                faviconView.setImageResource(R.drawable.ic_home)
                faviconView.setColorFilter(Color.parseColor("#8B95A5"))
                loadFaviconAsync(tab.url, faviconView)
            } else {
                faviconView.setImageResource(R.drawable.ic_home)
                faviconView.setColorFilter(Color.parseColor("#8B95A5"))
            }

            // Set title
            val displayTitle = tab.title.ifEmpty { "New Tab" }
            titleView.text = displayTitle
            titleView.setTextColor(if (tab.id == activeTabId)
                Color.parseColor("#E84560") else Color.parseColor("#E8ECF1"))

            // Set URL
            urlView.text = tab.url.ifEmpty { ""
            }

            // Show private indicator
            privateIndicator.isVisible = tab.isPrivate

            // Highlight active tab
            if (tab.id == activeTabId) {
                cardView.background = android.content.res.Resources.getSystem().getDrawable(android.R.drawable.dialog_holo_dark_frame, theme)
                cardView.setBackgroundResource(R.drawable.tab_card_active_bg)
            } else {
                cardView.setBackgroundResource(R.drawable.tab_card_bg)
            }

            // Click to switch
            val tabId = tab.id
            cardView.setOnClickListener {
                dialog.dismiss()
                switchToTab(tabId)
            }

            // Close button
            closeBtn.setOnClickListener {
                if (tabsList.size <= 1) {
                    dialog.dismiss()
                    closeTab(tabId)
                    return@setOnClickListener
                }
                // Animate removal
                cardView.animate()
                    .scaleX(0.8f)
                    .scaleY(0.8f)
                    .alpha(0f)
                    .setDuration(150)
                    .withEndAction {
                        closeTab(tabId)
                        // Refresh the switcher
                        dialog.dismiss()
                        if (tabsList.isNotEmpty()) {
                            showTabSwitcher()
                        }
                    }
                    .start()
            }

            tabGridContainer.addView(cardView)
        }

        // New Tab button
        btnNewTabSwitcher?.setOnClickListener {
            dialog.dismiss()
            createNewTab()
        }

        // Done button
        btnDone?.setOnClickListener {
            dialog.dismiss()
        }

        // Configure dialog
        dialog.window?.setLayout(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        dialog.window?.setGravity(android.view.Gravity.BOTTOM)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialog.show()
    }

    // ─────────────────────────────────────────────────────────────────────
    // Find in Page
    // ─────────────────────────────────────────────────────────────────────

    private fun setupFindBar() {
        findInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                val text = findInput.text.toString()
                if (text.isNotEmpty()) {
                    findInPage(text)
                }
                true
            } else false
        }

        btnFindNext.setOnClickListener {
            webView.findNext(true)
        }

        btnFindPrev.setOnClickListener {
            webView.findNext(false)
        }

        btnFindClose.setOnClickListener {
            hideFindBar()
        }
    }

    private fun showFindBar() {
        findBar.isVisible = true
        findInput.requestFocus()
        val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
        imm.showSoftInput(findInput, 0)
    }

    private fun hideFindBar() {
        findBar.isVisible = false
        findInput.text.clear()
        findCount.text = "0/0"
        webView.clearMatches()
        val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(findInput.windowToken, 0)
    }

    private fun findInPage(text: String) {
        webView.findAllAsync(text)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Downloads Manager
    // ─────────────────────────────────────────────────────────────────────

    private fun setupDownloadReceiver() {
        downloadCompleteReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
                if (id != -1L) {
                    val entry = downloadsList.find { it.downloadId == id }
                    if (entry != null) {
                        Toast.makeText(this@EeshaBrowser, "Download complete: ${entry.filename}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
        // Android 14+ (API 34) requires RECEIVER_EXPORTED or RECEIVER_NOT_EXPORTED flag
        // DownloadManager broadcasts are system-level, directed to our app
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(downloadCompleteReceiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(downloadCompleteReceiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
        }
    }

    @SuppressLint("Range")
    private fun enqueueDownload(url: String, userAgent: String, contentDisposition: String, mimetype: String, contentLength: Long) {
        val filename = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimetype)

        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mimetype)
                addRequestHeader("User-Agent", userAgent)
                setDescription("Downloading via Eesha")
                setTitle(filename)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
            }

            val dm = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
            val downloadId = dm.enqueue(request)

            downloadsList.add(DownloadEntry(
                filename = filename,
                url = url,
                downloadId = downloadId,
                timestamp = System.currentTimeMillis()
            ))
            saveDownloadsList()

            Toast.makeText(this, "Downloading: $filename", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Download failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun openSystemDownloads() {
        try {
            startActivity(Intent(DownloadManager.ACTION_VIEW_DOWNLOADS))
        } catch (e: Exception) {
            Toast.makeText(this, "Cannot open Downloads", Toast.LENGTH_SHORT).show()
        }
    }

    private fun loadDownloadsList() {
        try {
            val file = File(filesDir, "downloads.json")
            if (file.exists()) {
                val json = file.readText()
                val arr = JSONArray(json)
                downloadsList = (0 until arr.length()).map { i ->
                    val obj = arr.getJSONObject(i)
                    DownloadEntry(
                        filename = obj.getString("filename"),
                        url = obj.getString("url"),
                        downloadId = obj.getLong("downloadId"),
                        timestamp = obj.getLong("timestamp")
                    )
                }.toMutableList()
            }
        } catch (e: Exception) {
            downloadsList = mutableListOf()
        }
    }

    private fun saveDownloadsList() {
        try {
            val arr = JSONArray()
            downloadsList.forEach { d ->
                val obj = JSONObject()
                obj.put("filename", d.filename)
                obj.put("url", d.url)
                obj.put("downloadId", d.downloadId)
                obj.put("timestamp", d.timestamp)
                arr.put(obj)
            }
            val file = File(filesDir, "downloads.json")
            file.writeText(arr.toString())
        } catch (e: Exception) { /* silently fail */ }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Share
    // ─────────────────────────────────────────────────────────────────────

    private fun shareCurrentPage() {
        val url = currentPageUrl
        val title = currentPageTitle
        if (url.isEmpty() || url.startsWith("eesha://")) return

        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, "$title - $url")
            putExtra(Intent.EXTRA_SUBJECT, title)
            type = "text/plain"
        }
        startActivity(Intent.createChooser(sendIntent, "Share via"))
    }

    // ─────────────────────────────────────────────────────────────────────
    // Navigation & UI Setup
    // ─────────────────────────────────────────────────────────────────────

    private fun setupNavigation() {
        // Home button - go to Eesha new tab page
        btnHome.setOnClickListener {
            loadEeshaNewTab()
        }

        // New Tab button - create a new browser tab
        btnNewTab.setOnClickListener {
            createNewTab()
        }

        // Tab count button opens tab switcher
        tabCount.setOnClickListener {
            showTabSwitcher()
        }
    }

    private fun setupModernNavBar() {
        // Back button
        btnBack.setOnClickListener {
            if (webView.canGoBack()) {
                webView.goBack()
            }
        }
        btnBack.setOnLongClickListener {
            // Optional: Show history dropdown on long press
            true
        }

        // Forward button
        btnForward.setOnClickListener {
            if (webView.canGoForward()) {
                webView.goForward()
            }
        }

        // Refresh button
        btnRefresh.setOnClickListener {
            webView.reload()
        }
        btnRefresh.setOnLongClickListener {
            // Long press to stop loading
            if (progressBar.isVisible) {
                webView.stopLoading()
                progressBar.isVisible = false
                swipeRefresh.isRefreshing = false
            }
            true
        }

        // Menu button (alternative to FAB)
        btnMenu.setOnClickListener {
            toggleFloatingMenuPopup()
        }

        // Clear URL button
        btnClearUrl.setOnClickListener {
            urlBar.text.clear()
            urlBar.requestFocus()
            showAutocomplete("")
        }

        // Update button states based on WebView navigation state
        val updateNavState = Runnable {
            btnBack.isEnabled = webView.canGoBack()
            btnBack.alpha = if (webView.canGoBack()) 1.0f else 0.35f
            btnForward.isEnabled = webView.canGoForward()
            btnForward.alpha = if (webView.canGoForward()) 1.0f else 0.35f
        }

        // Hook into page lifecycle to update nav button states
        webView.webViewClient = EeshaWebViewClient()
    }

    private fun setupUrlBar() {
        urlBar.setOnEditorActionListener { _, actionId, event ->
            if (actionId == EditorInfo.IME_ACTION_GO ||
                (event?.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_ENTER)) {
                navigateToUrl(urlBar.text.toString())
                urlBar.clearFocus()
                hideAutocomplete()
                btnClearUrl.isVisible = false
                true
            } else false
        }

        urlBar.setOnClickListener {
            urlBar.selectAll()
            applyImmersiveMode()
        }

        urlBar.setOnFocusChangeListener { _, hasFocus ->
            // Show/hide clear button based on focus and content
            btnClearUrl.isVisible = hasFocus && urlBar.text.isNotEmpty()
            // Show/hide security icon based on focus
            urlSecurityIcon.isVisible = !hasFocus && currentPageUrl.startsWith("https://")

            if (hasFocus && urlBar.text.isNotEmpty()) {
                showAutocomplete(urlBar.text.toString())
            } else if (!hasFocus) {
                hideAutocomplete()
            }
            // Re-apply immersive mode on focus change to keep status bar hidden
            if (hasFocus) {
                applyImmersiveMode()
            }
        }
    }

    private fun setupAutocomplete() {
        autocompleteSuggestions = mutableListOf()
        autocompleteAdapter = ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, autocompleteSuggestions as List<String>)
        autocompleteList.adapter = autocompleteAdapter

        autocompleteList.setOnItemClickListener { _, _, position, _ ->
            val selected = autocompleteSuggestions[position]
            urlBar.setText(selected)
            navigateToUrl(selected)
            urlBar.clearFocus()
            hideAutocomplete()
        }

        urlBar.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val query = s?.toString()?.trim() ?: ""
                if (query.length >= 2) {
                    showAutocomplete(query)
                } else {
                    hideAutocomplete()
                }
            }
            override fun afterTextChanged(s: android.text.Editable?) {}
        })
    }

    private fun showAutocomplete(query: String) {
        val lowerQuery = query.lowercase()
        autocompleteSuggestions.clear()

        // Search bookmarks first
        bookmarks.filter { b ->
            b.url.lowercase().contains(lowerQuery) || b.title.lowercase().contains(lowerQuery)
        }.take(3).forEach { autocompleteSuggestions.add(it.url) }

        // Then history
        history.filter { h ->
            h.url.lowercase().contains(lowerQuery) || h.title.lowercase().contains(lowerQuery)
        }.take(5).forEach { h ->
            if (!autocompleteSuggestions.contains(h.url)) {
                autocompleteSuggestions.add(h.url)
            }
        }

        if (autocompleteSuggestions.isNotEmpty()) {
            autocompleteAdapter.clear()
            autocompleteAdapter.addAll(autocompleteSuggestions)
            autocompleteAdapter.notifyDataSetChanged()
            autocompleteList.isVisible = true
        } else {
            hideAutocomplete()
        }
    }

    private fun hideAutocomplete() {
        autocompleteList.isVisible = false
    }

    private fun setupGestures(wv: WebView) {
        val localDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            private val SWIPE_THRESHOLD = 100
            private val SWIPE_VELOCITY_THRESHOLD = 200

            override fun onFling(
                e1: MotionEvent?, e2: MotionEvent,
                velocityX: Float, velocityY: Float
            ): Boolean {
                if (e1 == null) return false
                val diffX = e2.x - e1.x
                val diffY = e2.y - e1.y

                // Only handle horizontal swipes
                if (Math.abs(diffX) > Math.abs(diffY)) {
                    if (Math.abs(diffX) > SWIPE_THRESHOLD && Math.abs(velocityX) > SWIPE_VELOCITY_THRESHOLD) {
                        // Check if swipe starts from edge
                        val screenWidth = resources.displayMetrics.widthPixels
                        if (diffX > 0 && e1.x < screenWidth * 0.15) {
                            // Swipe right from left edge → go back
                            if (wv.canGoBack()) {
                                wv.goBack()
                                return true
                            }
                        } else if (diffX < 0 && e1.x > screenWidth * 0.85) {
                            // Swipe left from right edge → go forward
                            if (wv.canGoForward()) {
                                wv.goForward()
                                return true
                            }
                        }
                    }
                }
                return false
            }
        })

        // Intercept touch events on WebView for gesture detection
        wv.setOnTouchListener { _, event ->
            localDetector.onTouchEvent(event)
            false // Don't consume - let WebView handle scroll etc.
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Floating Draggable Menu (Mobile Only)
    // ─────────────────────────────────────────────────────────────────────

    private fun setupMenu() {
        setupFloatingMenuDrag()
        setupFloatingMenuPopupActions()
    }

    private fun setupFloatingMenuDrag() {
        var startTranslationX = 0f
        var startTranslationY = 0f
        var startRawX = 0f
        var startRawY = 0f
        var isDragging = false

        floatingMenuBtn.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startTranslationX = floatingMenuBtn.translationX
                    startTranslationY = floatingMenuBtn.translationY
                    startRawX = event.rawX
                    startRawY = event.rawY
                    isDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - startRawX
                    val dy = event.rawY - startRawY
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        isDragging = true
                    }
                    if (isDragging) {
                        // Close popup if open while dragging
                        if (isMenuPopupVisible) {
                            hideFloatingMenuPopup()
                        }
                        val newTx = startTranslationX + dx
                        val newTy = startTranslationY + dy

                        // Constrain: the FAB must stay within webViewContainer bounds
                        val containerWidth = webViewContainer.width
                        val containerHeight = webViewContainer.height
                        val fabWidth = floatingMenuBtn.width
                        val fabHeight = floatingMenuBtn.height

                        // Get the FAB's base position (from layout_gravity + margins)
                        val fabLeft = floatingMenuBtn.left
                        val fabTop = floatingMenuBtn.top

                        val minTx = -fabLeft.toFloat()
                        val maxTx = (containerWidth - fabLeft - fabWidth).toFloat()
                        val minTy = -fabTop.toFloat()
                        val maxTy = (containerHeight - fabTop - fabHeight).toFloat()

                        floatingMenuBtn.translationX = newTx.coerceIn(minTx, maxTx)
                        floatingMenuBtn.translationY = newTy.coerceIn(minTy, maxTy)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!isDragging) {
                        toggleFloatingMenuPopup()
                    }
                    true
                }
            }
            true
        }
    }

    private fun toggleFloatingMenuPopup() {
        if (isMenuPopupVisible) {
            hideFloatingMenuPopup()
        } else {
            showFloatingMenuPopup()
        }
    }

    private fun showFloatingMenuPopup() {
        // Update dynamic items
        val bookmarkLayout = floatingMenuPopup.findViewById<LinearLayout>(R.id.popupBookmark)
        val bookmarkIcon = floatingMenuPopup.findViewById<ImageView>(R.id.popupBookmarkIcon)
        val bookmarkLabel = floatingMenuPopup.findViewById<TextView>(R.id.popupBookmarkLabel)
        val isBookmarked = bookmarks.any { it.url == currentPageUrl }

        if (isBookmarked) {
            bookmarkIcon.setImageResource(R.drawable.ic_bookmark_filled)
            bookmarkLabel.text = "Bookmarked"
        } else {
            bookmarkIcon.setImageResource(R.drawable.ic_bookmark_outline)
            bookmarkLabel.text = "Bookmark"
        }
        bookmarkLayout.isEnabled = currentPageUrl.isNotEmpty() && !currentPageUrl.startsWith("eesha://")
        bookmarkLayout.alpha = if (bookmarkLayout.isEnabled) 1.0f else 0.4f

        val desktopLayout = floatingMenuPopup.findViewById<LinearLayout>(R.id.popupDesktopSite)
        val desktopLabel = floatingMenuPopup.findViewById<TextView>(R.id.popupDesktopLabel)
        desktopLabel.text = if (desktopMode) "Mobile Site" else "Desktop Site"
        desktopLayout.alpha = if (desktopMode) 1.0f else 0.7f

        floatingMenuPopup.visibility = View.VISIBLE
        isMenuPopupVisible = true

        // Position popup relative to the FAB's actual screen position
        floatingMenuPopup.post {
            val fabLocation = IntArray(2)
            floatingMenuBtn.getLocationOnScreen(fabLocation)
            val containerLocation = IntArray(2)
            webViewContainer.getLocationOnScreen(containerLocation)

            val fabActualX = fabLocation[0] - containerLocation[0]
            val fabActualY = fabLocation[1] - containerLocation[1]
            val fabWidth = floatingMenuBtn.width
            val fabHeight = floatingMenuBtn.height
            val popupWidth = floatingMenuPopup.width
            val popupHeight = floatingMenuPopup.height

            // Position popup so its right edge aligns with the FAB's right edge
            var popupLeft = fabActualX + fabWidth - popupWidth
            // Show popup above the FAB
            var popupTop = fabActualY - popupHeight - (8 * resources.displayMetrics.density).toInt()

            // If popup would go above the container, show it below the FAB instead
            if (popupTop < 0) {
                popupTop = fabActualY + fabHeight + (8 * resources.displayMetrics.density).toInt()
            }

            // Ensure popup doesn't go off-screen left
            popupLeft = popupLeft.coerceAtLeast(0)

            // Ensure popup doesn't go off-screen right
            val containerWidth = webViewContainer.width
            popupLeft = popupLeft.coerceAtMost(containerWidth - popupWidth)

            // Set the popup's position using layoutParams
            val params = floatingMenuPopup.layoutParams as FrameLayout.LayoutParams
            params.gravity = android.view.Gravity.TOP or android.view.Gravity.START
            params.leftMargin = popupLeft
            params.topMargin = popupTop
            floatingMenuPopup.layoutParams = params
        }
    }

    private fun hideFloatingMenuPopup() {
        floatingMenuPopup.visibility = View.GONE
        isMenuPopupVisible = false
    }

    private fun setupFloatingMenuPopupActions() {
        // Navigation buttons in popup
        floatingMenuPopup.findViewById<ImageButton>(R.id.popupNavBack).setOnClickListener {
            webView.goBack()
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<ImageButton>(R.id.popupNavForward).setOnClickListener {
            webView.goForward()
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<ImageButton>(R.id.popupNavRefresh).setOnClickListener {
            webView.reload()
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<ImageButton>(R.id.popupNavHome).setOnClickListener {
            loadEeshaNewTab()
            hideFloatingMenuPopup()
        }

        // Menu items
        floatingMenuPopup.findViewById<LinearLayout>(R.id.popupNewTab).setOnClickListener {
            createNewTab()
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<LinearLayout>(R.id.popupNewPrivateTab).setOnClickListener {
            openPrivateTab()
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<LinearLayout>(R.id.popupBookmark).setOnClickListener {
            if (currentPageUrl.isNotEmpty() && !currentPageUrl.startsWith("eesha://")) {
                val existing = bookmarks.find { it.url == currentPageUrl }
                if (existing != null) {
                    bookmarks.remove(existing)
                    Toast.makeText(this, "Bookmark removed", Toast.LENGTH_SHORT).show()
                } else {
                    bookmarks.add(BookmarkEntry(
                        title = currentPageTitle.ifEmpty { currentPageUrl },
                        url = currentPageUrl,
                        timestamp = System.currentTimeMillis()
                    ))
                    Toast.makeText(this, "Bookmark added", Toast.LENGTH_SHORT).show()
                }
                saveBookmarksToFile()
            }
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<LinearLayout>(R.id.popupBookmarks).setOnClickListener {
            loadInternalPage("eesha://bookmarks")
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<LinearLayout>(R.id.popupHistory).setOnClickListener {
            loadInternalPage("eesha://history")
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<LinearLayout>(R.id.popupDownloads).setOnClickListener {
            openSystemDownloads()
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<LinearLayout>(R.id.popupFindInPage).setOnClickListener {
            showFindBar()
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<LinearLayout>(R.id.popupShare).setOnClickListener {
            shareCurrentPage()
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<LinearLayout>(R.id.popupDesktopSite).setOnClickListener {
            desktopMode = !desktopMode
            webView.settings.userAgentString = if (desktopMode) {
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            } else {
                "Eesha/0.9.9 (Android) " + webView.settings.userAgentString.removePrefix("Eesha/0.9.9 (Android) ").removePrefix("Eesha/1.0.0 (Android) ").removePrefix("Eesha/0.9.8 (Android) ").removePrefix("Eesha/0.9.7 (Android) ").removePrefix("Eesha/0.9.2 (Android) ").removePrefix("Eesha/0.9.0 (Android) ").removePrefix("Eesha/0.8.0 (Android) ").removePrefix("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            }
            webView.reload()
            Toast.makeText(this, if (desktopMode) "Desktop mode on" else "Desktop mode off", Toast.LENGTH_SHORT).show()
            hideFloatingMenuPopup()
        }
        floatingMenuPopup.findViewById<LinearLayout>(R.id.popupSettings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
            hideFloatingMenuPopup()
        }
    }

    private fun openPrivateTab() {
        val intent = Intent(this, EeshaBrowser::class.java)
        intent.putExtra("private_mode", true)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
    }

    private fun navigateToUrl(input: String) {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return

        // Determine if input is a URL or a search query
        val url = when {
            trimmed.startsWith("eesha://") -> trimmed
            trimmed.startsWith("http://") -> {
                if (prefs.getBoolean("https_only_enabled", true)) {
                    "https://" + trimmed.removePrefix("http://")
                } else trimmed
            }
            trimmed.startsWith("https://") -> trimmed
            trimmed.contains(".") && !trimmed.contains(" ") -> {
                // Looks like a URL (has a dot and no spaces) — navigate directly
                "https://$trimmed"
            }
            else -> getSearchUrl(trimmed)
        }

        try {
            if (url.startsWith("eesha://")) {
                loadInternalPage(url)
            } else {
                webView.loadUrl(url)
            }
        } catch (e: Throwable) {
            // URL loading failed — fall back to search
            try {
                webView.loadUrl(getSearchUrl(trimmed))
            } catch (_: Throwable) {
                Toast.makeText(this, "Cannot open: $trimmed", Toast.LENGTH_SHORT).show()
            }
        }
        urlBar.clearFocus()
    }

    /**
     * Get the search URL for a query using the current search engine.
     * All engines navigate directly to their search page — no internal eesha:// pages.
     */
    private fun getSearchUrl(query: String): String {
        val encoded = Uri.encode(query)
        return when (currentSearchEngine) {
            "eesha" -> "$EESHA_SEARCH_URL/search?q=$encoded"
            "google" -> "https://www.google.com/search?q=$encoded"
            "brave" -> "https://search.brave.com/search?q=$encoded"
            "startpage" -> "https://www.startpage.com/sp/search?query=$encoded"
            "duckduckgo" -> "https://duckduckgo.com/?q=$encoded"
            else -> "$EESHA_SEARCH_URL/search?q=$encoded"
        }
    }

    private fun loadInternalPage(url: String) {
        when {
            url == "eesha://newtab" -> loadEeshaNewTab()
            url.startsWith("eesha://search") -> {
                val uri = Uri.parse(url)
                val query = uri.getQueryParameter("q") ?: ""
                val category = uri.getQueryParameter("category")

                // Redirect eesha://search to the SearXNG instance directly
                if (query.isNotEmpty()) {
                    val searchUrl = if (category != null && category != "general") {
                        "$EESHA_SEARCH_URL/search?q=${Uri.encode(query)}&categories=$category"
                    } else {
                        "$EESHA_SEARCH_URL/search?q=${Uri.encode(query)}"
                    }
                    webView.loadUrl(searchUrl)
                    urlBar.setText(query)
                } else {
                    webView.loadUrl(EESHA_SEARCH_URL)
                    urlBar.setText(EESHA_SEARCH_URL)
                }
            }
            url == "eesha://bookmarks" -> loadBookmarksPage()
            url == "eesha://history" -> loadHistoryPage()
            url == "eesha://downloads" -> loadDownloadsPage()
            else -> webView.loadUrl(url)
        }
        if (!url.startsWith("eesha://search")) {
            urlBar.setText(url)
        }
    }

    private fun getSearchEngineName(): String = when (currentSearchEngine) {
        "eesha" -> "Eesha Search"
        "google" -> "Google"
        "brave" -> "Brave Search"
        "startpage" -> "StartPage"
        "duckduckgo" -> "DuckDuckGo"
        else -> "Eesha Search"
    }

    private fun getSearchEngineUrl(): String = when (currentSearchEngine) {
        "eesha" -> "${EESHA_SEARCH_URL}/search?q="
        "google" -> "https://www.google.com/search?q="
        "brave" -> "https://search.brave.com/search?q="
        "startpage" -> "https://www.startpage.com/sp/search?query="
        "duckduckgo" -> "https://duckduckgo.com/?q="
        else -> "${EESHA_SEARCH_URL}/search?q="
    }

    private fun loadEeshaNewTab() {
        blockedCount = 0
        updateBlockedCount()

        // Update tab info
        getActiveTab()?.let {
            it.title = "New Tab"
            it.url = ""
            it.blockedCount = 0
        }

        val logoBase64 = try {
            val logoStream = resources.openRawResource(R.drawable.eesha_logo)
            val logoBytes = logoStream.readBytes()
            logoStream.close()
            android.util.Base64.encodeToString(logoBytes, android.util.Base64.NO_WRAP)
        } catch (e: Exception) { "" }
        val logoDataUri = if (logoBase64.isNotEmpty()) "data:image/png;base64,$logoBase64" else ""

        val searchEngine = getSearchEngineName()
        val searchUrl = getSearchEngineUrl()

        // Modern dark theme colors
        val bgColor = if (isPrivateMode) "#1a0a2e" else "#0a1219"
        val textColor = if (isPrivateMode) "#e0e0e0" else "#e8ecf1"
        val hintColor = if (isPrivateMode) "#888888" else "#8b95a5"
        val surfaceColor = if (isPrivateMode) "#2a1a4e" else "#162636"
        val borderColor = if (isPrivateMode) "#4a148c" else "#1e3345"
        val accentColor = "#e84560"

        // Get recent history items (up to 6)
        val recentHistory = history.takeLast(6).reversed()
        val recentHtml = if (recentHistory.isNotEmpty() && !isPrivateMode) {
            val items = recentHistory.joinToString("") { entry ->
                val shortTitle = entry.title.take(30).let { if (entry.title.length > 30) "$it..." else it }
                """
                <a class="recent-item" href="${entry.url}">
                    <div class="recent-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="$hintColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </div>
                    <div class="recent-info">
                        <div class="recent-title">${escapeHtml(shortTitle)}</div>
                        <div class="recent-url">${escapeHtml(entry.url.removePrefix("https://").removePrefix("http://").take(40))}</div>
                    </div>
                </a>
                """.trimIndent()
            }
            """
            <div class="recent-section">
                <div class="recent-header">Recently Visited</div>
                <div class="recent-list">$items</div>
            </div>
            """.trimIndent()
        } else { "" }

        val newTabHtml = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self';">
            <title>Eesha - New Tab</title>
            <link rel="icon" type="image/png" href="$logoDataUri">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes logoPulse {
                    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: ${if (isPrivateMode) "0.08" else "0.12"}; }
                    50% { transform: translate(-50%, -50%) scale(1.02); opacity: ${if (isPrivateMode) "0.12" else "0.16"}; }
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: $bgColor;
                    color: $textColor;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    padding: 10vh 1rem 2rem;
                    position: relative;
                    overflow: hidden;
                }
                body::after {
                    content: '';
                    position: fixed;
                    top: 20%; left: 50%;
                    width: 60vmin; height: 32vmin;
                    background-image: url('$logoDataUri');
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                    animation: logoPulse 4s ease-in-out infinite;
                    pointer-events: none;
                    z-index: 0;
                }
                .search-container {
                    width: 100%; max-width: 520px;
                    position: relative; z-index: 1;
                    animation: fadeInUp 0.5s ease-out;
                }
                .search-box {
                    width: 100%; padding: 16px 20px 16px 50px; font-size: 16px;
                    border: 1.5px solid $borderColor; border-radius: 28px;
                    background: $surfaceColor; color: $textColor; outline: none;
                    transition: all 0.25s ease;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .search-box:focus {
                    border-color: $accentColor;
                    box-shadow: 0 2px 16px rgba(232,69,96,0.15), 0 0 0 3px rgba(232,69,96,0.08);
                }
                .search-box::placeholder { color: $hintColor; }
                .search-icon {
                    position: absolute; left: 18px; top: 50%; transform: translateY(-50%);
                    color: $hintColor; pointer-events: none;
                    transition: color 0.2s;
                }
                .search-box:focus + .search-icon, .search-container:focus-within .search-icon { color: $accentColor; }
                .shortcuts {
                    display: flex; flex-wrap: wrap; justify-content: center;
                    gap: 12px; margin-top: 32px; max-width: 520px; width: 100%;
                    position: relative; z-index: 1;
                    animation: fadeInUp 0.5s ease-out 0.15s both;
                }
                .shortcut {
                    display: flex; flex-direction: column; align-items: center; gap: 8px;
                    padding: 10px; border-radius: 16px;
                    text-decoration: none; color: $textColor; width: 78px;
                    transition: all 0.2s ease;
                    cursor: pointer;
                }
                .shortcut:hover, .shortcut:active { background: ${if (isPrivateMode) "#3a2a5e" else "#1e3345"}; transform: translateY(-2px); }
                .shortcut-icon {
                    width: 50px; height: 50px; border-radius: 16px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 20px; font-weight: 700; color: #fff;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    overflow: hidden; background: #1a1a2e;
                    transition: all 0.2s ease;
                }
                .shortcut:hover .shortcut-icon { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
                .shortcut-icon img { width: 28px; height: 28px; border-radius: 50%; object-fit: contain; }
                .shortcut-name {
                    font-size: 11px; color: $hintColor; text-align: center;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px;
                }
                .private-badge {
                    position: fixed; top: 12px; right: 12px;
                    background: linear-gradient(135deg, #4a148c, #7b1fa2); color: #fff;
                    padding: 6px 16px; border-radius: 20px;
                    font-size: 12px; z-index: 10; font-weight: 600;
                    box-shadow: 0 2px 12px rgba(74,20,140,0.3);
                    animation: fadeInUp 0.3s ease-out;
                }
                .recent-section {
                    width: 100%; max-width: 520px; margin-top: 28px;
                    position: relative; z-index: 1;
                    animation: fadeInUp 0.5s ease-out 0.3s both;
                }
                .recent-header {
                    font-size: 12px; font-weight: 600; color: $hintColor;
                    text-transform: uppercase; letter-spacing: 0.08em;
                    margin-bottom: 8px; padding: 0 4px;
                }
                .recent-list {
                    background: $surfaceColor;
                    border-radius: 16px;
                    border: 1px solid $borderColor;
                    overflow: hidden;
                }
                .recent-item {
                    display: flex; align-items: center; gap: 12px;
                    padding: 12px 16px;
                    text-decoration: none;
                    border-bottom: 1px solid $borderColor;
                    transition: background 0.15s;
                }
                .recent-item:last-child { border-bottom: none; }
                .recent-item:active { background: ${if (isPrivateMode) "#3a2a5e" else "#1a2c3d"}; }
                .recent-icon { flex-shrink: 0; }
                .recent-info { flex: 1; min-width: 0; }
                .recent-title { font-size: 14px; color: $textColor; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .recent-url { font-size: 12px; color: $hintColor; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
                .footer {
                    position: fixed; bottom: 16px; left: 0; right: 0;
                    text-align: center; font-size: 11px; color: $hintColor;
                    z-index: 1; pointer-events: none; opacity: 0.6;
                }
            </style>
        </head>
        <body>
            ${if (isPrivateMode) """<div class="private-badge">🛡 Private</div>""" else ""}
            <div class="search-container">
                <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" class="search-box" id="search" placeholder="Search with $searchEngine or enter URL" autofocus autocomplete="off">
            </div>
            <div class="shortcuts">
                <a class="shortcut" href="${EESHA_SEARCH_URL}">
                    <div class="shortcut-icon" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);"><img src="${logoDataUri}" alt="Eesha"></div><span class="shortcut-name">Eesha</span>
                </a>
                <a class="shortcut" href="https://www.wikipedia.org">
                    <div class="shortcut-icon" style="background: linear-gradient(135deg, #636466, #8e8e93);"><span style="font-size:22px;">W</span></div><span class="shortcut-name">Wikipedia</span>
                </a>
                <a class="shortcut" href="https://github.com">
                    <div class="shortcut-icon" style="background: linear-gradient(135deg, #24292e, #484f58);"><svg width="24" height="24" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg></div><span class="shortcut-name">GitHub</span>
                </a>
                <a class="shortcut" href="https://www.youtube.com">
                    <div class="shortcut-icon" style="background: linear-gradient(135deg, #ff0000, #cc0000);"><span style="font-size:20px;">▶</span></div><span class="shortcut-name">YouTube</span>
                </a>
                <a class="shortcut" href="https://www.reddit.com">
                    <div class="shortcut-icon" style="background: linear-gradient(135deg, #ff4500, #ff6347);"><span style="font-size:20px;">R</span></div><span class="shortcut-name">Reddit</span>
                </a>
                <a class="shortcut" href="https://twitter.com">
                    <div class="shortcut-icon" style="background: linear-gradient(135deg, #1da1f2, #0d8bd9);"><span style="font-size:18px;">𝕏</span></div><span class="shortcut-name">X</span>
                </a>
                <a class="shortcut" href="https://news.ycombinator.com">
                    <div class="shortcut-icon" style="background: linear-gradient(135deg, #ff6600, #ff8533);"><span style="font-size:18px;">Y</span></div><span class="shortcut-name">HN</span>
                </a>
                <a class="shortcut" href="https://stackoverflow.com">
                    <div class="shortcut-icon" style="background: linear-gradient(135deg, #f48024, #f69c55);"><span style="font-size:18px;">S</span></div><span class="shortcut-name">Stack</span>
                </a>
            </div>
            $recentHtml
            <div class="footer">Eesha Browser v0.9.2</div>
            <script>
                document.getElementById('search').addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        var q = this.value.trim();
                        if (q) {
                            if (q.startsWith('eesha://')) {
                                location.href = q;
                            } else if (q.match(/^(https?:\/\/|www\\.)/)) {
                                location.href = q.startsWith('www.') ? 'https://' + q : q;
                            } else if (q.includes('.') && !q.includes(' ')) {
                                location.href = 'https://' + q;
                            } else {
                                location.href = '$searchUrl' + encodeURIComponent(q);
                            }
                        }
                    }
                });
                // Animate recent items on load
                document.querySelectorAll('.recent-item').forEach(function(el, i) {
                    el.style.opacity = '0';
                    el.style.transform = 'translateX(-10px)';
                    el.style.transition = 'all 0.3s ease ' + (i * 0.05) + 's';
                    requestAnimationFrame(function() {
                        el.style.opacity = '1';
                        el.style.transform = 'translateX(0)';
                    });
                });
            </script>
        </body>
        </html>
        """.trimIndent()

        webView.loadDataWithBaseURL("eesha://newtab", newTabHtml, "text/html", "UTF-8", null)
        urlBar.setText("")
        currentPageUrl = ""
        currentPageTitle = ""
    }

    // NOTE: loadSearchResultsHtml() was removed — it was dead code.
    // Search now uses SearXNG directly (loaded in WebView with CSS injection to hide header).



    private fun loadBookmarksPage() {
        val logoBase64 = try {
            val logoStream = resources.openRawResource(R.drawable.eesha_logo)
            val logoBytes = logoStream.readBytes()
            logoStream.close()
            android.util.Base64.encodeToString(logoBytes, android.util.Base64.NO_WRAP)
        } catch (e: Exception) { "" }
        val logoDataUri = if (logoBase64.isNotEmpty()) "data:image/png;base64,$logoBase64" else ""

        val bookmarkItems = bookmarks.mapIndexed { index, b ->
            val dateStr = SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(b.timestamp))
            """
            <div class="item">
                <div class="item-info">
                    <div class="item-title">${escapeHtml(b.title)}</div>
                    <div class="item-url">${escapeHtml(b.url)}</div>
                    <div class="item-date">$dateStr</div>
                </div>
                <div class="item-actions">
                    <button class="btn-delete" onclick="deleteBookmark($index)">✕</button>
                </div>
            </div>
            """
        }.joinToString("\n")

        val emptyState = if (bookmarks.isEmpty()) {
            """<div class="empty">No bookmarks yet. Tap the ★ button to add one.</div>"""
        } else ""

        val html = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Eesha - Bookmarks</title>
            <link rel="icon" type="image/png" href="$logoDataUri">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #fff; color: #202124; min-height: 100vh;
                }
                .header {
                    background: #1a1a2e; color: #fff; padding: 16px 20px;
                    display: flex; align-items: center; justify-content: space-between;
                    position: sticky; top: 0; z-index: 10;
                }
                .header h1 { font-size: 18px; font-weight: 600; }
                .header-btn {
                    background: none; border: none; color: #e94560;
                    font-size: 14px; cursor: pointer; padding: 4px 8px;
                }
                .item-list { padding: 8px 0; }
                .item {
                    display: flex; align-items: center; padding: 12px 20px;
                    border-bottom: 1px solid #f0f0f0; cursor: pointer;
                }
                .item:active { background: #f5f5f5; }
                .item-info { flex: 1; min-width: 0; }
                .item-title { font-size: 15px; color: #202124; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .item-url { font-size: 12px; color: #9aa0a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
                .item-date { font-size: 11px; color: #c0c0c0; margin-top: 2px; }
                .item-actions { margin-left: 12px; flex-shrink: 0; }
                .btn-delete {
                    background: none; border: none; color: #e94560;
                    font-size: 18px; cursor: pointer; padding: 8px;
                    border-radius: 50%; width: 36px; height: 36px;
                }
                .btn-delete:active { background: #fce4ec; }
                .empty {
                    text-align: center; padding: 60px 20px;
                    color: #9aa0a6; font-size: 15px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>★ Bookmarks</h1>
            </div>
            <div class="item-list">
                $emptyState
                $bookmarkItems
            </div>
            <script>
                document.querySelectorAll('.item').forEach(function(el) {
                    el.addEventListener('click', function(e) {
                        if (e.target.classList.contains('btn-delete')) return;
                        var url = el.querySelector('.item-url').textContent;
                        if (url) location.href = url;
                    });
                });
                function deleteBookmark(index) {
                    location.href = 'eesha://delete-bookmark/' + index;
                }
            </script>
        </body>
        </html>
        """.trimIndent()

        webView.loadDataWithBaseURL("eesha://bookmarks", html, "text/html", "UTF-8", null)
    }

    private fun loadHistoryPage() {
        val logoBase64 = try {
            val logoStream = resources.openRawResource(R.drawable.eesha_logo)
            val logoBytes = logoStream.readBytes()
            logoStream.close()
            android.util.Base64.encodeToString(logoBytes, android.util.Base64.NO_WRAP)
        } catch (e: Exception) { "" }
        val logoDataUri = if (logoBase64.isNotEmpty()) "data:image/png;base64,$logoBase64" else ""

        val historyItems = history.mapIndexed { index, h ->
            val dateStr = SimpleDateFormat("MMM d, yyyy h:mm a", Locale.getDefault()).format(Date(h.timestamp))
            """
            <div class="item">
                <div class="item-info">
                    <div class="item-title">${escapeHtml(h.title)}</div>
                    <div class="item-url">${escapeHtml(h.url)}</div>
                    <div class="item-date">$dateStr</div>
                </div>
                <div class="item-actions">
                    <button class="btn-delete" onclick="deleteHistory($index)">✕</button>
                </div>
            </div>
            """
        }.joinToString("\n")

        val emptyState = if (history.isEmpty()) {
            """<div class="empty">No browsing history yet.</div>"""
        } else ""

        val clearAllBtn = if (history.isNotEmpty()) {
            """<button class="header-btn" onclick="clearAll()">Clear All</button>"""
        } else ""

        val html = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Eesha - History</title>
            <link rel="icon" type="image/png" href="$logoDataUri">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #fff; color: #202124; min-height: 100vh;
                }
                .header {
                    background: #1a1a2e; color: #fff; padding: 16px 20px;
                    display: flex; align-items: center; justify-content: space-between;
                    position: sticky; top: 0; z-index: 10;
                }
                .header h1 { font-size: 18px; font-weight: 600; }
                .header-btn {
                    background: none; border: none; color: #e94560;
                    font-size: 14px; cursor: pointer; padding: 4px 8px;
                }
                .search-bar {
                    padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                }
                .search-bar input {
                    width: 100%; padding: 10px 14px; border: 1px solid #dfe1e5;
                    border-radius: 20px; font-size: 14px; outline: none;
                    background: #f8f9fa;
                }
                .search-bar input:focus { border-color: #e94560; }
                .item-list { padding: 8px 0; }
                .item {
                    display: flex; align-items: center; padding: 12px 20px;
                    border-bottom: 1px solid #f0f0f0; cursor: pointer;
                }
                .item:active { background: #f5f5f5; }
                .item-info { flex: 1; min-width: 0; }
                .item-title { font-size: 15px; color: #202124; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .item-url { font-size: 12px; color: #9aa0a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
                .item-date { font-size: 11px; color: #c0c0c0; margin-top: 2px; }
                .item-actions { margin-left: 12px; flex-shrink: 0; }
                .btn-delete {
                    background: none; border: none; color: #e94560;
                    font-size: 18px; cursor: pointer; padding: 8px;
                    border-radius: 50%; width: 36px; height: 36px;
                }
                .btn-delete:active { background: #fce4ec; }
                .empty {
                    text-align: center; padding: 60px 20px;
                    color: #9aa0a6; font-size: 15px;
                }
                .item.hidden { display: none; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🕐 History</h1>
                $clearAllBtn
            </div>
            <div class="search-bar">
                <input type="text" id="searchInput" placeholder="Search history..." oninput="filterItems()">
            </div>
            <div class="item-list" id="itemList">
                $emptyState
                $historyItems
            </div>
            <script>
                document.querySelectorAll('.item').forEach(function(el) {
                    el.addEventListener('click', function(e) {
                        if (e.target.classList.contains('btn-delete')) return;
                        var url = el.querySelector('.item-url').textContent;
                        if (url) location.href = url;
                    });
                });
                function deleteHistory(index) {
                    location.href = 'eesha://delete-history/' + index;
                }
                function clearAll() {
                    location.href = 'eesha://clear-history';
                }
                function filterItems() {
                    var query = document.getElementById('searchInput').value.toLowerCase();
                    document.querySelectorAll('.item').forEach(function(el) {
                        var title = el.querySelector('.item-title').textContent.toLowerCase();
                        var url = el.querySelector('.item-url').textContent.toLowerCase();
                        if (title.includes(query) || url.includes(query)) {
                            el.classList.remove('hidden');
                        } else {
                            el.classList.add('hidden');
                        }
                    });
                }
            </script>
        </body>
        </html>
        """.trimIndent()

        webView.loadDataWithBaseURL("eesha://history", html, "text/html", "UTF-8", null)
    }

    private fun loadDownloadsPage() {
        val logoBase64 = try {
            val logoStream = resources.openRawResource(R.drawable.eesha_logo)
            val logoBytes = logoStream.readBytes()
            logoStream.close()
            android.util.Base64.encodeToString(logoBytes, android.util.Base64.NO_WRAP)
        } catch (e: Exception) { "" }
        val logoDataUri = if (logoBase64.isNotEmpty()) "data:image/png;base64,$logoBase64" else ""

        val downloadItems = downloadsList.mapIndexed { index, d ->
            val dateStr = SimpleDateFormat("MMM d, yyyy h:mm a", Locale.getDefault()).format(Date(d.timestamp))
            """
            <div class="item">
                <div class="item-info">
                    <div class="item-title">${escapeHtml(d.filename)}</div>
                    <div class="item-url">${escapeHtml(d.url)}</div>
                    <div class="item-date">$dateStr</div>
                </div>
                <div class="item-actions">
                    <button class="btn-delete" onclick="deleteDownload($index)">✕</button>
                </div>
            </div>
            """
        }.joinToString("\n")

        val emptyState = if (downloadsList.isEmpty()) {
            """<div class="empty">No downloads yet.</div>"""
        } else ""

        val openSystemBtn = """<button class="header-btn" onclick="openSystemDownloads()">Open System Downloads</button>"""

        val html = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Eesha - Downloads</title>
            <link rel="icon" type="image/png" href="$logoDataUri">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #fff; color: #202124; min-height: 100vh;
                }
                .header {
                    background: #1a1a2e; color: #fff; padding: 16px 20px;
                    display: flex; align-items: center; justify-content: space-between;
                    position: sticky; top: 0; z-index: 10;
                }
                .header h1 { font-size: 18px; font-weight: 600; }
                .header-btn {
                    background: none; border: none; color: #e94560;
                    font-size: 14px; cursor: pointer; padding: 4px 8px;
                }
                .item-list { padding: 8px 0; }
                .item {
                    display: flex; align-items: center; padding: 12px 20px;
                    border-bottom: 1px solid #f0f0f0;
                }
                .item:active { background: #f5f5f5; }
                .item-info { flex: 1; min-width: 0; }
                .item-title { font-size: 15px; color: #202124; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .item-url { font-size: 12px; color: #9aa0a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
                .item-date { font-size: 11px; color: #c0c0c0; margin-top: 2px; }
                .item-actions { margin-left: 12px; flex-shrink: 0; }
                .btn-delete {
                    background: none; border: none; color: #e94560;
                    font-size: 18px; cursor: pointer; padding: 8px;
                    border-radius: 50%; width: 36px; height: 36px;
                }
                .btn-delete:active { background: #fce4ec; }
                .empty {
                    text-align: center; padding: 60px 20px;
                    color: #9aa0a6; font-size: 15px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📥 Downloads</h1>
                $openSystemBtn
            </div>
            <div class="item-list">
                $emptyState
                $downloadItems
            </div>
            <script>
                function deleteDownload(index) {
                    location.href = 'eesha://delete-download/' + index;
                }
                function openSystemDownloads() {
                    location.href = 'eesha://open-system-downloads';
                }
            </script>
        </body>
        </html>
        """.trimIndent()

        webView.loadDataWithBaseURL("eesha://downloads", html, "text/html", "UTF-8", null)
    }

    private fun escapeHtml(text: String): String {
        return text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;")
    }

    private fun handleEeshaProtocol(url: String) {
        when {
            url == "eesha://newtab" -> loadEeshaNewTab()
            url.startsWith("eesha://search") -> loadInternalPage(url) // Redirects to SearXNG
            url == "eesha://bookmarks" -> loadBookmarksPage()
            url == "eesha://history" -> loadHistoryPage()
            url == "eesha://downloads" -> loadDownloadsPage()
            url.startsWith("eesha://delete-bookmark/") -> {
                val index = url.removePrefix("eesha://delete-bookmark/").toIntOrNull()
                if (index != null && index in bookmarks.indices) {
                    bookmarks.removeAt(index)
                    saveBookmarksToFile()
                }
                loadBookmarksPage()
            }
            url.startsWith("eesha://delete-history/") -> {
                val index = url.removePrefix("eesha://delete-history/").toIntOrNull()
                if (index != null && index in history.indices) {
                    history.removeAt(index)
                    saveHistoryToFile()
                }
                loadHistoryPage()
            }
            url == "eesha://clear-history" -> {
                history.clear()
                saveHistoryToFile()
                loadHistoryPage()
            }
            url.startsWith("eesha://delete-download/") -> {
                val index = url.removePrefix("eesha://delete-download/").toIntOrNull()
                if (index != null && index in downloadsList.indices) {
                    downloadsList.removeAt(index)
                    saveDownloadsList()
                }
                loadDownloadsPage()
            }
            url == "eesha://open-system-downloads" -> {
                openSystemDownloads()
            }
        }
    }

    private fun updateBookmarkButton() {
        // Bookmark button is now in the overflow menu - no visual button to update
    }

    private fun updateBlockedCount() {
        val tab = getActiveTab()
        val count = tab?.blockedCount ?: blockedCount
        if (count > 0 && prefs.getBoolean("ad_blocking_enabled", true)) {
            blockedCountText.isVisible = true
            blockedCountText.text = "🛡 $count blocked"
        } else {
            blockedCountText.isVisible = false
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Bookmarks persistence
    // ─────────────────────────────────────────────────────────────────────
    private fun loadBookmarksFromFile() {
        try {
            val file = File(filesDir, "bookmarks.json")
            if (file.exists()) {
                val json = file.readText()
                val arr = JSONArray(json)
                bookmarks = (0 until arr.length()).map { i ->
                    val obj = arr.getJSONObject(i)
                    BookmarkEntry(
                        title = obj.getString("title"),
                        url = obj.getString("url"),
                        timestamp = obj.getLong("timestamp")
                    )
                }.toMutableList()
            }
        } catch (e: Exception) {
            bookmarks = mutableListOf()
        }
    }

    private fun saveBookmarksToFile() {
        try {
            val arr = JSONArray()
            bookmarks.forEach { b ->
                val obj = JSONObject()
                obj.put("title", b.title)
                obj.put("url", b.url)
                obj.put("timestamp", b.timestamp)
                arr.put(obj)
            }
            val file = File(filesDir, "bookmarks.json")
            file.writeText(arr.toString())
        } catch (e: Exception) { /* silently fail */ }
    }

    // ─────────────────────────────────────────────────────────────────────
    // History persistence
    // ─────────────────────────────────────────────────────────────────────
    private fun loadHistoryFromFile() {
        if (isPrivateMode) return // Don't load history in private mode
        try {
            val file = File(filesDir, "history.json")
            if (file.exists()) {
                val json = file.readText()
                val arr = JSONArray(json)
                history = (0 until arr.length()).map { i ->
                    val obj = arr.getJSONObject(i)
                    HistoryEntry(
                        title = obj.getString("title"),
                        url = obj.getString("url"),
                        timestamp = obj.getLong("timestamp")
                    )
                }.toMutableList()
            }
        } catch (e: Exception) {
            history = mutableListOf()
        }
    }

    private fun saveHistoryToFile() {
        if (isPrivateMode) return // Don't save history in private mode
        try {
            val arr = JSONArray()
            // Keep only last 500 entries
            val toSave = history.takeLast(500)
            toSave.forEach { h ->
                val obj = JSONObject()
                obj.put("title", h.title)
                obj.put("url", h.url)
                obj.put("timestamp", h.timestamp)
                arr.put(obj)
            }
            val file = File(filesDir, "history.json")
            file.writeText(arr.toString())
        } catch (e: Exception) { /* silently fail */ }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        // Close floating menu popup if touching outside of it
        if (isMenuPopupVisible && ev.action == MotionEvent.ACTION_DOWN) {
            val popupLocation = IntArray(2)
            floatingMenuPopup.getLocationOnScreen(popupLocation)
            val popupRect = android.graphics.Rect(
                popupLocation[0], popupLocation[1],
                popupLocation[0] + floatingMenuPopup.width,
                popupLocation[1] + floatingMenuPopup.height
            )
            val fabLocation = IntArray(2)
            floatingMenuBtn.getLocationOnScreen(fabLocation)
            val fabRect = android.graphics.Rect(
                fabLocation[0], fabLocation[1],
                fabLocation[0] + floatingMenuBtn.width,
                fabLocation[1] + floatingMenuBtn.height
            )
            val touchX = ev.rawX.toInt()
            val touchY = ev.rawY.toInt()
            if (!popupRect.contains(touchX, touchY) && !fabRect.contains(touchX, touchY)) {
                hideFloatingMenuPopup()
            }
        }
        return super.dispatchTouchEvent(ev)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            // If floating menu popup is visible, close it first
            if (isMenuPopupVisible) {
                hideFloatingMenuPopup()
                return true
            }
            // If find bar is visible, close it first
            if (findBar.isVisible) {
                hideFindBar()
                return true
            }
            // If WebView can go back, go back
            if (webView.canGoBack()) {
                webView.goBack()
                return true
            }
            // If there are multiple tabs, close current tab
            if (tabsList.size > 1) {
                closeTab(activeTabId)
                return true
            }
            // Last tab - let system handle (minimize app)
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        // Refresh search engine from prefs in case it changed
        currentSearchEngine = prefs.getString("search_engine", "eesha") ?: "eesha"

        // Re-apply immersive mode (status bar can reappear after leaving the app)
        applyImmersiveMode()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Re-apply immersive mode every time the window gains focus.
        // The status bar can reappear after: dialogs, Settings activity,
        // tab switcher, permission prompts, or any system UI interaction.
        if (hasFocus) {
            applyImmersiveMode()
        }
    }

    private fun applyImmersiveMode() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val controller = window.insetsController
                controller?.hide(WindowInsetsCompat.Type.statusBars())
                controller?.systemBarsBehavior =
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } else {
                @Suppress("DEPRECATION")
                window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
                // Also use sticky immersive mode via decorView for pre-R
                window.decorView.systemUiVisibility = (
                    android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                    or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
            }
        } catch (e: Exception) {
            // Immersive mode failure should not crash
            try {
                window.statusBarColor = android.graphics.Color.TRANSPARENT
            } catch (_: Exception) {}
        }
    }

    override fun onPause() {
        // Pause all WebViews
        tabsList.forEach { it.webView.onPause() }
        super.onPause()
    }

    override fun onDestroy() {
        // Unregister download receiver
        downloadCompleteReceiver?.let {
            try {
                unregisterReceiver(it)
            } catch (e: Exception) { /* already unregistered */ }
        }

        if (isPrivateMode) {
            // Clear all private data
            CookieManager.getInstance().removeAllCookies(null)
            tabsList.forEach { tab ->
                tab.webView.clearCache(true)
                tab.webView.clearHistory()
                tab.webView.clearFormData()
            }
            WebStorage.getInstance().deleteAllData()
        }

        // Destroy all WebViews
        tabsList.forEach { tab ->
            try {
                tab.webView.destroy()
            } catch (e: Exception) { /* already destroyed */ }
        }
        tabsList.clear()

        super.onDestroy()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_RUNNING_LOW) {
            // Clear WebView caches for all tabs
            tabsList.forEach { tab ->
                try { tab.webView.clearCache(false) } catch (_: Exception) {}
            }
        }
        if (level >= TRIM_MEMORY_MODERATE) {
            // Release favicon bitmaps
            tabsList.forEach { tab ->
                tab.favicon = null
            }
            // Clear WebView caches aggressively
            tabsList.forEach { tab ->
                try { tab.webView.clearCache(true) } catch (_: Exception) {}
            }
        }
        if (level >= TRIM_MEMORY_COMPLETE) {
            // Critical: destroy background tabs to save memory
            val activeTab = tabsList.find { it.id == activeTabId }
            val backgroundTabs = tabsList.filter { it.id != activeTabId }
            backgroundTabs.forEach { tab ->
                try {
                    tab.webView.loadUrl("about:blank")
                    tab.favicon = null
                } catch (_: Exception) {}
            }
        }
    }

    override fun onLowMemory() {
        super.onLowMemory()
        // Clear all WebView caches
        tabsList.forEach { tab ->
            try { tab.webView.clearCache(true) } catch (_: Exception) {}
            tab.favicon = null
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Custom WebViewClient with ad blocking, HTTPS upgrade, JS injection
    // ─────────────────────────────────────────────────────────────────────
    inner class EeshaWebViewClient : WebViewClient() {
        override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
            if (error == null || handler == null) return

            val errorCode = when (error.primaryError) {
                SslError.SSL_IDMISMATCH -> "SSL ID Mismatch"
                SslError.SSL_UNTRUSTED -> "Untrusted SSL Certificate"
                SslError.SSL_DATE_INVALID -> "SSL Certificate Date Invalid"
                SslError.SSL_EXPIRED -> "SSL Certificate Expired"
                SslError.SSL_NOTYETVALID -> "SSL Certificate Not Yet Valid"
                SslError.SSL_INVALID -> "SSL Certificate Invalid"
                else -> "SSL Error (${error.primaryError})"
            }

            val url = error.url ?: currentPageUrl

            // Show a dialog asking the user if they want to proceed
            android.app.AlertDialog.Builder(this@EeshaBrowser)
                .setTitle("SSL Certificate Warning")
                .setMessage("The SSL certificate for this site is not trusted:\n\n$errorCode\n\nURL: $url\n\nDo you want to continue anyway?")
                .setPositiveButton("Continue Anyway") { _, _ ->
                    handler.proceed()
                }
                .setNegativeButton("Go Back") { _, _ ->
                    handler.cancel()
                }
                .setCancelable(false)
                .show()
        }

        override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
            super.onReceivedError(view, request, error)

            if (view == null || request == null || error == null) return
            // Only handle main frame errors
            if (!request.isForMainFrame) return

            val errorCode = error.errorCode
            val description = error.description?.toString() ?: "Unknown error"
            val failingUrl = request.url.toString()

            // ERROR_FAILED_SSL_HANDSHAKE = -11 (WebViewClient constant)
            // -14 = SSL protocol error (net::ERR_SSL_PROTOCOL, no named constant in WebViewClient)
            val isSslHandshakeError = errorCode == ERROR_FAILED_SSL_HANDSHAKE || errorCode == -14
            val isRenderUrl = failingUrl.contains(".onrender.com")

            if (isSslHandshakeError && isRenderUrl) {
                // Render free-tier cold start: TLS handshake fails while service wakes up
                val errorHtml = """
                    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background:#1a1a2e;color:#e0e0e0;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center;">
                    <div style="max-width:400px;">
                    <div style="font-size:48px;margin-bottom:16px;">⏳</div>
                    <h2 style="color:#e94560;margin:0 0 12px 0;">Service Waking Up</h2>
                    <p style="font-size:16px;line-height:1.5;">This site may be temporarily unavailable (waking up from sleep mode). It will retry automatically in a few seconds.</p>
                    <p style="font-size:13px;color:#888;margin-top:16px;">$failingUrl</p>
                    </div></body></html>
                """.trimIndent()
                view.loadDataWithBaseURL(failingUrl, errorHtml, "text/html", "UTF-8", null)

                // Show a brief Toast on the UI thread
                Handler(Looper.getMainLooper()).post {
                    Toast.makeText(this@EeshaBrowser, "Retrying in 5 seconds…", Toast.LENGTH_LONG).show()
                }

                // Auto-retry after 5 seconds
                Handler(Looper.getMainLooper()).postDelayed({
                    if (view.url == failingUrl || view.url.isNullOrBlank()) {
                        view.loadUrl(failingUrl)
                    }
                }, 5000)
            } else if (isSslHandshakeError) {
                // Non-Render SSL handshake error — show styled error page
                val errorHtml = """
                    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background:#1a1a2e;color:#e0e0e0;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center;">
                    <div style="max-width:400px;">
                    <div style="font-size:48px;margin-bottom:16px;">🔒</div>
                    <h2 style="color:#e94560;margin:0 0 12px 0;">SSL Connection Failed</h2>
                    <p style="font-size:16px;line-height:1.5;">The server could not complete the SSL handshake. This may be a temporary issue or a server configuration problem.</p>
                    <p style="font-size:13px;color:#888;margin-top:16px;">$failingUrl</p>
                    <button onclick="location.reload()" style="margin-top:20px;padding:10px 24px;background:#e94560;color:white;border:none;border-radius:6px;font-size:14px;cursor:pointer;">Try Again</button>
                    </div></body></html>
                """.trimIndent()
                view.loadDataWithBaseURL(failingUrl, errorHtml, "text/html", "UTF-8", null)
            } else {
                // Generic load error — show styled error page
                val errorMessage = description ?: "Unknown error"
                val errorHtml = """
                    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background:#1a1a2e;color:#e0e0e0;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center;">
                    <div style="max-width:400px;">
                    <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
                    <h2 style="color:#e94560;margin:0 0 12px 0;">Page Load Error</h2>
                    <p style="font-size:16px;line-height:1.5;">$errorMessage</p>
                    <p style="font-size:13px;color:#888;margin-top:16px;">$failingUrl</p>
                    <button onclick="location.reload()" style="margin-top:20px;padding:10px 24px;background:#e94560;color:white;border:none;border-radius:6px;font-size:14px;cursor:pointer;">Try Again</button>
                    </div></body></html>
                """.trimIndent()
                view.loadDataWithBaseURL(failingUrl, errorHtml, "text/html", "UTF-8", null)
            }
        }

        override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
            if (view == null) return false

            // Find the tab with this WebView
            val tab = tabsList.find { it.webView == view }
            if (tab != null) {
                // Close the crashed tab
                closeTab(tab.id)
            }

            // Show a Toast informing the user
            Handler(Looper.getMainLooper()).post {
                Toast.makeText(this@EeshaBrowser, "Tab crashed. A new tab has been opened.", Toast.LENGTH_LONG).show()
            }

            return true // We handled it
        }

        override fun shouldOverrideUrlLoading(
            view: WebView, request: WebResourceRequest
        ): Boolean {
            val url = request.url.toString()

            // Handle eesha:// protocol
            if (url.startsWith("eesha://")) {
                handleEeshaProtocol(url)
                return true
            }

            // Block tracking domains
            if (prefs.getBoolean("ad_blocking_enabled", true) && isBlockedUrl(url)) {
                val tab = tabsList.find { it.webView == view }
                tab?.blockedCount = (tab?.blockedCount ?: 0) + 1
                if (view == webView) {
                    blockedCount = tab?.blockedCount ?: blockedCount
                    updateBlockedCount()
                }
                return true
            }

            // HTTPS-only upgrade
            if (prefs.getBoolean("https_only_enabled", true) && url.startsWith("http://")) {
                val httpsUrl = "https://" + url.removePrefix("http://")
                view.loadUrl(httpsUrl)
                return true
            }

            return false
        }

        override fun shouldInterceptRequest(
            view: WebView, request: WebResourceRequest
        ): WebResourceResponse? {
            val url = request.url.toString()

            // Block ads and trackers at request level
            if (prefs.getBoolean("ad_blocking_enabled", true) && isBlockedUrl(url)) {
                val tab = tabsList.find { it.webView == view }
                tab?.blockedCount = (tab?.blockedCount ?: 0) + 1
                if (view == webView) {
                    blockedCount = tab?.blockedCount ?: blockedCount
                    updateBlockedCount()
                }
                return WebResourceResponse("text/plain", "UTF-8", null)
            }

            return super.shouldInterceptRequest(view, request)
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            super.onPageStarted(view, url, favicon)

            // Update modern nav bar UI
            if (view == webView) {
                updateNavButtonStates()
                if (url != null) {
                    updateSecurityIcon(url)
                }
            }

            // Always update the tab's stored URL
            val tab = tabsList.find { it.webView == view }
            if (url != null && !url.startsWith("eesha://")) {
                tab?.url = url
            }

            // ── Switch rendering mode for image-heavy pages ──
            // Android WebView has far less GPU memory than Chrome browser.
            // SearXNG images pages load 100+ images at once → GPU OOM crash.
            // Solution: use software rendering for image pages (no GPU textures),
            // and reset to NONE (default hardware-accelerated) for normal pages.
            // NOTE: LAYER_TYPE_NONE = hardware-accelerated (default). Do NOT use
            // LAYER_TYPE_HARDWARE — that forces the entire view into one GPU texture!
            if (view != null && url != null) {
                val isImagePage = url.contains("eesha-search.onrender.com/search") &&
                    url.contains("categories=images")
                if (isImagePage) {
                    view.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
                } else if (view.layerType == View.LAYER_TYPE_SOFTWARE) {
                    // Only reset if we previously set it to software
                    view.setLayerType(View.LAYER_TYPE_NONE, null)
                }
            }

            // Only update UI if this is the active tab
            if (view == webView) {
                progressBar.isVisible = true
                progressBar.progress = 0
                blockedCount = 0
                tab?.blockedCount = 0
                updateBlockedCount()

                if (url != null && !url.startsWith("eesha://")) {
                    // Show search query instead of full URL for Eesha Search results
                    if (url.contains("eesha-search.onrender.com/search")) {
                        val queryParam = Uri.parse(url).getQueryParameter("q")
                        urlBar.setText(queryParam ?: url)
                    } else {
                        urlBar.setText(url)
                    }
                    currentPageUrl = url
                }
            }
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)

            val tab = tabsList.find { it.webView == view }

            if (view == webView) {
                progressBar.isVisible = false
                swipeRefresh.isRefreshing = false

                // Update modern nav bar UI
                updateNavButtonStates()
                if (url != null) {
                    updateSecurityIcon(url)
                }

                if (url != null && !url.startsWith("eesha://")) {
                    // Show search query instead of full URL for Eesha Search results
                    if (url.contains("eesha-search.onrender.com/search")) {
                        val queryParam = Uri.parse(url).getQueryParameter("q")
                        urlBar.setText(queryParam ?: url)
                    } else {
                        urlBar.setText(url)
                    }
                    currentPageUrl = url
                    tab?.url = url

                    // Update bookmark button
                    updateBookmarkButton()

                    // Save to history (not in private mode)
                    if (!isPrivateMode) {
                        val title = view?.title ?: url
                        currentPageTitle = title
                        tab?.title = title
                        // Remove duplicate if same URL is last entry
                        if (history.isNotEmpty() && history.last().url == url) {
                            history.removeAt(history.lastIndex)
                        }
                        history.add(HistoryEntry(
                            title = title,
                            url = url,
                            timestamp = System.currentTimeMillis()
                        ))
                        // Keep only last 500
                        if (history.size > 500) {
                            history = history.takeLast(500).toMutableList()
                        }
                        saveHistoryToFile()
                    }

                    // Inject fingerprint protection JS
                    if (prefs.getBoolean("fingerprint_protection_enabled", true)) {
                        view?.evaluateJavascript(fingerprintJs, null)
                    }

                    // Inject HTTPS-only enforcement JS
                    if (prefs.getBoolean("https_only_enabled", true)) {
                        view?.evaluateJavascript(httpsOnlyJs, null)
                    }

                    // Hide SearXNG header/search bar when loading the SearXNG page directly
                    // IMPORTANT: Do NOT hide #categories — those are the General/Images/Videos tabs!
                    if (url?.contains("eesha-search.onrender.com") == true) {
                        view?.evaluateJavascript("""
                            (function(){
                                var style = document.createElement('style');
                                style.textContent = '
                                    #search_header { display: none !important; }
                                    #search_view { display: none !important; }
                                    #search_logo { display: none !important; }
                                    form#search { display: flex !important; flex-direction: column !important; }
                                    #links_on_top { display: none !important; }
                                    .search_filters { display: none !important; }
                                    .search_box { display: none !important; }
                                    #clear_search { display: none !important; }
                                    #send_search { display: none !important; }
                                    nav#links_on_top { display: none !important; }
                                    #main_results { padding-top: 0 !important; margin-top: 0 !important; }
                                    #urls { padding-top: 8px !important; }
                                    body { padding-top: 0 !important; }
                                ';
                                document.head.appendChild(style);
                            })();
                        """, null)
                    }

                    // ── SearXNG images page: inject lazy loading + off-screen image release ──
                    // This prevents OOM crash by not loading/keeping all images in memory at once.
                    // It's the same page — just adds standard loading="lazy" and evicts far off-screen images.
                    if (url?.contains("eesha-search.onrender.com/search") == true &&
                        url.contains("categories=images")) {
                        view?.evaluateJavascript("""
                            (function(){
                                // Add loading="lazy" to all images (standard HTML attribute)
                                var imgs = document.querySelectorAll('img:not([loading])');
                                for (var i = 0; i < imgs.length; i++) {
                                    imgs[i].setAttribute('loading', 'lazy');
                                }
                                // Observe images: save src to data-src when far off-screen, restore when near
                                var releaseObs = new IntersectionObserver(function(entries) {
                                    entries.forEach(function(e) {
                                        var img = e.target;
                                        if (!e.isIntersecting) {
                                            // Far off-screen: release the bitmap
                                            var src = img.src;
                                            if (src && !img.getAttribute('data-released-src')) {
                                                img.setAttribute('data-released-src', src);
                                                img.src = '';
                                            }
                                        } else {
                                            // Coming into view: restore the image
                                            var released = img.getAttribute('data-released-src');
                                            if (released && !img.src) {
                                                img.src = released;
                                                img.removeAttribute('data-released-src');
                                            }
                                        }
                                    });
                                }, { rootMargin: '800px' });
                                var allImgs = document.querySelectorAll('img');
                                for (var j = 0; j < allImgs.length; j++) {
                                    releaseObs.observe(allImgs[j]);
                                }
                            })();
                        """, null)
                    }
                }
            } else {
                // Background tab - update tab state, save history, inject JS
                if (url != null && !url.startsWith("eesha://")) {
                    tab?.url = url
                    tab?.title = view?.title ?: url

                    // Save to history for background tabs too (not in private mode)
                    if (!isPrivateMode) {
                        val title = view?.title ?: url
                        if (history.isNotEmpty() && history.last().url == url) {
                            history.removeAt(history.lastIndex)
                        }
                        history.add(HistoryEntry(
                            title = title,
                            url = url,
                            timestamp = System.currentTimeMillis()
                        ))
                        if (history.size > 500) {
                            history = history.takeLast(500).toMutableList()
                        }
                        saveHistoryToFile()
                    }

                    // Inject JS for background tabs too
                    if (prefs.getBoolean("fingerprint_protection_enabled", true)) {
                        view?.evaluateJavascript(fingerprintJs, null)
                    }
                    if (prefs.getBoolean("https_only_enabled", true)) {
                        view?.evaluateJavascript(httpsOnlyJs, null)
                    }

                    // Hide SearXNG header/search bar when loading the SearXNG page directly
                    if (url?.contains("eesha-search.onrender.com") == true) {
                        view?.evaluateJavascript("""
                            (function(){
                                var style = document.createElement('style');
                                style.textContent = '
                                    #search_header { display: none !important; }
                                    #search_view { display: none !important; }
                                    #search_logo { display: none !important; }
                                    form#search { display: flex !important; flex-direction: column !important; }
                                    #links_on_top { display: none !important; }
                                    .search_filters { display: none !important; }
                                    .search_box { display: none !important; }
                                    #clear_search { display: none !important; }
                                    #send_search { display: none !important; }
                                    nav#links_on_top { display: none !important; }
                                    #main_results { padding-top: 0 !important; margin-top: 0 !important; }
                                    #urls { padding-top: 8px !important; }
                                    body { padding-top: 0 !important; }
                                ';
                                document.head.appendChild(style);
                            })();
                        """, null)
                    }

                    // ── SearXNG images page: inject lazy loading (background tab) ──
                    if (url?.contains("eesha-search.onrender.com/search") == true &&
                        url.contains("categories=images")) {
                        view?.evaluateJavascript("""
                            (function(){
                                var imgs = document.querySelectorAll('img:not([loading])');
                                for (var i = 0; i < imgs.length; i++) {
                                    imgs[i].setAttribute('loading', 'lazy');
                                }
                                var releaseObs = new IntersectionObserver(function(entries) {
                                    entries.forEach(function(e) {
                                        var img = e.target;
                                        if (!e.isIntersecting) {
                                            var src = img.src;
                                            if (src && !img.getAttribute('data-released-src')) {
                                                img.setAttribute('data-released-src', src);
                                                img.src = '';
                                            }
                                        } else {
                                            var released = img.getAttribute('data-released-src');
                                            if (released && !img.src) {
                                                img.src = released;
                                                img.removeAttribute('data-released-src');
                                            }
                                        }
                                    });
                                }, { rootMargin: '800px' });
                                var allImgs = document.querySelectorAll('img');
                                for (var j = 0; j < allImgs.length; j++) {
                                    releaseObs.observe(allImgs[j]);
                                }
                            })();
                        """, null)
                    }
                } else if (url != null) {
                    tab?.url = url
                    tab?.title = view?.title ?: url
                }
            }
        }

        private fun isBlockedUrl(url: String): Boolean {
            if (url.startsWith("eesha://")) return false
            val lowerUrl = url.lowercase()
            return blockedDomains.any { domain ->
                lowerUrl.contains(domain) && (
                    // Match domain in host portion: check common patterns
                    lowerUrl.contains("://$domain") ||
                    lowerUrl.contains("://$domain/") ||
                    lowerUrl.contains("://$domain?") ||
                    lowerUrl.contains("://$domain#") ||
                    lowerUrl.contains("://$domain:") ||
                    lowerUrl.contains(".$domain") ||
                    lowerUrl.contains(".$domain/") ||
                    lowerUrl.contains(".$domain?") ||
                    lowerUrl.contains(".$domain#") ||
                    lowerUrl.contains(".$domain:")
                )
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Chrome client for progress, title, etc.
    // ─────────────────────────────────────────────────────────────────────
    inner class EeshaWebChromeClient : WebChromeClient() {
        override fun onProgressChanged(view: WebView?, newProgress: Int) {
            if (view == webView) {
                progressBar.progress = newProgress
                if (newProgress == 100) {
                    progressBar.isVisible = false
                }
            }
        }

        override fun onReceivedTitle(view: WebView?, title: String?) {
            super.onReceivedTitle(view, title)
            title?.let {
                val tab = tabsList.find { it.webView == view }
                tab?.title = it
                if (view == webView) {
                    currentPageTitle = it
                }
            }
        }

        override fun onReceivedIcon(view: WebView?, icon: Bitmap?) {
            super.onReceivedIcon(view, icon)
            icon?.let {
                val tab = tabsList.find { it.webView == view }
                tab?.favicon = it
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Modern UI Update Helpers
    // ─────────────────────────────────────────────────────────────────────

    private fun updateNavButtonStates() {
        btnBack.alpha = if (webView.canGoBack()) 1.0f else 0.35f
        btnForward.alpha = if (webView.canGoForward()) 1.0f else 0.35f
    }

    private fun updateSecurityIcon(url: String) {
        if (url.startsWith("https://")) {
            urlSecurityIcon.isVisible = true
            urlSecurityIcon.setImageResource(R.drawable.ic_https)
        } else {
            urlSecurityIcon.isVisible = false
        }
    }
}
