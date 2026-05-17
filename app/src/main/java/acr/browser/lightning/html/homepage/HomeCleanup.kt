package acr.browser.lightning.html.homepage

import acr.browser.lightning.constant.SCHEME_HOMEPAGE
import acr.browser.lightning.migration.Cleanup
import acr.browser.lightning.preference.UserPreferences
import acr.browser.lightning.utils.isSearchEngineUrl
import android.app.Application
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

/**
 * Migration cleanup for the homepage.
 *
 * v140: Complete architectural fix — removed SearXNG from the homepage entirely.
 * - News data is now fetched in Kotlin (not JavaScript XHR)
 * - No base URL is used (loadDataWithBaseURL with null base URL)
 * - SearXNG has NOTHING to do with the homepage — only used for searching
 * - Cleared all saved tab state to prevent stale SearXNG tabs from being restored
 */
class HomeCleanup @Inject constructor(
    private val application: Application,
    private val userPreferences: UserPreferences
) : Cleanup.Action {
    override val versionCode: Int = 140

    override suspend fun execute() {
        withContext(Dispatchers.IO) {
            // Clean up old generated homepage files from previous versions
            val generatedHtml = File(application.filesDir, "generated-html")
            if (generatedHtml.exists()) {
                generatedHtml.listFiles()
                    ?.filter { it.name.endsWith(".html") }
                    ?.forEach(File::delete)
            }

            // Delete saved tab state so stale SearXNG tabs don't get restored.
            // The browser will create fresh tabs with the proper homepage initializer.
            // This is essential because old saved tabs may have URL_KEY set to
            // https://eesha-search.onrender.com which would show SearXNG on restore.
            val savedTabs = File(application.filesDir, "SAVED_TABS.parcel")
            if (savedTabs.exists()) {
                savedTabs.delete()
            }

            // Also check the internal files directory for the parcel file
            val internalSavedTabs = File(application.filesDir, "../saved_tabs/SAVED_TABS.parcel")
            if (internalSavedTabs.exists()) {
                internalSavedTabs.delete()
            }
        }

        // Reset homepage to the custom news page if it was set to a search engine URL
        val currentHomepage = userPreferences.homepage
        if (currentHomepage.isSearchEngineUrl()) {
            userPreferences.homepage = SCHEME_HOMEPAGE
        }
    }
}
