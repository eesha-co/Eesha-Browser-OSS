// main.js - Eesha Browser Electron Main Process
// A privacy-first browser powered by Chromium via Electron

const {
  app,
  BaseWindow,
  WebContentsView,
  BrowserWindow,
  ipcMain,
  session,
  protocol,
  dialog,
  Menu,
  clipboard,
  globalShortcut,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Protocol Registration (MUST be before app.ready) ────────────────────────
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'eesha',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: false,
    },
  },
]);

// ─── Constants ────────────────────────────────────────────────────────────────
const APP_VERSION = '0.9.9';
const USER_AGENT_SUFFIX = `Eesha/${APP_VERSION}`;
const GITHUB_REPO = 'eesha-co/Eesha';
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const NEWTAB_URL = 'eesha://newtab';
const SETTINGS_URL = 'eesha://settings';
const BOOKMARKS_URL = 'eesha://bookmarks';
const HISTORY_URL = 'eesha://history';
const DOWNLOADS_URL = 'eesha://downloads';
const BOOKMARKS_FILE = path.join(app.getPath('userData'), 'bookmarks.json');
const HISTORY_FILE = path.join(app.getPath('userData'), 'history.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const MAX_HISTORY_ENTRIES = 1000;
const CHROME_HEIGHT = 82; // Tab bar + URL bar height in pixels

// ─── Resource Paths ──────────────────────────────────────────────────────────
const SHARED_DIR = fs.existsSync(path.join(__dirname, '..', 'shared'))
  ? path.join(__dirname, '..', 'shared')
  : path.join(process.resourcesPath, 'shared');
const ICONS_DIR = path.join(SHARED_DIR, 'icons');
const RESOURCES_DIR = path.join(SHARED_DIR, 'resources');
const SECURITY_DIR = path.join(SHARED_DIR, 'security');

// ─── Load Comprehensive Blocklist from JSON ──────────────────────────────────
let blockedDomainSet = new Set();
let blockedDomainCount = 0;

function loadBlockedDomains() {
  try {
    const blocklistPath = path.join(SECURITY_DIR, 'blocked-domains.json');
    if (fs.existsSync(blocklistPath)) {
      const data = JSON.parse(fs.readFileSync(blocklistPath, 'utf-8'));
      if (data.categories) {
        for (const category of Object.values(data.categories)) {
          if (Array.isArray(category)) {
            category.forEach(domain => {
              // Some entries are paths like "facebook.com/tr" - extract the domain
              const cleanDomain = domain.split('/')[0];
              blockedDomainSet.add(cleanDomain);
            });
          }
        }
      }
      blockedDomainCount = blockedDomainSet.size;
      console.log(`[Eesha] Loaded ${blockedDomainCount} blocked domains from blocklist`);
    } else {
      console.warn('[Eesha] blocked-domains.json not found, using empty blocklist');
    }
  } catch (e) {
    console.error('[Eesha] Error loading blocklist:', e);
  }
}

loadBlockedDomains();

const BLOCKED_RESOURCE_TYPES = ['script', 'image', 'stylesheet', 'xmlhttprequest', 'sub_frame', 'font', 'media', 'ping', 'other'];

// ─── SearXNG Search API ──────────────────────────────────────────────────────
// Eesha Search fetches results from SearXNG JSON API and renders them natively
// with Eesha branding. Zero third-party branding visible to users.
const SEARXNG_API_URL = 'https://eesha-search.onrender.com/search?q=';
const SEARCH_URL = 'eesha://search';

// ─── Default Settings ────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  adBlockerEnabled: true,
  httpsOnlyMode: true,
  fingerprintProtection: true,
  webrtcProtection: true,
  searchEngine: 'https://eesha-search.onrender.com/search?q=',
  homepageUrl: 'eesha://newtab',
};

let settings = {};

function loadSettings() {
  settings = loadJSON(SETTINGS_FILE, { ...DEFAULT_SETTINGS });
  // Ensure all keys exist
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (settings[key] === undefined) {
      settings[key] = val;
    }
  }
}

function saveSettings() {
  saveJSON(SETTINGS_FILE, settings);
}

loadSettings();

function getSearchEngine() {
  return settings.searchEngine || 'https://eesha-search.onrender.com/search?q=';
}

// ─── Data Store Helpers ───────────────────────────────────────────────────────
function loadJSON(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`Error loading ${filePath}:`, e);
  }
  return defaultValue;
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Error saving ${filePath}:`, e);
  }
}

let bookmarks = loadJSON(BOOKMARKS_FILE, []);
let history = loadJSON(HISTORY_FILE, []);

function saveBookmarks() { saveJSON(BOOKMARKS_FILE, bookmarks); }
function saveHistory() { saveJSON(HISTORY_FILE, history); }

// ─── Tab Manager ──────────────────────────────────────────────────────────────
let tabs = [];
let activeTabId = null;
let mainWindow = null;
let chromeView = null; // The browser chrome (tab bar, URL bar, etc.)
let tabIdCounter = 0;
const sslRetryCounts = new Map(); // tabId → retry count for SSL errors

function createTabId() {
  return ++tabIdCounter;
}

function getTabById(id) {
  return tabs.find(t => t.id === id);
}

function addHistoryEntry(url, title) {
  if (!url || url.startsWith('eesha://')) return;
  const entry = {
    url,
    title: title || url,
    timestamp: Date.now(),
  };
  // Remove duplicate entries for the same URL (keep the latest)
  history = history.filter(h => h.url !== url);
  history.unshift(entry);
  if (history.length > MAX_HISTORY_ENTRIES) {
    history = history.slice(0, MAX_HISTORY_ENTRIES);
  }
  saveHistory();
}

function isBookmarked(url) {
  return bookmarks.some(b => b.url === url);
}

function addBookmark(url, title) {
  if (isBookmarked(url)) return;
  bookmarks.push({ url, title: title || url, timestamp: Date.now() });
  saveBookmarks();
}

function removeBookmark(url) {
  bookmarks = bookmarks.filter(b => b.url !== url);
  saveBookmarks();
}

function removeHistoryEntry(url) {
  history = history.filter(h => h.url !== url);
  saveHistory();
}

// ─── Fingerprint Protection Preload ──────────────────────────────────────────
const fingerprintPreloadPath = path.join(SECURITY_DIR, 'fingerprint-protection.js');
let fingerprintPreloadContent = '';
try {
  fingerprintPreloadContent = fs.readFileSync(fingerprintPreloadPath, 'utf-8');
} catch (e) {
  console.error('[Eesha] Could not read fingerprint protection script:', e);
}

// ─── New Tab Page HTML ────────────────────────────────────────────────────────
function getNewTabHTML(isPrivate = false) {
  const searchEngine = getSearchEngine();
  const engineName = searchEngine.includes('eesha://search') || searchEngine.includes('eesha-search') || searchEngine.includes('localhost:3031') ? 'Eesha Search' :
    searchEngine.includes('duckduckgo') ? 'DuckDuckGo' :
    searchEngine.includes('google') ? 'Google' :
    searchEngine.includes('bing') ? 'Bing' :
    searchEngine.includes('brave') ? 'Brave Search' :
    searchEngine.includes('startpage') ? 'StartPage' : 'Eesha Search';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isPrivate ? 'Private Tab' : 'New Tab'} - Eesha</title>
  <link rel="icon" type="image/png" href="eesha://resources/icons/eesha-logo.png">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' eesha:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' eesha: https: data:;">
  <style>
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: ${isPrivate ? '#1a0a2e' : '#ffffff'};
      color: ${isPrivate ? '#e0d0f0' : '#202124'};
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      overflow-x: hidden;
      position: relative;
    }

    /* Eesha logo watermark background */
    body::after {
      content: '';
      position: fixed;
      top: 25%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 70vmin;
      height: 38vmin;
      background-image: url('eesha://resources/icons/eesha-logo.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      opacity: ${isPrivate ? '0.10' : '0.18'};
      pointer-events: none;
      z-index: 0;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      max-width: 680px;
      width: 100%;
      padding: 15vh 32px 32px;
      position: relative;
      z-index: 1;
    }

    .search-wrapper {
      width: 100%;
      max-width: 584px;
      position: relative;
    }

    .search-bar {
      width: 100%;
      padding: 12px 16px 12px 48px;
      background: ${isPrivate ? 'rgba(40, 20, 60, 0.6)' : '#ffffff'};
      border: 1px solid ${isPrivate ? '#4a2a6a' : '#dfe1e5'};
      border-radius: 24px;
      color: ${isPrivate ? '#e0d0f0' : '#202124'};
      font-size: 16px;
      outline: none;
      transition: box-shadow 0.2s ease, border-color 0.2s ease;
    }

    .search-bar:hover {
      box-shadow: 0 1px 6px ${isPrivate ? 'rgba(100, 50, 150, 0.4)' : 'rgba(32,33,36,0.28)'};
      border-color: rgba(223,225,229,0);
    }

    .search-bar:focus {
      box-shadow: 0 1px 6px ${isPrivate ? 'rgba(100, 50, 150, 0.4)' : 'rgba(32,33,36,0.28)'};
      border-color: rgba(223,225,229,0);
    }

    .search-bar::placeholder { color: ${isPrivate ? '#8060a0' : '#9aa0a6'}; }

    .search-icon {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: ${isPrivate ? '#8060a0' : '#9aa0a6'};
      pointer-events: none;
    }

    ${isPrivate ? `
    .private-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: rgba(80, 40, 120, 0.3);
      border: 1px solid #4a2a6a;
      border-radius: 20px;
      color: #c090e0;
      font-size: 14px;
      font-weight: 500;
    }
    .private-badge svg { flex-shrink: 0; }
    ` : ''}

    .shortcuts {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 16px;
      width: 100%;
      max-width: 584px;
      padding-top: 8px;
    }

    .shortcut {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-radius: 8px;
      text-decoration: none;
      color: ${isPrivate ? '#c090e0' : '#202124'};
      cursor: pointer;
      transition: background 0.15s ease;
      width: 80px;
    }

    .shortcut:hover {
      background: ${isPrivate ? 'rgba(80, 40, 120, 0.2)' : '#f1f3f4'};
    }

    .shortcut-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      transition: transform 0.15s ease;
      overflow: hidden;
      background: #1a1a2e;
    }

    .shortcut-icon img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: contain;
    }

    .shortcut:hover .shortcut-icon { transform: scale(1.08); }

    .shortcut-label {
      font-size: 12px;
      font-weight: 400;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 72px;
      color: ${isPrivate ? '#9070b0' : '#5f6368'};
    }

    .footer {
      position: fixed;
      bottom: 16px;
      font-size: 11px;
      color: ${isPrivate ? '#6040a0' : '#9aa0a6'};
      letter-spacing: 0.3px;
    }
  </style>
</head>
<body>
  <div class="container">
    ${isPrivate ? `
    <div class="private-badge">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
      Private Browsing — Eesha won't save your history or cookies
    </div>
    ` : ''}
    <div class="search-wrapper">
      <input type="text" class="search-bar" id="searchInput"
        placeholder="Search with ${engineName} or enter a URL..." autocomplete="off" autofocus />
      <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    </div>

    <div class="shortcuts">
      <a class="shortcut" href="https://eesha-search.onrender.com">
        <div class="shortcut-icon" style="background: #1a1a2e;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></div>
        <span class="shortcut-label">Eesha Search</span>
      </a>
      <a class="shortcut" href="https://www.wikipedia.org">
        <div class="shortcut-icon" style="background: #636466;"><img src="https://en.wikipedia.org/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;" onerror="this.style.display='none'"></div>
        <span class="shortcut-label">Wikipedia</span>
      </a>
      <a class="shortcut" href="https://github.com">
        <div class="shortcut-icon" style="background: #24292e;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
        </div>
        <span class="shortcut-label">GitHub</span>
      </a>
      <a class="shortcut" href="https://www.reddit.com">
        <div class="shortcut-icon" style="background: #FF4500;"><img src="https://www.reddit.com/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;" onerror="this.style.display='none'"></div>
        <span class="shortcut-label">Reddit</span>
      </a>
      <a class="shortcut" href="https://www.youtube.com">
        <div class="shortcut-icon" style="background: #FF0000;"><img src="https://www.youtube.com/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;" onerror="this.style.display='none'"></div>
        <span class="shortcut-label">YouTube</span>
      </a>
      <a class="shortcut" href="https://news.ycombinator.com">
        <div class="shortcut-icon" style="background: #FF6600;"><img src="https://news.ycombinator.com/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;" onerror="this.style.display='none'"></div>
        <span class="shortcut-label">HN</span>
      </a>
      <a class="shortcut" href="https://stackoverflow.com">
        <div class="shortcut-icon" style="background: #F48024;"><img src="https://stackoverflow.com/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;" onerror="this.style.display='none'"></div>
        <span class="shortcut-label">Stack Overflow</span>
      </a>
      <a class="shortcut" href="https://mastodon.social">
        <div class="shortcut-icon" style="background: #6364FF;"><img src="https://mastodon.social/favicon.ico" width="32" height="32" alt="" style="border-radius:50%;" onerror="this.style.display='none'"></div>
        <span class="shortcut-label">Mastodon</span>
      </a>
    </div>
  </div>
  <div class="footer">Eesha Browser v${APP_VERSION}</div>
  <script>
    (function() {
      var searchInput = document.getElementById('searchInput');
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          var query = searchInput.value.trim();
          if (query) {
            if (/^https?:\\/\\//i.test(query)) {
              window.eesha.navigate(query);
            } else if (/^[a-zA-Z0-9-]+\\.[a-zA-Z]{2,}/.test(query)) {
              window.eesha.navigate('https://' + query);
            } else {
              // Navigate directly to the search engine URL
              window.eesha.navigate(engine + encodeURIComponent(query));
            }
          }
        }
      });
      document.querySelectorAll('.shortcut').forEach(function(link) {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          window.eesha.navigate(this.href);
        });
      });
    })();
  </script>
</body>
</html>`;
}

