package org.eesha.browser

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.URL

/**
 * Eesha Browser - In-App Auto-Update Manager
 *
 * Checks GitHub Releases API for new versions, downloads the APK
 * via Android DownloadManager, and triggers the system installer.
 *
 * Features:
 * - Version comparison against GitHub Releases
 * - 24-hour cooldown between automatic update checks
 * - Manual "Check for updates" from Settings
 * - Downloads APK to Downloads folder via DownloadManager
 * - Triggers system package installer via FileProvider
 * - Handles REQUEST_INSTALL_PACKAGES permission for Android 8+
 */
class UpdateManager(private val context: Context) {

    companion object {
        private const val GITHUB_REPO = "eesha-co/Eesha"
        private const val GITHUB_API_URL = "https://api.github.com/repos/$GITHUB_REPO/releases/latest"
        private const val PREFS_NAME = "eesha_prefs"
        private const val KEY_LAST_UPDATE_CHECK = "last_update_check_ms"
        private const val KEY_LAST_KNOWN_VERSION = "last_known_version"
        private const val KEY_DOWNLOAD_ID = "update_download_id"
        private const val COOLDOWN_MS = 24 * 60 * 60 * 1000L // 24 hours

        // The APK asset name pattern in GitHub releases
        private const val APK_NAME_PATTERN = ".apk"
    }

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /**
     * Data class representing a GitHub Release
     */
    data class GitHubRelease(
        val tagName: String,
        val name: String,
        val body: String,
        val apkUrl: String?,
        val apkSize: Long
    )

    /**
     * Check for updates if the cooldown period has passed.
     * Called automatically on app launch.
     */
    fun checkForUpdatesIfDue() {
        val lastCheck = prefs.getLong(KEY_LAST_UPDATE_CHECK, 0)
        val now = System.currentTimeMillis()

        if (now - lastCheck < COOLDOWN_MS) {
            return // Not due yet
        }

        checkForUpdates(silent = true)
    }

    /**
     * Check for updates now. Shows feedback to the user.
     * @param silent If true, only shows a dialog if an update is available.
     *               If false, also shows "You're up to date" toast.
     */
    fun checkForUpdates(silent: Boolean = false) {
        Thread {
            try {
                val release = fetchLatestRelease()
                if (release == null) {
                    if (!silent) {
                        showOnUiThread("Could not check for updates. Try again later.")
                    }
                    return@Thread
                }

                // Update last check time
                prefs.edit().putLong(KEY_LAST_UPDATE_CHECK, System.currentTimeMillis()).apply()
                prefs.edit().putString(KEY_LAST_KNOWN_VERSION, release.tagName).apply()

                val currentVersion = getCurrentVersionName()
                val latestVersion = extractVersionNumber(release.tagName)

                if (latestVersion != null && isNewerVersion(currentVersion, latestVersion)) {
                    // New version available!
                    showUpdateDialog(release, latestVersion)
                } else {
                    if (!silent) {
                        showOnUiThread("Eesha is up to date! (v$currentVersion)")
                    }
                }
            } catch (e: Exception) {
                if (!silent) {
                    showOnUiThread("Update check failed: ${e.message}")
                }
            }
        }.start()
    }

    /**
     * Fetch the latest release from GitHub API
     */
    private fun fetchLatestRelease(): GitHubRelease? {
        try {
            val connection = URL(GITHUB_API_URL).openConnection()
            connection.setRequestProperty("Accept", "application/vnd.github+json")
            connection.setRequestProperty("User-Agent", "Eesha-Browser-Update-Checker")
            connection.connectTimeout = 15000
            connection.readTimeout = 15000

            val response = connection.getInputStream().bufferedReader().use { it.readText() }
            val json = JSONObject(response)

            val tagName = json.optString("tag_name", "")
            val name = json.optString("name", "")
            val body = json.optString("body", "")

            // Find the APK asset
            val assets = json.optJSONArray("assets") ?: return null
            var apkUrl: String? = null
            var apkSize: Long = 0

            for (i in 0 until assets.length()) {
                val asset = assets.getJSONObject(i)
                val assetName = asset.optString("name", "")
                if (assetName.endsWith(APK_NAME_PATTERN)) {
                    apkUrl = asset.optString("browser_download_url", "")
                    apkSize = asset.optLong("size", 0)
                    break
                }
            }

            return GitHubRelease(
                tagName = tagName,
                name = name,
                body = body,
                apkUrl = apkUrl,
                apkSize = apkSize
            )
        } catch (e: Exception) {
            return null
        }
    }

