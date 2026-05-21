// app.js - Eesha Browser Renderer Logic
// Handles the browser chrome UI (tabs, URL bar, navigation)

(function () {
  'use strict';

  // ─── DOM References ────────────────────────────────────────────────────────
  const tabBar = document.getElementById('tabBar');
  const tabsContainer = document.getElementById('tabsContainer');
  const newTabBtn = document.getElementById('newTabBtn');
  const privateTabBtn = document.getElementById('privateTabBtn');
  const urlInput = document.getElementById('urlInput');
  const urlInputWrapper = document.getElementById('urlInputWrapper');
  const securityIndicator = document.getElementById('securityIndicator');
  const shieldIcon = document.getElementById('shieldIcon');
  const shieldBadge = document.getElementById('shieldBadge');
  const shieldPopup = document.getElementById('shieldPopup');
  const shieldSettingsBtn = document.getElementById('shieldSettingsBtn');
  const autocompleteDropdown = document.getElementById('autocompleteDropdown');
  const backBtn = document.getElementById('backBtn');
  const forwardBtn = document.getElementById('forwardBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  const homeBtn = document.getElementById('homeBtn');
  const bookmarkBtn = document.getElementById('bookmarkBtn');
  const downloadsBtn = document.getElementById('downloadsBtn');
  const downloadBadge = document.getElementById('downloadBadge');
  const shareBtn = document.getElementById('shareBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const progressBar = document.getElementById('progressBar');
  const progressBarContainer = document.getElementById('progressBarContainer');
  const findBar = document.getElementById('findBar');
  const findInput = document.getElementById('findInput');
  const findCount = document.getElementById('findCount');
  const findPrevBtn = document.getElementById('findPrevBtn');
  const findNextBtn = document.getElementById('findNextBtn');
  const findCloseBtn = document.getElementById('findCloseBtn');

  // ─── State ─────────────────────────────────────────────────────────────────
  let activeTabId = null;
  let tabs = [];
  let isLoading = false;
  let urlInputFocused = false;
  let bookmarks = [];
  let historyData = [];
  let appSettings = {};
  let autocompleteItems = [];
  let autocompleteSelectedIndex = -1;
  let shieldPopupVisible = false;
  let findBarVisible = false;
  let findCurrentMatch = 0;
  let findTotalMatches = 0;

  // ─── Search Engine ─────────────────────────────────────────────────────────
  const NEWTAB_URL = 'eesha://newtab';
  const SEARCH_URL = 'eesha://search';
  const SETTINGS_URL = 'eesha://settings';
  const BOOKMARKS_URL = 'eesha://bookmarks';
  const HISTORY_URL = 'eesha://history';
  const DOWNLOADS_URL = 'eesha://downloads';

  function getSearchEngine() {
    return appSettings.searchEngine || 'https://eesha-search.onrender.com/search?q=';
  }

  // ─── Platform Detection ────────────────────────────────────────────────────
  function detectPlatform() {
    const platform = navigator.platform || '';
    if (platform.includes('Mac')) {
      document.body.classList.add('platform-mac');
    } else if (platform.includes('Win')) {
      document.body.classList.add('platform-win');
    } else {
      document.body.classList.add('platform-linux');
    }
  }
  detectPlatform();

  // ─── Tab Management ────────────────────────────────────────────────────────
  function createTabElement(tabData) {
    const tab = document.createElement('div');
    tab.className = 'tab' + (tabData.active ? ' active' : '') + (tabData.isPrivate ? ' private-tab' : '');
    tab.dataset.tabId = tabData.tabId;

    // Create favicon element - use real favicons for websites, emoji for internal pages
    const faviconWrapper = document.createElement('div');
    faviconWrapper.className = 'tab-favicon';

    const isInternal = !tabData.url || tabData.url === NEWTAB_URL || tabData.url.startsWith('eesha://');

    if (tabData.isPrivate) {
      // Private tab - show eye icon
      faviconWrapper.textContent = '👁';
      faviconWrapper.style.fontSize = '11px';
      faviconWrapper.style.display = 'flex';
      faviconWrapper.style.alignItems = 'center';
      faviconWrapper.style.justifyContent = 'center';
      faviconWrapper.style.borderRadius = '3px';
      faviconWrapper.style.background = '#7c3aed';
    } else if (isInternal) {
      // Internal page - show emoji icon
      faviconWrapper.textContent = getInternalPageIcon(tabData.url);
      faviconWrapper.style.fontSize = '11px';
      faviconWrapper.style.display = 'flex';
      faviconWrapper.style.alignItems = 'center';
      faviconWrapper.style.justifyContent = 'center';
      faviconWrapper.style.borderRadius = '3px';
      faviconWrapper.style.background = getInternalPageColor(tabData.url);
    } else {
      // External website - load real favicon
      const faviconImg = document.createElement('img');
      faviconImg.className = 'tab-favicon-img';
      try {
        const urlObj = new URL(tabData.url);
        faviconImg.src = `${urlObj.origin}/favicon.ico`;
      } catch {
        faviconImg.src = '';
      }
      faviconImg.style.width = '16px';
      faviconImg.style.height = '16px';
      faviconImg.style.borderRadius = '2px';
      faviconImg.style.objectFit = 'contain';
      faviconImg.style.flexShrink = '0';
      // Fallback if image fails to load
      faviconImg.onerror = function() {
        this.style.display = 'none';
        const fallback = document.createElement('div');
        fallback.className = 'tab-favicon-fallback';
        try {
          const hn = new URL(tabData.url).hostname;
          fallback.textContent = hn.charAt(0).toUpperCase();
        } catch {
          fallback.textContent = '?';
        }
        fallback.style.background = getFaviconColorFromUrl(tabData.url);
        fallback.style.color = '#fff';
        fallback.style.fontSize = '10px';
        fallback.style.display = 'flex';
        fallback.style.alignItems = 'center';
        fallback.style.justifyContent = 'center';
        fallback.style.borderRadius = '3px';
        fallback.style.width = '16px';
        fallback.style.height = '16px';
        fallback.style.flexShrink = '0';
        this.parentNode.insertBefore(fallback, this.nextSibling);
      };
      faviconWrapper.appendChild(faviconImg);
      faviconWrapper.style.background = 'transparent';
      faviconWrapper.style.padding = '0';
    }

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tabData.title || (tabData.isPrivate ? 'Private Tab' : 'New Tab');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.eesha.closeTab(tabData.tabId);
    });

    tab.addEventListener('click', () => {
      window.eesha.switchTab(tabData.tabId);
    });

    tab.appendChild(faviconWrapper);
    tab.appendChild(title);
    tab.appendChild(closeBtn);

    return tab;
  }

  function getInternalPageIcon(url) {
    if (!url || url === NEWTAB_URL) return '🏠';
    if (url && url.startsWith(SEARCH_URL)) return '🔍';
    if (url === SETTINGS_URL) return '⚙';
    if (url === BOOKMARKS_URL) return '🔖';
    if (url === HISTORY_URL) return '📜';
    if (url === DOWNLOADS_URL) return '⬇';
    return '🏠';
  }

  function getInternalPageColor(url) {
    if (!url || url === NEWTAB_URL) return '#e94560';
    if (url && url.startsWith(SEARCH_URL)) return '#1a1a2e';
    if (url === SETTINGS_URL) return '#5a5a7a';
    if (url === BOOKMARKS_URL) return '#e94560';
    if (url === HISTORY_URL) return '#5a5a7a';
    if (url === DOWNLOADS_URL) return '#e94560';
    return '#e94560';
  }

  function getFaviconColorFromUrl(url) {
    // Generate a consistent color based on URL for fallback
    let hash = 0;
    try {
      const hostname = new URL(url).hostname;
      for (let i = 0; i < hostname.length; i++) {
        hash = hostname.charCodeAt(i) + ((hash << 5) - hash);
      }
    } catch {
      hash = 0;
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 55%, 45%)`;
  }

  function updateTabsList(tabsData) {
    tabs = tabsData;
    tabsContainer.innerHTML = '';

    tabsData.forEach((tabData) => {
      const tabEl = createTabElement(tabData);
      tabsContainer.appendChild(tabEl);
    });

    // Update active tab ID
    const activeTab = tabsData.find(t => t.active);
    if (activeTab) {
      activeTabId = activeTab.tabId;
      updateUrlBar(activeTab.url, activeTab.loading);
      updateNavButtons(activeTab);
      updateBookmarkButton(activeTab.url);
      updateShieldForTab(activeTab);
    }
  }

  function addTab(tabData) {
    tabs.push(tabData);
    const tabEl = createTabElement(tabData);
    tabsContainer.appendChild(tabEl);
    scrollToTab(tabEl);
  }

  function updateTab(tabId, updates) {
    const tabEl = tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (!tabEl) return;

    if (updates.title !== undefined) {
      const titleEl = tabEl.querySelector('.tab-title');
      if (titleEl) titleEl.textContent = updates.title || 'New Tab';
    }

    if (updates.url !== undefined) {
      const faviconEl = tabEl.querySelector('.tab-favicon');
      const tabData = tabs.find(t => t.tabId === tabId);
      const isPrivate = tabData ? tabData.isPrivate : false;
      const isInternal = !updates.url || updates.url === NEWTAB_URL || updates.url.startsWith('eesha://');
      
      if (faviconEl) {
        // Remove old fallback if any
        const oldFallback = faviconEl.querySelector('.tab-favicon-fallback');
        if (oldFallback) oldFallback.remove();
        const oldImg = faviconEl.querySelector('.tab-favicon-img');
        
        if (isPrivate) {
          faviconEl.textContent = '👁';
          faviconEl.style.fontSize = '11px';
          faviconEl.style.background = '#7c3aed';
        } else if (isInternal) {
          faviconEl.textContent = getInternalPageIcon(updates.url);
          faviconEl.style.fontSize = '11px';
          faviconEl.style.background = getInternalPageColor(updates.url);
          if (oldImg) oldImg.remove();
        } else {
          // External URL - update favicon image
          faviconEl.textContent = '';
          if (oldImg) {
            try {
              const urlObj = new URL(updates.url);
              oldImg.src = `${urlObj.origin}/favicon.ico`;
              oldImg.style.display = '';
            } catch {}
          } else {
            // Create new img element
            const faviconImg = document.createElement('img');
            faviconImg.className = 'tab-favicon-img';
            try {
              const urlObj = new URL(updates.url);
              faviconImg.src = `${urlObj.origin}/favicon.ico`;
            } catch {
              faviconImg.src = '';
            }
            faviconImg.style.width = '16px';
            faviconImg.style.height = '16px';
            faviconImg.style.borderRadius = '2px';
            faviconImg.style.objectFit = 'contain';
            faviconImg.style.flexShrink = '0';
            faviconImg.onerror = function() {
              this.style.display = 'none';
              const fallback = document.createElement('div');
              fallback.className = 'tab-favicon-fallback';
              try {
                const hn = new URL(updates.url).hostname;
                fallback.textContent = hn.charAt(0).toUpperCase();
              } catch {
                fallback.textContent = '?';
              }
              fallback.style.background = getFaviconColorFromUrl(updates.url);
              fallback.style.color = '#fff';
              fallback.style.fontSize = '10px';
              fallback.style.display = 'flex';
              fallback.style.alignItems = 'center';
              fallback.style.justifyContent = 'center';
              fallback.style.borderRadius = '3px';
              fallback.style.width = '16px';
              fallback.style.height = '16px';
              fallback.style.flexShrink = '0';
              this.parentNode.insertBefore(fallback, this.nextSibling);
            };
            faviconEl.appendChild(faviconImg);
          }
          faviconEl.style.background = 'transparent';
        }
      }
    }

    if (updates.loading !== undefined) {
      tabEl.classList.toggle('loading', updates.loading);
    }

    // Update our local tabs state
    const tabIdx = tabs.findIndex(t => t.tabId === tabId);
    if (tabIdx !== -1) {
      Object.assign(tabs[tabIdx], updates);
    }
  }

  function setActiveTab(tabId) {
    // Remove active from all
    tabsContainer.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    // Add active to target
    const tabEl = tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabEl) {
      tabEl.classList.add('active');
      scrollToTab(tabEl);
    }
    activeTabId = tabId;
  }

  function removeTab(tabId) {
    const tabEl = tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabEl) {
      tabEl.style.opacity = '0';
      tabEl.style.transform = 'scale(0.9)';
      tabEl.style.transition = 'all 0.15s ease';
      setTimeout(() => tabEl.remove(), 150);
    }
    tabs = tabs.filter(t => t.tabId !== tabId);
  }

  function scrollToTab(tabEl) {
    if (tabEl) {
      tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  // ─── URL Bar ───────────────────────────────────────────────────────────────
  function updateUrlBar(url, loading) {
    if (!urlInputFocused) {
      // Clean up the URL for display
      let displayUrl = url || '';
      if (displayUrl === NEWTAB_URL || displayUrl === 'eesha://newtab/') {
        displayUrl = '';
      } else if (displayUrl === SETTINGS_URL || displayUrl === 'eesha://settings/') {
        displayUrl = 'eesha://settings';
      } else if (displayUrl === BOOKMARKS_URL || displayUrl === 'eesha://bookmarks/') {
        displayUrl = 'eesha://bookmarks';
      } else if (displayUrl === HISTORY_URL || displayUrl === 'eesha://history/') {
        displayUrl = 'eesha://history';
      } else if (displayUrl === DOWNLOADS_URL || displayUrl === 'eesha://downloads/') {
        displayUrl = 'eesha://downloads';
      }
      urlInput.value = displayUrl;
    }
    updateSecurityIndicator(url);
  }

  function updateSecurityIndicator(url) {
    securityIndicator.classList.remove('secure', 'insecure', 'internal');
    if (!url) return;

    if (url.startsWith('https://')) {
      securityIndicator.classList.add('secure');
    } else if (url.startsWith('http://')) {
      securityIndicator.classList.add('insecure');
    } else if (url.startsWith('eesha://')) {
      securityIndicator.classList.add('internal');
    }
  }

  function navigateFromUrlBar() {
    const query = urlInput.value.trim();
    if (!query) {
      window.eesha.navigate(NEWTAB_URL);
      return;
    }

    let url;
    if (/^https?:\/\//i.test(query)) {
      url = query;
    } else if (/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/.test(query)) {
      url = 'https://' + query;
    } else if (query.startsWith('eesha://')) {
      url = query;
    } else {
      // Navigate directly to the search engine URL
      const engine = getSearchEngine();
      url = engine + encodeURIComponent(query);
    }

    window.eesha.navigate(url);
    urlInput.blur();
    hideAutocomplete();
  }

  // ─── Navigation Buttons ────────────────────────────────────────────────────
  function updateNavButtons(tabData) {
    backBtn.classList.toggle('disabled', !tabData.canGoBack);
    forwardBtn.classList.toggle('disabled', !tabData.canGoForward);
  }

  // ─── Progress Bar ─────────────────────────────────────────────────────────
  function showLoading() {
    isLoading = true;
    progressBar.className = 'progress-bar loading';
    progressBarContainer.style.height = '2px';
    reloadBtn.querySelector('svg').style.animation = 'spin 1s linear infinite';
  }

  function hideLoading() {
    isLoading = false;
    progressBar.className = 'progress-bar complete';
    reloadBtn.querySelector('svg').style.animation = '';
    setTimeout(() => {
      progressBar.className = 'progress-bar hidden';
      setTimeout(() => {
        progressBarContainer.style.height = '0';
      }, 300);
    }, 200);
  }

  // ─── Bookmark Button ──────────────────────────────────────────────────────
  function updateBookmarkButton(url) {
    if (!url || url.startsWith('eesha://')) {
      bookmarkBtn.classList.remove('bookmarked');
      bookmarkBtn.style.opacity = '0.4';
      return;
    }
    bookmarkBtn.style.opacity = '1';
    window.eesha.isBookmarked(url).then((isMarked) => {
      bookmarkBtn.classList.toggle('bookmarked', isMarked);
    });
  }

  function toggleBookmark() {
    const activeTab = tabs.find(t => t.tabId === activeTabId);
    if (!activeTab || activeTab.url.startsWith('eesha://')) return;

    window.eesha.isBookmarked(activeTab.url).then((isMarked) => {
      if (isMarked) {
        window.eesha.removeBookmark(activeTab.url);
        bookmarkBtn.classList.remove('bookmarked');
      } else {
        window.eesha.addBookmark(activeTab.url, activeTab.title);
        bookmarkBtn.classList.add('bookmarked');
      }
    });
  }

  // ─── Shield Icon ──────────────────────────────────────────────────────────
  function updateShieldForTab(tabData) {
    window.eesha.getBlockStats().then((stats) => {
      const count = stats.totalBlocked || 0;
      shieldBadge.textContent = count > 99 ? '99+' : count.toString();
      shieldBadge.classList.toggle('empty', count === 0);

      // Update popup values
      const popupBlocked = document.getElementById('popupBlockedCount');
      if (popupBlocked) popupBlocked.textContent = count.toString();

      const popupFingerprint = document.getElementById('popupFingerprint');
      if (popupFingerprint) {
        popupFingerprint.textContent = appSettings.fingerprintProtection ? 'On' : 'Off';
        popupFingerprint.classList.toggle('off', !appSettings.fingerprintProtection);
      }

      const popupHttps = document.getElementById('popupHttps');
      if (popupHttps) {
        popupHttps.textContent = appSettings.httpsOnlyMode ? 'On' : 'Off';
        popupHttps.classList.toggle('off', !appSettings.httpsOnlyMode);
      }

      const popupConnection = document.getElementById('popupConnection');
      if (popupConnection) {
        if (tabData.url && tabData.url.startsWith('https://')) {
          popupConnection.textContent = 'Secure (HTTPS)';
          popupConnection.classList.remove('off');
        } else if (tabData.url && tabData.url.startsWith('http://')) {
          popupConnection.textContent = 'Insecure (HTTP)';
          popupConnection.classList.add('off');
        } else {
          popupConnection.textContent = 'Internal';
          popupConnection.classList.remove('off');
        }
      }
    });
  }

  function toggleShieldPopup() {
    shieldPopupVisible = !shieldPopupVisible;
    shieldPopup.classList.toggle('visible', shieldPopupVisible);

    if (shieldPopupVisible) {
      const activeTab = tabs.find(t => t.tabId === activeTabId);
      if (activeTab) {
        updateShieldForTab(activeTab);
      }
    }
  }

  function hideShieldPopup() {
    shieldPopupVisible = false;
    shieldPopup.classList.remove('visible');
  }

  // ─── Autocomplete ──────────────────────────────────────────────────────────
  function fuzzyMatch(query, text) {
    if (!query || !text) return false;
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    // Exact substring match
    if (t.includes(q)) return true;
    // Fuzzy match - each character of query appears in order in text
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) qi++;
    }
    return qi === q.length;
  }

  function getAutocompleteSuggestions(query) {
    if (!query || query.length < 2) return [];
    const results = [];
    const seenUrls = new Set();

    // Search bookmarks
    bookmarks.forEach(b => {
      if (seenUrls.has(b.url)) return;
      if (fuzzyMatch(query, b.title) || fuzzyMatch(query, b.url)) {
        seenUrls.add(b.url);
        results.push({
          type: 'bookmark',
          title: b.title || b.url,
          url: b.url,
        });
      }
    });

    // Search history
    historyData.forEach(h => {
      if (seenUrls.has(h.url)) return;
      if (fuzzyMatch(query, h.title) || fuzzyMatch(query, h.url)) {
        seenUrls.add(h.url);
        results.push({
          type: 'history',
          title: h.title || h.url,
          url: h.url,
        });
      }
    });

    return results.slice(0, 8);
  }

  function showAutocomplete(query) {
    autocompleteItems = getAutocompleteSuggestions(query);
    autocompleteSelectedIndex = -1;

    if (autocompleteItems.length === 0) {
      hideAutocomplete();
      return;
    }

    autocompleteDropdown.innerHTML = '';

    // Group by type
    const bookmarkItems = autocompleteItems.filter(i => i.type === 'bookmark');
    const historyItems = autocompleteItems.filter(i => i.type === 'history');

    if (bookmarkItems.length > 0) {
      const category = document.createElement('div');
      category.className = 'autocomplete-category';
      category.textContent = 'Bookmarks';
      autocompleteDropdown.appendChild(category);

      bookmarkItems.forEach((item, idx) => {
        autocompleteDropdown.appendChild(createAutocompleteItem(item, idx));
      });
    }

    if (historyItems.length > 0) {
      const category = document.createElement('div');
      category.className = 'autocomplete-category';
      category.textContent = 'History';
      autocompleteDropdown.appendChild(category);

      historyItems.forEach((item) => {
        const globalIdx = autocompleteItems.indexOf(item);
        autocompleteDropdown.appendChild(createAutocompleteItem(item, globalIdx));
      });
    }

    autocompleteDropdown.classList.add('visible');
  }

  function createAutocompleteItem(item, index) {
    const el = document.createElement('div');
    el.className = 'autocomplete-item';
    el.dataset.index = index;

    const icon = document.createElement('div');
    icon.className = 'autocomplete-item-icon ' + (item.type === 'bookmark' ? 'bookmark-icon' : 'history-icon');
    if (item.type === 'bookmark') {
      icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
    } else {
      icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
    }

    const text = document.createElement('div');
    text.className = 'autocomplete-item-text';

    const title = document.createElement('div');
    title.className = 'autocomplete-item-title';
    title.textContent = item.title;

    const url = document.createElement('div');
    url.className = 'autocomplete-item-url';
    url.textContent = item.url;

    text.appendChild(title);
    text.appendChild(url);

    el.appendChild(icon);
    el.appendChild(text);

    el.addEventListener('click', () => {
      window.eesha.navigate(item.url);
      urlInput.blur();
      hideAutocomplete();
    });

    el.addEventListener('mouseenter', () => {
      autocompleteSelectedIndex = index;
      updateAutocompleteSelection();
    });

    return el;
  }

  function updateAutocompleteSelection() {
    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    items.forEach((el, idx) => {
      el.classList.toggle('selected', parseInt(el.dataset.index) === autocompleteSelectedIndex);
    });
  }

  function hideAutocomplete() {
    autocompleteDropdown.classList.remove('visible');
    autocompleteItems = [];
    autocompleteSelectedIndex = -1;
  }

  // ─── Event Listeners ───────────────────────────────────────────────────────

  // New Tab button
  newTabBtn.addEventListener('click', () => {
    window.eesha.createTab(NEWTAB_URL);
  });

  // Private Tab button
  privateTabBtn.addEventListener('click', () => {
    window.eesha.createPrivateTab(NEWTAB_URL);
  });

  // URL Input
  urlInput.addEventListener('focus', () => {
    urlInputFocused = true;
    urlInput.select();
  });

  urlInput.addEventListener('blur', () => {
    urlInputFocused = false;
    // Restore URL display
    const activeTab = tabs.find(t => t.tabId === activeTabId);
    if (activeTab) {
      updateUrlBar(activeTab.url, activeTab.loading);
    }
    // Delay hiding autocomplete to allow click events to fire
    setTimeout(hideAutocomplete, 200);
  });

  urlInput.addEventListener('input', () => {
    const query = urlInput.value.trim();
    if (query.length >= 2) {
      showAutocomplete(query);
    } else {
      hideAutocomplete();
    }
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (autocompleteSelectedIndex >= 0 && autocompleteItems[autocompleteSelectedIndex]) {
        window.eesha.navigate(autocompleteItems[autocompleteSelectedIndex].url);
        urlInput.blur();
        hideAutocomplete();
      } else {
        navigateFromUrlBar();
      }
    } else if (e.key === 'Escape') {
      urlInput.blur();
      hideAutocomplete();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (autocompleteItems.length > 0) {
        autocompleteSelectedIndex = (autocompleteSelectedIndex + 1) % autocompleteItems.length;
        updateAutocompleteSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (autocompleteItems.length > 0) {
        autocompleteSelectedIndex = autocompleteSelectedIndex <= 0 ? autocompleteItems.length - 1 : autocompleteSelectedIndex - 1;
        updateAutocompleteSelection();
      }
    } else if (e.key === 'Tab') {
      // Tab completion: if there's a selected autocomplete item, fill it in
      if (autocompleteSelectedIndex >= 0 && autocompleteItems[autocompleteSelectedIndex]) {
        e.preventDefault();
        urlInput.value = autocompleteItems[autocompleteSelectedIndex].url;
      }
    }
  });

  // Navigation buttons
  backBtn.addEventListener('click', () => window.eesha.goBack());
  forwardBtn.addEventListener('click', () => window.eesha.goForward());
  reloadBtn.addEventListener('click', () => window.eesha.reload());
  homeBtn.addEventListener('click', () => {
    const homepage = appSettings.homepageUrl || NEWTAB_URL;
    window.eesha.navigate(homepage);
  });
  bookmarkBtn.addEventListener('click', toggleBookmark);
  downloadsBtn.addEventListener('click', () => {
    window.eesha.createTab(DOWNLOADS_URL);
  });
  shareBtn.addEventListener('click', shareCurrentUrl);
  settingsBtn.addEventListener('click', () => window.eesha.createTab(SETTINGS_URL));

  // Shield icon
  shieldIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleShieldPopup();
  });

  // Shield settings button
  shieldSettingsBtn.addEventListener('click', () => {
    hideShieldPopup();
    window.eesha.createTab(SETTINGS_URL);
  });

  // Close shield popup when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (shieldPopupVisible && !shieldPopup.contains(e.target) && !shieldIcon.contains(e.target)) {
      hideShieldPopup();
    }
    if (autocompleteDropdown.classList.contains('visible') && !autocompleteDropdown.contains(e.target) && !urlInputWrapper.contains(e.target)) {
      hideAutocomplete();
    }
  });

  // Window controls (for Windows/Linux)
  const minimizeBtn = document.getElementById('minimizeBtn');
  const maximizeBtn = document.getElementById('maximizeBtn');
  const closeBtn = document.getElementById('closeBtn');

  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      window.eesha.windowMinimize();
    });
  }

  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', () => {
      window.eesha.windowMaximize();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.eesha.windowClose();
    });
  }

  // ─── IPC Event Handlers ────────────────────────────────────────────────────

  // URL change
  window.eesha.onUrlChange((data) => {
    if (data.tabId === activeTabId) {
      updateUrlBar(data.url, isLoading);
      updateNavButtons(data);
      updateBookmarkButton(data.url);
    }
    updateTab(data.tabId, { url: data.url });
  });

  // Title change
  window.eesha.onTitleChange((data) => {
    updateTab(data.tabId, { title: data.title });
  });

  // Loading state change
  window.eesha.onLoadingStateChange((data) => {
    updateTab(data.tabId, { loading: data.loading });
    if (data.tabId === activeTabId) {
      if (data.loading) {
        showLoading();
      } else {
        hideLoading();
        // Update shield stats after page loads
        const activeTab = tabs.find(t => t.tabId === activeTabId);
        if (activeTab) {
          updateShieldForTab(activeTab);
        }
      }
    }
  });

  // Tab created
  window.eesha.onTabCreated((data) => {
    addTab(data);
    setActiveTab(data.tabId);
  });

  // Tab switched
  window.eesha.onTabSwitched((data) => {
    setActiveTab(data.tabId);
    // Fetch latest tab info
    window.eesha.getActiveTab().then((tabData) => {
      if (tabData) {
        updateUrlBar(tabData.url, tabData.loading);
        updateNavButtons(tabData);
        updateBookmarkButton(tabData.url);
        updateShieldForTab(tabData);
      }
    });
  });

  // Tab closed
  window.eesha.onTabClosed((data) => {
    removeTab(data.tabId);
  });

  // Bookmarks updated
  window.eesha.onBookmarksUpdated((data) => {
    bookmarks = data.bookmarks;
  });

  // Focus URL bar
  window.eesha.onFocusUrlBar(() => {
    urlInput.focus();
    urlInput.select();
  });

  // Settings updated
  window.eesha.onSettingsUpdated((data) => {
    appSettings = data;
    // Update placeholder based on search engine
    const engineName = getSearchEngine().includes('eesha://search') || getSearchEngine().includes('eesha-search') || getSearchEngine().includes('localhost:3031') ? 'Eesha Search' :
      getSearchEngine().includes('searxng') || getSearchEngine().includes('localhost:8888') ? 'Eesha Search' :
      getSearchEngine().includes('duckduckgo') ? 'DuckDuckGo' :
      getSearchEngine().includes('google') ? 'Google' :
      getSearchEngine().includes('bing') ? 'Bing' :
      getSearchEngine().includes('brave') ? 'Brave Search' :
      getSearchEngine().includes('startpage') ? 'StartPage' : 'Eesha Search';
    urlInput.placeholder = `Search with ${engineName} or enter a URL...`;
  });

  // ─── Find in Page ──────────────────────────────────────────────────────────
  function showFindBar() {
    findBarVisible = true;
    findBar.style.display = 'flex';
    findInput.focus();
    findInput.select();
  }

  function hideFindBar() {
    findBarVisible = false;
    findBar.style.display = 'none';
    findInput.value = '';
    findCount.textContent = '0/0';
    findCurrentMatch = 0;
    findTotalMatches = 0;
    window.eesha.stopFindInPage();
  }

  function performFind(forward) {
    const text = findInput.value;
    if (!text) {
      findCount.textContent = '0/0';
      return;
    }
    window.eesha.findInPage(text, { forward: forward !== false, findNext: false });
  }

  findInput.addEventListener('input', () => {
    performFind(true);
  });

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        window.eesha.findInPage(findInput.value, { forward: false, findNext: true });
      } else {
        window.eesha.findInPage(findInput.value, { forward: true, findNext: true });
      }
    } else if (e.key === 'Escape') {
      hideFindBar();
    }
  });

  findNextBtn.addEventListener('click', () => {
    window.eesha.findInPage(findInput.value, { forward: true, findNext: true });
  });

  findPrevBtn.addEventListener('click', () => {
    window.eesha.findInPage(findInput.value, { forward: false, findNext: true });
  });

  findCloseBtn.addEventListener('click', () => {
    hideFindBar();
  });

  // Listen for find results
  window.eesha.onFindResult((result) => {
    findCurrentMatch = result.activeMatchOrdinal || 0;
    findTotalMatches = result.matches || 0;
    if (findTotalMatches > 0) {
      findCount.textContent = `${findCurrentMatch}/${findTotalMatches}`;
    } else {
      findCount.textContent = '0/0';
    }
  });

  // ─── Share URL (Copy to clipboard) ──────────────────────────────────────
  function shareCurrentUrl() {
    const activeTab = tabs.find(t => t.tabId === activeTabId);
    if (!activeTab || !activeTab.url) return;

    window.eesha.shareUrl(activeTab.url).then((result) => {
      if (result.success) {
        // Brief visual feedback
        shareBtn.style.color = '#4caf50';
        shareBtn.title = 'Copied!';
        setTimeout(() => {
          shareBtn.style.color = '';
          shareBtn.title = 'Copy URL to clipboard';
        }, 1500);
      }
    });
  }

  // ─── Download Badge Update ──────────────────────────────────────────────
  function updateDownloadBadge() {
    window.eesha.getDownloads().then((downloadsList) => {
      const active = downloadsList.filter(d => d.state === 'downloading').length;
      if (active > 0) {
        downloadBadge.style.display = 'flex';
        downloadBadge.textContent = active;
      } else {
        downloadBadge.style.display = 'none';
      }
    });
  }

  // Listen for download updates
  window.eesha.onDownloadsUpdated(() => {
    updateDownloadBadge();
  });

  // ─── Keyboard Shortcuts ────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Ctrl+L - Focus URL bar
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      urlInput.focus();
      urlInput.select();
    }
    // Ctrl+F - Find in page
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      if (findBarVisible) {
        findInput.focus();
        findInput.select();
      } else {
        showFindBar();
      }
    }
    // Ctrl+J - Downloads
    if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
      e.preventDefault();
      window.eesha.createTab(DOWNLOADS_URL);
    }
    // Ctrl+T - New tab (also handled by menu, but ensure it works)
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      // This is handled by the application menu
    }
    // Ctrl+W - Close tab
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      // This is handled by the application menu
    }
  });

  // ─── Initialize ────────────────────────────────────────────────────────────
  async function init() {
    try {
      // Load settings
      appSettings = await window.eesha.getSettings();

      // Update placeholder based on search engine
      const engineName = getSearchEngine().includes('eesha://search') || getSearchEngine().includes('eesha-search') || getSearchEngine().includes('localhost:3031') ? 'Eesha Search' :
        getSearchEngine().includes('searxng') || getSearchEngine().includes('localhost:8888') ? 'Eesha Search' :
        getSearchEngine().includes('duckduckgo') ? 'DuckDuckGo' :
        getSearchEngine().includes('google') ? 'Google' :
        getSearchEngine().includes('bing') ? 'Bing' :
        getSearchEngine().includes('brave') ? 'Brave Search' :
        getSearchEngine().includes('startpage') ? 'StartPage' : 'Eesha Search';
      urlInput.placeholder = `Search with ${engineName} or enter a URL...`;

      // Get initial tabs
      const tabsData = await window.eesha.getTabs();
      if (tabsData && tabsData.length > 0) {
        updateTabsList(tabsData);
      }

      // Get initial bookmarks and history for autocomplete
      bookmarks = await window.eesha.getBookmarks();
      historyData = await window.eesha.getHistory();

      // Get active tab info
      const activeTab = await window.eesha.getActiveTab();
      if (activeTab) {
        activeTabId = activeTab.id;
        updateUrlBar(activeTab.url, activeTab.loading);
        updateNavButtons(activeTab);
        updateBookmarkButton(activeTab.url);
        updateShieldForTab(activeTab);
      }
    } catch (err) {
      console.error('Failed to initialize:', err);
    }
  }

  init();

  // ─── Double-click title bar to maximize ──────────────────────────────────
  tabBar.addEventListener('dblclick', (e) => {
    // Only if clicking on empty space in tab bar
    if (e.target === tabBar || e.target === tabsContainer) {
      window.eesha.windowMaximize();
    }
  });

  // ─── Periodic shield update ───────────────────────────────────────────────
  setInterval(() => {
    const activeTab = tabs.find(t => t.tabId === activeTabId);
    if (activeTab) {
      updateShieldForTab(activeTab);
    }
  }, 5000);

})();
