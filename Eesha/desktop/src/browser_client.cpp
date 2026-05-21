// browser_client.cpp - Eesha Browser Client implementation
#include "browser_client.h"

#include "include/cef_browser.h"
#include "include/cef_frame.h"
#include "include/cef_request.h"
#include "include/cef_resource_request_handler.h"

#include <algorithm>
#include <iostream>

// Known tracking/ad domains to block for privacy
static const std::vector<std::string> TRACKING_DOMAINS = {
    "doubleclick.net",
    "google-analytics.com",
    "googletagmanager.com",
    "facebook.net/en_US/fbevents",
    "analytics.facebook.com",
    "ads.yahoo.com",
    "amazon-adsystem.com",
    "adnxs.com",
    "adsrvr.org",
    "casalemedia.com",
    "criteo.com",
    "moatads.com",
    "outbrain.com",
    "rubiconproject.com",
    "scorecardresearch.com",
    "serving-sys.com",
    "sharethis.com",
    "taboola.com",
    "tapad.com",
    "quantserve.com",
};

EeshaBrowserClient::EeshaBrowserClient(
    TitleChangeCallback title_cb,
    URLChangeCallback url_cb,
    LoadingStateCallback loading_cb)
    : title_callback_(std::move(title_cb)),
      url_callback_(std::move(url_cb)),
      loading_callback_(std::move(loading_cb)) {}

void EeshaBrowserClient::OnTitleChange(CefRefPtr<CefBrowser> browser,
                                        const CefString& title) {
    CEF_REQUIRE_UI_THREAD();
    if (title_callback_) {
        title_callback_(title.ToString());
    }
}

void EeshaBrowserClient::OnAddressChange(CefRefPtr<CefBrowser> browser,
                                          CefRefPtr<CefFrame> frame,
                                          const CefString& url) {
    CEF_REQUIRE_UI_THREAD();
    if (url_callback_ && frame->IsMain()) {
        url_callback_(url.ToString());
    }
}

void EeshaBrowserClient::OnFaviconURLChange(
    CefRefPtr<CefBrowser> browser,
    const std::vector<CefString>& icon_urls) {
    CEF_REQUIRE_UI_THREAD();
    // Could update tab favicon here
}

void EeshaBrowserClient::OnLoadingStateChange(CefRefPtr<CefBrowser> browser,
                                               bool isLoading,
                                               bool canGoBack,
                                               bool canGoForward) {
    CEF_REQUIRE_UI_THREAD();
    if (loading_callback_) {
        loading_callback_(canGoBack, canGoForward);
    }
}

