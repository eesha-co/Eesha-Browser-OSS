package acr.browser.lightning.browser.tab.bundle

import acr.browser.lightning.R
import acr.browser.lightning.browser.di.DiskScheduler
import acr.browser.lightning.browser.tab.BookmarkPageInitializer
import acr.browser.lightning.browser.tab.DownloadPageInitializer
import acr.browser.lightning.browser.tab.FreezableBundleInitializer
import acr.browser.lightning.browser.tab.HistoryPageInitializer
import acr.browser.lightning.browser.tab.HomePageInitializer
import acr.browser.lightning.browser.tab.TabInitializer
import acr.browser.lightning.browser.tab.TabModel
import acr.browser.lightning.utils.FileUtils
import acr.browser.lightning.utils.isBookmarkUrl
import acr.browser.lightning.utils.isDownloadsUrl
import acr.browser.lightning.utils.isHistoryUrl
import acr.browser.lightning.utils.isSpecialUrl
import acr.browser.lightning.utils.isStartPageUrl
import android.app.Application
import android.os.Bundle
import io.reactivex.rxjava3.core.Scheduler
import javax.inject.Inject

/**
 * A bundle store that serializes each tab state to disk and supports its retrieval.
 */
class DefaultBundleStore @Inject constructor(
    private val application: Application,
    private val bookmarkPageInitializer: BookmarkPageInitializer,
    private val homePageInitializer: HomePageInitializer,
    private val downloadPageInitializer: DownloadPageInitializer,
    private val historyPageInitializer: HistoryPageInitializer,
    @DiskScheduler private val diskScheduler: Scheduler
) : BundleStore {

    override fun save(tabs: List<TabModel>) {
        val outState = Bundle(ClassLoader.getSystemClassLoader())

        tabs.withIndex().forEach { (index, tab) ->
            if (!tab.url.isSpecialUrl()) {
                val frozenBundle = tab.freeze()
                // Always save the URL alongside the WebView state so we can check it on restore
                frozenBundle.putString(URL_KEY, tab.url)
                outState.putBundle(BUNDLE_KEY + index, frozenBundle)
                outState.putString(TAB_TITLE_KEY + index, tab.title)
                outState.putInt(TAB_ID_KEY + index, tab.id)
            } else {
                outState.putBundle(BUNDLE_KEY + index, Bundle().apply {
                    putString(URL_KEY, tab.url)
                })
            }
        }

        FileUtils.writeBundleToStorage(application, outState, BUNDLE_STORAGE)
            .subscribeOn(diskScheduler)
            .subscribe()
    }

    override fun retrieve(): List<TabInitializer> =
        FileUtils.readBundleFromStorage(application, BUNDLE_STORAGE)?.let { bundle ->
            bundle.keySet()
                .filter { it.startsWith(BUNDLE_KEY) }
                .mapNotNull { bundleKey ->
                    bundle.getBundle(bundleKey)?.let {
                        Triple(
                            it,
                            bundle.getString(TAB_TITLE_KEY + bundleKey.extractNumberFromEnd()),
                            bundle.getInt(TAB_ID_KEY + bundleKey.extractNumberFromEnd(), -1)
                        )
                    }
                }
        }?.map { (bundle, title, id) ->
            val savedUrl = bundle.getString(URL_KEY)
            return@map savedUrl?.let { url ->
                when {
                    url.isStartPageUrl() -> homePageInitializer
                    url.isBookmarkUrl() -> bookmarkPageInitializer
                    url.isDownloadsUrl() -> downloadPageInitializer
                    url.isHistoryUrl() -> historyPageInitializer
                    // If the URL is the old SearXNG base URL, redirect to homepage
                    url.isOldHomepageBaseUri() -> homePageInitializer
                    // Normal web pages — restore from frozen bundle
                    else -> FreezableBundleInitializer(
                        bundle = bundle,
                        initialTitle = title ?: application.getString(R.string.tab_frozen),
                        id = id
                    )
                }
            } ?: FreezableBundleInitializer(
                bundle = bundle,
                initialTitle = title ?: application.getString(R.string.tab_frozen),
                id = id
            )
        } ?: emptyList()

    override fun deleteAll() {
        FileUtils.deleteBundleInStorage(application, BUNDLE_STORAGE)
    }

    private fun String.extractNumberFromEnd(): String {
        val underScore = lastIndexOf('_')
        return if (underScore in indices) {
            substring(underScore + 1)
        } else {
            ""
        }
    }

    companion object {
        private const val BUNDLE_KEY = "WEBVIEW_"
        private const val TAB_TITLE_KEY = "TITLE_"
        private const val TAB_ID_KEY = "ID_"
        private const val URL_KEY = "URL_KEY"
        private const val BUNDLE_STORAGE = "SAVED_TABS.parcel"
    }
}

/**
 * Detects URLs from previous versions that should be redirected to the homepage.
 * - Old SearXNG base URL (v1.6.0 and earlier): loadDataWithBaseURL used SearXNG as base URL
 * - "about:blank" (v1.7.0): loadDataWithBaseURL used null as base URL
 * - "eesha://homepage" (v1.8.0): custom scheme that was blocked by UrlHandler
 * All should be treated as the homepage on restore.
 */
private fun String.isOldHomepageBaseUri(): Boolean =
    (this.contains("eesha-search.onrender.com") && !this.contains("/search?"))
        || this == "about:blank"
        || this == "eesha://homepage"
