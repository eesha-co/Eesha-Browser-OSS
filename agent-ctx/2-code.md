# Task 2 - Android Bug Fixes

## Agent: code
## Date: 2026-03-05

### Completed Fixes

#### Bug 1: Splash screen logo zoomed in
- Root cause: `<bitmap>` tag in `splash_screen.xml` rendered logo at native pixel size without constraints when used as `windowBackground`
- Fix: Added `<inset>` wrapper with percentage-based padding (20% left/right, 30% top/bottom) to constrain logo to ~60% screen width
- Files: `splash_screen.xml` (modified), `splash_logo_centered.xml` (new)

#### Bug 2: White header/bar at top when browsing
- Root causes: WebView transparent background causing compositing artifacts, SwipeRefreshLayout potentially inheriting white background, white overscroll glow
- Fix: Changed WebView background to dark theme color `#1a1a2e`, set explicit transparent backgrounds on containers, disabled overscroll
- Files: `activity_browser.xml` (modified), `EeshaBrowser.kt` (modified)

#### Bug 3: App icon logo verification
- Result: `drawable/eesha_logo.png` already matches `shared/icons/eesha-logo.png` (identical MD5). No change needed.