void EeshaBrowserClient::OnLoadError(CefRefPtr<CefBrowser> browser,
                                      CefRefPtr<CefFrame> frame,
                                      ErrorCode errorCode,
                                      const CefString& errorText,
                                      const CefString& failedUrl) {
    CEF_REQUIRE_UI_THREAD();
    if (errorCode == ERR_ABORTED) return;

    std::string urlStr = failedUrl.ToString();

    // Detect SSL/TLS errors
    bool isSSLError = (errorCode == ERR_SSL_PROTOCOL_ERROR ||
                       errorCode == ERR_SSL_VERSION_OR_CIPHER_MISMATCH ||
                       errorCode == ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN ||
                       errorCode == ERR_CERT_COMMON_NAME_INVALID ||
                       errorCode == ERR_CERT_DATE_INVALID ||
                       errorCode == ERR_CERT_AUTHORITY_INVALID ||
                       errorCode == ERR_CERT_CONTAINS_ERRORS ||
                       errorCode == ERR_CERT_NO_REVOCATION_MECHANISM ||
                       errorCode == ERR_CERT_UNABLE_TO_CHECK_REVOCATION ||
                       errorCode == ERR_CERT_REVOKED ||
                       errorCode == ERR_CERT_INVALID ||
                       errorCode == ERR_CERT_WEAK_SIGNATURE_ALGORITHM ||
                       errorCode == ERR_CERT_WEAK_KEY ||
                       errorCode == ERR_CERT_NAME_CONSTRAINT_VIOLATION ||
                       errorCode == ERR_CERT_VALIDITY_TOO_LONG ||
                       errorCode == ERR_CERT_TRANSPARENCY_REQUIRED);

    // Check if URL is on Render's free tier (.onrender.com)
    bool isRenderDomain = false;
    if (urlStr.find("https://") == 0) {
        // Extract hostname from URL
        size_t hostStart = 8; // after "https://"
        size_t hostEnd = urlStr.find('/', hostStart);
        if (hostEnd == std::string::npos) hostEnd = urlStr.find(':', hostStart);
        if (hostEnd == std::string::npos) hostEnd = urlStr.length();
        std::string host = urlStr.substr(hostStart, hostEnd - hostStart);
        // Check if hostname ends with .onrender.com
        const std::string renderSuffix = ".onrender.com";
        if (host.length() >= renderSuffix.length() &&
            host.compare(host.length() - renderSuffix.length(), renderSuffix.length(), renderSuffix) == 0) {
            isRenderDomain = true;
        }
    }

    std::stringstream ss;

    if (isSSLError && isRenderDomain) {
        // Render cold start: show special message with auto-retry
        ss << "<html><head><title>Waking up server...</title>"
           << "<style>"
           << "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; "
           << "       display: flex; justify-content: center; align-items: center; "
           << "       min-height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }"
           << ".container { text-align: center; padding: 2rem; }"
           << "h1 { font-size: 1.5rem; color: #e94560; }"
           << "p { color: #aaa; margin: 0.5rem 0; }"
           << ".spinner { display: inline-block; width: 24px; height: 24px; "
           << "           border: 3px solid rgba(233,69,96,0.3); border-top-color: #e94560; "
           << "           border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem; }"
           << "@keyframes spin { to { transform: rotate(360deg); } }"
           << "</style></head><body>"
           << "<div class='container'>"
           << "<div class='spinner'></div>"
           << "<h1>Waking up server...</h1>"
           << "<p>This site is hosted on Render's free tier and may take up to 60 seconds to start.</p>"
           << "<p id='retry-info'>Auto-retrying in 5 seconds...</p>"
           << "<a href='" << urlStr << "' style='color:#0f3460; background:#e94560; padding:0.5rem 1.5rem; "
           << "   border-radius:0.5rem; text-decoration:none; color:white; display:inline-block; margin-top:1rem;'>Try Now</a>"
           << "</div>"
           << "<script>"
           << "var retryCount = 0;"
           << "var maxRetries = 3;"
           << "function autoRetry() {"
           << "  if (retryCount < maxRetries) {"
           << "    retryCount++;"
           << "    document.getElementById('retry-info').textContent = "
           << "      'Retry ' + retryCount + '/' + maxRetries + ' in 5s...';"
           << "    setTimeout(function() { window.location.reload(); }, 5000);"
           << "  } else {"
           << "    document.getElementById('retry-info').textContent = "
           << "      'Max retries reached. Click Try Now to attempt again manually.';"
           << "    var spinner = document.querySelector('.spinner');"
           << "    if (spinner) spinner.style.display = 'none';"
           << "  }"
           << "}"
           << "autoRetry();"
           << "</script></body></html>";
    } else if (isSSLError) {
        // Non-Render SSL errors: show SSL-specific error page
        ss << "<html><head><title>SSL Error</title>"
           << "<style>"
           << "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; "
           << "       display: flex; justify-content: center; align-items: center; "
           << "       min-height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }"
           << ".container { text-align: center; padding: 2rem; max-width: 500px; }"
           << "h1 { font-size: 1.5rem; color: #e94560; }"
           << "p { color: #aaa; margin: 0.5rem 0; font-size: 0.9rem; }"
           << ".url { color: #888; font-size: 0.8rem; word-break: break-all; margin: 1rem 0; }"
           << "a { margin-top: 1rem; padding: 0.6rem 2rem; background: #e94560; color: white; "
           << "    border-radius: 0.5rem; text-decoration: none; color: white; display: inline-block; }"
           << "a:hover { background: #c93050; }"
           << "</style></head><body>"
           << "<div class='container'>"
           << "<h1>&#128274; This connection is not secure</h1>"
           << "<p>The site could not provide a secure connection.</p>"
           << "<p>Error: " << errorText.ToString() << "</p>"
           << "<div class='url'>" << urlStr << "</div>"
           << "<a href='" << urlStr << "'>Try Again</a>"
           << "</div></body></html>";
    } else {
        // Non-SSL errors: show the existing generic error page
        ss << "<html><head><title>Eesha - Page Load Error</title>"
           << "<style>"
           << "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; "
           << "       display: flex; justify-content: center; align-items: center; "
           << "       min-height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }"
           << ".container { text-align: center; padding: 2rem; }"
           << "h1 { font-size: 2rem; color: #e94560; }"
           << "p { color: #aaa; margin: 1rem 0; }"
           << "a { color: #0f3460; background: #e94560; padding: 0.5rem 1.5rem; "
           << "    border-radius: 0.5rem; text-decoration: none; color: white; }"
           << "</style></head><body>"
           << "<div class='container'>"
           << "<h1>This page can't be reached</h1>"
           << "<p>" << errorText.ToString() << "</p>"
           << "<p>URL: " << urlStr << "</p>"
           << "<a href='" << urlStr << "'>Try Again</a>"
           << "</div></body></html>";
    }

    frame->LoadString(ss.str(), failedUrl);
}

