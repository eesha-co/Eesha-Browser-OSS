package acr.browser.lightning.html.homepage

import acr.browser.lightning.R
import acr.browser.lightning.browser.theme.ThemeProvider
import acr.browser.lightning.constant.FILE
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
import java.io.File
import java.io.FileWriter
import javax.inject.Inject

/**
 * A factory for the home page.
 *
 * Uses the original Lightning Browser approach: build HTML, write to file on disk,
 * load via file:// URL. This is production-ready and works with WebView's URL
 * handling, JavaScript interfaces, and the browser's URL bar display logic.
 *
 * News data for "For You" is pre-fetched in Kotlin and injected into the HTML,
 * so the initial category always has content. Other categories use the
 * NewsBridge JavaScript interface.
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
            try {
                NewsFetcher.fetchCategorySync("top")
            } catch (e: Exception) {
                Log.w("HomePageFactory", "Failed to pre-fetch news", e)
                "[]"
            }
        }
        .map { newsData ->
            val (iconUrl, queryUrl, _) = searchEngineProvider.provideSearchEngine()
            val content = parse(homePageReader.provideHtml()) andBuild {
                title { title }
                style { content ->
                    content.replace("--body-bg: {COLOR}", "--body-bg: #$backgroundColor;")
                        .replace("--card-bg: {COLOR}", "--card-bg: #$cardColor;")
                        .replace("--text-primary: {COLOR}", "--text-primary: #$textColor;")
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
            // Write HTML to file (like original Lightning Browser)
            val page = createHomePage()
            FileWriter(page, false).use { it.write(content) }
            "$FILE$page"
        }

    /**
     * Create the home page file.
     */
    fun createHomePage(): File {
        val generatedHtml = File(application.filesDir, "generated-html")
        generatedHtml.mkdirs()
        return File(generatedHtml, FILENAME)
    }

    companion object {
        const val FILENAME = "homepage.html"
    }
}
