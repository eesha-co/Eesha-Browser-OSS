// Eesha Browser - HTTPS-Only Enforcement
// Upgrades insecure HTTP requests to HTTPS at the page level
// For platforms where network-level enforcement isn't possible

(function() {
  'use strict';

  // ─── Intercept fetch() ────────────────────────────────────────────
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    let url = typeof input === 'string' ? input : input.url;
    if (url && url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
      if (typeof input === 'string') {
        input = url;
      } else {
        input = new Request(url, input);
      }
    }
    return origFetch.call(this, input, init);
  };

  // ─── Intercept XMLHttpRequest ─────────────────────────────────────
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === 'string' && url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    }
    return origOpen.apply(this, arguments);
  };

  // ─── Intercept <a> and <form> with http:// ────────────────────────
  function upgradeLinks() {
    document.querySelectorAll('a[href^="http://"]').forEach(link => {
      link.href = link.href.replace('http://', 'https://');
    });
    document.querySelectorAll('form[action^="http://"]').forEach(form => {
      form.action = form.action.replace('http://', 'https://');
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', upgradeLinks);
  } else {
    upgradeLinks();
  }

  // Also run when new elements are added
  const observer = new MutationObserver(upgradeLinks);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
