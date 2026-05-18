package acr.browser.lightning.html.homepage

import acr.browser.lightning.constant.SCHEME_HOMEPAGE
import acr.browser.lightning.migration.Cleanup
import acr.browser.lightning.preference.UserPreferences
import android.app.Application
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

/**
 * Migration cleanup for the homepage.
 *
 * v106: Fixed critical bugs causing homepage to be completely static.
 * - Changed base URL from "eesha://homepage" to "https://localhost" (recommended for JS interfaces)
 * - Removed &count= parameter from rss2json.com API calls (caused HTTP 422 on free tier)
 * - Fixed CSS variable replacement (--card-bg, --text-primary)
 * - Removed broken quick action shortcuts (bookmarks/history/downloads use wrong paths)
 * - Better RSS sources: BBC feeds first (provide thumbnails), Google News second
 */
class HomeCleanup @Inject constructor(
    private val application: Application,
    private val userPreferences: UserPreferences
) : Cleanup.Action {
    override val versionCode: Int = 106

    override suspend fun execute() {
        withContext(Dispatchers.IO) {
            // Clean up old generated homepage files from previous versions
            val generatedHtml = File(application.filesDir, "generated-html")
            if (generatedHtml.exists()) {
                generatedHtml.listFiles()
                    ?.filter { it.name.endsWith(".html") }
                    ?.forEach(File::delete)
            }

            // Delete saved tab state so stale tabs don't get restored
            val savedTabs = File(application.filesDir, "SAVED_TABS.parcel")
            if (savedTabs.exists()) {
                savedTabs.delete()
            }
        }

        // Reset homepage to the custom news page if it was set to SearXNG
        val currentHomepage = userPreferences.homepage
        if (currentHomepage.contains("eesha-search") || currentHomepage.contains("searx")) {
            userPreferences.homepage = SCHEME_HOMEPAGE
        }
    }
}