// ─── Search Results Page HTML ─────────────────────────────────────────────────
function getSearchResultsHTML(query) {
  const encodedQuery = encodeURIComponent(query);
  const safeQuery = query.replace(/</g, '&lt;').replace(/"/g, '&quot;');
  
  // If no query, show a search landing page
  if (!query || !query.trim()) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Eesha Search</title>
  <link rel="icon" type="image/png" href="eesha://resources/icons/eesha-logo.png">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' eesha:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src https://eesha-search.onrender.com https://commons.wikimedia.org https://en.wikipedia.org https://pipedapi.kavin.rocks https://pipedapi.adminforge.de https://news.google.com; img-src 'self' eesha: https: data:;">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 28px;
      padding: 20px;
      max-width: 580px;
      width: 100%;
    }
    .logo-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .logo-icon {
      width: 64px;
      height: 64px;
      background: linear-gradient(135deg, #e94560, #c73652);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(233, 69, 96, 0.3);
    }
    .logo-text {
      font-size: 32px;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.5px;
    }
    .logo-sub {
      font-size: 13px;
      color: #8888aa;
    }
    .search-wrapper {
      width: 100%;
      position: relative;
    }
    .search-bar {
      width: 100%;
      padding: 14px 52px 14px 20px;
      background: rgba(22, 33, 62, 0.8);
      border: 1px solid #2a2a4a;
      border-radius: 28px;
      color: #e0e0e0;
      font-size: 16px;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .search-bar:focus {
      border-color: #e94560;
      box-shadow: 0 0 0 3px rgba(233, 69, 96, 0.15);
    }
    .search-bar::placeholder { color: #5a5a7a; }
    .search-btn {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: 40px;
      background: #e94560;
      border: none;
      border-radius: 50%;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
    }
    .search-btn:hover { background: #c73652; }
    .footer {
      position: fixed;
      bottom: 16px;
      font-size: 12px;
      color: #4a4a6a;
    }
    .footer-brand { color: #e94560; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-area">
      <div class="logo-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </div>
      <div class="logo-text">Eesha Search</div>
      <div class="logo-sub">Privacy-first · Independent · Fast</div>
    </div>
    <div class="search-wrapper">
      <input type="text" class="search-bar" id="searchInput" placeholder="Search the web..." autocomplete="off" autofocus />
      <button class="search-btn" id="searchBtn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </button>
    </div>
  </div>
  <div class="footer"><span class="footer-brand">Powered by Eesha</span></div>
  <script>
    (function() {
      var searchInput = document.getElementById('searchInput');
      var searchBtn = document.getElementById('searchBtn');
      function doSearch() {
        var q = searchInput.value.trim();
        if (q) window.eesha.navigate('eesha://search?q=' + encodeURIComponent(q));
      }
      searchBtn.addEventListener('click', doSearch);
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') doSearch();
      });
    })();
  </script>
</body>
</html>`;
  }
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeQuery} - Eesha Search</title>
  <link rel="icon" type="image/png" href="eesha://resources/icons/eesha-logo.png">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' eesha:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src https://eesha-search.onrender.com https://commons.wikimedia.org https://en.wikipedia.org https://pipedapi.kavin.rocks https://pipedapi.adminforge.de https://news.google.com; img-src 'self' eesha: https: data:;">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
    }

    /* Category tabs */
    .category-tabs {
      max-width: 900px;
      margin: 0 auto;
      padding: 12px 20px 0;
      display: flex;
      gap: 4px;
      border-bottom: 1px solid #2a2a4a;
    }
    .category-tab {
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 500;
      color: #8888aa;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s ease;
      background: none;
      border-top: none;
      border-left: none;
      border-right: none;
    }
    .category-tab:hover { color: #e0e0e0; }
    .category-tab.active {
      color: #e94560;
      border-bottom-color: #e94560;
    }

    /* Results container */
    .results-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 16px 20px 60px;
    }
    .results-meta {
      font-size: 12px;
      color: #5a5a7a;
      margin-bottom: 16px;
    }

    /* Loading state */
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      gap: 16px;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #2a2a4a;
      border-top-color: #e94560;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text { color: #8888aa; font-size: 14px; }

    /* Error state */
    .error {
      text-align: center;
      padding: 60px 20px;
    }
    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    .error-title { color: #e94560; font-size: 18px; margin-bottom: 8px; }
    .error-desc { color: #8888aa; font-size: 14px; margin-bottom: 20px; }
    .retry-btn {
      padding: 10px 24px;
      background: #e94560;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.2s ease;
    }
    .retry-btn:hover { background: #c73652; }

    /* No results */
    .no-results {
      text-align: center;
      padding: 60px 20px;
    }
    .no-results-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.4; }
    .no-results-title { color: #e0e0e0; font-size: 18px; margin-bottom: 8px; }
    .no-results-desc { color: #8888aa; font-size: 14px; }

    /* Individual result */
    .result-item {
      padding: 16px 0;
      border-bottom: 1px solid rgba(42, 42, 74, 0.5);
    }
    .result-item:last-child { border-bottom: none; }
    .result-url {
      font-size: 12px;
      color: #6a8aaa;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .result-url-icon {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #2a2a4a;
    }
    .result-title {
      font-size: 16px;
      color: #8ab4f8;
      text-decoration: none;
      line-height: 1.3;
      display: block;
      margin-bottom: 4px;
      cursor: pointer;
      transition: color 0.15s ease;
    }
    .result-title:hover { color: #aecbfa; text-decoration: underline; }
    .result-snippet {
      font-size: 13px;
      color: #aaa8c0;
      line-height: 1.5;
    }
    .result-snippet b { color: #e0e0e0; }
    .result-date {
      font-size: 11px;
      color: #5a5a7a;
      margin-top: 4px;
    }

    /* Suggestions */
    .suggestions {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #2a2a4a;
    }
    .suggestions-title {
      font-size: 13px;
      color: #8888aa;
      margin-bottom: 8px;
    }
    .suggestion-chip {
      display: inline-block;
      padding: 6px 14px;
      background: rgba(22, 33, 62, 0.8);
      border: 1px solid #2a2a4a;
      border-radius: 16px;
      color: #8ab4f8;
      font-size: 13px;
      margin: 4px 4px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .suggestion-chip:hover {
      background: rgba(233, 69, 96, 0.1);
      border-color: #e94560;
      color: #e94560;
    }

    /* Footer */
    .footer {
      text-align: center;
      padding: 24px 20px;
      color: #4a4a6a;
      font-size: 12px;
      border-top: 1px solid #2a2a4a;
    }
    .footer-brand { color: #e94560; font-weight: 600; }
  </style>
</head>
<body>
  <div class="category-tabs">
    <button class="category-tab active" data-category="general">All</button>
    <button class="category-tab" data-category="images">Images</button>
    <button class="category-tab" data-category="videos">Videos</button>
    <button class="category-tab" data-category="news">News</button>
  </div>

  <div class="results-container" id="resultsContainer">
    <div class="loading" id="loadingState">
      <div class="spinner"></div>
      <div class="loading-text">Searching for "${safeQuery}"...</div>
    </div>
  </div>

  <div class="footer">
    <span class="footer-brand">Powered by Eesha</span> · Privacy-first search
  </div>

  <script>
    (function() {
      var query = '${encodedQuery}';
      var currentCategory = 'general';
      var resultsContainer = document.getElementById('resultsContainer');

      function doSearch(q, category) {
        if (!q) return;
        var cat = category || 'general';
        var apiUrl = 'https://eesha-search.onrender.com/search?q=' + encodeURIComponent(q) + '&format=json&categories=' + cat;
        resultsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Searching for "' + q.replace(/</g, '&lt;') + '"...</div></div>';

        var extraFetches = [];
        if (cat === 'images') {
          extraFetches.push(fetch('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch='+encodeURIComponent(q)+'&gsrlimit=10&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=400&format=json&origin=*').then(function(r){return r.ok?r.json():{};}).then(function(data){var results=[];var pages=(data.query&&data.query.pages)||{};Object.keys(pages).forEach(function(pid){var p=pages[pid];var img=(p.imageinfo&&p.imageinfo[0])||null;if(img){results.push({title:(p.title||'').replace('File:','').replace(/\\.[^.]+$/,'')||q,url:img.descriptionurl||img.url||'',content:'',thumbnail:img.thumburl||img.url||'',engine:'wikimedia',category:'images'});}});return results;}).catch(function(){return[];}));
          extraFetches.push(fetch('https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent(q)+'&gsrlimit=8&prop=pageimages|extracts&pithumbsize=400&exintro=true&explaintext=true&exsentences=2&format=json&origin=*').then(function(r){return r.ok?r.json():{};}).then(function(data){var results=[];var pages=(data.query&&data.query.pages)||{};Object.keys(pages).forEach(function(pid){var p=pages[pid];if(p.thumbnail&&p.thumbnail.source){results.push({title:p.title||q,url:'https://en.wikipedia.org/wiki/'+encodeURIComponent((p.title||'').replace(/ /g,'_')),content:p.extract||'',thumbnail:p.thumbnail.source,engine:'wikipedia',category:'images'});}});return results;}).catch(function(){return[];}));
        } else if (cat === 'videos') {
          extraFetches.push(fetch('https://pipedapi.kavin.rocks/search?q='+encodeURIComponent(q)+'&filter=videos').then(function(r){return r.ok?r.json():{};}).then(function(data){var results=[];(data.items||[]).slice(0,10).forEach(function(item){if(item.url&&item.title){results.push({title:item.title||'',url:item.url.startsWith('/')?'https://youtube.com'+item.url:item.url,content:(item.uploaderName?'By '+item.uploaderName:'')+(item.uploadedDate?' · '+item.uploadedDate:''),thumbnail:item.thumbnail||'',duration:item.duration>0?fmtDur(item.duration):'',engine:'piped',category:'videos'});}});return results;}).catch(function(){return[];}));
        } else if (cat === 'news') {
          extraFetches.push(fetch('https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=en-US&gl=US&ceid=US:en').then(function(r){return r.ok?r.text():'';}).then(function(xml){var results=[];var items=xml.match(/<item[\\s>][\\s\\S]*?<\\/item>/gi)||[];items.slice(0,12).forEach(function(ix){var tm=ix.match(/<title><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/title>/i)||ix.match(/<title>([\\s\\S]*?)<\\/title>/i);var lm=ix.match(/<link>([\\s\\S]*?)<\\/link>/i);var pm=ix.match(/<pubDate>([\\s\\S]*?)<\\/pubDate>/i);if(tm&&lm){results.push({title:tm[1].trim(),url:lm[1].trim(),content:pm?pm[1].trim():'',publishedDate:pm?pm[1].trim():'',engine:'google_news',category:'news'});}});return results;}).catch(function(){return[];}));
        }

        var allFetches = [fetch(apiUrl).then(function(res){if(!res.ok)throw new Error('Search failed: '+res.status);return res.json();}).catch(function(){return{results:[],suggestions:[]};})].concat(extraFetches);

        Promise.all(allFetches).then(function(responses){
          var searxData=responses[0];
          var extraResults=[];
          for(var i=1;i<responses.length;i++){if(Array.isArray(responses[i])){extraResults=extraResults.concat(responses[i]);}}
          var searxResults=searxData.results||[];
          if(cat==='images'){searxResults=searxResults.filter(function(r){return r.thumbnail||r.img_src;});}
          else if(cat==='videos'){searxResults=searxResults.filter(function(r){return r.thumbnail||r.duration;});}
          else if(cat==='news'){searxResults=searxResults.filter(function(r){return r.publishedDate;});}
          var merged=extraResults.concat(searxResults);
          var seen={};merged=merged.filter(function(r){if(seen[r.url])return false;seen[r.url]=true;return true;});
          renderResults({results:merged,suggestions:searxData.suggestions||[],number_of_results:searxData.number_of_results||merged.length},q);
        }).catch(function(err){
          resultsContainer.innerHTML = '<div class="error"><div class="error-icon">⚠️</div><div class="error-title">Search temporarily unavailable</div><div class="error-desc">Could not fetch results. Please check your connection and try again.</div><button class="retry-btn" id="retryBtn">Try Again</button></div>';
          var retryBtn = document.getElementById('retryBtn');
          if(retryBtn) retryBtn.addEventListener('click', function() { doSearch(q, cat); });
        });
      }

      function fmtDur(s){if(!s||s<0)return'';var h=Math.floor(s/3600);var m=Math.floor((s%3600)/60);var sec=s%60;if(h>0)return h+':'+('0'+m).slice(-2)+':'+('0'+sec).slice(-2);return m+':'+('0'+sec).slice(-2);}

      function renderResults(data, q) {
        var html = '';
        var results = data.results || [];
        var suggestions = data.suggestions || [];
        var numResults = data.number_of_results || results.length;

        // Meta line
        if (numResults > 0) {
          html += '<div class="results-meta">About ' + numResults.toLocaleString() + ' results</div>';
        }

        if (results.length === 0) {
          html += '<div class="no-results"><div class="no-results-icon">🔍</div><div class="no-results-title">No results found</div><div class="no-results-desc">Try different keywords or check your spelling.</div></div>';
        } else {
          results.forEach(function(r) {
            var title = (r.title || 'No title').replace(/</g, '&lt;');
            var url = r.url || '';
            var snippet = (r.content || '').replace(/</g, '&lt;');
            var date = r.publishedDate ? new Date(r.publishedDate).toLocaleDateString() : '';
            var hostname = '';
            try { hostname = new URL(url).hostname; } catch(e) { hostname = url; }

            html += '<div class="result-item">';
            html += '<div class="result-url"><img class="result-url-icon" src="https://' + hostname + '/favicon.ico" alt="" onerror="this.style.display=\\'none\\'">' + hostname + '</div>';
            html += '<a class="result-title" href="' + url + '">' + title + '</a>';
            html += '<div class="result-snippet">' + snippet + '</div>';
            if (date) html += '<div class="result-date">' + date + '</div>';
            html += '</div>';
          });
        }

        // Suggestions
        if (suggestions.length > 0) {
          html += '<div class="suggestions"><div class="suggestions-title">Related searches</div>';
          suggestions.forEach(function(s) {
            var safeS = s.replace(/</g, '&lt;').replace(/"/g, '&quot;');
            html += '<a class="suggestion-chip" href="eesha://search?q=' + encodeURIComponent(s) + '">' + safeS + '</a>';
          });
          html += '</div>';
        }

        resultsContainer.innerHTML = html;

        // Make result links open in the browser
        resultsContainer.querySelectorAll('.result-title').forEach(function(link) {
          link.addEventListener('click', function(e) {
            e.preventDefault();
            window.eesha.navigate(this.href);
          });
        });
        resultsContainer.querySelectorAll('.suggestion-chip').forEach(function(chip) {
          chip.addEventListener('click', function(e) {
            e.preventDefault();
            window.eesha.navigate(this.href);
          });
        });
      }

      // Category tab events
      document.querySelectorAll('.category-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          document.querySelectorAll('.category-tab').forEach(function(t) { t.classList.remove('active'); });
          this.classList.add('active');
          currentCategory = this.dataset.category;
          doSearch(query, currentCategory);
        });
      });

      // Initial search
      doSearch(query, 'general');
    })();
  </script>
</body>
</html>`;
}

// ─── Custom Image Viewer HTML (Memory-Safe) ──────────────────────────────────
// Loads images from SearXNG JSON API with:
// - thumbnail_src for grid (small, ~150px) instead of full-res images
// - img_src for full-screen view (one at a time only)
// - IntersectionObserver lazy loading
// - Concurrent load limiting (max 4 at once)
// - "Load More" button (10 per batch)
// This prevents OOM crashes from loading many full-resolution images simultaneously.
function getImageViewerHTML(query) {
  const safeQuery = query.replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, "\\'");
  const encodedQuery = encodeURIComponent(query);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Images - ${safeQuery} - Eesha</title>
  <link rel="icon" type="image/png" href="eesha://resources/icons/eesha-logo.png">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' eesha:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' eesha: https: data:; connect-src https://eesha-search.onrender.com https://commons.wikimedia.org https://en.wikipedia.org;">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e; color: #e0e0e0; min-height: 100vh;
    }
    .header {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 20px; background: #16213e;
      position: sticky; top: 0; z-index: 100;
      border-bottom: 1px solid #0f3460;
    }
    .back-btn {
      background: none; border: none; color: #e94560;
      font-size: 22px; cursor: pointer; padding: 4px 8px;
    }
    .back-btn:hover { opacity: 0.8; }
    .header-title {
      font-size: 17px; font-weight: 600; color: #e0e0e0;
      flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .header-count { font-size: 13px; color: #6a6a8a; }
    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px; padding: 16px 20px;
    }
    .image-card {
      background: #16213e; border-radius: 10px; overflow: hidden;
      cursor: pointer; position: relative;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .image-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    .image-card img {
      width: 100%; aspect-ratio: 1; object-fit: cover; display: block;
    }
    .image-card .placeholder {
      width: 100%; aspect-ratio: 1;
      background: linear-gradient(135deg, #16213e 25%, #1a2a4e 50%, #16213e 75%);
      background-size: 200% 200%;
      animation: shimmer 1.5s ease-in-out infinite;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .image-card .img-title {
      padding: 6px 8px; font-size: 12px; color: #e0e0e0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .image-card .img-host {
      padding: 0 8px 6px; font-size: 10px; color: #6a6a8a;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .load-more-btn {
      display: block; width: calc(100% - 40px); margin: 12px 20px 40px;
      padding: 14px; background: #16213e; color: #e94560;
      border: 1px solid #0f3460; border-radius: 10px;
      font-size: 14px; font-weight: 500; cursor: pointer; text-align: center;
      transition: background 0.15s;
    }
    .load-more-btn:hover { background: #0f3460; }
    .loading {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 80px 20px; gap: 16px;
    }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid #0f3460; border-top-color: #e94560;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text { font-size: 14px; color: #6a6a8a; }
    .error { text-align: center; padding: 60px 20px; }
    .error-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
    .error-title { font-size: 18px; color: #e94560; margin-bottom: 8px; }
    .error-desc { font-size: 14px; color: #8a8aaa; margin-bottom: 20px; max-width: 400px; margin-left: auto; margin-right: auto; }
    .retry-btn {
      padding: 10px 24px; background: #e94560; color: white;
      border: none; border-radius: 8px; cursor: pointer;
      font-size: 14px; font-weight: 500; transition: background 0.15s;
    }
    .retry-btn:hover { background: #c73652; }
    /* Full-screen viewer */
    .fullscreen-overlay {
      display: none; position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.95); z-index: 200;
      flex-direction: column; align-items: center; justify-content: center;
    }
    .fullscreen-overlay.active { display: flex; }
    .fullscreen-close {
      position: absolute; top: 16px; right: 20px;
      background: none; border: none; color: #fff;
      font-size: 28px; cursor: pointer; z-index: 201; padding: 8px;
    }
    .fullscreen-counter {
      position: absolute; top: 18px; left: 20px;
      color: rgba(255,255,255,0.7); font-size: 14px; z-index: 201;
    }
    .fullscreen-img {
      max-width: 90%; max-height: 80vh;
      object-fit: contain; border-radius: 4px;
    }
    .fullscreen-source {
      position: absolute; bottom: 30px;
      color: rgba(255,255,255,0.5); font-size: 12px; z-index: 201;
    }
    .fullscreen-nav {
      position: absolute; top: 50%; transform: translateY(-50%);
      background: rgba(255,255,255,0.15); border: none;
      color: #fff; font-size: 28px; cursor: pointer;
      padding: 20px 16px; z-index: 201; transition: background 0.15s;
    }
    .fullscreen-nav:hover { background: rgba(255,255,255,0.25); }
    .fullscreen-prev { left: 12px; }
    .fullscreen-next { right: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <button class="back-btn" onclick="closeViewer()">←</button>
    <div class="header-title">Images: ${safeQuery}</div>
    <div class="header-count" id="resultCount"></div>
  </div>
  <div id="content">
    <div class="loading"><div class="spinner"></div><div class="loading-text">Loading images...</div></div>
  </div>
  <div class="fullscreen-overlay" id="fullscreenOverlay">
    <button class="fullscreen-close" onclick="closeFullscreen()">✕</button>
    <div class="fullscreen-counter" id="fullscreenCounter"></div>
    <button class="fullscreen-nav fullscreen-prev" onclick="navFullscreen(-1)">‹</button>
    <img class="fullscreen-img" id="fullscreenImg" src="" alt="">
    <button class="fullscreen-nav fullscreen-next" onclick="navFullscreen(1)">›</button>
    <div class="fullscreen-source" id="fullscreenSource"></div>
  </div>
  <script>
    (function() {
      var query = '${safeQuery}';
      var API_BASE = 'https://eesha-search.onrender.com';
      var allResults = [];
      var shownCount = 0;
      var BATCH_SIZE = 10;
      var MAX_CONCURRENT_LOADS = 4;
      var activeLoads = 0;
      var loadQueue = [];

      function escapeHtml(t) { if(!t)return''; var d=document.createElement('div'); d.textContent=t; return d.innerHTML; }
      function getHostname(u) { try{return new URL(u).hostname;}catch(e){return u;} }
      function closeViewer() { history.back(); }

      function queueImageLoad(imgEl, src) {
        if (activeLoads < MAX_CONCURRENT_LOADS) {
          activeLoads++; imgEl.src = src;
          imgEl.onload = imgEl.onerror = function() { activeLoads--; processQueue(); };
        } else { loadQueue.push({ img: imgEl, src: src }); }
      }
      function processQueue() {
        while (activeLoads < MAX_CONCURRENT_LOADS && loadQueue.length > 0) {
          var item = loadQueue.shift(); activeLoads++; item.img.src = item.src;
          item.img.onload = item.img.onerror = function() { activeLoads--; processQueue(); };
        }
      }

      var lazyObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            var card = entry.target;
            var dataSrc = card.getAttribute('data-src');
            var imgEl = card.querySelector('img');
            if (dataSrc && imgEl) {
              card.removeAttribute('data-src');
              var ph = card.querySelector('.placeholder');
              if (ph) ph.style.display = 'none';
              imgEl.style.display = 'block';
              queueImageLoad(imgEl, dataSrc);
            }
            lazyObserver.unobserve(card);
          }
        });
      }, { rootMargin: '300px' });

      function fetchImages() {
        var content = document.getElementById('content');
        content.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading images...</div></div>';
        var searxUrl = API_BASE + '/search?q=' + encodeURIComponent(query) + '&format=json&categories=images';
        var fetches = [
          fetch(searxUrl).then(function(r){if(!r.ok)throw new Error('Search failed');return r.json();}).catch(function(){return{results:[],suggestions:[]};})
        ];
        // Wikimedia Commons (150px thumbnails)
        fetches.push(fetch('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch='+encodeURIComponent(query)+'&gsrlimit=15&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=150&format=json&origin=*').then(function(r){return r.ok?r.json():{};}).then(function(data){var results=[];try{var pages=(data.query&&data.query.pages)||{};Object.keys(pages).forEach(function(pid){try{var p=pages[pid];var img=(p.imageinfo&&p.imageinfo[0])||null;if(img){results.push({title:(p.title||'').replace('File:','').replace(/\\.[^.]+$/,'')||query,url:img.descriptionurl||img.url||'',content:'',thumbnail_src:img.thumburl||img.url||'',img_src:img.url||'',engine:'wikimedia',category:'images'});}}catch(e){}});}catch(e){}return results;}).catch(function(){return[];}));
        // Wikipedia (150px thumbnails)
        fetches.push(fetch('https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent(query)+'&gsrlimit=10&prop=pageimages|extracts&pithumbsize=150&exintro=true&explaintext=true&exsentences=1&format=json&origin=*').then(function(r){return r.ok?r.json():{};}).then(function(data){var results=[];try{var pages=(data.query&&data.query.pages)||{};Object.keys(pages).forEach(function(pid){try{var p=pages[pid];if(p.thumbnail&&p.thumbnail.source){results.push({title:p.title||query,url:'https://en.wikipedia.org/wiki/'+encodeURIComponent((p.title||'').replace(/ /g,'_')),content:p.extract||'',thumbnail_src:p.thumbnail.source,img_src:p.thumbnail.source.replace('/150px-','/800px-'),engine:'wikipedia',category:'images'});}}catch(e){}});}catch(e){}return results;}).catch(function(){return[];}));

        Promise.all(fetches).then(function(responses) {
          var searxData = responses[0]; var extraResults = [];
          for (var i = 1; i < responses.length; i++) { if (Array.isArray(responses[i])) { extraResults = extraResults.concat(responses[i]); } }
          var searxResults = (searxData.results || []).filter(function(r) { return r.thumbnail_src || r.img_src || r.thumbnail; });
          var merged = extraResults.concat(searxResults);
          var seen = {}; merged = merged.filter(function(r) { var k = r.thumbnail_src || r.img_src || r.url; if (seen[k]) return false; seen[k] = true; return true; });
          allResults = merged; shownCount = 0;
          document.getElementById('resultCount').textContent = merged.length + ' images';
          if (merged.length === 0) {
            content.innerHTML = '<div class="error"><div class="error-icon">🔍</div><div class="error-title">No images found</div><div class="error-desc">Try different keywords.</div></div>';
            return;
          }
          content.innerHTML = '<div class="image-grid" id="imageGrid"></div><div id="loadMoreArea"></div>';
          appendBatch();
        }).catch(function(err) {
          content.innerHTML = '<div class="error"><div class="error-icon">⚠️</div><div class="error-title">Something went wrong</div><div class="error-desc">' + escapeHtml(err.message || 'Could not fetch images') + '</div><button class="retry-btn" onclick="fetchImages()">Try Again</button></div>';
        });
      }

      function appendBatch() {
        var grid = document.getElementById('imageGrid'); if (!grid) return;
        var end = Math.min(shownCount + BATCH_SIZE, allResults.length);
        var fragment = document.createDocumentFragment();
        for (var i = shownCount; i < end; i++) {
          var r = allResults[i];
          var thumbnail = r.thumbnail_src || r.thumbnail || r.img_src || '';
          var fullImg = r.img_src || r.thumbnail_src || r.thumbnail || '';
          var title = escapeHtml(r.title || getHostname(r.url));
          var url = r.url || ''; var host = getHostname(url);
          var card = document.createElement('div');
          card.className = 'image-card'; card.setAttribute('data-src', thumbnail);
          card.setAttribute('data-full', fullImg); card.setAttribute('data-title', title);
          card.setAttribute('data-source', host); card.setAttribute('data-index', i);
          card.innerHTML = '<div class="placeholder"></div><img style="display:none" alt="" onerror="this.parentElement.style.display=\'none\'"><div class="img-title">' + title + '</div><div class="img-host">' + escapeHtml(host) + '</div>';
          card.addEventListener('click', function() { openFullscreen(this.getAttribute('data-full'), this.getAttribute('data-title'), this.getAttribute('data-source'), parseInt(this.getAttribute('data-index'))); });
          fragment.appendChild(card); lazyObserver.observe(card);
        }
        grid.appendChild(fragment); shownCount = end;
        var loadMoreArea = document.getElementById('loadMoreArea');
        if (shownCount < allResults.length) {
          loadMoreArea.innerHTML = '<button class="load-more-btn" onclick="appendBatch()">Load More (' + (allResults.length - shownCount) + ' remaining)</button>';
        } else { loadMoreArea.innerHTML = ''; }
      }

      var currentFullscreenIndex = -1;
      function openFullscreen(src, title, source, index) {
        currentFullscreenIndex = index;
        document.getElementById('fullscreenImg').src = src;
        document.getElementById('fullscreenCounter').textContent = (index + 1) + ' / ' + allResults.length;
        document.getElementById('fullscreenSource').textContent = source;
        document.getElementById('fullscreenOverlay').classList.add('active');
      }
      function closeFullscreen() {
        document.getElementById('fullscreenOverlay').classList.remove('active');
        document.getElementById('fullscreenImg').src = ''; currentFullscreenIndex = -1;
      }
      function navFullscreen(dir) {
        if (currentFullscreenIndex < 0) return; var ni = currentFullscreenIndex + dir;
        if (ni < 0 || ni >= allResults.length) return; var r = allResults[ni];
        openFullscreen(r.img_src || r.thumbnail_src || r.thumbnail || '', r.title || getHostname(r.url), getHostname(r.url), ni);
      }
      window.fetchImages = fetchImages; window.appendBatch = appendBatch;
      window.closeFullscreen = closeFullscreen; window.navFullscreen = navFullscreen; window.closeViewer = closeViewer;
      document.addEventListener('keydown', function(e) {
        if (currentFullscreenIndex >= 0) {
          if (e.key === 'Escape') closeFullscreen();
          else if (e.key === 'ArrowLeft') navFullscreen(-1);
          else if (e.key === 'ArrowRight') navFullscreen(1);
        }
      });
      fetchImages();
    })();
  </script>
</body>
</html>`;
}

// ─── Settings Page HTML ──────────────────────────────────────────────────────
function getSettingsHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settings - Eesha</title>
  <link rel="icon" type="image/png" href="eesha://resources/icons/eesha-logo.png">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' eesha:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' eesha: data:;">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 28px; color: #fff; margin-bottom: 8px; }
    .subtitle { color: #8888aa; font-size: 14px; margin-bottom: 32px; }
    h2 { font-size: 16px; color: #e94560; margin: 28px 0 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .card {
      background: rgba(22, 33, 62, 0.6);
      border: 1px solid #2a2a4a;
      border-radius: 12px;
      padding: 4px 20px;
      margin-bottom: 16px;
    }
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 0;
      border-bottom: 1px solid #2a2a4a;
    }
    .setting-row:last-child { border-bottom: none; }
    .setting-label { font-size: 14px; color: #e0e0e0; }
    .setting-desc { font-size: 12px; color: #5a5a7a; margin-top: 4px; }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .btn-primary { background: #e94560; color: #fff; }
    .btn-primary:hover { background: #c73652; }
    .btn-danger { background: transparent; color: #e94560; border: 1px solid #e94560; }
    .btn-danger:hover { background: rgba(233, 69, 96, 0.1); }
    .btn-secondary { background: rgba(22, 33, 62, 0.8); color: #e0e0e0; border: 1px solid #2a2a4a; }
    .btn-secondary:hover { background: rgba(30, 42, 74, 0.8); }
    .info { font-size: 13px; color: #8888aa; }
    .version { color: #e94560; font-weight: 600; }
    .blocked-count { color: #4caf50; font-size: 12px; margin-top: 4px; }

    /* Toggle switch */
    .toggle {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      flex-shrink: 0;
    }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #2a2a4a;
      border-radius: 24px;
      transition: 0.3s;
    }
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background: #e0e0e0;
      border-radius: 50%;
      transition: 0.3s;
    }
    .toggle input:checked + .toggle-slider { background: #e94560; }
    .toggle input:checked + .toggle-slider:before { transform: translateX(20px); }

    /* Select dropdown */
    .select-wrapper {
      position: relative;
    }
    .select-wrapper select {
      appearance: none;
      background: rgba(22, 33, 62, 0.8);
      color: #e0e0e0;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      padding: 8px 32px 8px 12px;
      font-size: 13px;
      cursor: pointer;
      outline: none;
    }
    .select-wrapper select:focus {
      border-color: #e94560;
    }
    .select-wrapper:after {
      content: '▾';
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: #8888aa;
      pointer-events: none;
    }

    .home-input {
      background: rgba(22, 33, 62, 0.8);
      color: #e0e0e0;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 13px;
      width: 220px;
      outline: none;
    }
    .home-input:focus { border-color: #e94560; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚙ Settings</h1>
    <div class="subtitle">Configure your privacy-first browsing experience</div>

    <h2>🛡 Privacy & Security</h2>
    <div class="card">
      <div class="setting-row">
        <div>
          <div class="setting-label">Ad & Tracker Blocking</div>
          <div class="setting-desc">Block ads, trackers, and fingerprinting scripts (${blockedDomainCount} domains)</div>
          <div class="blocked-count" id="blockedCountDisplay">Blocked this session: loading...</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="adBlockerToggle" ${settings.adBlockerEnabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">HTTPS-Only Mode</div>
          <div class="setting-desc">Upgrade all HTTP requests to HTTPS for secure connections</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="httpsOnlyToggle" ${settings.httpsOnlyMode ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">Fingerprint Protection</div>
          <div class="setting-desc">Protect against canvas, WebGL, audio, and browser fingerprinting</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="fingerprintToggle" ${settings.fingerprintProtection ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">WebRTC Leak Protection</div>
          <div class="setting-desc">Prevent WebRTC from leaking your real IP address</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="webrtcToggle" ${settings.webrtcProtection ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <h2>🔍 Search</h2>
    <div class="card">
      <div class="setting-row">
        <div>
          <div class="setting-label">Default Search Engine</div>
          <div class="setting-desc">Choose your preferred search provider</div>
        </div>
        <div class="select-wrapper">
          <select id="searchEngineSelect">
            <option value="https://eesha-search.onrender.com/search?q=" ${settings.searchEngine === 'https://eesha-search.onrender.com/search?q=' || settings.searchEngine === 'eesha://search?q=' ? 'selected' : ''}>Eesha Search (Default)</option>
            <option value="https://duckduckgo.com/?q=" ${settings.searchEngine === 'https://duckduckgo.com/?q=' ? 'selected' : ''}>DuckDuckGo</option>
            <option value="https://www.google.com/search?q=" ${settings.searchEngine === 'https://www.google.com/search?q=' ? 'selected' : ''}>Google</option>
            <option value="https://www.bing.com/search?q=" ${settings.searchEngine === 'https://www.bing.com/search?q=' ? 'selected' : ''}>Bing</option>
            <option value="https://search.brave.com/search?q=" ${settings.searchEngine === 'https://search.brave.com/search?q=' ? 'selected' : ''}>Brave Search</option>
            <option value="https://www.startpage.com/sp/search?query=" ${settings.searchEngine === 'https://www.startpage.com/sp/search?query=' ? 'selected' : ''}>StartPage</option>
          </select>
        </div>
      </div>
    </div>

    <h2>🏠 Homepage</h2>
    <div class="card">
      <div class="setting-row">
        <div>
          <div class="setting-label">Homepage URL</div>
          <div class="setting-desc">Page loaded when clicking the Home button</div>
        </div>
        <input type="text" class="home-input" id="homepageInput" value="${settings.homepageUrl || 'eesha://newtab'}" placeholder="eesha://newtab">
      </div>
    </div>

    <h2>🗑 Data</h2>
    <div class="card">
      <div class="setting-row">
        <div>
          <div class="setting-label">Clear Browsing History</div>
          <div class="setting-desc">Remove all browsing history entries</div>
        </div>
        <button class="btn btn-danger" id="clearHistoryBtn">Clear History</button>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">Clear Cookies & Site Data</div>
          <div class="setting-desc">Remove all cookies and cached site data</div>
        </div>
        <button class="btn btn-danger" id="clearCookiesBtn">Clear Cookies</button>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">Clear All Browsing Data</div>
          <div class="setting-desc">Clear history, cookies, cache, and all site data</div>
        </div>
        <button class="btn btn-danger" id="clearAllBtn">Clear All</button>
      </div>
    </div>

    <h2>ℹ About</h2>
    <div class="card">
      <div class="setting-row">
        <div>
          <div class="setting-label">Eesha Browser</div>
          <div class="setting-desc">A privacy-first browser powered by Chromium</div>
        </div>
        <span class="version">v${APP_VERSION}</span>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">Engine</div>
          <div class="setting-desc">Chromium via Electron</div>
        </div>
        <span class="info">100% web compatible</span>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">Blocklist</div>
          <div class="setting-desc">Comprehensive ad/tracker/fingerprinting/malware domain list</div>
        </div>
        <span class="info">${blockedDomainCount} domains</span>
      </div>
    </div>
  </div>
  <script>
    (function() {
      // Load blocked count
      window.eesha.getBlockStats().then(function(stats) {
        var el = document.getElementById('blockedCountDisplay');
        if (el) el.textContent = 'Blocked this session: ' + (stats.totalBlocked || 0) + ' trackers/ads';
      });

      // Toggle handlers
      document.getElementById('adBlockerToggle').addEventListener('change', function() {
        window.eesha.updateSetting('adBlockerEnabled', this.checked);
      });
      document.getElementById('httpsOnlyToggle').addEventListener('change', function() {
        window.eesha.updateSetting('httpsOnlyMode', this.checked);
      });
      document.getElementById('fingerprintToggle').addEventListener('change', function() {
        window.eesha.updateSetting('fingerprintProtection', this.checked);
      });
      document.getElementById('webrtcToggle').addEventListener('change', function() {
        window.eesha.updateSetting('webrtcProtection', this.checked);
      });
      document.getElementById('searchEngineSelect').addEventListener('change', function() {
        window.eesha.updateSetting('searchEngine', this.value);
      });
      document.getElementById('homepageInput').addEventListener('change', function() {
        window.eesha.updateSetting('homepageUrl', this.value || 'eesha://newtab');
      });

      // Data clear buttons
      document.getElementById('clearHistoryBtn').addEventListener('click', function() {
        if (confirm('Clear all browsing history?')) {
          window.eesha.clearHistory();
          alert('History cleared.');
        }
      });
      document.getElementById('clearCookiesBtn').addEventListener('click', function() {
        if (confirm('Clear all cookies and site data?')) {
          window.eesha.clearBrowsingData();
          alert('Cookies and site data cleared.');
        }
      });
      document.getElementById('clearAllBtn').addEventListener('click', function() {
        if (confirm('Clear ALL browsing data? This includes history, cookies, and cache.')) {
          window.eesha.clearHistory();
          window.eesha.clearBrowsingData();
          alert('All browsing data cleared.');
        }
      });
    })();
  </script>
</body>
</html>`;
}

// ─── Bookmarks Page HTML ─────────────────────────────────────────────────────
function getBookmarksHTML() {
  const bookmarksList = bookmarks.map(b => `
    <div class="bookmark-item" data-url="${b.url.replace(/"/g, '&quot;')}">
      <div class="bookmark-info">
        <div class="bookmark-title">${(b.title || b.url).replace(/</g, '&lt;')}</div>
        <div class="bookmark-url">${b.url.replace(/</g, '&lt;')}</div>
      </div>
      <button class="remove-btn" data-url="${b.url.replace(/"/g, '&quot;')}">Remove</button>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bookmarks - Eesha</title>
  <link rel="icon" type="image/png" href="eesha://resources/icons/eesha-logo.png">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' eesha:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' eesha: data:;">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 28px; color: #fff; margin-bottom: 8px; }
    .subtitle { color: #8888aa; font-size: 14px; margin-bottom: 24px; }
    .empty-state { text-align: center; padding: 60px 20px; color: #5a5a7a; }
    .empty-state svg { margin-bottom: 16px; opacity: 0.3; }
    .bookmark-item {
      display: flex;
      align-items: center;
      padding: 14px 16px;
      background: rgba(22, 33, 62, 0.6);
      border: 1px solid #2a2a4a;
      border-radius: 10px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .bookmark-item:hover { background: rgba(30, 42, 74, 0.8); border-color: #3a3a5a; }
    .bookmark-info { flex: 1; min-width: 0; }
    .bookmark-title { font-size: 14px; color: #e0e0e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bookmark-url { font-size: 12px; color: #5a5a7a; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .remove-btn {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid #e94560;
      background: transparent;
      color: #e94560;
      cursor: pointer;
      font-size: 12px;
      flex-shrink: 0;
      margin-left: 12px;
      transition: all 0.15s ease;
    }
    .remove-btn:hover { background: rgba(233, 69, 96, 0.15); }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔖 Bookmarks</h1>
    <div class="subtitle">${bookmarks.length} saved bookmark${bookmarks.length !== 1 ? 's' : ''}</div>
    ${bookmarks.length === 0 ? `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        <p>No bookmarks yet</p>
        <p style="font-size: 13px; margin-top: 8px;">Click the star icon in the URL bar to bookmark pages</p>
      </div>
    ` : `<div id="bookmarksList">${bookmarksList}</div>`}
  </div>
  <script>
    (function() {
      document.querySelectorAll('.bookmark-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          if (e.target.classList.contains('remove-btn')) return;
          var url = this.dataset.url;
          if (url) window.eesha.navigate(url);
        });
      });
      document.querySelectorAll('.remove-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var url = this.dataset.url;
          if (url) {
            window.eesha.removeBookmark(url);
            this.closest('.bookmark-item').style.opacity = '0';
            this.closest('.bookmark-item').style.transform = 'translateX(20px)';
            this.closest('.bookmark-item').style.transition = 'all 0.2s ease';
            setTimeout(function() {
              this.closest('.bookmark-item').remove();
            }.bind(this), 200);
          }
        });
      });
    })();
  </script>
</body>
</html>`;
}

// ─── History Page HTML ───────────────────────────────────────────────────────
function getHistoryHTML() {
  const historyList = history.map(h => {
    const date = new Date(h.timestamp);
    const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
    <div class="history-item" data-url="${h.url.replace(/"/g, '&quot;')}">
      <div class="history-info">
        <div class="history-title">${(h.title || h.url).replace(/</g, '&lt;')}</div>
        <div class="history-url">${h.url.replace(/</g, '&lt;')}</div>
        <div class="history-time">${timeStr}</div>
      </div>
      <button class="remove-btn" data-url="${h.url.replace(/"/g, '&quot;')}">Remove</button>
    </div>
  `}).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>History - Eesha</title>
  <link rel="icon" type="image/png" href="eesha://resources/icons/eesha-logo.png">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' eesha:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' eesha: data:;">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 720px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    h1 { font-size: 28px; color: #fff; margin-bottom: 4px; }
    .subtitle { color: #8888aa; font-size: 14px; }
    .search-box {
      width: 100%;
      max-width: 400px;
      padding: 10px 16px;
      background: rgba(22, 33, 62, 0.6);
      border: 1px solid #2a2a4a;
      border-radius: 10px;
      color: #e0e0e0;
      font-size: 14px;
      outline: none;
      margin-bottom: 20px;
    }
    .search-box:focus { border-color: #e94560; }
    .search-box::placeholder { color: #5a5a7a; }
    .clear-all-btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid #e94560;
      background: transparent;
      color: #e94560;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
      white-space: nowrap;
      margin-top: 4px;
    }
    .clear-all-btn:hover { background: rgba(233, 69, 96, 0.15); }
    .history-item {
      display: flex;
      align-items: center;
      padding: 14px 16px;
      background: rgba(22, 33, 62, 0.6);
      border: 1px solid #2a2a4a;
      border-radius: 10px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .history-item:hover { background: rgba(30, 42, 74, 0.8); border-color: #3a3a5a; }
    .history-item.hidden { display: none; }
    .history-info { flex: 1; min-width: 0; }
    .history-title { font-size: 14px; color: #e0e0e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .history-url { font-size: 12px; color: #5a5a7a; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .history-time { font-size: 11px; color: #4a4a6a; margin-top: 3px; }
    .remove-btn {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid #e94560;
      background: transparent;
      color: #e94560;
      cursor: pointer;
      font-size: 12px;
      flex-shrink: 0;
      margin-left: 12px;
      transition: all 0.15s ease;
    }
    .remove-btn:hover { background: rgba(233, 69, 96, 0.15); }
    .empty-state { text-align: center; padding: 60px 20px; color: #5a5a7a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>📜 History</h1>
        <div class="subtitle">${history.length} entries</div>
      </div>
      <button class="clear-all-btn" id="clearAllBtn">Clear All History</button>
    </div>
    <input type="text" class="search-box" id="searchBox" placeholder="Search history..." autocomplete="off">
    ${history.length === 0 ? `
      <div class="empty-state">
        <p>No browsing history</p>
      </div>
    ` : `<div id="historyList">${historyList}</div>`}
  </div>
  <script>
    (function() {
      var searchBox = document.getElementById('searchBox');
      searchBox.addEventListener('input', function() {
        var query = this.value.toLowerCase();
        document.querySelectorAll('.history-item').forEach(function(item) {
          var title = item.querySelector('.history-title').textContent.toLowerCase();
          var url = item.querySelector('.history-url').textContent.toLowerCase();
          item.classList.toggle('hidden', !(title.includes(query) || url.includes(query)));
        });
      });

      document.querySelectorAll('.history-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          if (e.target.classList.contains('remove-btn')) return;
          var url = this.dataset.url;
          if (url) window.eesha.navigate(url);
        });
      });

      document.querySelectorAll('.remove-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var url = this.dataset.url;
          if (url) {
            window.eesha.removeHistoryEntry(url);
            var item = this.closest('.history-item');
            item.style.opacity = '0';
            item.style.transform = 'translateX(20px)';
            item.style.transition = 'all 0.2s ease';
            setTimeout(function() { item.remove(); }, 200);
          }
        });
      });

      document.getElementById('clearAllBtn').addEventListener('click', function() {
        if (confirm('Clear all browsing history?')) {
          window.eesha.clearHistory();
          document.getElementById('historyList').innerHTML = '<div class="empty-state"><p>History cleared.</p></div>';
        }
      });
    })();
  </script>
</body>
</html>`;
}

// ─── Ad/Tracker Blocking Setup ───────────────────────────────────────────────
let totalBlockedCount = 0;
let tabBlockedCounts = {};

// ─── Downloads Manager ────────────────────────────────────────────────────────
let downloads = [];
let downloadIdCounter = 0;
let activeDownloads = {}; // Map of download item ID to Electron DownloadItem

function getDownloadsHTML() {
  const downloadItems = downloads.map(d => {
    const progress = d.size > 0 ? Math.round((d.receivedBytes / d.size) * 100) : 0;
    const sizeStr = d.size > 0 ? formatBytes(d.receivedBytes) + ' / ' + formatBytes(d.size) : formatBytes(d.receivedBytes);
    const stateClass = d.state === 'completed' ? 'state-completed' :
                       d.state === 'downloading' ? 'state-downloading' :
                       d.state === 'cancelled' ? 'state-cancelled' : 'state-interrupted';
    const stateLabel = d.state === 'completed' ? 'Completed' :
                       d.state === 'downloading' ? `Downloading (${progress}%)` :
                       d.state === 'cancelled' ? 'Cancelled' : 'Interrupted';
    return `
    <div class="download-item ${stateClass}" data-id="${d.id}">
      <div class="download-info">
        <div class="download-filename">${d.filename.replace(/</g, '&lt;')}</div>
        <div class="download-url">${d.url.replace(/</g, '&lt;')}</div>
        <div class="download-meta">
          <span class="download-size">${sizeStr}</span>
          <span class="download-state">${stateLabel}</span>
        </div>
        ${d.state === 'downloading' ? `
        <div class="download-progress-bar">
          <div class="download-progress-fill" style="width: ${progress}%"></div>
        </div>` : ''}
      </div>
      <div class="download-actions">
        ${d.state === 'completed' ? `
          <button class="download-btn open-btn" data-id="${d.id}" title="Open file">Open</button>
          <button class="download-btn folder-btn" data-id="${d.id}" title="Open folder">Folder</button>
        ` : ''}
        ${d.state === 'downloading' ? `
          <button class="download-btn cancel-btn" data-id="${d.id}" title="Cancel download">Cancel</button>
        ` : ''}
        <button class="download-btn remove-btn" data-id="${d.id}" title="Remove from list">✕</button>
      </div>
    </div>`;
  }).join('');

  const activeCount = downloads.filter(d => d.state === 'downloading').length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Downloads - Eesha</title>
  <link rel="icon" type="image/png" href="eesha://resources/icons/eesha-logo.png">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' eesha:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' eesha: data:;">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 720px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    h1 { font-size: 28px; color: #fff; margin-bottom: 4px; }
    .subtitle { color: #8888aa; font-size: 14px; }
    .clear-completed-btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid #e94560;
      background: transparent;
      color: #e94560;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
      white-space: nowrap;
      margin-top: 4px;
    }
    .clear-completed-btn:hover { background: rgba(233, 69, 96, 0.15); }
    .download-item {
      display: flex;
      align-items: center;
      padding: 14px 16px;
      background: rgba(22, 33, 62, 0.6);
      border: 1px solid #2a2a4a;
      border-radius: 10px;
      margin-bottom: 8px;
      transition: all 0.15s ease;
    }
    .download-item:hover { background: rgba(30, 42, 74, 0.8); border-color: #3a3a5a; }
    .download-info { flex: 1; min-width: 0; }
    .download-filename { font-size: 14px; color: #e0e0e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .download-url { font-size: 12px; color: #5a5a7a; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .download-meta { font-size: 11px; color: #4a4a6a; margin-top: 3px; display: flex; gap: 8px; }
    .download-state { font-weight: 600; }
    .state-downloading .download-state { color: #e94560; }
    .state-completed .download-state { color: #4caf50; }
    .state-cancelled .download-state { color: #ff9800; }
    .state-interrupted .download-state { color: #f44336; }
    .download-progress-bar {
      height: 3px;
      background: #2a2a4a;
      border-radius: 2px;
      margin-top: 6px;
      overflow: hidden;
    }
    .download-progress-fill {
      height: 100%;
      background: #e94560;
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .download-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
      margin-left: 12px;
    }
    .download-btn {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid #2a2a4a;
      background: transparent;
      color: #8888aa;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s ease;
    }
    .download-btn:hover { background: var(--bg-hover); color: #e0e0e0; }
    .open-btn:hover { border-color: #4caf50; color: #4caf50; }
    .folder-btn:hover { border-color: #2196f3; color: #2196f3; }
    .cancel-btn:hover { border-color: #ff9800; color: #ff9800; }
    .remove-btn { border-color: transparent; }
    .remove-btn:hover { border-color: #e94560; color: #e94560; background: rgba(233, 69, 96, 0.15); }
    .empty-state { text-align: center; padding: 60px 20px; color: #5a5a7a; }
    .empty-state svg { margin-bottom: 16px; opacity: 0.3; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>⬇ Downloads</h1>
        <div class="subtitle">${downloads.length} download${downloads.length !== 1 ? 's' : ''}${activeCount > 0 ? ` (${activeCount} active)` : ''}</div>
      </div>
      ${downloads.some(d => d.state === 'completed') ? '<button class="clear-completed-btn" id="clearCompletedBtn">Clear Completed</button>' : ''}
    </div>
    ${downloads.length === 0 ? `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <p>No downloads yet</p>
        <p style="font-size: 13px; margin-top: 8px;">Files you download will appear here</p>
      </div>
    ` : `<div id="downloadsList">${downloadItems}</div>`}
  </div>
  <script>
    (function() {
      // Listen for real-time download updates
      if (window.eesha && window.eesha.onDownloadsUpdated) {
        window.eesha.onDownloadsUpdated(function(data) {
          // Reload the page to reflect changes
          window.location.reload();
        });
      }

      var clearBtn = document.getElementById('clearCompletedBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          window.eesha.clearDownloads().then(function() {
            window.location.reload();
          });
        });
      }

      document.querySelectorAll('.open-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var id = parseInt(this.dataset.id);
          var dl = null;
          window.eesha.getDownloads().then(function(downloads) {
            dl = downloads.find(function(d) { return d.id === id; });
            if (dl) {
              window.eesha.navigate('file://' + dl.savePath);
            }
          });
        });
      });

      document.querySelectorAll('.folder-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var id = parseInt(this.dataset.id);
          window.eesha.getDownloads().then(function(downloads) {
            var dl = downloads.find(function(d) { return d.id === id; });
            if (dl) {
              window.eesha.openDownloadFolder(dl.savePath);
            }
          });
        });
      });

      document.querySelectorAll('.cancel-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var id = parseInt(this.dataset.id);
          window.eesha.cancelDownload(id).then(function() {
            window.location.reload();
          });
        });
      });

      document.querySelectorAll('.remove-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var id = parseInt(this.dataset.id);
          var item = this.closest('.download-item');
          item.style.opacity = '0';
          item.style.transform = 'translateX(20px)';
          item.style.transition = 'all 0.2s ease';
          setTimeout(function() { item.remove(); }, 200);
          // Remove from list locally
          window.eesha.clearDownloads();
        });
      });
    })();
  </script>
</body>
</html>`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function setupDownloadsHandler() {
  session.defaultSession.on('will-download', (event, item, webContents) => {
    const id = ++downloadIdCounter;
    const url = item.getURLChain().length > 0 ? item.getURLChain()[0] : item.getURL();
    const filename = item.getFilename();
    const savePath = path.join(app.getPath('downloads'), filename);

    // Set save path
    item.setSavePath(savePath);

    const downloadEntry = {
      id,
      url,
      filename,
      savePath,
      size: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      state: 'downloading',
      startTime: Date.now(),
      endTime: null,
    };

    downloads.unshift(downloadEntry);
    activeDownloads[id] = item;

    // Notify chrome about download update
    notifyChrome('downloads-updated', { downloads });

    item.on('updated', (event, state) => {
      downloadEntry.receivedBytes = item.getReceivedBytes();
      downloadEntry.size = item.getTotalBytes();

      if (state === 'progressing') {
        downloadEntry.state = 'downloading';
      } else if (state === 'interrupted') {
        downloadEntry.state = 'interrupted';
      }

      notifyChrome('downloads-updated', { downloads });
    });

    item.once('done', (event, state) => {
      if (state === 'completed') {
        downloadEntry.state = 'completed';
        downloadEntry.endTime = Date.now();
      } else if (state === 'cancelled') {
        downloadEntry.state = 'cancelled';
        downloadEntry.endTime = Date.now();
      } else {
        downloadEntry.state = 'interrupted';
        downloadEntry.endTime = Date.now();
      }

      delete activeDownloads[id];
      notifyChrome('downloads-updated', { downloads });
    });
  });
}

// NOTE: setupDownloadsHandler() is called inside app.whenReady() below,
// because session.defaultSession is only available after the app is ready.

function setupAdBlocking(ses) {
  if (!settings.adBlockerEnabled) return;

  ses.webRequest.onBeforeRequest((details, callback) => {
    if (!settings.adBlockerEnabled) {
      callback({ cancel: false });
      return;
    }

    try {
      const url = new URL(details.url);
      const hostname = url.hostname;

      // Check if the domain matches any blocked domain (O(1) lookup)
      let blocked = false;
      if (blockedDomainSet.has(hostname)) {
        blocked = true;
      } else {
        // Check parent domains (e.g., subdomain.doubleclick.net)
        const parts = hostname.split('.');
        for (let i = 1; i < parts.length; i++) {
          const parentDomain = parts.slice(i).join('.');
          if (blockedDomainSet.has(parentDomain)) {
            blocked = true;
            break;
          }
        }
      }

      if (blocked && BLOCKED_RESOURCE_TYPES.includes(details.resourceType)) {
        totalBlockedCount++;
        // Track per-tab blocking
        const tabId = details.webContentsId;
        if (tabId) {
          tabBlockedCounts[tabId] = (tabBlockedCounts[tabId] || 0) + 1;
        }
        callback({ cancel: true });
        return;
      }
    } catch (e) {
      // Invalid URL, just pass through
    }

    callback({ cancel: false });
  });
}

// ─── HTTPS-Only Mode Setup ───────────────────────────────────────────────────
function setupHTTPSOnly(ses) {
  if (!settings.httpsOnlyMode) return;

  ses.webRequest.onBeforeRequest((details, callback) => {
    if (!settings.httpsOnlyMode) {
      callback({ cancel: false });
      return;
    }

    // Only upgrade main_frame and sub_frame requests
    if (details.url && details.url.startsWith('http://') &&
        !details.url.startsWith('http://localhost') &&
        !details.url.startsWith('http://127.0.0.1') &&
        !details.url.startsWith('http://[::1]')) {
      const httpsUrl = details.url.replace('http://', 'https://');
      callback({ redirectURL: httpsUrl });
      return;
    }

    callback({ cancel: false });
  });
}

// ─── Fingerprint Protection Injection ────────────────────────────────────────
function injectFingerprintProtection(webContents) {
  if (!settings.fingerprintProtection || !fingerprintPreloadContent) return;

  try {
    webContents.executeJavaScript(fingerprintPreloadContent)
      .catch(() => {}); // Silently ignore injection errors
  } catch (e) {
    // Ignore
  }
}

// ─── Splash Screen ──────────────────────────────────────────────────────────
let splashWindow = null;

function createSplashScreen() {
  const logoImage = path.join(ICONS_DIR, 'eesha-logo.png');
  
  splashWindow = new BrowserWindow({
    width: 480,
    height: 360,
    transparent: true,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
  });

  const splashHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="file://${logoImage.replace(/\\/g, '/')}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      overflow: hidden;
      background: #1a1a2e;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .splash-logo {
      max-width: 70%;
      max-height: 60%;
      object-fit: contain;
    }
    .splash-loader {
      position: fixed;
      bottom: 40px;
      width: 120px;
      height: 3px;
      background: rgba(233, 69, 96, 0.2);
      border-radius: 2px;
      overflow: hidden;
    }
    .splash-loader-bar {
      height: 100%;
      width: 0%;
      background: #e94560;
      border-radius: 2px;
      animation: splash-load 2s ease-in-out forwards;
    }
    @keyframes splash-load {
      0% { width: 0%; }
      40% { width: 60%; }
      80% { width: 90%; }
      100% { width: 100%; }
    }
  </style>
</head>
<body>
  <img class="splash-logo" src="${logoImage.replace(/\\/g, '/')}" alt="Eesha"
    onerror="this.style.display='none'">
  <div class="splash-loader"><div class="splash-loader-bar"></div></div>
</body>
</html>`;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });
}

