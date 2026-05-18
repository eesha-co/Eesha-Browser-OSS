package acr.browser.lightning.html.homepage

import android.webkit.WebView
import android.util.Log
import io.reactivex.rxjava3.core.Scheduler
import io.reactivex.rxjava3.kotlin.subscribeBy

/**
 * JavaScript interface that allows the homepage HTML to fetch news data
 * from Kotlin (instead of using XHR/fetch which would need a base URL).
 *
 * This completely decouples the homepage from any search engine.
 * SearXNG is ONLY used for actual search queries.
 */
class NewsBridge(
    private val webView: WebView,
    private val diskScheduler: Scheduler
) {

    companion object {
        private const val TAG = "NewsBridge"
    }

    /**
     * Called from JavaScript to fetch news for a category.
     * Result delivered via callback: window.__onNewsData(category, jsonString)
     */
    @android.webkit.JavascriptInterface
    fun fetchCategory(category: String) {
        Log.d(TAG, "Fetching news for category: $category")
        io.reactivex.rxjava3.core.Single
            .fromCallable { NewsFetcher.fetchCategorySync(category) }
            .subscribeOn(diskScheduler)
            .subscribeBy(
                onSuccess = { jsonData ->
                    val escapedCategory = category.replace("'", "\\'")
                    webView.post {
                        val js = "if(window.__onNewsData)window.__onNewsData('$escapedCategory',$jsonData);"
                        webView.evaluateJavascript(js, null)
                    }
                },
                onError = { error ->
                    Log.e(TAG, "Failed to fetch category: $category", error)
                    val escapedCategory = category.replace("'", "\\'")
                    webView.post {
                        val js = "if(window.__onNewsError)window.__onNewsError('$escapedCategory');"
                        webView.evaluateJavascript(js, null)
                    }
                }
            )
    }
}
