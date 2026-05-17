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

class HomeCleanup @Inject constructor(
    private val application: Application,
    private val userPreferences: UserPreferences
) : Cleanup.Action {
    override val versionCode: Int = 121

    override suspend fun execute() {
        withContext(Dispatchers.IO) {
            // Clean up old generated homepage files from previous versions
            val generatedHtml = File(application.filesDir, "generated-html")
            if (generatedHtml.exists()) {
                generatedHtml.listFiles()
                    ?.filter { it.name.endsWith(".html") }
                    ?.forEach(File::delete)
            }

            // Delete saved tab state so stale SearXNG tabs don't get restored
            // The browser will create fresh tabs with the proper homepage initializer
            val savedTabs = File(application.filesDir, "SAVED_TABS.parcel")
            if (savedTabs.exists()) {
                savedTabs.delete()
            }
        }

        // Reset homepage to the custom news page if it was set to a search engine URL
        val currentHomepage = userPreferences.homepage
        if (currentHomepage.isSearchEngineUrl()) {
            userPreferences.homepage = SCHEME_HOMEPAGE
        }
    }
}
