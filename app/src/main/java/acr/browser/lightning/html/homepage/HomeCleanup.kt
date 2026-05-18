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
 * v107: Fixed homepage to use file-based approach (like original Lightning Browser).
 * - Removed "https://localhost" as base URL (was showing in URL bar)
 * - Added ProGuard keep rule for @JavascriptInterface (was stripped in release builds)
 * - Write HTML to file on disk, load via file:// URL (production-ready)
 * - "For You" news pre-fetched and embedded in HTML
 * - Other categories use NewsBridge JavaScript interface
 */
class HomeCleanup @Inject constructor(
    private val application: Application,
    private val userPreferences: UserPreferences
) : Cleanup.Action {
    override val versionCode: Int = 107

    override suspend fun execute() {
        withContext(Dispatchers.IO) {
            // Clean up old generated homepage files from previous versions
            val generatedHtml = File(application.filesDir, "generated-html")
            if (generatedHtml.exists()) {
                generatedHtml.listFiles()
                    ?.filter { it.name.endsWith(".html") }
                    ?.forEach(File::delete)
            }

            // Delete saved tab state so stale tabs (with old base URLs) don't get restored
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
