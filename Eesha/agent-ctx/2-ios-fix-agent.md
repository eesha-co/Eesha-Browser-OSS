# Task 2 - iOS Browser Fixes (BrowserViewController.swift)

## Agent: iOS Fix Agent

## Work Completed

### Fix 1: Hide menu items on homepage
- Added `isHomepage` check in `showMenu()` based on `currentUrl.isEmpty || currentUrl.hasPrefix("eesha://newtab")`
- Wrapped "🖥 Request Desktop Site / 📱 Request Mobile Site" action in `if !isHomepage { }` block
- Wrapped "🔍 Find in Page" action in `if !isHomepage { }` block
- Wrapped "🛡 Site Settings" action in `if !isHomepage { }` block
- Other menu items (Bookmarks, History, Downloads, Passwords, Private Tab, Dark Mode, Share, Screenshot, Add Bookmark) remain always visible

### Fix 2: Password auto-fill robustness
- Verified `offerAutoFill(url:)` is already called in `webView(_:didFinish:)` at line ~2139
- Added `if !isPrivateMode` guard at the call site for extra robustness (even though `offerAutoFill` internally guards)
- Verified `getPasswordDetectionJS()` is properly injected via `WKUserScript` in `createWebView()` method (at document end, for main frame only)

### Fix 3: Dark mode browser UI
- Replaced `toggleDarkMode()` to update browser chrome colors:
  - When enabled: darker navigation bar (0.059/0.059/0.102), darker URL bar (0.12/0.11/0.22), lighter text (white 0.9 alpha)
  - When disabled: restores original colors (nav: 0.102/0.102/0.180, URL: 0.188/0.169/0.388, white text)
- Removed the `showAlert()` call from toggleDarkMode (no longer shows disruptive alert)
- Added dark mode chrome initialization in `viewDidLoad()` after `setupUI()` — applies saved dark mode state on app launch

### Fix 4: Tab switcher improvements
- Updated `showTabSwitcher()` title from "Tabs" to "Tabs (count)" showing total tab count
- Changed private tab marker from " [Private]" to "🕶 " prefix emoji
- Added fallback: tabs with empty titles now show "New Tab" instead of blank
- Added "Close All Tabs" destructive action (only shown when tabs.count > 1)
- Added `closeAllTabs()` helper method that properly removes observers, removes from superview, stops loading, clears tabs array, and creates a fresh new tab
