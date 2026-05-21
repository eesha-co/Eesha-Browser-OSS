import Foundation
import WebKit

/**
 * Eesha Browser - Content Blocker
 *
 * Converts the comprehensive blocked-domains.json into native WKContentRuleList format.
 * Uses iOS's built-in content blocking API for efficient, privacy-preserving ad/tracker blocking.
 *
 * Categories loaded from shared/security/blocked-domains.json:
 * - ad_networks, tracking, fingerprinting, malware_phishing, social_tracking, telemetry
 */

class ContentBlocker {

    static let shared = ContentBlocker()
    private let ruleListIdentifier = "org.eesha.contentblocker"

    private init() {}

    // MARK: - Compile Content Rule List

    /// Compiles all blocked domains into a WKContentRuleList and applies it to a WKWebView
    func compileAndApply(to webView: WKWebView, completion: @escaping (Bool) -> Void) {
        let ruleListStore = WKContentRuleListStore.default()

        // First, try to remove any existing rule list
        ruleListStore.removeContentRuleList(forIdentifier: ruleListIdentifier) { [weak self] error in
            guard let self = self else { return }
            self.compileNewRuleList(store: ruleListStore, webView: webView, completion: completion)
        }
    }

    private func compileNewRuleList(store: WKContentRuleListStore, webView: WKWebView,
                                     completion: @escaping (Bool) -> Void) {
        let encodedRules = generateRuleListJSON()

        store.compileContentRuleList(forIdentifier: ruleListIdentifier,
                                     encodedContentRuleList: encodedRules) { ruleList, error in
            if let error = error {
                print("[ContentBlocker] Failed to compile rule list: \(error.localizedDescription)")
                completion(false)
                return
            }

            guard let ruleList = ruleList else {
                print("[ContentBlocker] Rule list is nil after compilation")
                completion(false)
                return
            }

            webView.configuration.userContentController.removeAllContentRuleLists()
            webView.configuration.userContentController.addContentRuleList(ruleList)
            print("[ContentBlocker] Successfully applied content rule list")
            completion(true)
        }
    }

    /// Remove content rule list from a web view (when ad blocking is disabled)
    func removeFrom(webView: WKWebView) {
        let ruleListStore = WKContentRuleListStore.default()
        ruleListStore.removeContentRuleList(forIdentifier: ruleListIdentifier) { _ in
            webView.configuration.userContentController.removeAllContentRuleLists()
            print("[ContentBlocker] Removed content rule list")
        }
    }

    // MARK: - Generate Rule List JSON