bool EeshaBrowserClient::OnBeforePopup(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    const CefString& target_url,
    const CefString& target_frame_name,
    CefLifeSpanHandler::WindowOpenDisposition target_disposition,
    bool user_gesture,
    const CefPopupFeatures& popupFeatures,
    CefWindowInfo& windowInfo,
    CefRefPtr<CefClient>& client,
    CefBrowserSettings& settings,
    CefRefPtr<CefDictionaryValue>& extra_info,
    bool* no_javascript_access) {
    // Open popups in the same window (like a tab)
    if (target_disposition == CEF_WOD_NEW_FOREGROUND_TAB ||
        target_disposition == CEF_WOD_NEW_BACKGROUND_TAB ||
        target_disposition == CEF_WOD_NEW_WINDOW) {
        browser->GetMainFrame()->LoadURL(target_url);
        return true; // Cancel popup creation
    }
    return false;
}

void EeshaBrowserClient::OnAfterCreated(CefRefPtr<CefBrowser> browser) {
    CEF_REQUIRE_UI_THREAD();
}

bool EeshaBrowserClient::OnBeforeBrowse(CefRefPtr<CefBrowser> browser,
                                         CefRefPtr<CefFrame> frame,
                                         CefRefPtr<CefRequest> request,
                                         bool user_gesture,
                                         bool is_redirect) {
    CEF_REQUIRE_UI_THREAD();

    std::string url = request->GetURL().ToString();

    // Handle internal Eesha URLs
    if (url.find("eesha://") == 0) {
        if (url == "eesha://newtab") {
            // Serve the Eesha new tab page
            frame->LoadString(GetNewTabPageHTML(), "eesha://newtab");
            return true;
        }
        if (url == "eesha://settings") {
            frame->LoadString(GetSettingsPageHTML(), "eesha://settings");
            return true;
        }
    }

    return false;
}

CefRefPtr<CefResourceRequestHandler> EeshaBrowserClient::GetResourceRequestHandler(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    CefRefPtr<CefRequest> request,
    bool is_navigation,
    bool is_download,
    const CefString& request_initiator,
    bool& disable_default_handling) {
    // Block tracking domains
    std::string url = request->GetURL().ToString();
    if (ShouldBlockTracker(url)) {
        disable_default_handling = true;
        return nullptr;
    }
    return nullptr;
}

