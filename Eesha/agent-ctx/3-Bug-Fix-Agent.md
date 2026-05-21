# Task 3 - Bug Fix Agent (Desktop)

## Task: Fix 3 bugs in Eesha Desktop browser (Electron)

### Files Modified:
1. `/home/z/my-project/desktop/renderer/app.js` - Button visibility, dark mode body class
2. `/home/z/my-project/desktop/main.js` - Content preload for password APIs, save dialog
3. `/home/z/my-project/desktop/content-preload.js` - NEW: Preload for tab web contents
4. `/home/z/my-project/desktop/renderer/styles.css` - Dark mode browser chrome CSS overrides

### Fix 1: Hide context-dependent toolbar buttons on homepage
- Added `updateButtonVisibility(url)` function in app.js
- When URL is eesha://newtab, eesha://newtab/, or starts with eesha://, buttons are dimmed (opacity 0.3) and disabled (pointerEvents none)
- Affects: readerModeBtn, siteSettingsBtn
- Called from: updateUrlBar(), onUrlChange handler, init()

### Fix 2: Fix password auto-fill
- Root cause: Tab content views used `sandbox: true` with no preload, so `window.eesha.saveCredential()` was unavailable to injected password detection scripts
- Created `content-preload.js` with contextBridge exposing saveCredential, autoFillCredentials, and other APIs
- Updated createTab() in main.js: sandbox: false, preload: content-preload.js
- Enhanced save-credential IPC handler to show confirmation dialog via dialog.showMessageBox
- Added auto-fill-credentials IPC handler (no-op on main side, auto-fill is done via executeJavaScript)

### Fix 3: Fix dark mode to affect browser chrome
- Modified darkModeBtn click handler to toggle `dark-mode` class on document.body
- Modified getDarkMode().then() to also apply body class on init
- Modified onSettingsUpdated handler to sync body class
- Added 80+ lines of dark mode CSS overrides in styles.css covering all browser chrome elements

### Status: All 3 fixes complete
