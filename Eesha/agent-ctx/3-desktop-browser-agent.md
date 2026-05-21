# Task 3 - Desktop Browser Agent

## Task: Update Desktop browser to use SearXNG JSON API with native Eesha-branded search results

## Files Modified
- `desktop/main.js` - Main Electron process (major changes)
- `desktop/renderer/app.js` - Browser chrome renderer (minor changes)

## Summary of Changes

### desktop/main.js
1. Removed `net` from Electron imports (no longer needed)
2. Removed Browser-as-Crawler module (SUBMIT_ENDPOINT, CRAWL_RATE_LIMIT_MS, submitPageToSearchEngine, crawlPageOnLoad)
3. Added SEARXNG_API_URL and SEARCH_URL constants
4. Changed default search engine URL from `https://eesha-search.onrender.com/search?q=` to `eesha://search?q=`
5. Updated getSearchEngine() fallback to `eesha://search?q=`
6. Updated engine name detection in getNewTabHTML() to recognize `eesha://search`
7. Updated Eesha Search shortcut href from `https://eesha-search.onrender.com` to `eesha://search`
8. Created getSearchResultsHTML(query) function with:
   - Empty query mode: Eesha Search landing page
   - Query mode: Full search results page fetching from SearXNG JSON API
   - Dark theme (#1a1a2e, #e94560 accent)
   - Category tabs (All, Images, Videos, News)
   - Loading, error, and no-results states
   - "Powered by Eesha" footer (zero third-party branding)
   - CSP allowing connect-src to eesha-search.onrender.com
9. Added eesha://search protocol handler in both default and private sessions
10. Updated settings page search engine dropdown:
    - Eesha Search (Default) → `eesha://search?q=`
    - Removed SearXNG (localhost:8888) option
11. Fixed duplicate fingerprint injection in did-finish-load/did-stop-loading handlers

### desktop/renderer/app.js
1. Added SEARCH_URL constant (`eesha://search`)
2. Updated getSearchEngine() fallback to `eesha://search?q=`
3. Updated engine name detection in 3 places to recognize `eesha://search`
4. Added 🔍 icon for eesha://search in getInternalPageIcon()
5. Added #1a1a2e color for eesha://search in getInternalPageColor()