function closeSplashScreen() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ─── Create Main Window ──────────────────────────────────────────────────────
function createWindow() {
  // Load window icon
  const iconPath = path.join(ICONS_DIR, 'icon512x512.png');
  const windowIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  // Platform-specific frameless window configuration:
  //   macOS   → titleBarStyle: 'hidden' keeps traffic lights, hides title text
  //   Win/Linux → frame: false removes the entire native frame
  const isMac = process.platform === 'darwin';

  mainWindow = new BaseWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Eesha',
    frame: !isMac,              // frameless on Windows/Linux, native frame on macOS
    titleBarStyle: isMac ? 'hidden' : undefined,  // hidden title bar on macOS
    titleBarOverlay: false,
    autoHideMenuBar: true,      // hide the menu bar (Alt to toggle on Win/Linux)
    backgroundColor: '#1a1a2e',
    show: false,
    icon: windowIcon,
    trafficLightPosition: isMac ? { x: 12, y: 15 } : undefined,
  });

  // Create the browser chrome view (tab bar, URL bar, navigation)
  chromeView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.contentView.addChildView(chromeView);

  // Load the browser chrome UI
  chromeView.webContents.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Set up ad blocking on the default session
  setupAdBlocking(session.defaultSession);

  // Set up HTTPS-only on the default session
  setupHTTPSOnly(session.defaultSession);

  // Set custom user agent
  session.defaultSession.setUserAgent(
    session.defaultSession.getUserAgent().replace(/Electron\/\S+/, USER_AGENT_SUFFIX)
  );

  // Handle eesha:// protocol
  session.defaultSession.protocol.registerStringProtocol('eesha', (request, callback) => {
    const url = request.url;
    if (url === 'eesha://newtab' || url === 'eesha://newtab/') {
      callback({
        data: getNewTabHTML(false),
        mimeType: 'text/html',
        charset: 'utf-8',
      });
    } else if (url.startsWith('eesha://search')) {
      // Redirect eesha://search to SearXNG directly, EXCEPT images category
      const urlObj = new URL(url);
      const query = urlObj.searchParams.get('q') || '';
      const category = urlObj.searchParams.get('category');
      if (category === 'images' && query) {
        // Use custom image viewer for images — prevents OOM from heavy SearXNG image grids
        callback({ data: getImageViewerHTML(query), mimeType: 'text/html', charset: 'utf-8' });
      } else if (query) {
        let searchUrl = `https://eesha-search.onrender.com/search?q=${encodeURIComponent(query)}`;
        if (category && category !== 'general') {
          searchUrl += `&categories=${category}`;
        }
        callback({ data: `<script>window.location='${searchUrl}';</script>`, mimeType: 'text/html', charset: 'utf-8' });
      } else {
        callback({ data: `<script>window.location='https://eesha-search.onrender.com';</script>`, mimeType: 'text/html', charset: 'utf-8' });
      }
    } else if (url === 'eesha://settings' || url === 'eesha://settings/') {
      callback({
        data: getSettingsHTML(),
        mimeType: 'text/html',
        charset: 'utf-8',
      });
    } else if (url === 'eesha://bookmarks' || url === 'eesha://bookmarks/') {
      callback({
        data: getBookmarksHTML(),
        mimeType: 'text/html',
        charset: 'utf-8',
      });
    } else if (url === 'eesha://history' || url === 'eesha://history/') {
      callback({
        data: getHistoryHTML(),
        mimeType: 'text/html',
        charset: 'utf-8',
      });
    } else if (url === 'eesha://downloads' || url === 'eesha://downloads/') {
      callback({
        data: getDownloadsHTML(),
        mimeType: 'text/html',
        charset: 'utf-8',
      });
    } else if (url.startsWith('eesha://resources/')) {
      // Serve resource files (icons, logos, splash images)
      const resourcePath = url.replace('eesha://resources/', '');
      const fullPath = path.join(SHARED_DIR, resourcePath);
      try {
        const data = fs.readFileSync(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const mimeMap = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
        };
        callback({
          data: data,
          mimeType: mimeMap[ext] || 'application/octet-stream',
        });
      } catch (e) {
        callback({ data: 'Not Found', mimeType: 'text/plain' });
      }
    } else {
      callback({
        data: '<html><body><h1>Unknown eesha:// page</h1></body></html>',
        mimeType: 'text/html',
      });
    }
  });

  // ─── Create first tab ──────────────────────────────────────────────────
  createTab(NEWTAB_URL);

  // ─── Window layout ─────────────────────────────────────────────────────
  mainWindow.on('resize', () => {
    layoutViews();
  });

  // Show window when ready and close splash screen
  mainWindow.once('ready-to-show', () => {
    layoutViews();
    // Close splash and show main window
    setTimeout(() => {
      closeSplashScreen();
      mainWindow.show();
    }, 1500); // Give splash screen time to show
  });

  // Initial layout
  setTimeout(layoutViews, 100);

  // ─── Handle new window requests from web content ───────────────────────
  mainWindow.webContents.on('new-window', (event) => {
    event.preventDefault();
  });

  // ─── Clean up on close ─────────────────────────────────────────────────
  mainWindow.on('closed', () => {
    tabs = [];
    activeTabId = null;
    mainWindow = null;
    chromeView = null;
  });
}

