package acr.browser.lightning.html.homepage

import acr.browser.lightning.R
import acr.browser.lightning.browser.theme.ThemeProvider
import acr.browser.lightning.constant.UTF8
import acr.browser.lightning.html.HtmlPageFactory
import acr.browser.lightning.html.jsoup.andBuild
import acr.browser.lightning.html.jsoup.body
import acr.browser.lightning.html.jsoup.charset
import acr.browser.lightning.html.jsoup.id
import acr.browser.lightning.html.jsoup.parse
import acr.browser.lightning.html.jsoup.style
import acr.browser.lightning.html.jsoup.tag
import acr.browser.lightning.html.jsoup.title
import acr.browser.lightning.search.SearchEngineProvider
import android.app.Application
import android.util.Log
import io.reactivex.rxjava3.core.Single
import javax.inject.Inject

/**
 * A factory for the home page.
 *
 * News data is pre-fetched in Kotlin (not JavaScript XHR) to completely
 * decouple the homepage from any search engine. SearXNG is ONLY used
 * for actual search queries.
 */
class HomePageFactory @Inject constructor(
    private val application: Application,
    private val searchEngineProvider: SearchEngineProvider,
    private val homePageReader: HomePageReader,
    private val themeProvider: ThemeProvider
) : HtmlPageFactory {

    private val title = application.getString(R.string.home)

    private fun Int.toColor(): String {
        val string = Integer.toHexString(this)
        return string.substring(2) + string.substring(0, 2)
    }

    private val backgroundColor: String
        get() = themeProvider.color(R.attr.colorPrimary).toColor()
    private val cardColor: String
        get() = themeProvider.color(R.attr.autoCompleteBackgroundColor).toColor()
    private val textColor: String
        get() = themeProvider.color(R.attr.autoCompleteTitleColor).toColor()

    override fun buildPage(): Single<String> = Single
        .fromCallable {
            // Fetch "For You" news synchronously on the disk scheduler thread.
            // This avoids XHR/fetch in JavaScript which would need a base URL for CORS.
            // No SearXNG involved at all — news data comes from rss2json.com API.
            try {
                NewsFetcher.fetchCategorySync("top")
            } catch (e: Exception) {
                Log.w("HomePageFactory", "Failed to pre-fetch news", e)
                "[]"
            }
        }
        .map { newsData ->
            val (iconUrl, queryUrl, _) = searchEngineProvider.provideSearchEngine()
            parse(homePageReader.provideHtml()) andBuild {
                title { title }
                style { content ->
                    content.replace("--body-bg: {COLOR}", "--body-bg: #$backgroundColor;")
                        .replace("--box-bg: {COLOR}", "--box-bg: #$cardColor;")
                        .replace("--box-txt: {COLOR}", "--box-txt: #$textColor;")
                }
                charset { UTF8 }
                body {
                    // Set search engine icon if the element exists
                    try {
                        id("image_url") { attr("src", iconUrl) }
                    } catch (_: Exception) {
                        // Element doesn't exist in this HTML template, skip
                    }
                    tag("script") {
                        html(
                            html()
                                .replace("\${BASE_URL}", queryUrl)
                                .replace("\${NEWS_DATA}", newsData)
                                .replace("&", "\\u0026")
                        )
                    }
                }
            }
        }
        .map { content -> SCHEME_DATA + content }

    companion object {

        const val FILENAME = "homepage.html"
        const val SCHEME_DATA = "data:eesha-homepage,"

        /**
         * The historyUrl used with loadDataWithBaseURL.
         * This is what WebView.getUrl() returns.
         * It identifies the page as the Eesha homepage — NOT any search engine.
         */
        const val HOMEPAGE_URL = "eesha://homepage"

    }

}
