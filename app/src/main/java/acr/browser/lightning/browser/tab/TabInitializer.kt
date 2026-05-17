package acr.browser.lightning.browser.tab

import acr.browser.lightning.R
import acr.browser.lightning.browser.di.DiskScheduler
import acr.browser.lightning.browser.di.MainScheduler
import acr.browser.lightning.constant.SCHEME_BOOKMARKS
import acr.browser.lightning.constant.SCHEME_HOMEPAGE
import acr.browser.lightning.extensions.resizeAndShow
import acr.browser.lightning.html.HtmlPageFactory
import acr.browser.lightning.html.bookmark.BookmarkPageFactory
import acr.browser.lightning.html.download.DownloadPageFactory
import acr.browser.lightning.html.history.HistoryPageFactory
import acr.browser.lightning.html.homepage.HomePageFactory
import acr.browser.lightning.html.homepage.NewsBridge
import acr.browser.lightning.preference.UserPreferences
import android.app.Activity
import android.os.Bundle
import android.os.Message
import android.webkit.WebView
import androidx.appcompat.app.AlertDialog
import dagger.Reusable
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import io.reactivex.rxjava3.core.Scheduler
import io.reactivex.rxjava3.kotlin.subscribeBy
import javax.inject.Inject

/**
 * An initializer that is run on a [WebView] after it is created.
 */
interface TabInitializer {

    /**
     * Initialize the [WebView] instance held by the tab. If a url is loaded, the
     * provided [headers] should be used to load the url.
     */
    fun initialize(webView: WebView, headers: Map<String, String>)

}

/**
 * An initializer that loads a [url].
 */
class UrlInitializer(private val url: String) : TabInitializer {

    override fun initialize(webView: WebView, headers: Map<String, String>) {
        webView.loadUrl(url, headers)
    }

}

/**
 * An initializer that displays the page set as the user's homepage preference.
 */
@Reusable
class HomePageInitializer @Inject constructor(
    private val userPreferences: UserPreferences,
    private val startPageInitializer: StartPageInitializer,
    private val bookmarkPageInitializer: BookmarkPageInitializer
) : TabInitializer {

    override fun initialize(webView: WebView, headers: Map<String, String>) {
        val homepage = userPreferences.homepage

        // If homepage is set to a search engine URL, redirect to the custom news page.
        // Search engines make bad homepages — the custom homepage has search + news.
        // SearXNG should ONLY be used for searching, NOT as the homepage.
        val effectiveHomepage = if (homepage.contains("eesha-search") ||
            homepage.contains("searx") ||
            homepage.contains("google.com/search") ||
            homepage.contains("bing.com/search") ||
            homepage.contains("duckduckgo.com")
        ) {
            userPreferences.homepage = SCHEME_HOMEPAGE
            SCHEME_HOMEPAGE
        } else {
            homepage
        }

        when (effectiveHomepage) {
            SCHEME_HOMEPAGE -> startPageInitializer
            SCHEME_BOOKMARKS -> bookmarkPageInitializer
            else -> UrlInitializer(effectiveHomepage)
        }.initialize(webView, headers)
    }

}

/**
 * An initializer that displays the start page.
 *
 * IMPORTANT: The homepage is COMPLETELY INDEPENDENT of any search engine.
 * - NO base URL is used (null) — no SearXNG, no external domain
 * - News data is pre-fetched in Kotlin and injected into the HTML
 * - Category switching uses a JavaScript interface (NewsBridge) to fetch via Kotlin
 * - The historyUrl is set to "eesha://homepage" so WebView.getUrl() returns
 *   a recognizable identifier for tab state save/restore
 *
 * SearXNG is ONLY used when the user actually searches from the search bar.
 */
@Reusable
class StartPageInitializer @Inject constructor(
    private val homePageFactory: HomePageFactory,
    @DiskScheduler private val diskScheduler: Scheduler,
    @MainScheduler private val foregroundScheduler: Scheduler
) : TabInitializer {

    override fun initialize(webView: WebView, headers: Map<String, String>) {
        // Add the NewsBridge JavaScript interface BEFORE loading the page.
        // This allows JavaScript to request news data from Kotlin without
        // needing XHR/fetch (which would require a base URL for CORS).
        webView.addJavascriptInterface(NewsBridge(webView), "EeshaNews")

        homePageFactory
            .buildPage()
            .subscribeOn(diskScheduler)
            .observeOn(foregroundScheduler)
            .subscribeBy(
                onSuccess = { url ->
                    if (url.startsWith(HomePageFactory.SCHEME_DATA)) {
                        val html = url.substring(HomePageFactory.SCHEME_DATA.length)
                        // CRITICAL: Use null as baseUrl — no SearXNG, no external domain.
                        // The historyUrl is set to "eesha://homepage" so that
                        // WebView.getUrl() returns a recognizable identifier.
                        // This ensures tab state restoration loads the homepage
                        // instead of redirecting to a search engine.
                        webView.loadDataWithBaseURL(
                            null,  // NO base URL — homepage is independent of any search engine
                            html,
                            "text/html",
                            "UTF-8",
                            HomePageFactory.HOMEPAGE_HISTORY_URL  // eesha://homepage
                        )
                    } else {
                        webView.loadUrl(url, headers)
                    }
                },
                onError = { error ->
                    // Fallback: load a simple homepage if HTML processing fails
                    android.util.Log.e("StartPageInitializer", "Failed to build homepage", error)
                    val fallbackHtml = """
                        <!DOCTYPE html>
                        <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
                        <body style="font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa;color:#1a1a2e;">
                        <h2>Eesha Browser</h2>
                        <p style="color:#6b7280;margin-top:8px;">Welcome! Start browsing from the address bar above.</p>
                        </body></html>
                    """.trimIndent()
                    webView.loadDataWithBaseURL(
                        null,  // NO base URL
                        fallbackHtml,
                        "text/html",
                        "UTF-8",
                        HomePageFactory.HOMEPAGE_HISTORY_URL  // eesha://homepage
                    )
                }
            )
    }

}