// ─── Tab Operations ──────────────────────────────────────────────────────────
function createTab(url = NEWTAB_URL, isPrivate = false) {
  const id = createTabId();

  const webPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  };

  // WebRTC leak protection
  if (settings.webrtcProtection) {
    webPreferences.webrtcIPHandlingPolicy = 'disable_non_proxied_udp';
  }

  // Private browsing: use a separate non-persistent session partition
  if (isPrivate) {
    webPreferences.partition = 'private-session';
    webPreferences.session = session.fromPartition('private-session');
  }

  const contentView = new WebContentsView({
    webPreferences,
  });

  // For private tabs, set up ad blocking and HTTPS on the private session too
  if (isPrivate) {
    const privateSession = session.fromPartition('private-session');
    setupAdBlocking(privateSession);
    setupHTTPSOnly(privateSession);
    privateSession.setUserAgent(
      session.defaultSession.getUserAgent().replace(/Electron\/\S+/, USER_AGENT_SUFFIX)
    );

    // Handle eesha:// protocol for private session
    privateSession.protocol.registerStringProtocol('eesha', (request, callback) => {
      const reqUrl = request.url;
      if (reqUrl === 'eesha://newtab' || reqUrl === 'eesha://newtab/') {
        callback({ data: getNewTabHTML(true), mimeType: 'text/html', charset: 'utf-8' });
      } else if (reqUrl.startsWith('eesha://search')) {
        // Redirect eesha://search to SearXNG directly, EXCEPT images category
        const urlObj = new URL(reqUrl);
        const query = urlObj.searchParams.get('q') || '';
        const category = urlObj.searchParams.get('category');
        if (category === 'images' && query) {
          callback({ data: getImageViewerHTML(query), mimeType: 'text/html', charset: 'utf-8' });
        } else if (query) {
          let searchUrl = `https://eesha-search.onrender.com/search?q=${encodeURIComponent(query)}`;
          if (category && category !== 'general') {
            searchUrl += `&categories=${category}`;
          }
          callback({ data: `<script>window.location='${searchUrl}';</script>`, mimeType: 'text/html', charset: 'utf-8' });
        } else {
          callback({ data: `<script>window.location='https://eesha-search.onrender.com';</script>`, mimeType: 'text/html', charset: 'utf-8' });
        }
      } else if (reqUrl === 'eesha://settings' || reqUrl === 'eesha://settings/') {
        callback({ data: getSettingsHTML(), mimeType: 'text/html', charset: 'utf-8' });
      } else if (reqUrl === 'eesha://bookmarks' || reqUrl === 'eesha://bookmarks/') {
        callback({ data: getBookmarksHTML(), mimeType: 'text/html', charset: 'utf-8' });
      } else if (reqUrl === 'eesha://history' || reqUrl === 'eesha://history/') {
        callback({ data: getHistoryHTML(), mimeType: 'text/html', charset: 'utf-8' });
      } else if (reqUrl === 'eesha://downloads' || reqUrl === 'eesha://downloads/') {
        callback({ data: getDownloadsHTML(), mimeType: 'text/html', charset: 'utf-8' });
      } else if (reqUrl.startsWith('eesha://resources/')) {
        const resourcePath = reqUrl.replace('eesha://resources/', '');
        const fullPath = path.join(SHARED_DIR, resourcePath);
        try {
          const data = fs.readFileSync(fullPath);
          const ext = path.extname(fullPath).toLowerCase();
          const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif', '.webp': 'image/webp' };
          callback({ data, mimeType: mimeMap[ext] || 'application/octet-stream' });
        } catch (e) {
          callback({ data: 'Not Found', mimeType: 'text/plain' });
        }
      } else {
        callback({ data: '<html><body><h1>Unknown eesha:// page</h1></body></html>', mimeType: 'text/html' });
      }
    });
  }

  const tab = {
    id,
    url,
    title: isPrivate ? 'Private Tab' : 'New Tab',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    isPrivate,
    contentView,
  };

  tabs.push(tab);

  // Add to window
  if (mainWindow && mainWindow.contentView) {
    mainWindow.contentView.addChildView(contentView);
  }

  // Load URL
  if (url === NEWTAB_URL) {
    contentView.webContents.loadURL('eesha://newtab');
  } else if (url === SETTINGS_URL) {
    contentView.webContents.loadURL('eesha://settings');
  } else if (url === BOOKMARKS_URL) {
    contentView.webContents.loadURL('eesha://bookmarks');
  } else if (url === HISTORY_URL) {
    contentView.webContents.loadURL('eesha://history');
  } else if (url === DOWNLOADS_URL) {
    contentView.webContents.loadURL('eesha://downloads');
  } else {
    contentView.webContents.loadURL(url);
  }

  // ─── WebContents event handlers ────────────────────────────────────────
  contentView.webContents.on('did-navigate', (event, navUrl) => {
    sslRetryCounts.delete(id); // Reset SSL retry count on new navigation
    tab.url = navUrl;
    tab.canGoBack = contentView.webContents.canGoBack();
    tab.canGoForward = contentView.webContents.canGoForward();
    if (!isPrivate) {
      addHistoryEntry(navUrl, tab.title);
    }
    notifyChrome('url-change', { tabId: id, url: navUrl, canGoBack: tab.canGoBack, canGoForward: tab.canGoForward });
  });

  contentView.webContents.on('did-navigate-in-page', (event, navUrl) => {
    tab.url = navUrl;
    tab.canGoBack = contentView.webContents.canGoBack();
    tab.canGoForward = contentView.webContents.canGoForward();
    if (!isPrivate) {
      addHistoryEntry(navUrl, tab.title);
    }
    notifyChrome('url-change', { tabId: id, url: navUrl, canGoBack: tab.canGoBack, canGoForward: tab.canGoForward });
  });

  contentView.webContents.on('page-title-updated', (event, title) => {
    tab.title = title;
    notifyChrome('title-change', { tabId: id, title });
  });

  contentView.webContents.on('did-start-loading', () => {
    tab.loading = true;
    notifyChrome('loading-state', { tabId: id, loading: true });
  });

  contentView.webContents.on('did-stop-loading', () => {
    tab.loading = false;
    notifyChrome('loading-state', { tabId: id, loading: false });
  });

  // Inject fingerprint protection after page load
  contentView.webContents.on('did-finish-load', () => {
    sslRetryCounts.delete(id); // Reset SSL retry count on successful load
    injectFingerprintProtection(contentView.webContents);
    // Hide SearXNG header/search bar when loading the SearXNG page directly
    const currentUrl = contentView.webContents.getURL();
    if (currentUrl && currentUrl.includes('eesha-search.onrender.com')) {
      contentView.webContents.executeJavaScript(`
        (function(){
          var style = document.createElement('style');
          style.textContent = '#search_header, #search, form#search, #links_on_top, #categories, .search_filters, #search_logo, #search_view, .search_box, #clear_search, #send_search, nav#links_on_top { display: none !important; } #main_results { padding-top: 0 !important; margin-top: 0 !important; } #urls { padding-top: 8px !important; } body { padding-top: 0 !important; }';
          document.head.appendChild(style);
        })();
      `).catch(() => {});
    }
  });

  contentView.webContents.on('did-fail-load', (event, errorCode, errorDesc, failedUrl) => {
    tab.loading = false;
    notifyChrome('loading-state', { tabId: id, loading: false });

    // SSL/TLS handshake error codes in Chromium/Electron
    const SSL_ERROR_CODES = [-200, -201, -202, -203, -204, -205, -206, -207, -210, -211, -212, -213];
    const isSSLError = SSL_ERROR_CODES.includes(errorCode);

    if (isSSLError && failedUrl && failedUrl.startsWith('https://')) {
      let isRenderDomain = false;
      try {
        isRenderDomain = new URL(failedUrl).hostname.endsWith('.onrender.com');
      } catch (_) {}

      if (isRenderDomain) {
        // Render cold start: auto-retry after 5 seconds, max 3 retries
        const retryCount = sslRetryCounts.get(id) || 0;
        if (retryCount < 3) {
          sslRetryCounts.set(id, retryCount + 1);
          const retryInfo = `Retry ${retryCount + 1}/3 in 5s…`;
          contentView.webContents.executeJavaScript(`
            document.open();
            document.write(\`<!DOCTYPE html><html><head><title>Waking up server…</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                     display: flex; justify-content: center; align-items: center;
                     min-height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
              .container { text-align: center; padding: 2rem; }
              h1 { font-size: 1.5rem; color: #e94560; }
              p { color: #aaa; margin: 0.5rem 0; }
              .spinner { display: inline-block; width: 24px; height: 24px;
                         border: 3px solid rgba(233,69,96,0.3); border-top-color: #e94560;
                         border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem; }
              @keyframes spin { to { transform: rotate(360deg); } }
            </style></head><body>
            <div class='container'>
              <div class='spinner'></div>
              <h1>Waking up server…</h1>
              <p>This site is hosted on Render's free tier and may take up to 60 seconds to start.</p>
              <p>${retryInfo}</p>
            </div></body></html>\`);
            document.close();
          `).catch(() => {});
          setTimeout(() => {
            const currentTab = getTabById(id);
            if (currentTab && currentTab.contentView && !currentTab.contentView.webContents.isDestroyed()) {
              currentTab.contentView.webContents.loadURL(failedUrl);
            }
          }, 5000);
          return;
        } else {
          // Max retries reached — reset and show error page
          sslRetryCounts.delete(id);
        }
      }

      // Non-Render SSL errors: show styled error page with "Try Again" button
      contentView.webContents.executeJavaScript(`
        document.open();
        document.write(\`<!DOCTYPE html><html><head><title>SSL Error</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                 display: flex; justify-content: center; align-items: center;
                 min-height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
          .container { text-align: center; padding: 2rem; max-width: 500px; }
          h1 { font-size: 1.5rem; color: #e94560; }
          p { color: #aaa; margin: 0.5rem 0; font-size: 0.9rem; }
          .url { color: #888; font-size: 0.8rem; word-break: break-all; margin: 1rem 0; }
          button { margin-top: 1rem; padding: 0.6rem 2rem; background: #e94560; color: white;
                   border: none; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; }
          button:hover { background: #c93050; }
        </style></head><body>
        <div class='container'>
          <h1>🔒 This connection is not secure</h1>
          <p>The site could not provide a secure connection.</p>
          <p>Error: ${errorDesc.replace(/`/g, '\\`')} (code: ${errorCode})</p>
          <div class='url'>${failedUrl}</div>
          <button onclick="window.location.href=window.location.href">Try Again</button>
        </div></body></html>\`);
        document.close();
      `).catch(() => {});
    }
  });

  // Handle new window requests (e.g., target="_blank")
  contentView.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    createTab(openUrl, isPrivate);
    return { action: 'deny' };
  });

  // Forward find-in-page results to chrome
  contentView.webContents.on('found-in-page', (event, result) => {
    notifyChrome('find-result', result);
  });

  // Activate this tab
  switchToTab(id);

  // Notify chrome about new tab
  notifyChrome('tab-created', {
    tabId: id,
    url,
    title: tab.title,
    active: true,
    isPrivate,
  });

  return id;
}

