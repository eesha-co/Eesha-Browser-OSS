package org.eesha.browser

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Eesha Browser - Settings Activity
 *
 * Privacy settings:
 * - Ad & Tracker Blocking toggle
 * - HTTPS-Only Mode toggle
 * - Fingerprint Protection toggle
 *
 * Search Engine selector:
 * - Eesha Search, DuckDuckGo, Google, Brave Search, StartPage
 *
 * Data management:
 * - Clear browsing history
 * - Clear cookies and cache
 * - Clear all data
 *
 * Update:
 * - Auto-Check for Updates toggle
 * - Check for Updates Now button
 *
 * About section with version
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var prefs: SharedPreferences
    private lateinit var updateManager: UpdateManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // MUST set content view BEFORE any window insets manipulation
        setContentView(R.layout.activity_settings)

        // ── FULL IMMERSIVE MODE: Hide the status bar entirely ──
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false)
            }
        } catch (e: Exception) {
            // setDecorFitsSystemWindows failure should not crash
        }
        applyImmersiveMode()

        // Apply bottom padding for system navigation bar.
        // No top padding needed since status bar is hidden entirely.
        try {
            val contentView = findViewById<View>(android.R.id.content)
            val contentFrame = contentView as? ViewGroup
            val rootScrollView = contentFrame?.getChildAt(0) as? ViewGroup
            rootScrollView?.let { root ->
                ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
                    val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                    v.setPadding(
                        systemBars.left,
                        0,  // No top padding: status bar is hidden
                        systemBars.right,
                        systemBars.bottom
                    )
                    insets
                }
            }
        } catch (e: Exception) {
            // WindowInsets listener failure should not crash the app
        }

        prefs = getSharedPreferences("eesha_prefs", Context.MODE_PRIVATE)
        updateManager = UpdateManager(this)

        // Setup toolbar
        setSupportActionBar(findViewById(R.id.settingsToolbar))
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Settings"

        setupPrivacySection()
        setupSearchEngineSection()
        setDataSection()
        setupUpdateSection()
        setupAboutSection()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    override fun onResume() {
        super.onResume()
        applyImmersiveMode()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            applyImmersiveMode()
        }
    }

    private fun applyImmersiveMode() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val controller = window.insetsController
                controller?.hide(WindowInsetsCompat.Type.statusBars())
                controller?.systemBarsBehavior =
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } else {
                @Suppress("DEPRECATION")
                window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
                // Also use sticky immersive mode via decorView for pre-R
                window.decorView.systemUiVisibility = (
                    android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                    or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
            }
        } catch (e: Exception) {
            try {
                window.statusBarColor = android.graphics.Color.TRANSPARENT
            } catch (_: Exception) {}
        }
    }

    private fun setupPrivacySection() {
        val switchAdBlocking = findViewById<Switch>(R.id.switchAdBlocking)
        val switchHttpsOnly = findViewById<Switch>(R.id.switchHttpsOnly)
        val switchFingerprint = findViewById<Switch>(R.id.switchFingerprint)

        switchAdBlocking.isChecked = prefs.getBoolean("ad_blocking_enabled", true)
        switchHttpsOnly.isChecked = prefs.getBoolean("https_only_enabled", true)
        switchFingerprint.isChecked = prefs.getBoolean("fingerprint_protection_enabled", true)

        switchAdBlocking.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean("ad_blocking_enabled", isChecked).apply()
        }

        switchHttpsOnly.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean("https_only_enabled", isChecked).apply()
        }

        switchFingerprint.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean("fingerprint_protection_enabled", isChecked).apply()
        }
    }

    private fun setupSearchEngineSection() {
        val radioGroup = findViewById<RadioGroup>(R.id.searchEngineGroup)
        val currentEngine = prefs.getString("search_engine", "eesha") ?: "eesha"

        val radioButtonId = when (currentEngine) {
            "eesha" -> R.id.radioSketch
            "google" -> R.id.radioGoogle
            "brave" -> R.id.radioBrave
            "startpage" -> R.id.radioStartPage
            "duckduckgo" -> R.id.radioDuckDuckGo
            else -> R.id.radioSketch
        }
        radioGroup.check(radioButtonId)

        radioGroup.setOnCheckedChangeListener { _, checkedId ->
            val engine = when (checkedId) {
                R.id.radioSketch -> "eesha"
                R.id.radioGoogle -> "google"
                R.id.radioBrave -> "brave"
                R.id.radioStartPage -> "startpage"
                R.id.radioDuckDuckGo -> "duckduckgo"
                else -> "eesha"
            }
            prefs.edit().putString("search_engine", engine).apply()
        }
    }

    private fun setDataSection() {
        val btnClearHistory = findViewById<LinearLayout>(R.id.btnClearHistory)
        val btnClearCookies = findViewById<LinearLayout>(R.id.btnClearCookies)
        val btnClearAll = findViewById<LinearLayout>(R.id.btnClearAll)

        btnClearHistory.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Clear Browsing History")
                .setMessage("Are you sure you want to delete all browsing history?")
                .setPositiveButton("Clear") { _, _ ->
                    val file = filesDir.resolve("history.json")
                    if (file.exists()) file.delete()
                    Toast.makeText(this, "History cleared", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        btnClearCookies.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Clear Cookies & Cache")
                .setMessage("Are you sure you want to clear all cookies and cached data?")
                .setPositiveButton("Clear") { _, _ ->
                    CookieManager.getInstance().removeAllCookies(null)
                    WebStorage.getInstance().deleteAllData()
                    Toast.makeText(this, "Cookies and cache cleared", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        btnClearAll.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Clear All Data")
                .setMessage("This will delete all browsing history, bookmarks, cookies, and cached data. This cannot be undone.")
                .setPositiveButton("Clear All") { _, _ ->
                    // Delete history
                    val historyFile = filesDir.resolve("history.json")
                    if (historyFile.exists()) historyFile.delete()
                    // Delete bookmarks
                    val bookmarksFile = filesDir.resolve("bookmarks.json")
                    if (bookmarksFile.exists()) bookmarksFile.delete()
                    // Clear cookies and cache
                    CookieManager.getInstance().removeAllCookies(null)
                    WebStorage.getInstance().deleteAllData()
                    // Clear shared prefs except settings
                    val editor = prefs.edit()
                    val adBlocking = prefs.getBoolean("ad_blocking_enabled", true)
                    val httpsOnly = prefs.getBoolean("https_only_enabled", true)
                    val fingerprint = prefs.getBoolean("fingerprint_protection_enabled", true)
                    val searchEngine = prefs.getString("search_engine", "eesha")
                    val autoUpdate = prefs.getBoolean("auto_update_enabled", true)
                    editor.clear()
                    editor.putBoolean("ad_blocking_enabled", adBlocking)
                    editor.putBoolean("https_only_enabled", httpsOnly)
                    editor.putBoolean("fingerprint_protection_enabled", fingerprint)
                    editor.putString("search_engine", searchEngine)
                    editor.putBoolean("auto_update_enabled", autoUpdate)
                    editor.apply()
                    Toast.makeText(this, "All data cleared", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    private fun setupUpdateSection() {
        val switchAutoUpdate = findViewById<Switch>(R.id.switchAutoUpdate)
        val btnCheckUpdates = findViewById<LinearLayout>(R.id.btnCheckUpdates)
        val updateStatusText = findViewById<TextView>(R.id.updateStatusText)

        // Auto-update toggle (default: enabled)
        switchAutoUpdate.isChecked = prefs.getBoolean("auto_update_enabled", true)

        switchAutoUpdate.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean("auto_update_enabled", isChecked).apply()
        }

        // Show last check info
        val lastCheck = prefs.getLong("last_update_check_ms", 0)
        if (lastCheck > 0) {
            val timeAgo = formatTimeAgo(lastCheck)
            updateStatusText.text = "Last checked: $timeAgo"
        }

        // Check now button
        btnCheckUpdates.setOnClickListener {
            updateStatusText.text = "Checking for updates..."
            updateManager.checkForUpdates(silent = false)

            // Update status after a delay
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                val newLastCheck = prefs.getLong("last_update_check_ms", 0)
                if (newLastCheck > 0) {
                    updateStatusText.text = "Last checked: ${formatTimeAgo(newLastCheck)}"
                }
            }, 5000)
        }
    }

    private fun formatTimeAgo(timestamp: Long): String {
        val diff = System.currentTimeMillis() - timestamp
        val minutes = diff / (60 * 1000)
        val hours = diff / (60 * 60 * 1000)
        val days = diff / (24 * 60 * 60 * 1000)

        return when {
            minutes < 1 -> "Just now"
            minutes < 60 -> "$minutes min ago"
            hours < 24 -> "$hours hr ago"
            days < 7 -> "$days day${if (days > 1) "s" else ""} ago"
            else -> {
                val sdf = java.text.SimpleDateFormat("MMM d", java.util.Locale.getDefault())
                sdf.format(java.util.Date(timestamp))
            }
        }
    }

    private fun setupAboutSection() {
        val versionText = findViewById<TextView>(R.id.versionText)
        try {
            val packageInfo = packageManager.getPackageInfo(packageName, 0)
            versionText.text = "Eesha Browser v${packageInfo.versionName}"
        } catch (e: Exception) {
            versionText.text = "Eesha Browser v0.9.3"
        }
    }
}
