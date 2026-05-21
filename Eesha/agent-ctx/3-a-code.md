# Task 3-a - Android v0.10.0 Feature Additions (Agent: code)

## Date: 2026-03-05

## Summary
Added five major features to the Eesha browser Android app for v0.10.0:

1. **Reader Mode** - Per-tab toggle that injects JS to strip away navigation, sidebars, ads, footers, extracts main content using heuristics (article, main, [role="main"], etc.), applies clean readable style with dark background (#1a1a2e), light text (#e0e0e0), 18px font, 700px max-width centered, "Exit Reader" floating button

2. **Per-Site Permissions** - Dialog accessible from menu with toggleable permissions per domain: JavaScript (default: allow), Cookies (default: allow), Images (default: allow), Popups (default: block), Location (default: block). Stored in SharedPreferences as JSON with key `site_perms_{domain}`. Applied on `onPageStarted()`. Geolocation permission handled in WebChromeClient.

3. **Dark Mode Toggle** - Menu item with dynamic title showing on/off state. For API >= 29: uses `WebSettings.setForceDark()` and `setForceDarkStrategy()`. For API < 29: injects CSS `filter: invert(1) hue-rotate(180deg)` with media element exceptions. Preference persisted in SharedPreferences.

4. **Password/FormData Saving** - "Save Form Data" toggle in Settings. Form detection JS injected on page loads that intercepts form submissions with username/password fields. Credentials sent via alert() to native code, intercepted by `onJsAlert()` override. Base64-encoded passwords saved to `passwords.json`. Auto-fill offered on pages with saved credentials. `eesha://passwords` internal page with list and delete capability.

5. **Screenshot/Full Page Capture** - Menu item that captures WebView as bitmap using `webView.draw(canvas)` on Canvas backed by Bitmap. Saves as PNG to Downloads folder with filename `Eesha_Screenshot_{timestamp}.png`. Media scanner notified. Toast confirms save.

## Files Modified
- `android/app/src/main/java/org/eesha/browser/EeshaBrowser.kt`
- `android/app/src/main/java/org/eesha/browser/SettingsActivity.kt`
- `android/app/src/main/res/menu/browser_menu.xml`
- `android/app/src/main/res/layout/activity_settings.xml`
- `android/app/src/main/res/drawable/ic_reader_mode.xml` (new)
- `android/app/src/main/res/drawable/ic_site_settings.xml` (new)
- `android/app/src/main/res/drawable/ic_dark_mode.xml` (new)
- `android/app/src/main/res/drawable/ic_screenshot.xml` (new)
- `android/app/src/main/res/drawable/ic_password.xml` (new)

## Version Bumped
User agent, new tab page, and settings version: 0.9.0 → 0.10.0
