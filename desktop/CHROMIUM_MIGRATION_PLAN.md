# Eesha Browser: Chromium Fork Migration Plan

**Status:** Strategic Planning Document  
**Date:** 2025-03-05  
**Version:** 1.0  
**Author:** Eesha Project  
**Classification:** Internal — Strategic  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Brave Did: The Muon-to-Brave-Core Migration](#2-what-brave-did-the-muon-to-brave-core-migration)
3. [Feature Parity Analysis](#3-feature-parity-analysis)
4. [Architecture](#4-architecture)
5. [Migration Path](#5-migration-path)
6. [Ladybird Integration](#6-ladybird-integration)
7. [Build System](#7-build-system)
8. [Risks and Challenges](#8-risks-and-challenges)
9. [Team and Resource Estimates](#9-team-and-resource-estimates)
10. [Decision Matrix](#10-decision-matrix)

---

## 1. Executive Summary

Eesha Browser currently runs on Electron for desktop, which provides Chromium's rendering engine wrapped in a Node.js runtime. While Electron enabled rapid development, it imposes significant limitations:

- **Memory overhead**: Electron adds ~50-100MB of Node.js overhead per process
- **No deep Chromium access**: Cannot modify Blink renderer, V8 flags, or network stack
- **Security surface area**: Node.js integration increases the attack surface
- **Branding limitations**: Cannot change Chrome's built-in UI, update mechanism, or default services
- **Performance**: IPC overhead between Node.js main process and Chromium renderer
- **Independence**: Dependent on Electron's release cycle, which lags Chromium by weeks

Migrating to a direct Chromium fork — as Brave, Edge, and Opera have done — gives Eesha full control over the browser stack while maintaining 100% web compatibility.

This document outlines a realistic, phased plan for this migration, the feature-by-feature mapping, the architectural decisions, and how Ladybird fits as the long-term strategy.

---

## 2. What Brave Did: The Muon-to-Brave-Core Migration

### 2.1 The Muon Era (2016–2018)

Brave's first desktop browser was built on **Muon**, a custom Electron fork. Key characteristics:

- **Muon was a patched Electron**: Brave forked Electron's `electron/electron` repo, added custom patches for ad blocking, HTTPS Everywhere integration, and Tor tab support
- **Architecture**: Same Electron model — Node.js main process + Chromium renderer + IPC bridge
- **Limitations encountered**:
  - Could not efficiently implement per-request ad blocking (Electron's `webRequest` API is async and slow for large blocklists)
  - Could not modify Chromium's internal networking stack for HTTPS upgrading
  - Multi-process architecture was constrained by Electron's session model
  - Private/Tor tabs required ugly workarounds (separate session partitions)
  - Memory usage was significantly higher than native Chromium
  - Cannot ship security fixes faster than Electron's release cycle

### 2.2 The Brave Core Migration (2018–2019)

In March 2018, Brave announced they were abandoning Muon and building **Brave Core** — a direct Chromium fork.

**Timeline:**
| Date | Milestone |
|------|-----------|
| Jan 2016 | Brave 0.x launched on Muon (Electron fork) |
| Mar 2018 | Brave announces move to Chromium fork |
| Jun 2018 | First Brave Core dev build (0.55) |
| Nov 2018 | Brave Core beta (0.55.x) — feature parity with Muon |
| Jan 2019 | Brave 1.0 released on Brave Core |
| Jun 2019 | Muon officially retired |

**Key architectural decisions Brave made:**

1. **Fork `chrome/browser` not all of Chromium**: Brave only patches specific directories. They maintain a patch stack on top of upstream Chromium rather than forking the entire repo. This makes rebasing on new Chromium versions tractable.

2. **Brave's patch structure** (simplified):
   ```
   src/brave/                    # All Brave-specific code lives here
   src/brave/browser/            # C++ browser features (tabs, shields UI)
   src/brave/components/         # Reusable components (ad block, HTTPS upgrade)
   src/brave/renderer/           # Renderer-side C++ (content scripts)
   src/brave/common/             # Shared types/constants
   src/brave/tools/              # Build scripts, grit resources
   ```

3. **Chromium `//chrome` replacement**: Brave replaces Chrome's `//chrome` layer with their own `//brave` layer. The `//content` layer (rendering, networking) is shared with Chromium.

4. **Ad blocking in C++**: Brave moved ad blocking from JavaScript (`webRequest` API) to a native C++ implementation using the `Blink` content layer's `WebURLLoader` intercept. This made blocking 10-100x faster and enabled Brave's signature "Shields" per-site UI.

5. **Parallel build system**: Brave uses Chromium's `gn`/`ninja` build system directly. They have a `brave_browser` GN target that builds the entire browser.

6. **Chromium version tracking**: Brave tracks Chromium stable channel, typically landing 1-2 weeks after each Chromium stable release. They maintain a semi-automated rebase process.

### 2.3 Lessons for Eesha

| Lesson | Implication for Eesha |
|--------|----------------------|
| Forking Electron was a dead end | Go straight to Chromium fork — don't repeat Brave's Muon detour |
| Patch-stack approach works | Keep Eesha code in `src/eesha/`, patch Chromium minimally |
| C++ ad blocking is essential | The current JavaScript `onBeforeRequest` approach must become native |
| Rebase discipline is critical | Must establish a process for tracking Chromium releases from day one |
| Feature parity before switch | Must achieve full feature parity with Electron version before shipping |
| 6-9 months for migration | Brave took ~9 months with a larger team; budget accordingly |

---

## 3. Feature Parity Analysis

This section maps every current Eesha Electron feature to its Chromium fork equivalent. The verdict: **all features can be retained, and most will be significantly improved**.

### 3.1 Tab Management (Multi-tab, Private Tabs)

**Current Electron implementation:**
- `main.js`: Tab array with `WebContentsView` instances per tab
- `preload.js`: IPC bridge for `createTab`, `createPrivateTab`, `switchTab`, `closeTab`
- `app.js`: DOM-based tab bar with favicons, close buttons, active highlighting

**Chromium fork mapping:**
| Aspect | Current (Electron) | Chromium Fork | Improvement |
|--------|-------------------|---------------|-------------|
| Tab model | JS array + WebContentsView | Chromium's `TabStripModel` (C++) | Native tab grouping, pinned tabs, tab search |
| Private tabs | Separate `session.partition` | Chromium's `OffTheRecord` profile | True Incognito with separate process, no disk writes |
| Tab rendering | DOM in separate WebContentsView | Chromium Views (`TabStrip`, `Tab`) | GPU-accelerated tab strip, drag-and-drop, tab thumbnails |
| Tab crash recovery | Manual | Chromium's built-in sad-tab page | Automatic |
| Memory per tab | ~50-100MB (Node overhead) | ~30-60MB (pure Chromium) | 30-50% memory reduction |

**Migration approach:** Replace the entire JS tab management with Chromium's `TabStripModel`. Custom Eesha tab UI is built using Chromium's `views::View` framework in C++. Private tabs use Chromium's `Profile::GetOffTheRecordProfile()`.

**Verdict: FULL PARITY + significant improvements**

### 3.2 Ad/Tracker Blocking (500+ domains)

**Current Electron implementation:**
- `blocked-domains.json`: 6 categories, ~200+ unique domains
- `main.js`: `webRequest.onBeforeRequest` intercept, domain matching in JavaScript
- Per-tab block counting via `tabBlockedCounts`
- Shield popup showing blocked count, fingerprint status, HTTPS status

**Chromium fork mapping:**
| Aspect | Current (Electron) | Chromium Fork | Improvement |
|--------|-------------------|---------------|-------------|
| Blocking mechanism | JS `webRequest` API (async) | C++ `ContentBrowserClient::ShouldAllowDownload` + `URLLoaderThrottle` | 10-100x faster, synchronous blocking |
| Blocklist format | JSON, loaded at startup | Compiled binary trie (like Brave's `cosmetic-filter`) | Sub-millisecond per-URL lookup |
| Cosmetic filtering | Not implemented | CSS rule injection via `ContentScriptInjector` | Hide ad placeholders, not just block requests |
| Per-site controls | Global on/off only | Per-site shield with granular controls | Brave-level granularity |
| Block count | JS variable | C++ counter tied to `WebContentsObserver` | Accurate, zero overhead |

**Migration approach:** Build a C++ ad-blocking component in `src/eesha/components/ad_block/`. Use a compiled blocklist (convert `blocked-domains.json` to a binary format at build time). Intercept requests via `content::ContentBrowserClient::CanCommitURL` and `network::URLLoaderThrottle`. Inject cosmetic filter CSS via `content::RenderFrameObserver`.

**Verdict: FULL PARITY + major improvements (speed, cosmetic filtering, per-site controls)**

### 3.3 HTTPS-Only Mode

**Current Electron implementation:**
- `main.js`: `webRequest.onBeforeRequest` redirects `http://` to `https://`
- `https-only.js`: Client-side fetch/XHR interception
- Excludes localhost/127.0.0.1

**Chromium fork mapping:**
| Aspect | Current (Electron) | Chromium Fork | Improvement |
|--------|-------------------|---------------|-------------|
| HTTP→HTTPS upgrade | JS redirect (separate request) | C++ `HttpsOnlyMode` in `//chrome/browser` | Chromium already has HTTPS-Only built in (chrome://flags/#https-only-mode-setting) |
| Scope | Main frame + sub frames only | All resource types (scripts, images, etc.) | Complete coverage |
| Fallback | None | HTTPS-First fallback with interstitial | User sees explanation if HTTPS fails |
| Exclusions | Hardcoded localhost | Full exclusion list (enterprise policies, HSTS) | Standards-compliant |

**Migration approach:** Enable Chromium's built-in HTTPS-Only mode (it exists in `chrome/browser/https_only_mode/`). Patch the default to ON instead of OFF. Add Eesha-specific toggle in settings.

**Verdict: FULL PARITY — uses Chromium's existing feature**

### 3.4 Fingerprint Protection

**Current Electron implementation:**
- `fingerprint-protection.js`: Injected via `executeJavaScript()` on every page load
- Protects: Canvas, WebGL, AudioContext, Navigator, Screen, Timezone, Fonts, Battery, Connection, Storage, Math, WebRTC, Plugins, Client Hints

**Chromium fork mapping:**
| Aspect | Current (Electron) | Chromium Fork | Improvement |
|--------|-------------------|---------------|-------------|
| Injection method | `executeJavaScript` (post-load) | C++ `RenderFrameObserver::DidCreateDocumentElement` | Runs before any page script |
| Canvas noise | JS prototype override | C++ `SkCanvas` interception | Cannot be detected by anti-fingerprinting scripts |
| WebGL spoofing | JS Proxy on `getParameter` | C++ `gpu::GpuService` override | Undetectable |
| AudioContext noise | JS prototype override | C++ `AudioRendererMixer` noise | System-level, undetectable |
| WebRTC leak prevention | JS RTCPeerConnection override | C++ `PeerConnection` policy enforcement | Cannot be bypassed |
| Navigator spoofing | JS `defineProperty` | C++ `Blink` engine overrides | No JS detection possible |

**Migration approach:** Move fingerprint protection from JS injection to C++ Blink patches. Chromium already has `blink::WebFeaturePolicy` and `blink::ExecutionContext` hooks that allow overriding APIs before page scripts run. This is dramatically more secure because it cannot be detected or bypassed by fingerprinting scripts.

**Verdict: FULL PARITY + dramatically stronger protection (undetectable by sites)**

### 3.5 Bookmarks / History (eesha:// internal pages)

**Current Electron implementation:**
- `main.js`: JSON file storage (`bookmarks.json`, `history.json`)
- Internal pages: `eesha://bookmarks`, `eesha://history`, `eesha://newtab`, `eesha://settings`, `eesha://downloads`
- Custom protocol handler registered via `protocol.registerSchemesAsPrivileged`

**Chromium fork mapping:**
| Aspect | Current (Electron) | Chromium Fork | Improvement |
|--------|-------------------|---------------|-------------|
| Data storage | Flat JSON files | SQLite via Chromium's `sql::Database` | ACID transactions, crash safety |
| Bookmark model | JS array | Chromium's `BookmarkModel` (C++) | Hierarchical folders, synced, fast search |
| History model | JS array (max 1000) | Chromium's `HistoryService` (C++, SQLite) | Full-text search, favicons, visit counts |
| Internal pages | Custom protocol + inline HTML | Chromium's `WebUI` system (`chrome://` style) | Proper CSP, i18n, Mojo bindings |
| Protocol | `eesha://` | `eesha://` (registered via `content::URLDataSource`) | Same UX, native implementation |

**Migration approach:** Register `eesha://` scheme via Chromium's `content::URLDataSource` infrastructure (same way `chrome://` pages work). Build each internal page as a `WebUIController` that serves HTML/CSS/JS and communicates with C++ backend via Chromium's Mojo IPC. Use Chromium's built-in `BookmarkModel` and `HistoryService` instead of flat JSON files.

**Verdict: FULL PARITY + improved data safety and search**

### 3.6 Downloads Manager

**Current Electron implementation:**
- `main.js`: Electron's `session.on('will-download')` handler
- Custom download tracking in JS array
- `eesha://downloads` internal page

**Chromium fork mapping:**
| Aspect | Current (Electron) | Chromium Fork | Improvement |
|--------|-------------------|---------------|-------------|
| Download engine | Electron's `DownloadItem` | Chromium's `DownloadManager` (C++) | Full-featured: resume, pause, speed, retry |
| Download UI | Custom HTML page | Chromium Views download shelf + `eesha://downloads` | Native animated shelf, drag-to-desktop |
| Progress tracking | JS polling | C++ `DownloadItem::Observer` | Real-time, zero overhead |

**Migration approach:** Use Chromium's built-in download system. Add custom `eesha://downloads` WebUI page. Optionally add a download shelf view using Chromium's Views framework.

**Verdict: FULL PARITY + native download shelf, resume support**

### 3.7 Find in Page

**Current Electron implementation:**
- `preload.js`: `findInPage()`, `stopFindInPage()` IPC calls
- `app.js`: Custom find bar UI with prev/next/count

**Chromium fork mapping:**
Chromium has a complete, production-grade find-in-page implementation. Use it directly.

| Aspect | Current (Electron) | Chromium Fork |
|--------|-------------------|---------------|
| Search engine | Electron's `webContents.findInPage` | Chromium's `FindTabHelper` |
| UI | Custom HTML bar | Chromium Views `FindBarView` (or custom Eesha bar) |
| Features | Basic prev/next | Regex, case-sensitive, highlight all matches |

**Migration approach:** Use Chromium's `FindTabHelper` directly. Build a custom find bar using Chromium Views to match Eesha's UI style, or use the default Chromium find bar as a starting point.

**Verdict: FULL PARITY (Chromium has this built-in)**

### 3.8 Custom New Tab Page

**Current Electron implementation:**
- `main.js`: `getNewTabHTML()` generates inline HTML
- Search bar, shortcut icons with favicons, private mode variant

**Chromium fork mapping:**
| Aspect | Current (Electron) | Chromium Fork |
|--------|-------------------|---------------|
| Page serving | Inline HTML via custom protocol | `WebUI` page at `eesha://newtab` |
| Search integration | JS `window.eesha.navigate()` | Mojo IPC to browser process → Omnibox |
| Shortcuts | Hardcoded HTML | Configurable, synced, with real favicons via `FaviconService` |
| Private mode | Separate `isPrivate` template | Same page with `OffTheRecord` profile context |

**Migration approach:** Build `eesha://newtab` as a `WebUIController`. Port the existing HTML/CSS/JS almost directly. Replace `window.eesha.navigate()` calls with Mojo IPC. Use Chromium's `TopSites` and `FaviconService` APIs for dynamic shortcut generation.

**Verdict: FULL PARITY + dynamic shortcuts, synced**

### 3.9 Address Bar Autocomplete

**Current Electron implementation:**
- `app.js`: Custom fuzzy-matching autocomplete against bookmarks + history
- Dropdown with bookmark/history icons, keyboard navigation

**Chromium fork mapping:**
| Aspect | Current (Electron) | Chromium Fork |
|--------|-------------------|---------------|
| Autocomplete engine | Custom JS fuzzy match | Chromium's `AutocompleteController` (C++) |
| Providers | Bookmarks + history | Bookmarks, history, search, clipboard, zero-suggest |
| Performance | JS search on every keystroke | C++ indexed search, <1ms |
| Features | Basic title/URL match | Omnibox: search suggestions, URL correction, clipboard URL |

**Migration approach:** Use Chromium's built-in Omnibox. Customize the `AutocompleteProvider` list to include Eesha's search engine choices. Add Eesha-specific providers if needed.

**Verdict: FULL PARITY + vastly superior autocomplete (Chromium's is production-grade)**

### 3.10 Settings Page

**Current Electron implementation:**
- `main.js`: `getSettingsHTML()` inline HTML
- Toggle switches for: ad blocker, HTTPS-only, fingerprint protection, WebRTC
- Search engine selector, homepage URL input
- Clear history/cookies/data buttons

**Chromium fork mapping:**
| Aspect | Current (Electron) | Chromium Fork |
|--------|-------------------|---------------|
| Settings page | Custom HTML | `eesha://settings` WebUI + Chromium's `PrefService` |
| Preference storage | JSON file | Chromium's `JsonPrefStore` (existing, battle-tested) |
| Privacy toggles | Custom JS | Chromium's `HostContentSettingsMap` + Eesha extensions |
| Data clearing | `session.clearData()` | Chromium's `BrowsingDataRemover` (C++) |

**Migration approach:** Build `eesha://settings` as a WebUI page. Use Chromium's `PrefService` for storage. Add Eesha-specific privacy preferences as custom `Pref` entries. Clear browsing data via Chromium's existing `BrowsingDataRemover`.

**Verdict: FULL PARITY + standards-compliant preference storage, enterprise policy support**

### 3.11 Shield/Security Indicator

**Current Electron implementation:**
- `app.js`: Shield icon with badge count, popup with blocked count + status
- Security indicator (lock/info icon) based on URL scheme
- Per-tab state tracking

**Chromium fork mapping:**
| Aspect | Current (Electron) | Chromium Fork |
|--------|-------------------|---------------|
| Security indicator | JS DOM manipulation | Chromium's `SecurityStateModel` + `LocationBarView` |
| Shield icon | Custom HTML element | Chromium Views `ImageView` + badge overlay |
| Popup | Custom HTML popup | Chromium Views `BubbleDialog` (native, GPU-accelerated) |
| Per-tab state | JS variables | C++ `TabSpecificContentSettings` |

**Migration approach:** Extend Chromium's `LocationBarView` to add a shield icon. Use `BubbleDialog` for the shield popup. Wire to C++ blocking stats via `TabSpecificContentSettings`.

**Verdict: FULL PARITY + native UI, better performance**

### 3.12 Summary Table

| Feature | Full Parity? | Improvement? | Effort |
|---------|-------------|-------------|--------|
| Tab management | YES | Memory -40%, native UI | High |
| Ad/tracker blocking | YES | 10-100x faster, cosmetic filtering | High |
| HTTPS-only mode | YES | Uses Chromium built-in | Low |
| Fingerprint protection | YES | Undetectable (C++ level) | Medium |
| Bookmarks/History | YES | SQLite, full-text search | Medium |
| Downloads | YES | Resume, native shelf | Low |
| Find in page | YES | Chromium built-in | Low |
| Custom new tab | YES | Dynamic shortcuts, favicons | Medium |
| Address bar autocomplete | YES | Chromium Omnibox | Low |
| Settings page | YES | PrefService, enterprise policies | Medium |
| Shield/security indicator | YES | Native Views UI | Medium |

**Overall verdict: Every feature can be retained. Most will be significantly improved.**

---

## 4. Architecture

### 4.1 High-Level Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    Eesha Browser Process                      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  Eesha UI     │  │  Eesha       │  │  Chromium          │ │
│  │  (Views/C++)  │  │  Components  │  │  Browser           │ │
│  │              │  │  (C++)       │  │  (patched)         │ │
│  │  - Tab strip │  │              │  │                    │ │
│  │  - URL bar   │  │  - Ad block  │  │  - Profile mgmt    │ │
│  │  - Find bar  │  │  - Shield    │  │  - Bookmark model  │ │
│  │  - Shield UI │  │  - HTTPS     │  │  - History service │ │
│  │  - Settings  │  │  - Fingerpr. │  │  - Download mgr    │ │
│  └──────┬───────┘  └──────┬───────┘  │  - Autocomplete    │ │
│         │                  │          │  - Preferences     │ │
│         └────────┬─────────┘          └─────────┬──────────┘ │
│                  │                              │             │
│         ┌────────┴──────────┐                   │             │
│         │   Mojo IPC        │                   │             │
│         │   (Browser↔UI)    │                   │             │
│         └────────┬──────────┘                   │             │
└──────────────────┼──────────────────────────────┼─────────────┘
                   │                              │
┌──────────────────┼──────────────────────────────┼─────────────┐
│  Renderer Process│                              │             │
│                  ▼                              ▼             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                  Blink Renderer Engine                    │ │
│  │                                                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │ │
│  │  │  Eesha        │  │  Web         │  │  Eesha         │ │ │
│  │  │  Renderer     │  │  Content     │  │  Content       │ │ │
│  │  │  Hooks (C++)  │  │  (standard)  │  │  Scripts (JS)  │ │ │
│  │  │              │  │              │  │                │ │ │
│  │  │ - Fingerprint│  │ - HTML/CSS   │  │ - New tab page │ │ │
│  │  │   noise      │  │ - JavaScript │  │ - Settings UI  │ │ │
│  │  │ - API hooks  │  │ - DOM        │  │ - Bookmarks UI │ │ │
│  │  │ - Cosmetic   │  │ - Layout     │  │ - Downloads UI │ │ │
│  │  │   filter CSS │  │ - Painting   │  │                │ │ │
│  │  └──────────────┘  └──────────────┘  └────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Directory Structure

```
chromium/                              # Chromium source (from depot_tools)
  src/
    eesha/                             # All Eesha-specific code
      browser/                         # Browser-process C++ code
        ui/                            # Views-based UI
          views/
            tab_strip.h/cc             # Custom tab strip
            shield_icon.h/cc           # Shield indicator
            location_bar.h/cc          # URL bar with shield
            find_bar.h/cc              # Custom find bar
        profiles/                      # Profile management
          profile_manager.h/cc         # Eesha profile setup
        net/                           # Network customizations
          ad_block_throttle.h/cc       # Ad blocking URL throttle
          https_upgrade_throttle.h/cc  # HTTPS-only enforcement
        webui/                         # Internal pages
          newtab_ui.h/cc               # eesha://newtab
          settings_ui.h/cc             # eesha://settings
          bookmarks_ui.h/cc            # eesha://bookmarks
          history_ui.h/cc              # eesha://history
          downloads_ui.h/cc            # eesha://downloads
      components/                      # Reusable C++ components
        ad_block/                      # Ad blocking engine
          ad_block_service.h/cc        # Service interface
          blocklist_parser.h/cc        # Parse blocked-domains.json → trie
          blocklist_trie.h/cc          # Compiled binary trie
          cosmetic_filter.h/cc         # CSS rule injection
        shield/                        # Privacy shield component
          shield_service.h/cc          # Per-site shield state
          shield_controller.h/cc       # Shield popup logic
        fingerprint/                   # Fingerprint protection
          canvas_noise.h/cc            # Canvas fingerprint noise
          webgl_spoof.h/cc             # WebGL renderer spoofing
          audio_noise.h/cc             # AudioContext noise
          navigator_override.h/cc      # Navigator property overrides
      renderer/                        # Renderer-process C++ code
        ad_block_render_observer.h/cc  # Cosmetic filter injection
        fingerprint_render_observer.h/cc # Fingerprint protection hooks
      common/                          # Shared types and constants
        eesha_constants.h              # URLs, version numbers
        eesha_switches.h/cc            # Command-line switches
        pref_names.h/cc                # Preference key names
      tools/                           # Build and dev tools
        build_eesha.py                 # Master build script
        convert_blocklist.py           # JSON → binary trie converter
        generate_grit.py               # Resource file generator
      resources/                       # UI resources
        newtab.html                    # New tab page HTML
        newtab.css                     # New tab page styles
        newtab.js                      # New tab page logic
        settings.html/css/js           # Settings page
        bookmarks.html/css/js          # Bookmarks page
        history.html/css/js            # History page
        downloads.html/css/js          # Downloads page
        icons/                         # Eesha icons, logos
        themes/                        # Theme assets
      app/                             # Entry point
        eesha_main_delegate.h/cc       # Main delegate (replaces chrome_main)
        eesha_content_client.h/cc      # Content client configuration
```

### 4.3 C++ vs JavaScript/CSS Boundaries

| Layer | Language | Rationale |
|-------|----------|-----------|
| Tab strip, URL bar, find bar, shield UI | **C++ (Views)** | Must run in browser process, GPU-accelerated, native feel |
| Ad blocking request interception | **C++** | Must be synchronous (or very fast async) in network stack |
| Fingerprint protection (canvas, WebGL, audio, WebRTC) | **C++ (Blink patches)** | Must run before page scripts, undetectable |
| HTTPS-only enforcement | **C++** | Network stack level, Chromium built-in |
| Bookmark/History data layer | **C++** | Chromium's existing services |
| Internal page **layout** (eesha://newtab, settings, etc.) | **HTML/CSS/JS** | Served by WebUI, runs in renderer process |
| Internal page **backend communication** | **Mojo IPC** | JS → C++ bridge (like Electron's IPC but typed and secure) |
| Blocklist compilation | **Python (build-time)** | Convert JSON → binary trie during build |
| Preference storage | **C++ (PrefService)** | Chromium's existing system |
| Extensions support (future) | **C++ + JS** | Chromium's extension system |

**Key principle:** Security-critical code (ad blocking, fingerprint protection, HTTPS enforcement) MUST be in C++ because JavaScript can be bypassed by page scripts or extensions. UI chrome MUST be C++ Views for native feel and GPU acceleration. Internal page UIs CAN be HTML/CSS/JS because they run in a privileged renderer.

### 4.4 How Eesha Patches Chromium

Eesha will NOT fork the entire `//chrome` directory. Instead, we use a **patch stack** approach:

1. **Add** `src/eesha/` directory with all new code
2. **Patch** a minimal set of Chromium files:
   - `BUILD.gn` files: Add `//eesha` targets
   - `chrome/browser/chrome_browser_main_extra_parts_profiles.cc`: Register Eesha profile
   - `chrome/browser/ui/browser_view.cc`: Add shield icon, custom tab strip
   - `content/public/browser/content_browser_client.h`: Override for ad blocking
   - `chrome/common/chrome_switches.cc`: Add Eesha command-line flags
3. **Replace** the `//chrome` main delegate with `//eesha` main delegate

This means when we rebase onto a new Chromium version, we only need to resolve conflicts in our patched files, not in the entire codebase.

---

## 5. Migration Path

### Phase 1: Foundation (Months 1-3)

**Goal:** Get Chromium building with Eesha branding, basic window opens.

| Step | Task | Details |
|------|------|---------|
| 1.1 | Set up build environment | Install `depot_tools`, `gclient sync` Chromium, verify `ninja` build works |
| 1.2 | First successful build | Build `chrome` target, verify it runs |
| 1.3 | Create `src/eesha/` scaffold | Directory structure from Section 4.2 |
| 1.4 | Eesha main delegate | Replace `ChromeMainDelegate` with `EeshaMainDelegate` |
| 1.5 | Branding changes | Product name "Eesha", icon, user agent string |
| 1.6 | Custom `eesha://` protocol | Register scheme, serve "Hello from Eesha" page |
| 1.7 | CI/CD pipeline | Automated build on Linux, Windows, macOS |

**Milestone:** `./out/Default/eesha` opens a window with Eesha branding, can load web pages, has `eesha://version` page.

**Risk:** Build environment setup can take 1-2 weeks on its own. First build takes 6+ hours. Subsequent builds 20-40 minutes (incremental).

### Phase 2: Core Integration (Months 3-6)

**Goal:** Privacy and security features working in C++.

| Step | Task | Details |
|------|------|---------|
| 2.1 | Ad blocking engine | Port `blocked-domains.json` → C++ trie, `URLLoaderThrottle` for blocking |
| 2.2 | HTTPS-only mode | Enable Chromium's built-in HTTPS-Only, default ON |
| 2.3 | Fingerprint protection (Blink) | Canvas noise, WebGL spoof, AudioContext noise in C++ |
| 2.4 | WebRTC leak prevention | C++ PeerConnection policy override |
| 2.5 | Shield component | C++ service tracking blocked count per tab |
| 2.6 | Preference system | Eesha prefs in Chromium's `PrefService` |
| 2.7 | Blocklist build tool | Python script: `blocked-domains.json` → compiled binary |
| 2.8 | Private/Incognito tabs | Chromium's `OffTheRecord` profile, verified working |

**Milestone:** Eesha Chromium fork blocks ads, enforces HTTPS, protects fingerprints — all in C++. Privacy features are undetectable and faster than the Electron version.

### Phase 3: Feature Parity (Months 6-9)

**Goal:** Every Electron feature is replicated. Can switch daily driver.

| Step | Task | Details |
|------|------|---------|
| 3.1 | Eesha tab strip | Custom Views tab strip with Eesha styling |
| 3.2 | Eesha URL bar | Custom `LocationBarView` with shield icon |
| 3.3 | Shield popup | Views `BubbleDialog` with blocked count, status toggles |
| 3.4 | `eesha://newtab` | WebUI page with search, shortcuts, favicons |
| 3.5 | `eesha://settings` | WebUI page with all toggle switches |
| 3.6 | `eesha://bookmarks` | WebUI page using Chromium's `BookmarkModel` |
| 3.7 | `eesha://history` | WebUI page using Chromium's `HistoryService` |
| 3.8 | `eesha://downloads` | WebUI page + download shelf |
| 3.9 | Find in page | Chromium's built-in + custom find bar Views |
| 3.10 | Autocomplete | Chromium Omnibox with Eesha search engines |
| 3.11 | Data migration | Import Electron bookmarks/history → Chromium format |
| 3.12 | Keyboard shortcuts | Port all Ctrl+T/W/L/F/J/D shortcuts |

**Milestone:** The Chromium fork has every feature that the Electron version has. Side-by-side testing confirms feature parity. Internal dogfooding begins.

### Phase 4: Release (Months 9-12)

**Goal:** Production-ready browser, auto-update, multi-platform.

| Step | Task | Details |
|------|------|---------|
| 4.1 | Performance benchmarking | Memory, startup time, page load vs Electron version |
| 4.2 | Security audit | Verify all privacy features work correctly |
| 4.3 | Auto-update system | Chromium's update framework, Eesha update server |
| 4.4 | Crash reporting | Opt into/out of crash reports |
| 4.5 | Windows installer | NSIS or MSI installer |
| 4.6 | macOS DMG | Code-signed DMG with app bundle |
| 4.7 | Linux packages | .deb, .rpm, AppImage, Flatpak |
| 4.8 | Alpha release | Limited release to testers |
| 4.9 | Beta release | Public beta with auto-update |
| 4.10 | 1.0 release | Stable release, Electron version deprecated |
| 4.11 | Rebase process | Document and automate Chromium version tracking |

**Milestone:** Eesha 1.0 released as a Chromium fork. Electron version enters maintenance mode (security fixes only).

---

## 6. Ladybird Integration

### 6.1 What is Ladybird?

Ladybird is a brand-new, from-scratch web browser engine being developed by Andreas Kling and contributors. Key characteristics:

- **Independent engine**: Not a Chromium or Firefox fork — entirely new codebase
- **C++ based**: Modern C++ with no legacy baggage
- **LibWeb + LibJS**: Custom HTML/CSS renderer and JavaScript engine
- **Goal**: Full web standards compliance
- **Status**: Pre-alpha (as of early 2025) — can render many sites but not production-ready
- **License**: BSD-2-Clause

### 6.2 Why Ladybird Matters for Eesha

Ladybird represents the **ultimate independence** goal. While a Chromium fork gives Eesha control, it still depends on Google's engine. Ladybird would give Eesha:

- **Zero Google dependency**: No Chromium, no Blink, no V8
- **No tracking concerns**: No Google services, no update pings to Google
- **Minimal attack surface**: Clean, small codebase vs Chromium's 35M+ lines
- **Differentiation**: Only independent browser engines: Firefox, Safari, Ladybird
- **Long-term sustainability**: Not subject to Google's Chromium decisions

### 6.3 When Would Switching Make Sense?

| Condition | Chromium Fork | Ladybird |
|-----------|--------------|----------|
| Web compatibility | 100% | 70-90% (as of 2025) |
| Production readiness | Now | 2027-2028 (estimated) |
| Maintenance burden | High (tracking Chromium) | Medium (smaller codebase) |
| Independence from Big Tech | Low (Chromium = Google) | High (independent) |
| Performance | Excellent | Good (improving) |
| Ecosystem compatibility | Perfect | Good but incomplete |

**Realistic timeline:**

```
2025:    Chromium fork (this plan) — ship Eesha 1.0
2026:    Track Chromium, monitor Ladybird progress
2027:    Evaluate Ladybird for alpha-quality Eesha build
2028:    If Ladybird reaches beta quality, begin dual-engine strategy
2029+:   If Ladybird matures, consider full switch
```

### 6.4 Dual-Engine Strategy

The recommended approach is **NOT an either/or decision**. Instead:

1. **Short-term (2025-2027)**: Ship Chromium fork as the primary desktop browser
2. **Medium-term (2027-2029)**: Offer Ladybird as an experimental rendering mode (like Opera's "IE tab" of yore, but with Ladybird engine)
3. **Long-term (2029+)**: If Ladybird achieves full web compatibility, transition the default engine

This is analogous to how:
- Brave started on Electron, moved to Chromium, and could theoretically move again
- Edge started on EdgeHTML, moved to Chromium
- Eesha would start on Chromium, potentially move to Ladybird

**Architecture for dual-engine support:**
```
┌─────────────────────────────────────────┐
│           Eesha Browser UI              │
│         (Views, same for both)          │
├─────────────────┬───────────────────────┤
│  Chromium Mode  │  Ladybird Mode        │
│  (Blink/V8)     │  (LibWeb/LibJS)       │
│  100% compat    │  70-90% compat        │
│  Default        │  Experimental         │
└─────────────────┴───────────────────────┘
```

### 6.5 When NOT to Switch to Ladybird

- If Ladybird development stalls or is abandoned
- If Ladybird cannot reach >95% web compatibility on top sites
- If the maintenance burden of two engines is unsustainable for the team size
- If a critical mass of users depend on Chromium-specific features (extensions, DRM, etc.)

**Key principle: Never sacrifice user experience for ideology. Ship Chromium fork now, evaluate Ladybird when it's ready.**

---

## 7. Build System

### 7.1 Prerequisites

| Requirement | Details |
|-------------|---------|
| OS | Linux (Ubuntu 22.04+ recommended), macOS 12+, Windows 10+ |
| Disk space | 100GB+ for source + build artifacts |
| RAM | 16GB minimum, 32GB+ recommended |
| CPU | 8+ cores recommended |
| Network | Fast internet for initial `gclient sync` (~25GB download) |
| depot_tools | Google's build toolchain (`gclient`, `gn`, `ninja`) |

### 7.2 Setup Process

```bash
# 1. Install depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH=$PATH:/path/to/depot_tools

# 2. Fetch Chromium source
mkdir chromium && cd chromium
fetch --nohooks chromium
# This downloads ~25GB, takes 30-60 minutes

# 3. Install build dependencies (Linux)
src/build/install-build-deps.sh

# 4. Run hooks (generates build files, downloads toolchains)
gclient runhooks
# Takes 20-40 minutes

# 5. Configure build
gn args out/Default
# Add: is_debug = false, is_component_build = false

# 6. Build
ninja -C out/Default chrome
# Full build: 2-6 hours on 8-core machine
# Incremental: 5-20 minutes for small changes
```

### 7.3 Build Times

| Build Type | Clean Build | Incremental Build |
|------------|------------|-------------------|
| Full (Debug) | 4-8 hours | 10-30 minutes |
| Full (Release) | 2-6 hours | 5-20 minutes |
| Component build (Debug) | 1-3 hours | 1-5 minutes |
| With Eesha patches | +5-10 minutes | +1-2 minutes |

**Tip:** Use component builds (`is_component_build = true`) during development for much faster iteration. Switch to release builds for testing and shipping.

### 7.4 Eesha Build Customization

```python
# args.gn for Eesha development
is_debug = true
is_component_build = true
enable_nacl = false
use_sysroot = false
# Disable features we don't need to speed up build
chrome_pgo_phase = 0
optimize_webui = false
```

### 7.5 Build Automation

```
eesha/tools/build_eesha.py
  ├── sync          # gclient sync + apply patches
  ├── build         # ninja build
  ├── package       # Create installer/dmg/deb
  ├── test          # Run test suite
  └── rebase        # Rebase patches onto new Chromium version
```

### 7.6 Cross-Platform Build

| Platform | Build Machine | Output |
|----------|--------------|--------|
| Linux | Linux | .deb, .rpm, AppImage |
| Windows | Windows or cross-compile | .exe (NSIS installer) |
| macOS | macOS only (Apple requirement) | .dmg (signed app bundle) |

Cross-compilation is NOT recommended for macOS (Apple requires building on macOS for code signing and notarization).

---

## 8. Risks and Challenges

### 8.1 High-Risk Items

#### 8.1.1 Chromium Rebase Maintenance Burden

**Risk:** Chromium releases a new stable version every 4 weeks. Each release may break Eesha patches.

**Impact:** If we fall behind by more than 2-3 Chromium versions, users are exposed to known security vulnerabilities.

**Mitigation:**
- Maintain a minimal patch set (fewer patches = fewer conflicts)
- Automate rebase process with `git rebase` scripts
- Allocate 1 engineer to rebase duty full-time
- Track Chromium Canary/Dev channel to catch breakage early
- Brave manages this with a team of ~5 engineers

**Estimated effort:** 1-2 engineer-days per Chromium release for rebase + testing.

#### 8.1.2 Build Infrastructure Cost

**Risk:** Building Chromium requires significant compute resources.

**Impact:** Without proper CI/CD infrastructure, builds take hours, slowing development.

**Mitigation:**
- Use cloud build farms (Google Cloud Build, AWS CodeBuild)
- Cache build artifacts aggressively
- Use component builds for development
- Consider using Chromium's distributed build system (`ccache`, `sccache`, or Goma)

**Estimated cost:** $500-2000/month for CI/CD during active development.

#### 8.1.3 Team C++ Expertise

**Risk:** The current team may be primarily JavaScript/TypeScript developers. Chromium is C++.

**Impact:** Slow development, incorrect patches, hard-to-debug crashes.

**Mitigation:**
- Hire or contract 1-2 C++ developers with Chromium or browser experience
- Invest in C++ training for existing team
- Start with WebUI pages (HTML/CSS/JS) and gradually move to C++
- Leverage Chromium's existing features (HTTPS-only, find, downloads) rather than reimplementing

#### 8.1.4 Code Review and Security

**Risk:** Chromium's codebase is enormous (35M+ lines). Incorrect patches can introduce security vulnerabilities.

**Impact:** Browser security is critical. A single bug can compromise all users.

**Mitigation:**
- External security audit before 1.0 release
- Follow Chromium's security best practices
- Use Chromium's existing sandboxing and process isolation
- Minimal patch approach: less code = less attack surface
- Establish a responsible disclosure process

### 8.2 Medium-Risk Items

#### 8.2.1 Google Service Dependencies

**Risk:** Chromium has many Google service integrations (Safe Browsing, update check, telemetry, spell check, translation).

**Impact:** These services may send data to Google, contradicting Eesha's privacy-first mission.

**Mitigation:**
- Disable all Google service integrations at compile time
- Replace Safe Browsing with a local blocklist
- Replace Google spell check with local dictionary (hunspell)
- Remove Google update check, implement Eesha's own update system
- Audit all outbound network connections

#### 8.2.2 DRM/Widevine Support

**Risk:** Some video streaming services (Netflix, Disney+) require Widevine DRM, which is proprietary and requires a Google license.

**Impact:** Without Widevine, users cannot stream DRM content.

**Mitigation:**
- Option 1: License Widevine CDM from Google (Chromium supports this)
- Option 2: Ship without DRM, let users opt in (Brave ships with Widevine disabled by default)
- Recommended: Follow Brave's approach — Widevine available but disabled by default

#### 8.2.3 Extension Compatibility

**Risk:** Chrome Web Store extensions may not work if we remove or change too many Chrome APIs.

**Impact:** Users who rely on Chrome extensions will be frustrated.

**Mitigation:**
- Keep Chromium's extension system intact
- Ensure `chrome.*` APIs are available to extensions
- Test top 100 Chrome extensions for compatibility
- Document any known incompatibilities

### 8.3 Low-Risk Items

| Risk | Impact | Mitigation |
|------|--------|------------|
| Build takes too long | Slower development | Component builds, sccache, cloud builds |
| Platform-specific bugs | Bad UX on some OS | Test on all 3 platforms in CI |
| User data migration | Users lose bookmarks/history | Build migration tool (Electron JSON → Chromium SQLite) |
| Branding inconsistencies | Confusing UX | Audit all user-facing strings |
| License compliance | Legal risk | Chromium is BSD-3, Ladybird is BSD-2 — both permissive |

### 8.4 Risk Summary Matrix

| Risk | Probability | Impact | Priority |
|------|------------|--------|----------|
| Rebase maintenance | HIGH | HIGH | P0 |
| Build infrastructure cost | CERTAIN | MEDIUM | P1 |
| C++ expertise gap | MEDIUM | HIGH | P1 |
| Security vulnerabilities | LOW | CRITICAL | P0 |
| Google service leakage | MEDIUM | HIGH | P1 |
| DRM/Widevine | LOW | MEDIUM | P2 |
| Extension compatibility | LOW | MEDIUM | P2 |

---

## 9. Team and Resource Estimates

### 9.1 Minimum Viable Team

| Role | Count | Responsibilities |
|------|-------|-----------------|
| C++/Chromium engineer (senior) | 2 | Core architecture, Blink patches, build system |
| Frontend engineer (C++ Views) | 1 | Browser chrome UI, shield UI |
| WebUI engineer (HTML/CSS/JS) | 1 | Internal pages, data migration |
| DevOps/Build engineer | 1 | CI/CD, build automation, packaging |
| QA engineer | 1 | Cross-platform testing, regression testing |
| **Total** | **6** | |

### 9.2 Timeline with Minimum Team

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Phase 1: Foundation | 3 months | 3 months |
| Phase 2: Core Integration | 3 months | 6 months |
| Phase 3: Feature Parity | 3 months | 9 months |
| Phase 4: Release | 3 months | 12 months |

**Note:** This assumes the team works full-time on the migration. With a smaller or part-time team, multiply by 1.5-2x.

### 9.3 Budget Estimate (First Year)

| Item | Monthly Cost | Annual Cost |
|------|-------------|-------------|
| Engineering salaries (6 people) | $60,000 | $720,000 |
| Cloud build infrastructure | $1,500 | $18,000 |
| Code signing certificates (macOS, Windows) | $500 | $6,000 |
| Security audit (one-time) | — | $50,000 |
| Miscellaneous (licenses, tools) | $500 | $6,000 |
| **Total** | | **~$800,000** |

---

## 10. Decision Matrix

### 10.1 Should We Do This?

| Factor | Electron (Status Quo) | Chromium Fork | Ladybird |
|--------|----------------------|---------------|----------|
| Development speed | Fast | Slow (1 year) | Very slow (3-5 years) |
| Web compatibility | 100% | 100% | 70-90% |
| Memory usage | High (Node overhead) | Medium | Low |
| Security surface | Large (Node.js + Chromium) | Medium (Chromium only) | Small |
| Privacy control | Limited (JS-level) | Full (C++ level) | Full |
| Maintenance burden | Low (Electron updates) | High (Chromium rebase) | Medium |
| Independence | Low (Electron = OpenJSF) | Low (Chromium = Google) | High |
| Extension support | None | Full (Chrome extensions) | None |
| DRM streaming | Custom | Widevine available | None |
| Brand control | Limited | Full | Full |

### 10.2 Recommended Strategy

```
┌─────────────────────────────────────────────────────────────┐
│  2025 Q1-Q4: Begin Chromium fork migration (this plan)     │
│  2026 Q1:    Ship Eesha 1.0 on Chromium fork              │
│  2026 Q2-Q4: Maintain Chromium fork, monitor Ladybird      │
│  2027:       Evaluate Ladybird alpha integration            │
│  2028:       If viable, begin dual-engine strategy          │
│  2029+:      Reassess based on Ladybird maturity            │
└─────────────────────────────────────────────────────────────┘
```

**The answer is YES — we should migrate to a Chromium fork.** The Electron version has served us well for rapid prototyping, but a privacy-first browser needs C++-level control over the rendering and networking stack. Ladybird is the right long-term vision, but it's not ready today. The Chromium fork is the bridge.

---

## Appendix A: Current Electron Architecture Reference

For reference, here is the current Eesha Electron architecture being migrated from:

```
desktop/
  main.js          # Main process: tabs, ad blocking, HTTPS, protocols, downloads
  preload.js       # IPC bridge: navigate, tabs, bookmarks, history, settings, find
  renderer/
    index.html     # Browser chrome DOM: tab bar, URL bar, shield, find bar
    app.js         # Browser chrome logic: tab management, autocomplete, shield popup
    styles.css     # Browser chrome styling
shared/
  security/
    blocked-domains.json      # ~200+ domains in 6 categories
    fingerprint-protection.js # Canvas, WebGL, audio, navigator, WebRTC overrides
    https-only.js             # Fetch/XHR HTTP→HTTPS upgrade
  resources/
    newtab.html               # New tab page template
  icons/                      # App icons and logos
```

**Key data flows in Electron version:**
- Ad blocking: `blocked-domains.json` → loaded into `Set` → `webRequest.onBeforeRequest` → callback `{cancel: true}`
- Fingerprint protection: JS file → `executeJavaScript()` injection on every page load
- HTTPS-only: `webRequest.onBeforeRequest` → redirect `http://` to `https://`
- IPC: `preload.js` (contextBridge) ↔ `ipcMain` handlers ↔ renderer
- Data: JSON files in `app.getPath('userData')`
- Internal pages: Inline HTML strings served via `eesha://` custom protocol

---

## Appendix B: Useful Chromium Entry Points

| Feature | Chromium Entry Point | File |
|---------|---------------------|------|
| Ad blocking | `ContentBrowserClient::ShouldAllowDownload` | `content/public/browser/` |
| URL interception | `URLLoaderThrottle` | `services/network/public/mojom/` |
| Fingerprint (canvas) | `SkCanvas::onDraw` | `third_party/skia/` |
| Fingerprint (WebGL) | `gpu::GpuService` | `gpu/ipc/service/` |
| HTTPS-only | `HttpsOnlyMode` | `chrome/browser/https_only_mode/` |
| Internal pages | `WebUIController` | `content/public/browser/web_ui.h` |
| Custom protocol | `URLDataSource` | `content/public/browser/url_data_source.h` |
| Tab strip | `TabStripModel` | `chrome/browser/ui/tabs/` |
| Bookmarks | `BookmarkModel` | `components/bookmarks/browser/` |
| History | `HistoryService` | `components/history/core/browser/` |
| Downloads | `DownloadManager` | `content/public/browser/download_manager.h` |
| Find in page | `FindTabHelper` | `chrome/browser/ui/find_bar/` |
| Omnibox | `AutocompleteController` | `components/omnibox/browser/` |
| Preferences | `PrefService` | `components/prefs/` |
| Profile | `Profile` | `chrome/browser/profiles/` |
| Views UI | `views::View` | `ui/views/` |

---

*End of document. This plan should be reviewed quarterly and updated as Chromium and Ladybird evolve.*