function switchToTab(id) {
  const previousTabId = activeTabId;
  activeTabId = id;

  // Remove all tab content views from display, then add the active one
  tabs.forEach(tab => {
    if (tab.contentView && mainWindow && mainWindow.contentView) {
      try {
        mainWindow.contentView.removeChildView(tab.contentView);
      } catch (e) {
        // View may not be a child, that's fine
      }
    }
  });

  // Add the active tab's content view
  const activeTab = getTabById(id);
  if (activeTab && activeTab.contentView && mainWindow && mainWindow.contentView) {
    mainWindow.contentView.addChildView(activeTab.contentView);
  }

  // Re-layout
  layoutViews();

  // Notify chrome
  notifyChrome('tab-switched', { tabId: id, previousTabId });
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tab = tabs[idx];

  // Remove content view
  if (tab.contentView && mainWindow && mainWindow.contentView) {
    try {
      mainWindow.contentView.removeChildView(tab.contentView);
    } catch (e) {
      // View may not be a child
    }
    tab.contentView.webContents.close();
  }

  tabs.splice(idx, 1);

  // If we closed the active tab, switch to another
  if (activeTabId === id) {
    if (tabs.length > 0) {
      const newIdx = Math.min(idx, tabs.length - 1);
      switchToTab(tabs[newIdx].id);
    } else {
      // No tabs left - create a new one
      createTab(NEWTAB_URL);
    }
  }

  notifyChrome('tab-closed', { tabId: id });
}

