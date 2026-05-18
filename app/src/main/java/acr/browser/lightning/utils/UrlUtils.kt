/*
 * Copyright (C) 2010 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
@file:JvmName("UrlUtils")

package acr.browser.lightning.utils

import acr.browser.lightning.constant.FILE
import acr.browser.lightning.html.bookmark.BookmarkPageFactory
import acr.browser.lightning.html.download.DownloadPageFactory
import acr.browser.lightning.html.history.HistoryPageFactory
import acr.browser.lightning.html.homepage.HomePageFactory
import android.util.Patterns
import android.webkit.URLUtil
import java.util.Locale
import java.util.regex.Pattern

/**
 * Attempts to determine whether user input is a URL or search terms.  Anything with a space is
 * passed to search if [canBeSearch] is true.
 *
 * Converts to lowercase any mistakenly upper-cased scheme (i.e., "Http://" converts to
 * "http://")
 *
 * @param canBeSearch if true, will return a search url if it isn't a valid  URL. If false,
 * invalid URLs will return null.
 * @return original or modified URL.
 */
fun smartUrlFilter(url: String, canBeSearch: Boolean, searchUrl: String): String {
    var inUrl = url.trim()
    val hasSpace = inUrl.contains(' ')
    val matcher = ACCEPTED_URI_SCHEMA.matcher(inUrl)
    if (matcher.matches()) {
        // force scheme to lowercase
        val scheme = requireNotNull(matcher.group(1)) { "matches() implies this is non null" }
        val lcScheme = scheme.lowercase(Locale.getDefault())
        if (lcScheme != scheme) {
            inUrl = lcScheme + matcher.group(2)
        }
        if (hasSpace && Patterns.WEB_URL.matcher(inUrl).matches()) {
            inUrl = inUrl.replace(" ", URL_ENCODED_SPACE)
        }
        return inUrl
    }
    if (!hasSpace) {
        if (Patterns.WEB_URL.matcher(inUrl).matches()) {
            return URLUtil.guessUrl(inUrl)
        }
    }

    return if (canBeSearch) {
        URLUtil.composeSearchUrl(inUrl, searchUrl, QUERY_PLACE_HOLDER)
    } else {
        ""
    }
}

/**
 * True if the URL is a file URL, false otherwise.
 */
fun String?.isFileUrl(): Boolean = this != null && this.startsWith(FILE)

/**
 * Returns whether the given url is a special (internal) page or a normal website.
 * Also recognizes the eesha://homepage custom scheme.
 */
fun String?.isSpecialUrl(): Boolean =
    this != null
        && (this.startsWith(FILE)
        && (this.endsWith(BookmarkPageFactory.FILENAME)
        || this.endsWith(DownloadPageFactory.FILENAME)
        || this.endsWith(HistoryPageFactory.FILENAME)
        || this.endsWith(HomePageFactory.FILENAME))
        || this == HomePageFactory.HOMEPAGE_URL)

/**
 * Determines if the url is a url for the bookmark page.
 */
fun String?.isBookmarkUrl(): Boolean =
    this != null && this.startsWith(FILE) && this.endsWith(BookmarkPageFactory.FILENAME)

/**
 * Determines if the url is a url for the downloads page.
 */
fun String?.isDownloadsUrl(): Boolean =
    this != null && this.startsWith(FILE) && this.endsWith(DownloadPageFactory.FILENAME)

/**
 * Determines if the url is a url for the history page.
 */
fun String?.isHistoryUrl(): Boolean =
    this != null && this.startsWith(FILE) && this.endsWith(HistoryPageFactory.FILENAME)

/**
 * Determines if the url is a url for the start page / homepage.
 * Recognizes both the file:// based URL and the eesha://homepage custom scheme.
 */
fun String?.isStartPageUrl(): Boolean =
    this != null && (this.startsWith(FILE) && this.endsWith(HomePageFactory.FILENAME)
        || this == HomePageFactory.HOMEPAGE_URL)

/**
 * Extracts the search query from a search engine URL.
 * For example: "https://eesha-search.onrender.com/search?q=cats" → "cats"
 * Returns null if the URL is not a search engine URL or has no query.
 */
fun String?.extractSearchQuery(): String? {
    if (this == null) return null
    // Match common search URL patterns: ?q=, ?query=, ?s=, ?search=
    val patterns = listOf(
        Regex("""[?&]q=([^&]+)""", RegexOption.IGNORE_CASE),
        Regex("""[?&]query=([^&]+)""", RegexOption.IGNORE_CASE),
        Regex("""[?&]s=([^&]+)""", RegexOption.IGNORE_CASE),
        Regex("""[?&]search=([^&]+)""", RegexOption.IGNORE_CASE)
    )
    for (pattern in patterns) {
        pattern.find(this)?.groupValues?.get(1)?.let { encoded ->
            return java.net.URLDecoder.decode(encoded, "UTF-8")
        }
    }
    return null
}

/**
 * Checks if a URL is a search engine results page.
 */
fun String?.isSearchResultsUrl(): Boolean =
    this != null && extractSearchQuery() != null

private val ACCEPTED_URI_SCHEMA =
    Pattern.compile("(?i)((?:http|https|file)://|(?:inline|data|about|javascript):|(?:.*:.*@))(.*)")
const val QUERY_PLACE_HOLDER = "%s"
private const val URL_ENCODED_SPACE = "%20"
