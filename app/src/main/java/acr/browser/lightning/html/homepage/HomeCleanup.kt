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
 * v105: Fixed homepage URL and UI overhaul.
 * - Base URL changed from null to "eesha://homepage" (fixes about:blank URL bar issue)
 * - Fixed CSS variable replacement (--card-bg, --text-primary instead of --box-bg, --box-txt)
 * - Complete UI/UX redesign for Chrome-level quality
 * - URL bar now shows search text instead of SearXNG URL
 * - Cleared all saved tab state to prevent stale tabs from being restored
 */
class HomeCleanup @Inject constructor(
    private val application: Application,
    private val userPreferences: UserPreferences
) : Cleanup.Action {
    override val versionCode: Int = 105

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