bool EeshaBrowserClient::IsBlockedDomain(const std::string& url) {
    for (const auto& domain : TRACKING_DOMAINS) {
        if (url.find(domain) != std::string::npos) {
            return true;
        }
    }
    return false;
}

bool EeshaBrowserClient::ShouldBlockTracker(const std::string& url) {
    return IsBlockedDomain(url);
}

// Eesha New Tab Page
static std::string GetNewTabPageHTML() {
    return R"html(
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Eesha - New Tab</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            color: #fff;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .logo { font-size: 4rem; margin-bottom: 2rem; font-weight: 700; color: #e94560; }
        .search-container {
            width: 100%;
            max-width: 600px;
            padding: 0 1rem;
        }
        .search-box {
            width: 100%;
            padding: 1rem 1.5rem;
            font-size: 1.1rem;
            border: 2px solid rgba(255,255,255,0.1);
            border-radius: 1rem;
            background: rgba(255,255,255,0.05);
            color: #fff;
            outline: none;
            transition: border-color 0.3s, background 0.3s;
        }
        .search-box:focus {
            border-color: #e94560;
            background: rgba(255,255,255,0.1);
        }
        .search-box::placeholder { color: rgba(255,255,255,0.4); }
        .shortcuts {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
            gap: 1rem;
            margin-top: 2rem;
            max-width: 600px;
            padding: 0 1rem;
        }
        .shortcut {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
            padding: 1rem 0.5rem;
            border-radius: 0.75rem;
            background: rgba(255,255,255,0.05);
            cursor: pointer;
            transition: background 0.2s;
            text-decoration: none;
            color: #fff;
        }
        .shortcut:hover { background: rgba(255,255,255,0.15); }
        .shortcut-icon {
            width: 40px; height: 40px;
            border-radius: 50%;
            background: #e94560;
            display: flex; align-items: center; justify-content: center;
            font-size: 1.2rem; font-weight: 700;
        }
        .shortcut-name { font-size: 0.75rem; color: rgba(255,255,255,0.7); }
        .footer {
            position: absolute;
            bottom: 1rem;
            color: rgba(255,255,255,0.3);
            font-size: 0.8rem;
        }
    </style>
</head>
<body>
    <div class="logo">Eesha</div>
    <div class="search-container">
        <input type="text" class="search-box" id="search" placeholder="Search the web or enter a URL" autofocus>
    </div>
    <div class="shortcuts">
        <a class="shortcut" href="https://www.wikipedia.org">
            <div class="shortcut-icon">W</div>
            <span class="shortcut-name">Wikipedia</span>
        </a>
        <a class="shortcut" href="https://github.com">
            <div class="shortcut-icon">G</div>
            <span class="shortcut-name">GitHub</span>
        </a>
        <a class="shortcut" href="https://www.youtube.com">
            <div class="shortcut-icon">Y</div>
            <span class="shortcut-name">YouTube</span>
        </a>
        <a class="shortcut" href="https://www.reddit.com">
            <div class="shortcut-icon">R</div>
            <span class="shortcut-name">Reddit</span>
        </a>
        <a class="shortcut" href="https://twitter.com">
            <div class="shortcut-icon">X</div>
            <span class="shortcut-name">X</span>
        </a>
        <a class="shortcut" href="https://news.ycombinator.com">
            <div class="shortcut-icon">H</div>
            <span class="shortcut-name">HN</span>
        </a>
    </div>
    <div class="footer">Eesha Browser v0.2.0 &mdash; Powered by Blink</div>
    <script>
        const searchInput = document.getElementById('search');
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    if (query.match(/^(https?:\/\/|www\.)/)) {
                        window.location.href = query.startsWith('www.') ? 'https://' + query : query;
                    } else if (query.includes('.') && !query.includes(' ')) {
                        window.location.href = 'https://' + query;
                    } else {
                        window.location.href = 'https://duckduckgo.com/?q=' + encodeURIComponent(query);
                    }
                }
            }
        });
    </script>
</body>
</html>
)html";
}