/**
 * An initializer that displays the bookmark page.
 */
@Reusable
class BookmarkPageInitializer @Inject constructor(
    bookmarkPageFactory: BookmarkPageFactory,
    @DiskScheduler diskScheduler: Scheduler,
    @MainScheduler foregroundScheduler: Scheduler
) : HtmlPageFactoryInitializer(bookmarkPageFactory, diskScheduler, foregroundScheduler)

/**
 * An initializer that displays the download page.
 */
@Reusable
class DownloadPageInitializer @Inject constructor(
    downloadPageFactory: DownloadPageFactory,
    @DiskScheduler diskScheduler: Scheduler,
    @MainScheduler foregroundScheduler: Scheduler
) : HtmlPageFactoryInitializer(downloadPageFactory, diskScheduler, foregroundScheduler)

/**
 * An initializer that displays the history page.
 */
@Reusable
class HistoryPageInitializer @Inject constructor(
    historyPageFactory: HistoryPageFactory,
    @DiskScheduler diskScheduler: Scheduler,
    @MainScheduler foregroundScheduler: Scheduler
) : HtmlPageFactoryInitializer(historyPageFactory, diskScheduler, foregroundScheduler)

/**
 * An initializer that loads the url built by the [HtmlPageFactory].
 */
abstract class HtmlPageFactoryInitializer(
    private val htmlPageFactory: HtmlPageFactory,
    @DiskScheduler private val diskScheduler: Scheduler,
    @MainScheduler private val foregroundScheduler: Scheduler
) : TabInitializer {

    override fun initialize(webView: WebView, headers: Map<String, String>) {
        htmlPageFactory
            .buildPage()
            .subscribeOn(diskScheduler)
            .observeOn(foregroundScheduler)
            .subscribeBy(onSuccess = { webView.loadUrl(it, headers) })
    }

}

/**
 * An initializer that sets the [WebView] as the target of the [resultMessage]. Used for
 * `target="_blank"` links.
 */
class ResultMessageInitializer(private val resultMessage: Message) : TabInitializer {

    override fun initialize(webView: WebView, headers: Map<String, String>) {
        resultMessage.apply {
            (obj as WebView.WebViewTransport).webView = webView
        }.sendToTarget()
    }

}

/**
 * An initializer that restores the [WebView] state using the [bundle].
 */
open class BundleInitializer(private val bundle: Bundle) : TabInitializer {

    override fun initialize(webView: WebView, headers: Map<String, String>) {
        webView.restoreState(bundle)
    }

}

/**
 * An initializer that can be delayed until the view is attached. [initialTitle] is the title that
 * should be initially set on the tab.
 */
class FreezableBundleInitializer(
    val bundle: Bundle,
    val initialTitle: String,
    val id: Int
) : BundleInitializer(bundle)

/**
 * An initializer that does not load anything into the [WebView].
 */
class NoOpInitializer : TabInitializer {

    override fun initialize(webView: WebView, headers: Map<String, String>) = Unit

}

/**
 * Ask the user's permission before loading the [url] and load the homepage instead if they deny
 * permission. Useful for scenarios where another app may attempt to open a malicious URL in the
 * browser via an intent.
 */
class PermissionInitializer @AssistedInject constructor(
    @Assisted private val url: String,
    private val activity: Activity,
    private val homePageInitializer: HomePageInitializer
) : TabInitializer {

    override fun initialize(webView: WebView, headers: Map<String, String>) {
        AlertDialog.Builder(activity).apply {
            setTitle(R.string.title_warning)
            setMessage(R.string.message_blocked_local)
            setCancelable(false)
            setOnDismissListener {
                homePageInitializer.initialize(webView, headers)
            }
            setNegativeButton(android.R.string.cancel, null)
            setPositiveButton(R.string.action_open) { _, _ ->
                UrlInitializer(url).initialize(webView, headers)
            }
        }.resizeAndShow()
    }

    /**
     * The factory for constructing the permission initializer.
     */
    @AssistedFactory
    interface Factory {

        /**
         * Creates the initializer.
         */
        fun create(url: String): PermissionInitializer

    }

}
