# Task 3-c - iOS v0.10.0 Feature Additions

## Agent: code
## Date: 2026-03-05

## Summary
Successfully added all five requested features to the Eesha iOS browser for v0.10.0:

1. **Reader Mode** - Book icon toolbar button, JS content extraction with dark readable style, per-tab state tracking, in-page exit button
2. **Per-Site Permissions** - UIAlertController with UISwitch toggles for JS/Cookies/Popups/Location/Camera/Microphone, stored as JSON in UserDefaults per domain
3. **Dark Mode Toggle** - Menu toggle injecting CSS to force dark theme, saved in UserDefaults, overrideUserInterfaceStyle applied
4. **Password Manager** - Form submission detection, save prompt, base64-encoded storage, auto-fill bar, eesha://passwords internal page
5. **Screenshot Capture** - WKSnapshotConfiguration + takeSnapshot(), saved to Photos album via UIImageWriteToSavedPhotosAlbum

## Files Modified
- `ios/Eesha/BrowserViewController.swift` (553→2785 lines) - All 5 features added
- `ios/Eesha/SettingsViewController.swift` (387→409 lines) - Dark Mode + Save Passwords toggles, new SettingsKeys
- `ios/Eesha/Info.plist` - Version 0.9.0→0.10.0, build 9→10, privacy descriptions added

## Key Implementation Details
- TabInfo struct gained `readerMode: Bool` field (default: false)
- New script message handlers: `passwordAction`, `credentialCapture`, `readerAction`
- Dark mode CSS and password detection JS injected via WKUserScript in createWebView
- Per-site permissions use WKContentRuleList for JS blocking
- All new features respect private mode (no password saving, no history)
- Version references updated in 4 locations: Info.plist, header comment, new tab page, settings page
