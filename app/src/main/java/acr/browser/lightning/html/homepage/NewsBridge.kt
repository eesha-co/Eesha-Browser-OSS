package acr.browser.lightning.html.homepage

import android.webkit.WebView
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * A JavaScript interface that allows the homepage HTML to fetch news data
 * from Kotlin (instead of using XHR/fetch which requires a base URL).
 *
 * This completely decouples the homepage from any search engine.
 * SearXNG is ONLY used for actual search queries.
 */
class NewsBridge(private val webView: WebView) {

    companion object {
        private const val TAG = "NewsBridge"
    }

    /**
     * Called from JavaScript to fetch news for a specific category.
     * The result is delivered via a callback: window.__onNewsData(category, jsonString)
     */
    @android.webkit.JavascriptInterface
    fun fetchCategory(category: String) {
        Log.d(TAG, "Fetching news for category: $category")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val jsonData = NewsFetcher.fetchCategory(category)
                val escapedCategory = category.replace("'", "\\'")
                    .replace("\"", "\\\"")
                    .replace("\n", "")
                    .replace("\r", "")

                // Call back into JavaScript on the UI thread
                webView.post {
                    val js = "if(window.__onNewsData)window.__onNewsData('$escapedCategory',$jsonData);"
                    webView.evaluateJavascript(js, null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to fetch category: $category", e)
                webView.post {
                    val escapedCategory = category.replace("'", "\\'")
                        .replace("\"", "\\\"")
                    val js = "if(window.__onNewsError)window.__onNewsError('$escapedCategory');"
                    webView.evaluateJavascript(js, null)
                }
            }
        }
    }
}