    /// Generates WKContentRuleList JSON from the blocked domains
    func generateRuleListJSON() -> String {
        var rules: [[String: Any]] = []

        // All domain categories from blocked-domains.json
        let allDomains = getAllBlockedDomains()

        // Group domains into batches for efficiency (WKContentRuleList has limits)
        // Each rule can have multiple if-domain entries
        let batchSize = 50
        let domainBatches = stride(from: 0, to: allDomains.count, by: batchSize).map {
            Array(allDomains[$0..<min($0 + batchSize, allDomains.count)])
        }

        for batch in domainBatches {
            let ifDomains = batch.map { "*\($0)" }

            let rule: [String: Any] = [
                "trigger": [
                    "url-filter": ".*",
                    "if-domain": ifDomains
                ],
                "action": [
                    "type": "block"
                ]
            ]
            rules.append(rule)
        }

        // Also block common ad/tracking URL patterns regardless of domain
        let urlPatternRules = generateURLPatternRules()
        rules.append(contentsOf: urlPatternRules)

        // Convert to JSON
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: rules, options: [])
            return String(data: jsonData, encoding: .utf8) ?? "[]"
        } catch {
            print("[ContentBlocker] Failed to serialize rules: \(error)")
            return "[]"
        }
    }

    // MARK: - Blocked Domains from JSON

    /// Returns all blocked domains from the comprehensive blocklist
    private func getAllBlockedDomains() -> [String] {
        // Load from the bundled blocked-domains.json
        var domains: [String] = []

        if let url = Bundle.main.url(forResource: "blocked-domains", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let categories = json["categories"] as? [String: Any] {

            for (_, categoryDomains) in categories {
                if let domainList = categoryDomains as? [String] {
                    domains.append(contentsOf: domainList)
                }
            }
        }

        // Fallback: hardcoded comprehensive list if JSON not found
        if domains.isEmpty {
            domains = getFallbackDomains()
        }

        // Deduplicate
        return Array(Set(domains)).sorted()
    }

    /// Fallback domain list if blocked-domains.json is not bundled
    private func getFallbackDomains() -> [String] {
        return [
            // Ad Networks
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

            // Tracking
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

            // Fingerprinting
            "fpjs.io", "fpcollect.com", "botd.dev",
            "fingerprintjs.com", "fingerprintjs.pro",
            "fpedge.net", "deviceatlas.com", "px-cdn.net",
            "perimeterx.net", "perimeterx.com", "arcsin.io",
            "arking.com", "iovation.com", "threatmetrix.com",
            "threatmetrix.net", "lexisnexisrisk.com",
            "biocatch.com", "nuance.com", "h-captcha.com",
            "kasada.io", "imperva.com", "incapsula.com",
            "distilnetworks.com", "distil.it",

            // Malware/Crypto Mining
            "coinhive.com", "coin-hive.com", "jsecoin.com",
            "crypto-loot.com", "minero.cc", "webminepool.com",
            "coinerra.com", "cryptoloot.pro", "coinhave.com",
            "deepminer.com", "webmine.cz", "authedmine.com",
            "cashbeet.com", "bewaslac.com", "pushstack.com",
            "realtimecampaign.com", "blastbomber.com",
            "highstakesdb.com", "redichat.com", "actons.com",
            "adnami.co", "adnami.io",
            "fontsprod.com", "grmtech.com"
        ]
    }

    // MARK: - URL Pattern Rules

    /// Additional URL pattern-based blocking rules (not domain-specific)
    private func generateURLPatternRules() -> [[String: Any]] {
        var rules: [[String: Any]] = []

        // Block common ad/tracking URL patterns
        let urlPatterns = [
            // Tracking pixels and beacons
            "^https?://.*/(pixel|beacon|tracking|track|hit)\\.(gif|png|jpg|json)",
            // Common ad serving paths
            "^https?://.*/(ads|ad|advert|adv)/.*",
            // Analytics endpoints
            "^https?://.*/(analytics|ga|gtag|gtm)/.*",
            // Social sharing/tracking widgets
            "^https?://.*/(share|social|widget)\\.(js|json)",
            // Fingerprinting scripts
            "^https?://.*/(fingerprint|fp|fpjs)\\.(js|json)"
        ]

        for pattern in urlPatterns {
            let rule: [String: Any] = [
                "trigger": [
                    "url-filter": pattern,
                    "resource-type": ["script", "image", "raw", "media"]
                ],
                "action": [
                    "type": "block"
                ]
            ]
            rules.append(rule)
        }

        // Block popup/popunder scripts
        let popupRule: [String: Any] = [
            "trigger": [
                "url-filter": "^https?://.*/(popunder|popup|pop)\\.(js|html)",
                "resource-type": ["script"]
            ],
            "action": [
                "type": "block"
            ]
        ]
        rules.append(popupRule)

        // Note: WKContentRuleList doesn't support URL query parameter stripping,
        // so tracking parameters like utm_source, fbclid, etc. cannot be removed
        // via content blockers. They would need to be handled at the network level.

        return rules
    }

    // MARK: - Blocked Count Tracking

    /// Count of blocked requests (tracked via WKContentRuleList statistics)
    private var _blockedCount: Int = 0
    var blockedCount: Int {
        return _blockedCount
    }

    func incrementBlockedCount() {
        _blockedCount += 1
    }

    func resetBlockedCount() {
        _blockedCount = 0
    }
}
