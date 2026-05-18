package acr.browser.lightning.html.homepage

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Fetches RSS news feed data from the rss2json.com API using OkHttp.
 * Runs synchronously (designed to be called on a background thread via RxJava).
 *
 * This completely decouples the homepage from any search engine.
 * SearXNG is ONLY used for actual search queries.
 */
object NewsFetcher {

    private const val TAG = "NewsFetcher"
    private const val API_BASE = "https://api.rss2json.com/v1/api.json?rss_url="
    private const val ITEMS_COUNT = 15

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()
    }

    // RSS Feed URLs by category
    private val feeds = mapOf(
        "top" to listOf(
            "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
            "https://feeds.bbci.co.uk/news/rss.xml"
        ),
        "politics" to listOf(
            "https://news.google.com/rss/topics/CAAqIggKIhxDQkFTRHdvSkwyMHZNRGxqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
            "https://feeds.bbci.co.uk/news/politics/rss.xml"
        ),
        "education" to listOf(
            "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
            "https://feeds.bbci.co.uk/news/education/rss.xml"
        ),
        "sports" to listOf(
            "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
            "https://feeds.bbci.co.uk/sport/rss.xml"
        ),
        "tech" to listOf(
            "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
            "https://feeds.bbci.co.uk/news/technology/rss.xml",
            "https://www.theverge.com/rss/index.xml"
        ),
        "business" to listOf(
            "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
            "https://feeds.bbci.co.uk/news/business/rss.xml"
        ),
        "entertainment" to listOf(
            "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
            "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml"
        ),
        "health" to listOf(
            "https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en",
            "https://feeds.bbci.co.uk/news/health/rss.xml"
        ),
        "science" to listOf(
            "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
            "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"
        )
    )

    /**
     * Fetches news for a category SYNCHRONOUSLY.
     * MUST be called on a background thread (e.g. via RxJava diskScheduler).
     * Returns a JSON string array of articles.
     */
    fun fetchCategorySync(category: String): String {
        val feedUrls = feeds[category] ?: feeds["top"] ?: emptyList()
        val allArticles = mutableListOf<JSONObject>()
        val seenTitles = mutableSetOf<String>()

        for (url in feedUrls) {
            try {
                val articles = fetchSingleFeedSync(url)
                for (article in articles) {
                    val title = article.optString("title", "")
                    if (title.length > 10 && title !in seenTitles) {
                        seenTitles.add(title)
                        allArticles.add(article)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to fetch feed: $url", e)
            }
        }

        allArticles.sortByDescending { it.optString("date", "") }
        return JSONArray(allArticles.take(20)).toString()
    }

    private fun fetchSingleFeedSync(feedUrl: String): List<JSONObject> {
        val apiUrl = API_BASE + URLEncoder.encode(feedUrl, "UTF-8") + "&count=$ITEMS_COUNT"
        val request = Request.Builder().url(apiUrl).build()

        return try {
            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: return emptyList()

            val data = JSONObject(responseBody)
            if (data.optString("status") != "ok") return emptyList()

            val items = data.optJSONArray("items") ?: return emptyList()
            val feedTitle = data.optJSONObject("feed")?.optString("title", "News") ?: "News"

            val result = mutableListOf<JSONObject>()
            for (i in 0 until items.length()) {
                val item = items.optJSONObject(i) ?: continue
                result.add(JSONObject().apply {
                    put("title", cleanHtml(item.optString("title", "")))
                    put("link", item.optString("link", ""))
                    put("source", feedTitle)
                    put("date", item.optString("pubDate", ""))
                    put("desc", cleanHtml(item.optString("description", "")))
                    put("image", extractImage(item))
                })
            }
            result
        } catch (e: Exception) {
            Log.w(TAG, "Error fetching feed: $feedUrl", e)
            emptyList()
        }
    }

    private fun extractImage(item: JSONObject): String {
        item.optString("thumbnail", "").takeIf { it.isNotEmpty() }?.let { return it }
        item.optJSONObject("enclosure")?.optString("link", "")?.takeIf { it.isNotEmpty() }?.let { return it }
        val desc = item.optString("description", "")
        if (desc.isNotEmpty()) {
            Regex("""<img[^>]+src="([^"]+)"""").find(desc)?.groupValues?.get(1)?.let { return it }
        }
        return ""
    }

    private fun cleanHtml(html: String): String = html
        .replace(Regex("<[^>]+>"), "")
        .replace("&nbsp;", " ").replace("&amp;", "&")
        .replace("&lt;", "<").replace("&gt;", ">")
        .replace("&quot;", "\"").trim()
}