    /**
     * Extract version number from tag name like "eesha-v0.9.2" → "0.9.2"
     */
    private fun extractVersionNumber(tagName: String): String? {
        val regex = Regex("""v?(\d+\.\d+\.\d+)""")
        return regex.find(tagName)?.groupValues?.getOrNull(1)
    }

    /**
     * Get the current installed version name
     */
    private fun getCurrentVersionName(): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName ?: "0.0.0"
        } catch (e: Exception) {
            "0.0.0"
        }
    }

    /**
     * Compare two version strings like "0.9.2" vs "0.9.3"
     * Returns true if latestVersion > currentVersion
     */
    private fun isNewerVersion(current: String, latest: String): Boolean {
        val currentParts = current.split(".").map { it.toIntOrNull() ?: 0 }
        val latestParts = latest.split(".").map { it.toIntOrNull() ?: 0 }

        val maxLen = maxOf(currentParts.size, latestParts.size)
        for (i in 0 until maxLen) {
            val c = currentParts.getOrElse(i) { 0 }
            val l = latestParts.getOrElse(i) { 0 }
            if (l > c) return true
            if (l < c) return false
        }
        return false // Equal versions
    }

    /**
     * Show update available dialog on the UI thread
     */
    private fun showUpdateDialog(release: GitHubRelease, latestVersion: String) {
        val currentVersion = getCurrentVersionName()
        val sizeText = if (release.apkSize > 0) {
            val sizeMB = release.apkSize / (1024.0 * 1024.0)
            " (${String.format("%.1f", sizeMB)} MB)"
        } else ""

        android.os.Handler(android.os.Looper.getMainLooper()).post {
            AlertDialog.Builder(context)
                .setTitle("Update Available!")
                .setMessage("Eesha v$latestVersion is available.\n\nCurrent: v$currentVersion\nLatest: v$latestVersion$sizeText\n\nDownload and install the update?")
                .setPositiveButton("Update") { _, _ ->
                    downloadAndInstall(release)
                }
                .setNegativeButton("Later", null)
                .show()
        }
    }

    /**
     * Download the APK via DownloadManager and trigger installation
     */
    private fun downloadAndInstall(release: GitHubRelease) {
        val apkUrl = release.apkUrl
        if (apkUrl.isNullOrEmpty()) {
            Toast.makeText(context, "APK download not available", Toast.LENGTH_LONG).show()
            return
        }

        val fileName = "Eesha-${release.tagName}.apk"

        try {
            // Use Android DownloadManager for reliable downloading
            val request = DownloadManager.Request(Uri.parse(apkUrl)).apply {
                setTitle("Eesha Update v${extractVersionNumber(release.tagName)}")
                setDescription("Downloading Eesha Browser update...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                addRequestHeader("User-Agent", "Eesha-Browser-Update")
            }

            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val downloadId = dm.enqueue(request)

            // Save download ID for tracking
            prefs.edit().putLong(KEY_DOWNLOAD_ID, downloadId).apply()

            Toast.makeText(context, "Downloading update...", Toast.LENGTH_SHORT).show()

            // Register receiver for download completion
            registerDownloadReceiver(downloadId, fileName)

        } catch (e: Exception) {
            Toast.makeText(context, "Download failed: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    /**
     * Register a BroadcastReceiver to trigger installation when download completes
     */
    private fun registerDownloadReceiver(downloadId: Long, fileName: String) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
                if (id == downloadId) {
                    try {
                        context.unregisterReceiver(this)
                    } catch (e: Exception) {}

                    // Trigger installation
                    installApk(fileName)
                }
            }
        }

        // Android 14+ (API 34) requires RECEIVER_EXPORTED or RECEIVER_NOT_EXPORTED flag
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
        }
    }

    /**
     * Trigger the system package installer to install the downloaded APK
     */
    private fun installApk(fileName: String) {
        try {
            val apkFile = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fileName)

            if (!apkFile.exists()) {
                Toast.makeText(context, "APK file not found", Toast.LENGTH_LONG).show()
                return
            }

            val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                // Use FileProvider for Android 7+
                FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    apkFile
                )
            } else {
                Uri.fromFile(apkFile)
            }

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            context.startActivity(installIntent)

        } catch (e: Exception) {
            Toast.makeText(context, "Installation failed: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    /**
     * Show a toast on the UI thread
     */
    private fun showOnUiThread(message: String) {
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }
}
