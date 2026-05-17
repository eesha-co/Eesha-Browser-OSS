package acr.browser.lightning.html.homepage

import acr.browser.lightning.constant.SCHEME_HOMEPAGE
import acr.browser.lightning.migration.Cleanup
import acr.browser.lightning.preference.UserPreferences
import android.app.Application
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

class HomeCleanup @Inject constructor(
    private val application: Application,
    private val userPreferences: UserPreferences
) : Cleanup.Action {
    override val versionCode: Int = 120

    override suspend fun execute() {
        withContext(Dispatchers.IO) {
            // Clean up old generated homepage files from previous versions
            val generatedHtml = File(application.filesDir, "generated-html")
            if (generatedHtml.exists()) {
                generatedHtml.listFiles()
                    ?.filter { it.name.endsWith(".html") }
                    ?.forEach(File::delete)
            }
        }

        // Reset homepage to the custom news page if it was set to a search engine URL
        // (e.g., users who previously set eesha-search.onrender.com as their homepage)
        val currentHomepage = userPreferences.homepage
        if (currentHomepage.contains("eesha-search") ||
            currentHomepage.contains("searx") ||
            currentHomepage.contains("google.com/search") ||
            currentHomepage.contains("bing.com/search") ||
            currentHomepage.contains("duckduckgo.com")
        ) {
            userPreferences.homepage = SCHEME_HOMEPAGE
        }
    }
}