function layoutViews() {
  if (!mainWindow) return;
  const [width, height] = mainWindow.getContentSize();
  if (!width || !height) return;

  // Chrome view at top
  if (chromeView) {
    chromeView.setBounds({ x: 0, y: 0, width, height: CHROME_HEIGHT });
  }

  // Active tab content view below chrome
  const activeTab = getTabById(activeTabId);
  if (activeTab && activeTab.contentView) {
    activeTab.contentView.setBounds({
      x: 0,
      y: CHROME_HEIGHT,
      width,
      height: height - CHROME_HEIGHT,
    });
  }
}

function notifyChrome(channel, data) {
  if (chromeView && chromeView.webContents && !chromeView.webContents.isDestroyed()) {
    chromeView.webContents.send(channel, data);
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
function setupIPC() {
  // Navigation
  ipcMain.handle('navigate', (_, url) => {
    const tab = getTabById(activeTabId);
    if (!tab) return;
    tab.url = url;
    if (url === NEWTAB_URL) {
      tab.contentView.webContents.loadURL('eesha://newtab');
    } else if (url === SETTINGS_URL) {
      tab.contentView.webContents.loadURL('eesha://settings');
    } else if (url === BOOKMARKS_URL) {
      tab.contentView.webContents.loadURL('eesha://bookmarks');
    } else if (url === HISTORY_URL) {
      tab.contentView.webContents.loadURL('eesha://history');
    } else if (url === DOWNLOADS_URL) {
      tab.contentView.webContents.loadURL('eesha://downloads');
    } else {
      tab.contentView.webContents.loadURL(url);
    }
  });

  ipcMain.handle('go-back', () => {
    const tab = getTabById(activeTabId);
    if (tab && tab.contentView.webContents.canGoBack()) {
      tab.contentView.webContents.goBack();
    }
  });

  ipcMain.handle('go-forward', () => {
    const tab = getTabById(activeTabId);
    if (tab && tab.contentView.webContents.canGoForward()) {
      tab.contentView.webContents.goForward();
    }
  });

  ipcMain.handle('reload', () => {
    const tab = getTabById(activeTabId);
    if (tab) {
      tab.contentView.webContents.reload();
    }
  });

  ipcMain.handle('force-reload', () => {
    const tab = getTabById(activeTabId);
    if (tab) {
      tab.contentView.webContents.reloadIgnoringCache();
    }
  });

  // Tab management
  ipcMain.handle('create-tab', (_, url) => {
    return createTab(url || NEWTAB_URL, false);
  });

  ipcMain.handle('create-private-tab', (_, url) => {
    return createTab(url || NEWTAB_URL, true);
  });

  ipcMain.handle('switch-tab', (_, tabId) => {
    switchToTab(tabId);
  });

  ipcMain.handle('close-tab', (_, tabId) => {
    closeTab(tabId);
  });

  ipcMain.handle('get-tabs', () => {
    return tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      loading: t.loading,
      active: t.id === activeTabId,
      isPrivate: t.isPrivate,
    }));
  });

  // Bookmarks
  ipcMain.handle('get-bookmarks', () => bookmarks);

  ipcMain.handle('add-bookmark', (_, url, title) => {
    addBookmark(url, title);
    return bookmarks;
  });

  ipcMain.handle('remove-bookmark', (_, url) => {
    removeBookmark(url);
    return bookmarks;
  });

  ipcMain.handle('is-bookmarked', (_, url) => {
    return isBookmarked(url);
  });

  // History
  ipcMain.handle('get-history', () => history);

  ipcMain.handle('clear-history', () => {
    history = [];
    saveHistory();
    return true;
  });

  ipcMain.handle('remove-history-entry', (_, url) => {
    removeHistoryEntry(url);
    return true;
  });

  // Settings
  ipcMain.handle('get-settings', () => {
    return { ...settings };
  });

  ipcMain.handle('update-setting', (_, key, value) => {
    settings[key] = value;
    saveSettings();
    // Notify all chrome views about settings change
    notifyChrome('settings-updated', { ...settings });
    return true;
  });

  // Clear browsing data
  ipcMain.handle('clear-browsing-data', async () => {
    try {
      await session.defaultSession.clearStorageData();
      await session.defaultSession.clearCache();
      return true;
    } catch (e) {
      console.error('[Eesha] Error clearing browsing data:', e);
      return false;
    }
  });

  // Block stats
  ipcMain.handle('get-block-stats', () => {
    return {
      totalBlocked: totalBlockedCount,
      blockedDomainCount: blockedDomainCount,
    };
  });

  // Focus URL bar
  ipcMain.handle('focus-url-bar', () => {
    notifyChrome('focus-url-bar', {});
  });

  // ─── Downloads IPC ──────────────────────────────────────────────────────
  ipcMain.handle('get-downloads', () => {
    return downloads;
  });

  ipcMain.handle('clear-downloads', () => {
    downloads = downloads.filter(d => d.state === 'downloading');
    return true;
  });

  ipcMain.handle('cancel-download', (_, id) => {
    const dl = downloads.find(d => d.id === id);
    if (dl && activeDownloads[id]) {
      activeDownloads[id].cancel();
      dl.state = 'cancelled';
      dl.endTime = Date.now();
      delete activeDownloads[id];
    }
    return true;
  });

  ipcMain.handle('open-download-folder', (_, filePath) => {
    shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle('pause-download', (_, id) => {
    if (activeDownloads[id] && activeDownloads[id].canPause()) {
      activeDownloads[id].pause();
      const dl = downloads.find(d => d.id === id);
      if (dl) dl.state = 'interrupted'; // paused shows as interrupted
    }
    return true;
  });

  ipcMain.handle('resume-download', (_, id) => {
    if (activeDownloads[id] && activeDownloads[id].canResume()) {
      activeDownloads[id].resume();
      const dl = downloads.find(d => d.id === id);
      if (dl) dl.state = 'downloading';
    }
    return true;
  });

  // ─── Find in Page IPC ──────────────────────────────────────────────────
  ipcMain.handle('find-in-page', (_, text, options) => {
    const tab = getTabById(activeTabId);
    if (tab && tab.contentView && tab.contentView.webContents) {
      tab.contentView.webContents.findInPage(text, options || { forward: true });
    }
    return true;
  });

  ipcMain.handle('stop-find-in-page', () => {
    const tab = getTabById(activeTabId);
    if (tab && tab.contentView && tab.contentView.webContents) {
      tab.contentView.webContents.stopFindInPage('clearSelection');
    }
    return true;
  });

  // ─── Window Control IPC ──────────────────────────────────────────────
  ipcMain.handle('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  ipcMain.handle('window-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    } else {
      mainWindow.maximize();
      return true;
    }
  });
  ipcMain.handle('window-close', () => {
    if (mainWindow) mainWindow.close();
  });
  ipcMain.handle('window-is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  // ─── Share URL IPC ─────────────────────────────────────────────────────
  ipcMain.handle('share-url', (_, url) => {
    try {
      clipboard.writeText(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Get current tab info
  ipcMain.handle('get-active-tab', () => {
    const tab = getTabById(activeTabId);
    if (!tab) return null;
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      loading: tab.loading,
      isPrivate: tab.isPrivate,
      canGoBack: tab.contentView.webContents.canGoBack(),
      canGoForward: tab.contentView.webContents.canGoForward(),
    };
  });
}

// ─── Application Menu ────────────────────────────────────────────────────────
function setupMenu() {
  const template = [
    {
      label: 'Eesha',
      submenu: [
        { label: 'About Eesha', click: () => createTab(SETTINGS_URL) },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => checkForUpdates(false) },
        { type: 'separator' },
        { label: 'Preferences', accelerator: 'CmdOrCtrl+,', click: () => createTab(SETTINGS_URL) },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => createTab(NEWTAB_URL) },
        { label: 'New Private Tab', accelerator: 'CmdOrCtrl+Shift+P', click: () => createTab(NEWTAB_URL, true) },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => { if (activeTabId) closeTab(activeTabId); } },
        { type: 'separator' },
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => { const tab = getTabById(activeTabId); if (tab) tab.contentView.webContents.reload(); } },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => { const tab = getTabById(activeTabId); if (tab) tab.contentView.webContents.reloadIgnoringCache(); } },
        { type: 'separator' },
        { label: 'Bookmarks', accelerator: 'CmdOrCtrl+B', click: () => createTab(BOOKMARKS_URL) },
        { label: 'History', accelerator: 'CmdOrCtrl+H', click: () => createTab(HISTORY_URL) },
        { type: 'separator' },
        { label: 'Toggle DevTools', accelerator: 'F12', click: () => { const tab = getTabById(activeTabId); if (tab) tab.contentView.webContents.toggleDevTools(); } },
        { type: 'separator' },
        { label: 'Focus URL Bar', accelerator: 'CmdOrCtrl+L', click: () => notifyChrome('focus-url-bar', {}) },
      ],
    },
    {
      label: 'History',
      submenu: [
        { label: 'Back', accelerator: 'Alt+Left', click: () => { const tab = getTabById(activeTabId); if (tab && tab.contentView.webContents.canGoBack()) tab.contentView.webContents.goBack(); } },
        { label: 'Forward', accelerator: 'Alt+Right', click: () => { const tab = getTabById(activeTabId); if (tab && tab.contentView.webContents.canGoForward()) tab.contentView.webContents.goForward(); } },
        { type: 'separator' },
        { label: 'Show All History', accelerator: 'CmdOrCtrl+H', click: () => createTab(HISTORY_URL) },
      ],
    },
    {
      label: 'Bookmarks',
      submenu: [
        { label: 'Bookmark This Page', accelerator: 'CmdOrCtrl+D', click: () => {
          const tab = getTabById(activeTabId);
          if (tab) {
            addBookmark(tab.url, tab.title);
            notifyChrome('bookmarks-updated', { bookmarks });
          }
        }},
        { label: 'Show All Bookmarks', click: () => createTab(BOOKMARKS_URL) },
        { type: 'separator' },
        ...bookmarks.slice(0, 10).map(b => ({
          label: b.title || b.url,
          click: () => createTab(b.url),
        })),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // On Windows/Linux, completely hide the menu bar so it doesn't add a title bar.
  // The menu is still registered so keyboard shortcuts (Ctrl+T, Ctrl+W, etc.) keep working.
  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
// ─── Auto-Update Checker ──────────────────────────────────────────────────────
// Checks GitHub Releases API for new versions (no electron-updater dependency needed)
const UPDATE_STATE_FILE = path.join(app.getPath('userData'), 'update-state.json');

function loadUpdateState() {
  try {
    if (fs.existsSync(UPDATE_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(UPDATE_STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return { lastCheck: 0, skippedVersion: null, autoUpdateEnabled: true };
}

function saveUpdateState(state) {
  try {
    fs.writeFileSync(UPDATE_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

function isNewerVersion(current, latest) {
  const cp = current.split('.').map(n => parseInt(n, 10) || 0);
  const lp = latest.split('.').map(n => parseInt(n, 10) || 0);
  const maxLen = Math.max(cp.length, lp.length);
  for (let i = 0; i < maxLen; i++) {
    const c = cp[i] || 0;
    const l = lp[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

function getPlatformAssetName() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'linux') return '.AppImage';
  if (platform === 'win32') return '.exe';
  if (platform === 'darwin') return '.dmg';
  return null;
}

async function checkForUpdates(silent = true) {
  const state = loadUpdateState();

  // Respect auto-update setting
  if (!state.autoUpdateEnabled && silent) return;

  // Check cooldown (24 hours for auto-checks)
  const now = Date.now();
  if (silent && (now - state.lastCheck) < UPDATE_CHECK_INTERVAL) return;

  try {
    const https = require('https');
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

    const data = await new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: { 'User-Agent': 'Eesha-Browser-Update-Checker', 'Accept': 'application/vnd.github+json' },
        timeout: 15000,
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });

    state.lastCheck = now;
    saveUpdateState(state);

    const tagName = data.tag_name || '';
    const versionMatch = tagName.match(/v?(\d+\.\d+\.\d+)/);
    if (!versionMatch) return;

    const latestVersion = versionMatch[1];
    if (!isNewerVersion(APP_VERSION, latestVersion)) {
      if (!silent) {
        dialog.showMessageBoxSync({
          type: 'info',
          title: 'Eesha is Up to Date',
          message: `Eesha v${APP_VERSION} is the latest version.`,
          buttons: ['OK'],
        });
      }
      return;
    }

    // Skip if user previously dismissed this version
    if (state.skippedVersion === latestVersion && silent) return;

    // Find the right asset for this platform
    const assetExt = getPlatformAssetName();
    const assets = data.assets || [];
    let downloadAsset = null;
    if (assetExt) {
      downloadAsset = assets.find(a => a.name && a.name.endsWith(assetExt));
    }

    const sizeMB = downloadAsset ? (downloadAsset.size / (1024 * 1024)).toFixed(1) : '?';
    const releaseNotes = (data.body || '').substring(0, 500);

    const result = dialog.showMessageBoxSync({
      type: 'info',
      title: 'Update Available!',
      message: `Eesha v${latestVersion} is available (current: v${APP_VERSION})`,
      detail: `Size: ${sizeMB} MB\n\n${releaseNotes}`,
      buttons: downloadAsset ? ['Download', 'Skip This Version', 'Later'] : ['Open Releases Page', 'Skip This Version', 'Later'],
      defaultId: 0,
    });

    if (result === 0 && downloadAsset) {
      // Open the download URL in the default browser
      shell.openExternal(downloadAsset.browser_download_url);
    } else if (result === 0 && !downloadAsset) {
      // Open GitHub releases page
      shell.openExternal(`https://github.com/${GITHUB_REPO}/releases/latest`);
    } else if (result === 1) {
      // Skip this version
      state.skippedVersion = latestVersion;
      saveUpdateState(state);
    }
    // result === 2: "Later" — just dismiss
  } catch (e) {
    if (!silent) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'Update Check Failed',
        message: `Could not check for updates: ${e.message}`,
        buttons: ['OK'],
      });
    }
  }
}

app.whenReady().then(() => {
  // Set up IPC handlers
  setupIPC();

  // Set up application menu
  setupMenu();

  // Set up downloads handler (must be after app is ready for session.defaultSession)
  setupDownloadsHandler();

  // Show splash screen first
  createSplashScreen();

  // Create the main window (it will remain hidden until ready)
  createWindow();

  // Check for updates on launch (24-hour cooldown, silent)
  setTimeout(() => checkForUpdates(true), 5000);

  // macOS: recreate window when clicking dock icon
  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
// ─── SSL Certificate Error Handler ──────────────────────────────────────────
// Render free tier: SSL handshake can fail during cold starts — auto-accept for .onrender.com
// All other domains: show a dialog asking the user, similar to Chrome's cert warning
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();

  try {
    const hostname = new URL(url).hostname;
    if (hostname.endsWith('.onrender.com')) {
      // Render's load balancer can have SSL issues during cold starts — auto-accept
      callback(true);
      return;
    }
  } catch (_) {
    // Invalid URL — fall through to dialog
  }

  // For all other domains, ask the user before proceeding
  const detail = `URL: ${url}\nError: ${error}\nIssuer: ${certificate.issuerName || 'Unknown'}\n\nDo you want to trust this certificate and continue?`;
  dialog.showMessageBox(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0], {
    type: 'warning',
    title: 'Certificate Error',
    message: 'This site has an invalid security certificate.',
    detail,
    buttons: ['Go Back (Safe)', 'Continue Anyway'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  }).then(({ response }) => {
    callback(response === 1);
  }).catch(() => {
    callback(false);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────
app.on('browser-window-focus', () => {
  // These are handled by the menu accelerators above
});

// Security: Prevent new window creation via web content
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event) => {
    event.preventDefault();
  });
});
